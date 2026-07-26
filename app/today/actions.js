"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unitOptions } from "@/lib/unitTree";
import { pushToStudents } from "@/app/push/actions";

function isMissingColumn(error) {
  if (!error) return false;
  return error.code === "PGRST204" || error.code === "42703";
}

// 교재 하나의 단원을 숙제 배정용 선택지로 내려준다 (교재DB의 단원명과 연동)
export async function listUnitOptions(textbookId) {
  if (!textbookId) return { options: [], error: null };
  const supabase = createClient();

  const base = "id, textbook_id, parent_id, label, name, page_start, page_end, sort";
  let { data, error } = await supabase
    .from("textbook_units")
    .select(`${base}, total_pages`)
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: true });
  if (error) {
    // total_pages 컬럼이 아직 없는 DB
    ({ data, error } = await supabase
      .from("textbook_units")
      .select(base)
      .eq("textbook_id", textbookId)
      .order("sort", { ascending: true }));
  }
  if (error) return { options: [], error: error.message };
  return { options: unitOptions(data || []), error: null };
}

// 출결만 빠르게 찍기
export async function setAttendance(studentId, date, status, note) {
  if (!studentId || !date || !status) return { error: "값이 부족해요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("attendance")
    .upsert(
      { student_id: studentId, date, status, note: note || null },
      { onConflict: "student_id,date" }
    );
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

export async function clearAttendance(studentId, date) {
  if (!studentId || !date) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("student_id", studentId)
    .eq("date", date);
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

function toInt(v) {
  const d = (v ?? "").toString().replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : null;
}

/**
 * 학생 한 명의 하루 기록을 한 번에 저장한다.
 *  - attendance: 출결
 *  - daily_reports: 점수 · 진도 · 태도 · 공지
 *  - daily_report_items: 숙제 항목별 상태(done/weak/missing)
 */
export async function saveStudentDay(studentId, date, form) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();

  // 1) 출결
  if (form.attendance) {
    const { error } = await supabase.from("attendance").upsert(
      { student_id: studentId, date, status: form.attendance },
      { onConflict: "student_id,date" }
    );
    if (error) return { error: error.message };
  }

  // 2) 리포트 본체
  //    지난 수업에 '배정한' 숙제가 오늘 모두 검사됐을 때만 '완료'로 본다
  const toCheck = Array.isArray(form.toCheck) ? form.toCheck : [];
  const checked = form.items || {};
  const unchecked = toCheck.filter((id) => !checked[id]);
  const complete = unchecked.length === 0;

  const row = {
    student_id: studentId,
    date,
    attendance_kind: form.attendance || null,
    attitude: form.attitude || null,
    word_correct: toInt(form.word_correct),
    word_total: toInt(form.word_total),
    sent_correct: toInt(form.sent_correct),
    sent_total: toInt(form.sent_total),
    own_progress: (form.own_progress || "").trim() || null,
    notice: (form.notice || "").trim() || null,
    report_written: complete,
  };
  const { data: report, error: repErr } = await supabase
    .from("daily_reports")
    .upsert(row, { onConflict: "student_id,date" })
    .select("id")
    .single();
  if (repErr) return { error: repErr.message };

  // 3) 숙제 항목 (기존 것 지우고 다시 넣기)
  const items = form.items || {};       // 검사 결과 { id: "done"|"weak"|"missing" }
  const nextIds = Array.isArray(form.nextHomework) ? form.nextHomework : []; // 다음 숙제
  const { error: delErr } = await supabase
    .from("daily_report_items")
    .delete()
    .eq("daily_report_id", report.id);
  if (delErr) return { error: delErr.message };

  // 배정한 숙제에 붙은 단원/범위 { [homework_item_id]: { unitId, note } }
  const units = form.nextUnits || {};
  const payload = [
    ...Object.entries(items)
      .filter(([, status]) => status)
      .map(([homework_item_id, status]) => ({
        daily_report_id: report.id,
        homework_item_id,
        status,
      })),
    // 다음 수업에 검사할 숙제 배정 (교재 단원과 함께)
    ...nextIds.map((homework_item_id) => ({
      daily_report_id: report.id,
      homework_item_id,
      status: "assigned",
      // 대표 단원 1개 + 전체 목록 (여러 단원 배정)
      textbook_unit_id: (units[homework_item_id]?.unitIds || [])[0] || null,
      textbook_unit_ids: (units[homework_item_id]?.unitIds || []).length
        ? units[homework_item_id].unitIds
        : null,
      range_note: (units[homework_item_id]?.note || "").trim() || null,
    })),
  ];
  if (payload.length > 0) {
    let { error } = await supabase.from("daily_report_items").insert(payload);
    if (isMissingColumn(error)) {
      // 0009 전이면 단원 1개만, 0008 전이면 단원 없이 저장
      const noArray = payload.map(({ textbook_unit_ids, ...rest }) => rest);
      ({ error } = await supabase.from("daily_report_items").insert(noArray));
      if (isMissingColumn(error)) {
        const bare = noArray.map(({ textbook_unit_id, range_note, ...rest }) => rest);
        ({ error } = await supabase.from("daily_report_items").insert(bare));
      }
    }
    if (error) return { error: error.message };
  }

  // 숙제가 배정됐으면 학생 앱으로 알림 (요금 없음, 실패해도 저장은 그대로)
  if (nextIds.length > 0) {
    try {
      const { data: names } = await supabase
        .from("homework_items")
        .select("name")
        .in("id", nextIds);
      const list = (names || []).map((n) => n.name).filter(Boolean);
      await pushToStudents([studentId], {
        title: "오늘 숙제가 올라왔어요",
        body: list.length ? list.join(", ") : "앱에서 확인해주세요",
        url: "/me",
        tag: "homework",
      });
    } catch {
      // 알림 실패는 무시한다
    }
  }

  revalidatePath("/today");
  return { error: null, complete, unchecked: unchecked.length };
}

// 완료 취소: 기록을 '미완료'로 되돌린다 (입력값은 그대로 둠)
export async function reopenReport(studentId, date) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ report_written: false })
    .eq("student_id", studentId)
    .eq("date", date);
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

// ============================================================
// 공지 · 전달사항
//   kind = 'deliver' : 수업 중 학생에게 전달할 사항 (하원 전 체크)
//   kind = 'notice'  : 학부모 리포트에 나갈 공지
// 대상은 만들 때 확정해서 notice_receipts 에 한 줄씩 깔아둔다.
// ============================================================

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

async function rosterOf(supabase, date) {
  const target = new Date(`${date}T00:00:00+09:00`);
  const dow = DOW[target.getDay()];
  const { data: classes } = await supabase.from("classes").select("id, days");
  const ids = (classes || []).filter((c) => (c.days || []).includes(dow)).map((c) => c.id);
  if (ids.length === 0) return [];
  const { data: members } = await supabase
    .from("class_students")
    .select("class_id, student_id")
    .in("class_id", ids);
  return members || [];
}

export async function createNotice(input) {
  const { date, kind, scope, classId, school, grade, studentIds, body } = input || {};
  const text = (body || "").trim();
  if (!date || !text) return { error: "내용을 적어주세요." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 대상 학생 확정
  let targets = [];
  if (scope === "student") {
    targets = Array.isArray(studentIds) ? [...new Set(studentIds)] : [];
  } else {
    const roster = await rosterOf(supabase, date);
    let ids = [...new Set(roster.map((m) => m.student_id))];
    if (scope === "class") {
      if (!classId) return { error: "반을 골라주세요." };
      ids = [...new Set(roster.filter((m) => m.class_id === classId).map((m) => m.student_id))];
    }
    if (scope === "grade") {
      if (!school && !grade) return { error: "학교나 학년을 골라주세요." };
      const { data: ss } = await supabase
        .from("students")
        .select("id, school, grade")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      ids = (ss || [])
        .filter((s) => (!school || s.school === school) && (!grade || s.grade === grade))
        .map((s) => s.id);
    }
    targets = ids;
  }
  if (targets.length === 0) return { error: "대상 학생이 없어요." };

  const { data: notice, error } = await supabase
    .from("notices")
    .insert({
      date,
      kind: kind === "notice" ? "notice" : "deliver",
      scope: scope || "all",
      class_id: scope === "class" ? classId : null,
      school: scope === "grade" ? school || null : null,
      grade: scope === "grade" ? grade || null : null,
      body: text,
      created_by: user?.id || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { error: rErr } = await supabase
    .from("notice_receipts")
    .insert(targets.map((student_id) => ({ notice_id: notice.id, student_id })));
  if (rErr) return { error: rErr.message };

  revalidatePath("/today");
  return { error: null, count: targets.length };
}

export async function deleteNotice(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("notices").delete().eq("id", id);
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

// 하원 전 "전달했어요" 체크
export async function setDelivered(noticeId, studentId, delivered) {
  if (!noticeId || !studentId) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("notice_receipts")
    .update({ delivered_at: delivered ? new Date().toISOString() : null })
    .eq("notice_id", noticeId)
    .eq("student_id", studentId);
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

// 한 학생의 전달사항을 한 번에 처리 (하원 처리용)
export async function setAllDelivered(studentId, noticeIds, delivered) {
  if (!studentId || !Array.isArray(noticeIds) || noticeIds.length === 0) {
    return { error: null };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("notice_receipts")
    .update({ delivered_at: delivered ? new Date().toISOString() : null })
    .eq("student_id", studentId)
    .in("notice_id", noticeIds);
  revalidatePath("/today");
  return { error: error ? error.message : null };
}
