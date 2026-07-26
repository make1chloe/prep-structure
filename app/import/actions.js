"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
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

  const { data: saved, error } = await supabase
    .from("daily_reports")
    .upsert(
      payload.map(({ _row, ...rest }) => rest),
      { onConflict: "student_id,date" }
    )
    .select("id, student_id, date");
  if (error) return { error: error.message, saved: 0, skipped };

  // 숙제 검사 결과 (완료O / 미흡△ / 미제출X)
  const names = payload.flatMap(({ _row }) => [..._row.done, ..._row.weak, ..._row.missing]);
  const items = await itemMap(supabase, names);
  const byKey = new Map((saved || []).map((r) => [`${r.student_id}|${r.date}`, r.id]));

  const driRows = [];
  payload.forEach(({ student_id, date, _row }) => {
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

  const { data: saved, error } = await supabase
    .from("daily_reports")
    .upsert(
      need.map(({ student_id, date }) => ({ student_id, date })),
      { onConflict: "student_id,date" }
    )
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

  revalidatePath("/resend");
  revalidatePath("/today");
  return { error: null, saved: driRows.length, skipped };
}
