"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unitOptions } from "@/lib/unitTree";
import { pushToStudents } from "@/app/push/actions";
import { dowOf } from "@/lib/day";
import { taskTitle, nextClassDate, autoKey } from "@/lib/prepTask";

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
  //    단, 결석이면 검사할 게 없으므로 완료로 본다 (숙제는 다음 수업에 검사한다)
  const toCheck = Array.isArray(form.toCheck) ? form.toCheck : [];
  const checked = form.items || {};
  const absent = form.attendance === "absent";
  const unchecked = absent ? [] : toCheck.filter((id) => !checked[id]);
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
    notice_student: (form.notice_student || "").trim() || null,
    report_written: complete,
  };
  let { data: report, error: repErr } = await supabase
    .from("daily_reports")
    .upsert(row, { onConflict: "student_id,date" })
    .select("id")
    .single();
  if (isMissingColumn(repErr)) {
    // 0050 전이면 학생공지 없이
    const { notice_student: _ns, ...noSplit } = row;
    ({ data: report, error: repErr } = await supabase
      .from("daily_reports")
      .upsert(noSplit, { onConflict: "student_id,date" })
      .select("id")
      .single());
  }
  if (repErr) return { error: repErr.message };

  // 3) 숙제 항목 (기존 것 지우고 다시 넣기)
  const items = form.items || {};       // 검사 결과 { id: "done"|"weak"|"missing" }
  let nextIds = Array.isArray(form.nextHomework) ? form.nextHomework : []; // 다음 숙제

  // 집에서는 못 하는 학습을 숙제로 낼 때 바꿔준다 (구두테스트 → 셀프녹음테스트).
  // 루틴은 등원 기준 하나만 알면 되고, 숙제로 나갈 때 여기서 알아서 바뀐다.
  if (nextIds.length > 0) {
    const { data: twins } = await supabase
      .from("homework_items")
      .select("id, home_item_id")
      .in("id", nextIds)
      .not("home_item_id", "is", null);
    if (twins?.length) {
      const swap = new Map(twins.map((t) => [t.id, t.home_item_id]));
      nextIds = [...new Set(nextIds.map((id) => swap.get(id) || id))];
    }
  }
  // 오늘 학원에서 할 것 — 학생 화면에 순서대로 뜨고, 타이머가 여기 붙는다
  const inClassIds = Array.isArray(form.inClass) ? form.inClass : [];
  // 학생이 눌러둔 '학습 완료' 는 지우고 다시 넣어도 살려야 한다
  const { data: keepDone } = await supabase
    .from("daily_report_items")
    .select("homework_item_id, status, student_done_at")
    .eq("daily_report_id", report.id)
    .not("student_done_at", "is", null);
  const doneAt = new Map(
    (keepDone || []).map((x) => [`${x.homework_item_id}|${x.status}`, x.student_done_at])
  );

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
    // 오늘 학원에서 할 것
    ...inClassIds.map((homework_item_id) => ({
      daily_report_id: report.id,
      homework_item_id,
      status: "inclass",
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
  payload.forEach((r) => {
    const at = doneAt.get(`${r.homework_item_id}|${r.status}`);
    if (at) r.student_done_at = at;
  });

  if (payload.length > 0) {
    let { error } = await supabase.from("daily_report_items").insert(payload);
    if (isMissingColumn(error)) {
      // 0034 전이면 학생 완료 표시 없이
      ({ error } = await supabase
        .from("daily_report_items")
        .insert(payload.map(({ student_done_at, ...rest }) => rest)));
    }
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

  // 배정한 숙제 중 "내가 준비해야 하는 것" 은 내 할일로 올린다
  await syncPrepTasks(supabase, studentId, date, nextIds, units);

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


async function rosterOf(supabase, date) {
  const dow = dowOf(date);
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

/**
 * 오늘 수업 화면에서 바로 **재시험 · 보강 날짜**를 잡는다.
 *
 * 숙제를 검사하다가 미제출·미흡이 나오면 그 자리에서 "그럼 목요일에 다시 보자" 가 된다.
 * 지금까지는 일정 화면으로 나갔다 와야 해서 수업 흐름이 끊겼다.
 *
 * 보강도 재시험도 attendance 한 줄로 남는다 (status='makeup').
 *   reason 에 무엇 때문인지 적어두면 그날 화면에서 바로 보인다.
 */
export async function bookMakeup(studentId, makeupDate, reason, absentDate, makeupTime) {
  if (!studentId || !makeupDate) return { error: "날짜를 골라주세요." };
  const supabase = createClient();

  const row = {
    student_id: studentId,
    date: makeupDate,
    status: "makeup",
    makeup_of: absentDate || null,
    reason: (reason || "").trim() || null,
    // 보강은 비는 시간에 끼워 넣는 것이라 몇 시인지가 날짜만큼 중요하다
    makeup_time: (makeupTime || "").trim() || null,
  };
  let { error } = await supabase
    .from("attendance")
    .upsert(row, { onConflict: "student_id,date" });
  if (isMissingColumn(error)) {
    // 0046 전이면 시간 없이
    const { makeup_time: _t, ...noTime } = row;
    ({ error } = await supabase
      .from("attendance")
      .upsert(noTime, { onConflict: "student_id,date" }));
  }
  if (isMissingColumn(error)) {
    // 0017 전이면 reason 도 없이
    const { makeup_time: _t2, reason: _drop, ...bare } = row;
    ({ error } = await supabase
      .from("attendance")
      .upsert(bare, { onConflict: "student_id,date" }));
  }
  if (error) return { error: error.message };

  revalidatePath("/today");
  revalidatePath("/plan");
  return { error: null };
}


/**
 * 배정한 숙제에서 **내 할일**을 만든다.
 *
 * 단원평가 대비 복습을 내주면 다음 수업 전에 내가 문제를 내야 한다.
 * 어떤 숙제가 그런지는 `homework_items.prep_task` 에 적혀 있다 (학습 항목 화면에서 관리).
 *
 * 배정을 취소하면 아직 안 한 할일은 같이 사라진다.
 * 이미 끝낸 할일은 건드리지 않는다 — 한 일은 한 일이다.
 */
async function syncPrepTasks(supabase, studentId, date, nextIds = [], units = {}) {
  // 0028 전이면 조용히 넘어간다
  const itemQ = nextIds.length
    ? await supabase.from("homework_items").select("id, name, prep_task").in("id", nextIds)
    : { data: [], error: null };
  if (itemQ.error) return;

  const need = (itemQ.data || []).filter((i) => (i.prep_task || "").trim());

  // 이 학생·이 날짜로 만들어 둔 자동 할일
  const prefix = `prep:${studentId}:`;
  const curQ = await supabase
    .from("tasks")
    .select("id, auto_key, status")
    .like("auto_key", `${prefix}%`)
    .like("auto_key", `%:${date}`);
  if (curQ.error) return;   // auto_key 컬럼이 아직 없다

  const keep = new Set(need.map((i) => autoKey(studentId, i.id, date)));

  // 배정을 뺐으면 아직 안 한 할일은 지운다
  const stale = (curQ.data || [])
    .filter((t) => !keep.has(t.auto_key) && t.status === "open")
    .map((t) => t.id);
  if (stale.length > 0) await supabase.from("tasks").delete().in("id", stale);

  if (need.length === 0) return;

  const { data: student } = await supabase
    .from("students")
    .select("name")
    .eq("id", studentId)
    .maybeSingle();

  // 다음 수업일까지 준비돼 있어야 한다
  const { data: mine } = await supabase
    .from("class_students")
    .select("class_id")
    .eq("student_id", studentId);
  const classIds = (mine || []).map((m) => m.class_id);
  const { data: klasses } = classIds.length
    ? await supabase.from("classes").select("id, days").in("id", classIds)
    : { data: [] };
  const days = [...new Set((klasses || []).flatMap((c) => c.days || []))];
  const due = nextClassDate(date, days);

  const { data: cat } = await supabase
    .from("todo_categories")
    .select("id")
    .eq("name", "수업 준비")
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 그 숙제에 붙여준 단원 이름 (제목에 {단원} 을 쓸 수 있게)
  const unitIds = [
    ...new Set(need.flatMap((i) => units[i.id]?.unitIds || []).filter(Boolean)),
  ];
  const { data: unitRows } = unitIds.length
    ? await supabase
        .from("textbook_units")
        .select("id, name, label, textbook_id")
        .in("id", unitIds)
    : { data: [] };
  const unitById = new Map((unitRows || []).map((u) => [u.id, u]));
  const bookIds = [...new Set((unitRows || []).map((u) => u.textbook_id).filter(Boolean))];
  const { data: bookRows } = bookIds.length
    ? await supabase.from("textbooks").select("id, name").in("id", bookIds)
    : { data: [] };
  const bookName = new Map((bookRows || []).map((b) => [b.id, b.name]));

  const labelOf = (itemId) => {
    const u = units[itemId] || {};
    const names = (u.unitIds || [])
      .map((id) => unitById.get(id))
      .filter(Boolean)
      .map((x) => [x.label, x.name].filter(Boolean).join(" ").trim())
      .filter(Boolean);
    // 단원을 안 골랐으면 직접 적은 범위를 쓴다
    const unit = names.join(", ") || (u.note || "").trim();
    const firstBook = (u.unitIds || [])
      .map((id) => unitById.get(id)?.textbook_id)
      .find(Boolean);
    return { unit, book: firstBook ? bookName.get(firstBook) || "" : "" };
  };

  const rows = need.map((i) => ({
    title: taskTitle(i.prep_task, {
      student: student?.name,
      item: i.name,
      ...labelOf(i.id),
    }),
    kind: "todo",
    due_on: due,
    status: "open",
    todo_category_id: cat?.id || null,
    note: `${date} 수업에서 '${i.name}' 을 배정했습니다.`,
    auto_key: autoKey(studentId, i.id, date),
    created_by: user?.id || null,
  }));

  // 이미 있으면 그대로 둔다 (마감일을 옮겨놨을 수 있다)
  await supabase.from("tasks").upsert(rows, {
    onConflict: "auto_key",
    ignoreDuplicates: true,
  });

  revalidatePath("/todo");
}
