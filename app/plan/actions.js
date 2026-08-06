"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDays, dowOf } from "@/lib/day";

function ok(error) {
  return { error: error ? error.message : null };
}
function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}

// ---------- 결석 예정 ----------
// 미리 연락받은 결석. 당일 결석과 구분해서 남긴다.
export async function setPlannedAbsence(studentId, date, reason) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();
  let { error } = await supabase.from("attendance").upsert(
    {
      student_id: studentId,
      date,
      status: "absent",
      planned: true,
      reason: (reason || "").trim() || null,
    },
    { onConflict: "student_id,date" }
  );
  if (isMissingColumn(error)) {
    return { error: "0017 SQL을 먼저 실행해주세요 (planned/reason 컬럼)." };
  }
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

/**
 * 기간 결석 예정 — 가족여행처럼 여러 날 빠질 때 한 번에.
 * 그 학생이 실제로 수업 있는 날만 넣는다.
 */
export async function setPlannedAbsenceRange(studentIds, from, to, reason) {
  const sids = Array.isArray(studentIds) ? studentIds : [studentIds];
  if (sids.length === 0 || !from) return { error: "학생과 날짜를 골라주세요.", count: 0 };
  const end = to || from;

  const supabase = createClient();
  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id")
    .in("student_id", sids);
  const classIds = [...new Set((members || []).map((m) => m.class_id))];
  const { data: classes } = classIds.length
    ? await supabase.from("classes").select("id, days").in("id", classIds)
    : { data: [] };
  const daysOf = new Map((classes || []).map((c) => [c.id, c.days || []]));

  const DOWN = ["일", "월", "화", "수", "목", "금", "토"];
  const rows = [];
  for (const sid of sids) {
    const myDays = new Set(
      (members || []).filter((m) => m.student_id === sid).flatMap((m) => daysOf.get(m.class_id) || [])
    );
    let d = from;
    const last = end;
    while (d <= last) {
      if (myDays.has(dowOf(d))) {
        rows.push({
          student_id: sid,
          date: d,
          status: "absent",
          planned: true,
          reason: (reason || "").trim() || null,
        });
      }
      d = addDays(d, 1);
    }
  }
  if (rows.length === 0) return { error: "그 기간에 수업이 없어요.", count: 0 };

  let { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "student_id,date" });
  if (isMissingColumn(error)) {
    return { error: "0017 SQL을 먼저 실행해주세요 (planned/reason 컬럼).", count: 0 };
  }
  revalidatePath("/plan");
  revalidatePath("/today");
  return { error: error ? error.message : null, count: rows.length };
}

// 기간 결석 예정 취소
export async function clearPlannedAbsenceRange(studentIds, from, to) {
  const sids = Array.isArray(studentIds) ? studentIds : [studentIds];
  if (sids.length === 0 || !from) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("attendance")
    .delete()
    .in("student_id", sids)
    .gte("date", from)
    .lte("date", to || from);
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

export async function clearPlannedAbsence(studentId, date) {
  if (!studentId || !date) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("student_id", studentId)
    .eq("date", date);
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

// 보강일을 잡으면 그 날짜에 보강으로 넣는다 (원 결석일을 함께 남김)
export async function setMakeup(studentId, makeupDate, absentDate) {
  if (!studentId || !makeupDate) return { error: "값이 부족해요." };
  const supabase = createClient();
  const { error } = await supabase.from("attendance").upsert(
    { student_id: studentId, date: makeupDate, status: "makeup", makeup_of: absentDate || null },
    { onConflict: "student_id,date" }
  );
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

/**
 * **보강 없음** — 이 결석은 보강을 안 한다 (0103).
 *
 * 원장님 (2026-08-06) — 「대시보드에서 보강 없음 버튼도 만들어줘」
 *
 * 「보강 잡을 것」 은 결석 줄이 있는데 보강 줄이 없으면 뜬다. 그래서 보강을
 * 안 하기로 한 결석은 **영원히 목록에 남았다.** 치우는 길이 「없는 보강을
 * 억지로 잡기」 밖에 없었고, 그러면 출결 기록이 거짓이 된다.
 *
 * **결석은 지우지 않는다** — 회차·수강료가 그 결석을 세고 있다.
 * 목록에서만 내린다. 되돌릴 수 있게 `on` 을 받는다.
 */
export async function waiveMakeup(studentId, absentDate, on = true) {
  if (!studentId || !absentDate) return { error: "어느 결석인지 모르겠어요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("attendance")
    .update({ makeup_waived: !!on })
    .eq("student_id", studentId)
    .eq("date", absentDate);
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    return { error: "설정 → Supabase 에서 0103 을 한 번 실행해주세요." };
  }
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

// ---------- 숙제 미리 배정 ----------
/**
 * 여러 학생에게 같은 숙제를 그 날짜로 배정한다.
 * 그 날짜 리포트에 status='assigned' 로 들어가고, 다음 수업에 검사 대상이 된다.
 * @param items [{ homeworkItemId, unitIds, note }]
 */
export async function assignHomeworkAhead(studentIds, date, items) {
  const sids = Array.isArray(studentIds) ? studentIds : [studentIds];
  const list = Array.isArray(items) ? items.filter((x) => x?.homeworkItemId) : [];
  if (sids.length === 0 || list.length === 0 || !date) {
    return { error: "학생과 숙제를 골라주세요.", count: 0 };
  }

  const supabase = createClient();

  // 리포트가 없으면 만든다 (점수·태도는 수업 당일에 채운다)
  const { data: reports, error: repErr } = await supabase
    .from("daily_reports")
    .upsert(
      sids.map((student_id) => ({ student_id, date })),
      { onConflict: "student_id,date", ignoreDuplicates: false }
    )
    .select("id, student_id");
  if (repErr) return { error: repErr.message, count: 0 };

  const rows = [];
  (reports || []).forEach((r) => {
    list.forEach((it) => {
      rows.push({
        daily_report_id: r.id,
        homework_item_id: it.homeworkItemId,
        status: "assigned",
        textbook_unit_id: (it.unitIds || [])[0] || null,
        textbook_unit_ids: (it.unitIds || []).length ? it.unitIds : null,
        range_note: (it.note || "").trim() || null,
      });
    });
  });

  // 같은 숙제가 이미 배정돼 있으면 지우고 다시 넣는다
  const reportIds = (reports || []).map((r) => r.id);
  if (reportIds.length > 0) {
    await supabase
      .from("daily_report_items")
      .delete()
      .in("daily_report_id", reportIds)
      .eq("status", "assigned")
      .in("homework_item_id", list.map((x) => x.homeworkItemId));
  }

  let { error } = await supabase.from("daily_report_items").insert(rows);
  if (isMissingColumn(error)) {
    const noArray = rows.map(({ textbook_unit_ids, ...rest }) => rest);
    ({ error } = await supabase.from("daily_report_items").insert(noArray));
    if (isMissingColumn(error)) {
      const bare = noArray.map(({ textbook_unit_id, range_note, ...rest }) => rest);
      ({ error } = await supabase.from("daily_report_items").insert(bare));
    }
  }
  if (error) return { error: error.message, count: 0 };

  revalidatePath("/plan");
  revalidatePath("/today");
  return { error: null, count: rows.length };
}

// 미리 배정한 숙제 지우기
export async function unassignHomeworkAhead(studentIds, date, homeworkItemId) {
  const sids = Array.isArray(studentIds) ? studentIds : [studentIds];
  if (sids.length === 0 || !date || !homeworkItemId) return { error: null };
  const supabase = createClient();
  const { data: reports } = await supabase
    .from("daily_reports")
    .select("id")
    .in("student_id", sids)
    .eq("date", date);
  const ids = (reports || []).map((r) => r.id);
  if (ids.length === 0) return { error: null };
  const { error } = await supabase
    .from("daily_report_items")
    .delete()
    .in("daily_report_id", ids)
    .eq("status", "assigned")
    .eq("homework_item_id", homeworkItemId);
  revalidatePath("/plan");
  revalidatePath("/today");
  return ok(error);
}

// ---------- 지난 수업 고치기 ----------
/**
 * 고른 학생들의 **최근 수업**을 모아 준다.
 *
 * 검사를 빠뜨렸거나 리포트를 고쳐야 할 때, 지금까지는 날짜를 손으로 바꿔가며
 * 오늘 수업 화면을 뒤져야 했다. 여기서 날짜가 보이면 바로 그 판으로 들어간다.
 *
 * **고치는 곳은 여기가 아니다.** 오늘 수업 화면의 학생 판 하나가 검사·숙제·
 * 리포트·등원 학습을 다 갖고 있다. 같은 것을 두 군데에 만들면 언젠가 한쪽만
 * 고치게 된다 — 여기서는 **데려다만 준다.**
 */
export async function recentClasses(studentIds = [], days = 60) {
  const ids = (studentIds || []).filter(Boolean);
  if (ids.length === 0) return { rows: [], error: null };
  const supabase = createClient();
  const from = addDays(new Date().toISOString().slice(0, 10), -days);

  const BASE = "id, student_id, date, word_total, word_correct, notice";
  let { data: reps, error } = await supabase
    .from("daily_reports")
    .select(`${BASE}, report_written`)
    .in("student_id", ids)
    .gte("date", from)
    .order("date", { ascending: false });
  if (error) {
    ({ data: reps, error } = await supabase
      .from("daily_reports")
      .select(BASE)
      .in("student_id", ids)
      .gte("date", from)
      .order("date", { ascending: false }));
  }
  if (error) return { rows: [], error: error.message };

  const repIds = (reps || []).map((r) => r.id);
  const { data: its } = repIds.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", repIds)
    : { data: [] };
  const gave = new Map();     // 그날 내준 숙제
  const checked = new Map();  // 그날 검사한 숙제
  (its || []).forEach((x) => {
    const m = x.status === "assigned" ? gave : checked;
    if (x.status === "inclass") return;
    m.set(x.daily_report_id, (m.get(x.daily_report_id) || 0) + 1);
  });

  const dates = [...new Set((reps || []).map((r) => r.date))];
  const { data: att } = dates.length
    ? await supabase
        .from("attendance")
        .select("student_id, date, status")
        .in("student_id", ids)
        .in("date", dates)
    : { data: [] };
  const attOf = new Map((att || []).map((a) => [`${a.student_id}|${a.date}`, a.status]));

  return {
    rows: (reps || []).map((r) => ({
      id: r.id,
      studentId: r.student_id,
      date: r.date,
      attendance: attOf.get(`${r.student_id}|${r.date}`) || null,
      word: r.word_total ? `${r.word_correct ?? 0}/${r.word_total}` : "",
      written: !!r.report_written,
      gave: gave.get(r.id) || 0,
      checked: checked.get(r.id) || 0,
    })),
    error: null,
  };
}
