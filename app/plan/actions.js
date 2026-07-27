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
