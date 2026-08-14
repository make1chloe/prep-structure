"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isRealDate } from "@/lib/importNotion";
import { noTable } from "@/lib/sqlError";
import { noColumn } from "@/lib/sqlError";
import { sessionUser } from "@/lib/session";

/**
 * **한 줄이 전체를 죽이지 않게** (2026-08-06).
 *
 * 보강 171줄을 올리는데 통째로 실패했다 —
 * `date/time field value out of range: "2026-25-08"`. 날짜를 「일/월」 순으로
 * 적은 줄이 하나 섞여 있었고, Postgres 는 한 덩어리로 받으므로 **그 한 줄
 * 때문에 171줄이 다 안 들어갔다.**
 *
 * 읽는 쪽(`parseDate`)도 고쳤지만, 여기서 한 번 더 막는다. 자료는 늘 예상
 * 밖으로 들어오고, **170줄이 들어가고 한 줄이 빠지는 것**이 0줄보다 낫다.
 * 빠진 줄은 조용히 버리지 않고 「못 넣은 줄」 에 적어 돌려드린다.
 */
function dropBadDates(rows, fields, skipped) {
  return rows.filter((r) => {
    for (const f of fields) {
      const v = r?.[f];
      if (v && !isRealDate(v)) {
        skipped.push(`${r.name || "(이름 없음)"} — 날짜를 못 읽었어요 「${v}」`);
        return false;
      }
    }
    return true;
  });
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
  const badDates = [];
  const list = dropBadDates((rows || []).filter((r) => r.name && r.date), ["date"], badDates);
  if (list.length === 0) return { error: "옮길 줄이 없어요.", saved: 0, skipped: [] };

  const supabase = createClient();
  const students = await studentMap(supabase);

  const skipped = [...badDates];
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
    if (noColumn(sErr)) {
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
  const badDates = [];
  const list = dropBadDates((rows || []).filter((r) => r.title && r.due_on), ["due_on", "end_on"], badDates);
  if (list.length === 0) return { error: "옮길 줄이 없어요.", saved: 0, skipped: [] };

  const supabase = createClient();
  const dates = [...new Set(list.map((r) => r.due_on))].sort();
  const { data: exist } = await supabase
    .from("tasks")
    .select("title, due_on")
    .gte("due_on", dates[0])
    .lte("due_on", dates[dates.length - 1]);
  const seen = new Set((exist || []).map((t) => `${t.due_on}|${t.title.trim()}`));

  const skipped = [...badDates];
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
  if (noColumn(error)) {
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
  // 날짜가 이상한 줄은 여기서 뺀다 — 하나가 DB 에서 터지면 전부가 안 들어간다
  const clean = dropBadDates(list, ["absentOn", "makeupOn"], skipped);

  const byKey = new Map();   // student|date → row (뒤에 온 것이 이긴다)
  clean.forEach((r) => {
    const sid = students.get((r.name || "").trim());
    if (!sid) {
      skipped.push(`${r.absentOn || r.makeupOn} ${r.name || "(이름 없음)"} (재원생 목록에 없음)`);
      return;
    }
    /**
     * **두 줄이 똑같은 칸을 갖게 만든다** (2026-08-06).
     *
     * 원장님 화면에서 이렇게 터졌다 —
     *   `null value in column "planned" of relation "attendance"
     *    violates not-null constraint`
     *
     * `planned` 는 `not null default false` 다. 그런데 결석 줄에만 그 칸을
     * 넣고 보강 줄에는 안 넣었더니, **한 덩어리로 보낼 때** 보강 줄의
     * planned 가 빈 값으로 채워져서 거절당했다. 여러 줄을 한 번에 넣으면
     * 칸을 **합집합**으로 맞추기 때문에 **기본값이 안 먹는다.**
     *
     * 줄마다 칸이 다르면 언젠가 또 이런다. 바탕을 하나 만들고 거기서 고친다.
     */
    const base = {
      student_id: sid,
      planned: false,
      reason: r.reason,
      makeup_of: null,
      note: "노션 이관",
    };
    if (r.isAbsence && r.absentOn) {
      byKey.set(`${sid}|${r.absentOn}`, {
        ...base,
        date: r.absentOn,
        status: "absent",
        planned: true,
        note: r.absentGuessed ? "노션 이관 (결석일이 생성일 기준이라 다를 수 있음)" : "노션 이관",
      });
    }
    if (r.makeupOn) {
      byKey.set(`${sid}|${r.makeupOn}`, {
        ...base,
        date: r.makeupOn,
        status: "makeup",
        makeup_of: r.isAbsence ? r.absentOn : null,
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
  if (noColumn(error)) {
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
  const badDates = [];
  const list = dropBadDates((rows || []).filter((r) => r.name && r.date && r.items.length > 0), ["date"], badDates);
  if (list.length === 0) return { error: "옮길 줄이 없어요.", saved: 0, skipped: [] };

  const supabase = createClient();
  const students = await studentMap(supabase);
  const items = await itemMap(supabase, list.flatMap((r) => r.items.map((i) => i.name)));

  const skipped = [...badDates];
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
    if (noColumn(iErr)) {
      await supabase
        .from("daily_report_items")
        .insert(driRows.map(({ range_note, ...rest }) => rest));
    }
  }

  // 숙제 문자 발송 내역
  if (sends.length > 0) {
    let { error: sErr } = await supabase.from("report_sends").insert(sends);
    if (noColumn(sErr)) {
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
  const badDates = [];
  const list = dropBadDates((rows || []).filter((r) => r.name && r.ym), ["paidOn"], badDates);
  if (list.length === 0) {
    return { error: "옮길 줄이 없어요. 학생 이름과 달이 있는지 봐주세요.", saved: 0, skipped: [] };
  }

  const supabase = createClient();
  const students = await studentMap(supabase);

  const skipped = [...badDates];
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


export async function importNotes(rows) {
  const badDates = [];
  const list = dropBadDates((rows || []).filter((r) => r?.name && r?.date), ["date"], badDates);
  if (list.length === 0) {
    return { error: "옮길 줄이 없어요. 학생 이름과 날짜가 있는지 봐주세요.", saved: 0, skipped: [] };
  }

  const supabase = createClient();
  const user = await sessionUser(supabase);
  const students = await studentMap(supabase);

  /**
   * **없는 이름은 퇴원생으로 만든다** (원장님, 2026-08-06 — 「퇴원생 기록도
   * 남겨두고 싶어. 재원생에 없는 이름은 퇴원생으로 올리고」).
   *
   * 그만둔 아이의 상담 이력이 제일 아깝다. 왜 그만뒀는지, 무슨 말이 오갔는지는
   * 다음 아이에게 쓰이는 것이라 버릴 것이 아니다.
   *
   * 다만 **이름 오타도 그대로 학생이 된다.** 그래서 새로 만든 이름은 결과에
   * 그대로 돌려준다 — 「이런 이름으로 만들었습니다」 를 보시고 아니면 바로
   * 지우실 수 있게. 조용히 만들면 유령 학생이 쌓인다.
   */
  const skipped = [...badDates];
  const made = [];
  const need = [...new Set(list.map((r) => r.name).filter((n) => !students.get(n)))];
  if (need.length > 0) {
    const { data: rows, error } = await supabase
      .from("students")
      .insert(need.map((name) => ({ name, status: "withdrawn" })))
      .select("id, name");
    if (error) {
      skipped.push(`퇴원생으로 만들지 못했어요: ${error.message}`);
    } else {
      (rows || []).forEach((s) => {
        students.set(s.name.trim(), s.id);
        made.push(s.name);
      });
    }
  }

  const ready = [];
  list.forEach((r) => {
    const sid = students.get(r.name);
    if (!sid) {
      skipped.push(`${r.date} ${r.name} (학생을 못 만들었어요)`);
      return;
    }
    ready.push({ ...r, student_id: sid });
  });
  if (ready.length === 0) return { error: null, saved: 0, updated: 0, skipped, made };

  // 이미 있는 것 — 같은 학생·날짜·제목
  const ids = [...new Set(ready.map((r) => r.student_id))];
  const { data: have, error: readErr } = await supabase
    .from("student_notes")
    .select("id, student_id, date, title")
    .in("student_id", ids);
  if (noTable(readErr)) return { error: "0049 SQL 을 먼저 실행해주세요.", saved: 0, skipped, made };
  if (readErr) return { error: readErr.message, saved: 0, skipped, made };
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
  return { error: null, saved, updated, skipped, made };
}

/**
 * **신규 문의 이관** — 노션 방문상담목록DB (원장님, 2026-08-06).
 *
 * rows: parseInquiryAoA 결과. 여기서는 세 가지를 더 한다 —
 *   1. **같은 사람이 이미 있으면 덮어쓴다** (이름+번호). 고쳐서 다시 올리셔도
 *      안 늘어난다.
 *   2. **반을 찾아 연결한다** — 「화목 5:00~7:30」 을 요일·시작시각으로 맞춘다.
 *      못 찾으면 글자만 남긴다 (엉뚱한 반에 붙이는 것보다 낫다).
 *   3. **등록까지 간 문의는 재원생과 잇는다** — 이름이 딱 하나일 때만.
 *      동명이인이면 안 잇는다.
 */
export async function importInquiries(rows) {
  const badDates = [];
  const list = dropBadDates((rows || []).filter((r) => r?.name && !r.skip), ["consult_on", "test_on"], badDates);
  if (list.length === 0) {
    return { error: "옮길 줄이 없어요. 학생 이름이 있는지 봐주세요.", saved: 0, skipped: [] };
  }

  const supabase = createClient();
  const user = await sessionUser(supabase);

  // 반 — 요일 묶음 + 시작시각으로 찾는다 (이름은 「월수1」 이라 안 맞는다)
  const { data: classes } = await supabase.from("classes").select("id, name, days, start_time");
  const classAt = new Map();
  (classes || []).forEach((c) => {
    const key = `${[...(c.days || [])].sort().join("")}|${(c.start_time || "").slice(0, 5)}`;
    // 같은 시각에 반이 둘이면 어느 쪽인지 모른다 → 안 잇는다
    classAt.set(key, classAt.has(key) ? null : c.id);
  });

  // 재원생 — 동명이인은 잇지 않는다
  const { data: studs } = await supabase.from("students").select("id, name");
  const nameCount = new Map();
  (studs || []).forEach((x) => nameCount.set(x.name.trim(), (nameCount.get(x.name.trim()) || 0) + 1));
  const studentAt = new Map();
  (studs || []).forEach((x) => {
    if (nameCount.get(x.name.trim()) === 1) studentAt.set(x.name.trim(), x.id);
  });

  // 이미 있는 문의
  const { data: have, error: readErr } = await supabase
    .from("inquiries")
    .select("id, name, phone");
  if (readErr) return { error: readErr.message, saved: 0, skipped: [] };
  const keyOf = (x) => `${(x.name || "").trim()}|${x.phone || ""}`;
  const known = new Map((have || []).map((x) => [keyOf(x), x.id]));

  const skipped = [...badDates];
  let saved = 0;
  let updated = 0;
  let linkedClass = 0;
  let linkedStudent = 0;

  for (const r of list) {
    const ckey = `${[...(r.classDays || [])].sort().join("")}|${r.classStart || ""}`;
    const class_id = r.classStart ? classAt.get(ckey) || null : null;
    if (class_id) linkedClass += 1;
    // 등록까지 간 문의만 재원생과 잇는다 (원칙1: 이름을 다시 안 적는다)
    // 「이민재A」 로는 재원생을 못 찾는다 — 원래 이름으로 잇는다
    const student_id = r.status === "enrolled" ? studentAt.get(r.baseName || r.name) || null : null;
    if (student_id) linkedStudent += 1;

    const row = {
      name: r.name,
      phone: r.phone || null,
      student_phone: r.student_phone || null,
      school: r.school || null,
      grade: r.grade || null,
      source: r.source || null,
      status: r.status || "new",
      consult_on: r.consult_on || null,
      consult_at: r.consult_at || null,
      test_on: r.test_on || null,
      test_at: r.test_at || null,
      want_days: r.want_days?.length ? r.want_days : null,
      want_time: r.want_time || null,
      class_id,
      student_id,
      memo: r.memo || null,
      updated_at: new Date().toISOString(),
    };

    const at = known.get(keyOf(row));
    const { error } = at
      ? await supabase.from("inquiries").update(row).eq("id", at)
      : await supabase.from("inquiries").insert({ ...row, created_by: user?.id || null });
    if (error) {
      skipped.push(`${r.name} — ${error.message}`);
      continue;
    }
    at ? (updated += 1) : (saved += 1);
  }

  revalidatePath("/consult");
  return { error: null, saved, updated, skipped, linkedClass, linkedStudent };
}

/**
 * **단원평가 이관** — 노션 3단원평가DB (원장님, 2026-08-06).
 *
 * 같은 학생·같은 단원이 여러 번 나오는 것은 **중복이 아니라 기록**이다
 * (재시험 → 통과). 그래서 **날짜까지 같아야** 한 건으로 본다.
 */
export async function importUnitScores(rows) {
  const badDates = [];
  const list = dropBadDates((rows || []).filter((r) => r?.name && r?.date && r?.unit), ["date"], badDates);
  if (list.length === 0) {
    return { error: "옮길 줄이 없어요. 학생·날짜·단원명이 있는지 봐주세요.", saved: 0, skipped: [] };
  }

  const supabase = createClient();
  const user = await sessionUser(supabase);
  const students = await studentMap(supabase);

  const skipped = [...badDates];
  const ready = [];
  list.forEach((r) => {
    const sid = students.get(r.name);
    if (!sid) { skipped.push(`${r.date} ${r.name} — 재원생 목록에 없어요`); return; }
    ready.push({ ...r, student_id: sid });
  });
  if (ready.length === 0) return { error: null, saved: 0, updated: 0, skipped };

  const ids = [...new Set(ready.map((r) => r.student_id))];
  const { data: have, error: readErr } = await supabase
    .from("scores")
    .select("id, student_id, kind, term, taken_on")
    .eq("kind", "unit")
    .in("student_id", ids);
  if (noTable(readErr)) return { error: "0072 SQL 을 먼저 실행해주세요.", saved: 0, skipped };
  if (readErr) return { error: readErr.message, saved: 0, skipped };
  const keyOf = (x) => `${x.student_id}|${(x.term || "").trim()}|${x.taken_on}`;
  const known = new Map((have || []).map((x) => [keyOf(x), x.id]));

  let saved = 0;
  let updated = 0;
  for (const r of ready) {
    const row = {
      student_id: r.student_id,
      kind: "unit",
      term: r.unit,
      taken_on: r.date,
      raw_score: r.point,
      full_score: r.point == null ? null : 100,
      // 통과인지 재시험인지가 단원평가의 핵심이다 — 점수보다 이것을 보신다
      note: [r.state, r.total ? `${r.total}문제 중 ${r.wrongCount ?? "?"}개 틀림` : ""]
        .filter(Boolean).join(" · ") || null,
      source: "notion",
    };
    const at = known.get(keyOf(row));
    const { error } = at
      ? await supabase.from("scores").update(row).eq("id", at)
      : await supabase.from("scores").insert({ ...row, created_by: user?.id || null });
    if (error) { skipped.push(`${r.date} ${r.name} — ${error.message}`); continue; }
    at ? (updated += 1) : (saved += 1);
  }

  revalidatePath("/scores");
  revalidatePath("/students");
  return { error: null, saved, updated, skipped };
}

/**
 * **모의고사 오답 이관** — 노션 오답분석DB (원장님, 2026-08-06).
 *
 * 성적 한 줄(scores)과 **문항별 오답**(score_items)을 같이 넣는다.
 * 문항이 성적의 자식이라 성적을 먼저 만들고 그 id 로 문항을 넣는다.
 */
export async function importWrongAnswers(rows) {
  const badDates = [];
  const list = dropBadDates((rows || []).filter((r) => r?.name && r?.date), ["date"], badDates);
  if (list.length === 0) {
    return { error: "옮길 줄이 없어요. 이름과 시험 본 날짜가 있는지 봐주세요.", saved: 0, skipped: [] };
  }

  const supabase = createClient();
  const user = await sessionUser(supabase);
  const students = await studentMap(supabase);

  const skipped = [...badDates];
  const ready = [];
  list.forEach((r) => {
    const sid = students.get(r.name);
    if (!sid) { skipped.push(`${r.date} ${r.name} — 재원생 목록에 없어요`); return; }
    ready.push({ ...r, student_id: sid });
  });
  if (ready.length === 0) return { error: null, saved: 0, updated: 0, items: 0, skipped };

  const ids = [...new Set(ready.map((r) => r.student_id))];
  const { data: have, error: readErr } = await supabase
    .from("scores")
    .select("id, student_id, kind, term, taken_on")
    .eq("kind", "mock")
    .in("student_id", ids);
  if (noTable(readErr)) return { error: "0072 SQL 을 먼저 실행해주세요.", saved: 0, skipped };
  if (readErr) return { error: readErr.message, saved: 0, skipped };
  const keyOf = (x) => `${x.student_id}|${(x.term || "").trim()}|${x.taken_on}`;
  const known = new Map((have || []).map((x) => [keyOf(x), x.id]));

  let saved = 0;
  let updated = 0;
  let items = 0;
  for (const r of ready) {
    const row = {
      student_id: r.student_id,
      kind: "mock",
      term: r.term,
      taken_on: r.date,
      raw_score: r.point,
      full_score: 100,
      self_note: r.self,
      // 아이가 적어 낸 점수와 어긋난 줄은 남겨둔다 — 나중에 「왜 다르지」 가 된다
      note: r.mismatch ? `아이가 적어 낸 점수는 ${r.said}점이었습니다` : null,
      source: "form",
    };
    const at = known.get(keyOf(row));
    let scoreId = at;
    if (at) {
      const { error } = await supabase.from("scores").update(row).eq("id", at);
      if (error) { skipped.push(`${r.date} ${r.name} — ${error.message}`); continue; }
      updated += 1;
    } else {
      const { data, error } = await supabase
        .from("scores")
        .insert({ ...row, created_by: user?.id || null })
        .select("id")
        .single();
      if (error) {
        // self_note 는 0097 에서 생긴 칸이다 — 아직 안 돌리셨으면 여기서 걸린다
        skipped.push(`${r.date} ${r.name} — ${error.message}`);
        continue;
      }
      scoreId = data.id;
      saved += 1;
    }
    if (!scoreId || !r.items?.length) continue;

    // 다시 올리셔도 안 늘어나게 — 그 회차 문항을 지우고 새로 넣는다
    await supabase.from("score_items").delete().eq("score_id", scoreId);
    const { error: itemErr } = await supabase.from("score_items").insert(
      r.items.map((it) => ({
        score_id: scoreId,
        no: it.no,
        wrong: true,
        reason: it.reason,
      }))
    );
    if (itemErr) {
      skipped.push(`${r.date} ${r.name} 문항 — 0097 SQL 을 먼저 실행해주세요 (${itemErr.message})`);
      continue;
    }
    items += r.items.length;
  }

  revalidatePath("/scores");
  revalidatePath("/students");
  return { error: null, saved, updated, items, skipped };
}
