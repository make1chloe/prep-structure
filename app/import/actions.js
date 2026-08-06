"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}

/**
 * 같은 (학생, 날짜)가 한 파일 안에 여러 번 나오면 **마지막 것만** 남긴다.
 *
 * 노션에서 내린 CSV 에는 같은 날 같은 학생 줄이 여러 개 있는 일이 흔하다.
 * 그대로 upsert 하면 Postgres 가
 *   "ON CONFLICT DO UPDATE command cannot affect row a second time"
 * 로 통째로 거절한다 — 한 번의 명령이 같은 줄을 두 번 고칠 수 없기 때문이다.
 */
function dedupe(rows, keyOf) {
  const m = new Map();
  rows.forEach((r) => m.set(keyOf(r), r));
  return { rows: [...m.values()], dropped: rows.length - m.size };
}

// 이름 → 학생 id
async function studentMap(supabase) {
  const { data } = await supabase.from("students").select("id, name");
  const m = new Map();
  (data || []).forEach((s) => m.set(s.name.trim(), s.id));
  return m;
}

// 학습 항목을 이름으로 찾고, 없으면 만든다
async function itemMap(supabase, names) {
  const { data } = await supabase.from("homework_items").select("id, name");
  const m = new Map((data || []).map((i) => [i.name.trim(), i.id]));
  const missing = [...new Set(names)].filter((n) => n && !m.has(n));
  if (missing.length > 0) {
    const { data: made } = await supabase
      .from("homework_items")
      .insert(missing.map((name) => ({ name, category: "기타", sort: 900, active: true })))
      .select("id, name");
    (made || []).forEach((i) => m.set(i.name.trim(), i.id));
  }
  return m;
}

/**
 * 데일리리포트 이관
 * rows: parseReportRow 결과 배열
 */
export async function importReports(rows) {
  const list = (rows || []).filter((r) => r.name && r.date);
  if (list.length === 0) return { error: "옮길 줄이 없어요.", saved: 0, skipped: [] };

  const supabase = createClient();
  const students = await studentMap(supabase);

  const skipped = [];
  const payload = [];
  list.forEach((r) => {
    const sid = students.get(r.name);
    if (!sid) {
      skipped.push(`${r.date} ${r.name} (재원생 목록에 없음)`);
      return;
    }
    payload.push({
      student_id: sid,
      date: r.date,
      attendance_kind: r.attendance,
      word_correct: r.wordCorrect,
      word_total: r.wordTotal,
      sent_correct: r.sentCorrect,
      sent_total: r.sentTotal,
      notice: r.notice || null,
      own_progress: r.progress || null,
      report_written: true,
      _row: r,
    });
  });
  if (payload.length === 0) return { error: null, saved: 0, skipped };

  // 같은 학생·같은 날이 여러 줄이면 마지막 것만 (그대로 넣으면 Postgres 가 거절한다)
  const dd = dedupe(payload, (r) => `${r.student_id}|${r.date}`);
  if (dd.dropped > 0) skipped.push(`같은 날 겹친 줄 ${dd.dropped}개는 마지막 것만 남겼어요.`);

  const { data: saved, error } = await supabase
    .from("daily_reports")
    .upsert(
      dd.rows.map(({ _row, ...rest }) => rest),
      { onConflict: "student_id,date" }
    )
    .select("id, student_id, date");
  if (error) return { error: error.message, saved: 0, skipped };

  // 숙제 검사 결과 (완료O / 미흡△ / 미제출X)
  const names = dd.rows.flatMap(({ _row }) => [..._row.done, ..._row.weak, ..._row.missing]);
  const items = await itemMap(supabase, names);
  const byKey = new Map((saved || []).map((r) => [`${r.student_id}|${r.date}`, r.id]));

  const driRows = [];
  dd.rows.forEach(({ student_id, date, _row }) => {
    const rid = byKey.get(`${student_id}|${date}`);
    if (!rid) return;
    const add = (list2, status) =>
      list2.forEach((n) => {
        const iid = items.get(n.trim());
        if (iid) driRows.push({ daily_report_id: rid, homework_item_id: iid, status });
      });
    add(_row.done, "done");
    add(_row.weak, "weak");
    add(_row.missing, "missing");
  });

  if (driRows.length > 0) {
    const ids = [...new Set(driRows.map((x) => x.daily_report_id))];
    await supabase
      .from("daily_report_items")
      .delete()
      .in("daily_report_id", ids)
      .in("status", ["done", "weak", "missing"]);
    await supabase.from("daily_report_items").insert(driRows);
  }

  // 이관한 내용은 이미 보낸 것으로 본다
  const savedIds = (saved || []).map((r) => r.id);
  if (savedIds.length > 0) {
    const { error: sErr } = await supabase
      .from("daily_reports")
      .update({ sent_at: new Date().toISOString() })
      .in("id", savedIds);
    if (isMissingColumn(sErr)) {
      // 0012 전이면 그냥 넘어간다
    }
  }

  revalidatePath("/report");
  revalidatePath("/today");
  return { error: null, saved: savedIds.length, skipped };
}

/**
 * 일정 · 할일 이관
 *   같은 제목·같은 날짜가 이미 있으면 건너뛴다 (여러 번 올려도 안 늘어나게)
 */
export async function importTasks(rows) {
  const list = (rows || []).filter((r) => r.title && r.due_on);
  if (list.length === 0) return { error: "옮길 줄이 없어요.", saved: 0, skipped: [] };

  const supabase = createClient();
  const dates = [...new Set(list.map((r) => r.due_on))].sort();
  const { data: exist } = await supabase
    .from("tasks")
    .select("title, due_on")
    .gte("due_on", dates[0])
    .lte("due_on", dates[dates.length - 1]);
  const seen = new Set((exist || []).map((t) => `${t.due_on}|${t.title.trim()}`));

  const skipped = [];
  const payload = [];
  list.forEach((r) => {
    const key = `${r.due_on}|${r.title}`;
    if (seen.has(key)) {
      skipped.push(`${r.due_on} ${r.title} (이미 있음)`);
      return;
    }
    seen.add(key);
    payload.push({
      title: r.title,
      kind: r.kind === "todo" ? "todo" : "schedule",
      category: r.category || null,
      due_on: r.due_on,
      end_on: r.end_on || null,
      note: r.note || null,
      status: "open",
    });
  });
  if (payload.length === 0) return { error: null, saved: 0, skipped };

  let { error } = await supabase.from("tasks").insert(payload);
  if (isMissingColumn(error)) {
    // 0014 전이면 end_on 없이
    ({ error } = await supabase
      .from("tasks")
      .insert(payload.map(({ end_on, ...rest }) => rest)));
  }
  if (error) return { error: error.message, saved: 0, skipped };

  revalidatePath("/tasks");
  return { error: null, saved: payload.length, skipped };
}

/**
 * 결석 · 보강 이관
 *   결석 → attendance(status='absent', reason=사유)
 *   보강 → attendance(status='makeup', makeup_of=결석일)
 * attendance 는 (학생, 날짜) 하나뿐이라 같은 날 여러 건이면 덮어쓴다.
 */
export async function importAbsences(rows) {
  const list = (rows || []).filter((r) => r.name && (r.absentOn || r.makeupOn));
  if (list.length === 0) return { error: "옮길 줄이 없어요.", saved: 0, skipped: [] };

  const supabase = createClient();
  const students = await studentMap(supabase);

  const skipped = [];
  const byKey = new Map();   // student|date → row (뒤에 온 것이 이긴다)
  list.forEach((r) => {
    const sid = students.get((r.name || "").trim());
    if (!sid) {
      skipped.push(`${r.absentOn || r.makeupOn} ${r.name || "(이름 없음)"} (재원생 목록에 없음)`);
      return;
    }
    if (r.isAbsence && r.absentOn) {
      byKey.set(`${sid}|${r.absentOn}`, {
        student_id: sid,
        date: r.absentOn,
        status: "absent",
        planned: true,
        reason: r.reason,
        note: r.absentGuessed ? "노션 이관 (결석일이 생성일 기준이라 다를 수 있음)" : "노션 이관",
      });
    }
    if (r.makeupOn) {
      byKey.set(`${sid}|${r.makeupOn}`, {
        student_id: sid,
        date: r.makeupOn,
        status: "makeup",
        makeup_of: r.isAbsence ? r.absentOn : null,
        reason: r.reason,
        note: r.none ? "보강 없음으로 처리됨" : "노션 이관",
      });
    }
  });

  const payload = [...byKey.values()];
  if (payload.length === 0) return { error: null, saved: 0, skipped };

  let { error } = await supabase
    .from("attendance")
    .upsert(dedupe(payload, (r) => `${r.student_id}|${r.date}`).rows, {
      onConflict: "student_id,date",
    });
  if (isMissingColumn(error)) {
    // 0017 전이면 planned/reason 없이
    ({ error } = await supabase
      .from("attendance")
      .upsert(
        payload.map(({ planned, reason, ...rest }) => rest),
        { onConflict: "student_id,date" }
      ));
  }
  if (error) return { error: error.message, saved: 0, skipped };

  revalidatePath("/today");
  revalidatePath("/tuition");
  return { error: null, saved: payload.length, skipped };
}

/**
 * 하원숙제 이관 — 그 수업일에 '배정한' 숙제로 넣는다.
 * 노션의 자유 텍스트는 범위 메모(range_note)에 그대로 담는다.
 */
export async function importHomework(rows) {
  const list = (rows || []).filter((r) => r.name && r.date && r.items.length > 0);
  if (list.length === 0) return { error: "옮길 줄이 없어요.", saved: 0, skipped: [] };

  const supabase = createClient();
  const students = await studentMap(supabase);
  const items = await itemMap(supabase, list.flatMap((r) => r.items.map((i) => i.name)));

  const skipped = [];
  const need = [];
  list.forEach((r) => {
    const sid = students.get(r.name);
    if (!sid) {
      skipped.push(`${r.date} ${r.name} (재원생 목록에 없음)`);
      return;
    }
    need.push({ student_id: sid, date: r.date, _row: r });
  });
  if (need.length === 0) return { error: null, saved: 0, skipped };

  // 같은 학생·같은 날은 하나로 (겹친 채로 보내면 Postgres 가 거절한다)
  const uniq = dedupe(
    need.map(({ student_id, date }) => ({ student_id, date })),
    (r) => `${r.student_id}|${r.date}`
  );

  const { data: saved, error } = await supabase
    .from("daily_reports")
    .upsert(uniq.rows, { onConflict: "student_id,date" })
    .select("id, student_id, date");
  if (error) return { error: error.message, saved: 0, skipped };

  const byKey = new Map((saved || []).map((r) => [`${r.student_id}|${r.date}`, r.id]));
  const driRows = [];
  const sends = [];
  need.forEach(({ student_id, date, _row }) => {
    const rid = byKey.get(`${student_id}|${date}`);
    if (!rid) return;
    _row.items.forEach((it) => {
      const iid = items.get(it.name);
      if (!iid) return;
      driRows.push({
        daily_report_id: rid,
        homework_item_id: iid,
        status: "assigned",
        range_note: it.detail,
      });
    });
    if (_row.sent) {
      sends.push({
        daily_report_id: rid,
        kind: "homework",
        body: _row.items.map((i) => `· ${i.name} — ${i.detail}`).join("\n"),
        channel: "copy",
        ok: true,
        detail: "노션에서 이관",
      });
    }
  });

  if (driRows.length > 0) {
    const ids = [...new Set(driRows.map((x) => x.daily_report_id))];
    await supabase
      .from("daily_report_items")
      .delete()
      .in("daily_report_id", ids)
      .eq("status", "assigned");
    let { error: iErr } = await supabase.from("daily_report_items").insert(driRows);
    if (isMissingColumn(iErr)) {
      await supabase
        .from("daily_report_items")
        .insert(driRows.map(({ range_note, ...rest }) => rest));
    }
  }

  // 숙제 문자 발송 내역
  if (sends.length > 0) {
    let { error: sErr } = await supabase.from("report_sends").insert(sends);
    if (isMissingColumn(sErr)) {
      await supabase
        .from("report_sends")
        .insert(sends.map(({ channel, ok, detail, ...rest }) => rest));
    }
    const ids = [...new Set(sends.map((s) => s.daily_report_id))];
    await supabase
      .from("daily_reports")
      .update({ homework_sent_at: new Date().toISOString() })
      .in("id", ids);
  }

  revalidatePath("/report");
  revalidatePath("/today");
  return { error: null, saved: driRows.length, skipped };
}

/**
 * 수납 엑셀 (결제선생 등) 옮기기.
 *
 * 금액을 앱이 다시 계산하지 않는다. **받았는지만** 남긴다. (원칙1)
 * 같은 (학생, 달) 은 한 줄이라 여러 번 올려도 덮어쓴다.
 */
export async function importPayments(rows) {
  const list = (rows || []).filter((r) => r.name && r.ym);
  if (list.length === 0) {
    return { error: "옮길 줄이 없어요. 학생 이름과 달이 있는지 봐주세요.", saved: 0, skipped: [] };
  }

  const supabase = createClient();
  const students = await studentMap(supabase);

  const skipped = [];
  const byKey = new Map();   // student|ym → 줄 (뒤에 온 것이 이긴다)
  list.forEach((r) => {
    const sid = students.get((r.name || "").trim());
    if (!sid) {
      skipped.push(`${r.ym} ${r.name} (재원생 목록에 없음)`);
      return;
    }
    byKey.set(`${sid}|${r.ym}`, {
      student_id: sid,
      ym: r.ym,
      amount: r.amount,
      paid_on: r.paidOn,
      method: r.method,
      source: "결제선생",
      note: r.paid ? null : r.status,
      updated_at: new Date().toISOString(),
    });
  });

  const payload = [...byKey.values()];
  if (payload.length === 0) {
    return { error: null, saved: 0, skipped };
  }

  const { error } = await supabase
    .from("payments")
    .upsert(payload, { onConflict: "student_id,ym" });
  if (error) {
    return {
      error: `${error.message} — supabase/migrations/0055_payments.sql 을 먼저 실행해주세요.`,
      saved: 0,
      skipped,
    };
  }

  revalidatePath("/tuition");
  revalidatePath("/");
  return { error: null, saved: payload.length, skipped };
}


/**
 * 상담일지 이관 — 노션 재원생상담일지DB (원장님, 2026-08-06).
 *
 * rows: parseNoteAoA 결과 (이미 학생별로 나뉘어 있다)
 *
 * **같은 (학생 · 날짜 · 제목) 은 한 건**으로 본다. 노션에서 다시 내려받아
 * 올리는 일이 흔한데, 그때마다 늘어나면 상담 이력이 못 쓰게 된다.
 * upsert 를 못 쓰는 이유 — student_notes 에는 그 세 칸의 유일 인덱스가 없고,
 * 여기 하나 때문에 표에 제약을 새로 거는 것은 과하다. 그래서 먼저 읽어보고 고른다.
 */
function needSql(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205");
}

export async function importNotes(rows) {
  const list = (rows || []).filter((r) => r?.name && r?.date);
  if (list.length === 0) {
    return { error: "옮길 줄이 없어요. 학생 이름과 날짜가 있는지 봐주세요.", saved: 0, skipped: [] };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const students = await studentMap(supabase);

  const skipped = [];
  const ready = [];
  list.forEach((r) => {
    const sid = students.get(r.name);
    if (!sid) {
      // 퇴원생은 재원생 목록에 남아 있으면 붙는다. 아예 없으면 붙일 데가 없다
      skipped.push(`${r.date} ${r.name} (재원생 목록에 없음)`);
      return;
    }
    ready.push({ ...r, student_id: sid });
  });
  if (ready.length === 0) return { error: null, saved: 0, updated: 0, skipped };

  // 이미 있는 것 — 같은 학생·날짜·제목
  const ids = [...new Set(ready.map((r) => r.student_id))];
  const { data: have, error: readErr } = await supabase
    .from("student_notes")
    .select("id, student_id, date, title")
    .in("student_id", ids);
  if (needSql(readErr)) return { error: "0049 SQL 을 먼저 실행해주세요.", saved: 0, skipped };
  if (readErr) return { error: readErr.message, saved: 0, skipped };
  const keyOf = (x) => `${x.student_id}|${x.date}|${(x.title || "").trim()}`;
  const known = new Map((have || []).map((x) => [keyOf(x), x.id]));

  let saved = 0;
  let updated = 0;
  for (const r of ready) {
    const row = {
      student_id: r.student_id,
      date: r.date,
      kind: "consult",
      title: r.title,
      // 노션에 적으신 글을 **그대로** 둔다 (raw). 정리한 글(body)은 원장님이
      // 나중에 손보시는 자리라, 옮기면서 우리가 채우면 안 된다
      raw: r.body,
      with_whom: r.how ? `학부모 (${r.how})` : "학부모",
    };
    const at = known.get(keyOf(row));
    const { error } = at
      ? await supabase.from("student_notes").update(row).eq("id", at)
      : await supabase.from("student_notes").insert({ ...row, created_by: user?.id || null });
    if (error) {
      skipped.push(`${r.date} ${r.name} — ${error.message}`);
      continue;
    }
    at ? (updated += 1) : (saved += 1);
  }

  revalidatePath("/notes");
  revalidatePath("/students");
  return { error: null, saved, updated, skipped };
}
