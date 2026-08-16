"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unitOptions } from "@/lib/unitTree";
import { pushToStudents, pushToFamilies } from "@/app/push/actions";
import { safeKind, isAlert } from "@/lib/notices";
import { dowOf } from "@/lib/day";
import { taskTitle, nextClassDate, autoKey } from "@/lib/prepTask";
import { inTarget } from "@/lib/who";
import { noColumn } from "@/lib/sqlError";
import { sessionUser } from "@/lib/session";

// 교재 하나의 단원을 숙제 배정용 선택지로 내려준다 (교재DB의 단원명과 연동)
export async function listUnitOptions(textbookId) {
  if (!textbookId) return { options: [], error: null };
  const supabase = createClient();

  // 분량·내용(0100)까지 실어와야 고르는 순간에 「이게 25문항이구나」 를 안다.
  // 없는 DB 도 있으므로 아래로 한 칸씩 내려가며 다시 본다
  const base = "id, textbook_id, parent_id, label, name, page_start, page_end, sort, question_no";
  const LADDER = [
    `${base}, total_pages, question_count, question_range, word_count, summary, minutes`,
    `${base}, total_pages`,
    base,
    "id, textbook_id, parent_id, label, name, page_start, page_end, sort",
  ];
  let data = null;
  let error = null;
  for (const cols of LADDER) {
    ({ data, error } = await supabase
      .from("textbook_units")
      .select(cols)
      .eq("textbook_id", textbookId)
      .order("sort", { ascending: true }));
    if (!error) break;
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
  /**
   * **임시저장** (원장님, 2026-08-11 — 「임시저장 기능 필요해」).
   * 적은 것은 다 저장하되 「기록 끝」 으로는 안 넘긴다 — 학생이 완료
   * 묶음으로 접혀 들어가지 않고, 이어서 적을 수 있다.
   */
  const complete = form.draft ? false : unchecked.length === 0;

  const row = {
    student_id: studentId,
    date,
    attendance_kind: form.attendance || null,
    // attitude 칸이 곧 **집중도**다 (0118 — 이름만 바뀌고 칸은 그대로)
    attitude: form.attitude || null,
    understanding: form.understanding || null,
    word_correct: toInt(form.word_correct),
    word_total: toInt(form.word_total),
    sent_correct: toInt(form.sent_correct),
    sent_total: toInt(form.sent_total),
    // 단원평가 — 원장님: 「단원평가는 현재 오늘 수업에서 적는 그거랑 같은 거야」
    sent_unit: (form.sent_unit || "").trim() || null,
    sent_passed: form.sent_passed === "" || form.sent_passed == null ? null : !!form.sent_passed,
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
  if (noColumn(repErr)) {
    // 0118 전이면 이해도 없이
    const { understanding: _ud, ...noUd } = row;
    ({ data: report, error: repErr } = await supabase
      .from("daily_reports")
      .upsert(noUd, { onConflict: "student_id,date" })
      .select("id")
      .single());
  }
  if (noColumn(repErr)) {
    // 0099 전이면 단원평가 두 칸 없이
    const { sent_unit: _su, sent_passed: _sp, understanding: _ud2, ...noUnit } = row;
    ({ data: report, error: repErr } = await supabase
      .from("daily_reports")
      .upsert(noUnit, { onConflict: "student_id,date" })
      .select("id")
      .single());
  }
  if (noColumn(repErr)) {
    // 0050 전이면 학생공지도 없이
    const { sent_unit: _su2, sent_passed: _sp2, notice_student: _ns, understanding: _ud3, ...noSplit } = row;
    ({ data: report, error: repErr } = await supabase
      .from("daily_reports")
      .upsert(noSplit, { onConflict: "student_id,date" })
      .select("id")
      .single());
  }
  if (repErr) return { error: repErr.message };

  // 2-2) **단원평가는 성적으로도 흘려보낸다** (0099)
  //
  //   원장님: 「단원평가는 현재 오늘 수업에서 적는 그거랑 같은 거야」
  //
  //   리포트(scores, kind='unit')는 노션에서 옮겨온 122줄이 사는 곳이다.
  //   여기서 적은 것이 거기로 안 가면, 옛 기록과 앞으로 쌓일 기록이 갈라진다.
  //   **daily_reports 가 원본이고 scores 는 사본이다** — (학생·날짜)를 열쇠로
  //   덮어쓰므로 사본이 스스로 달라질 길이 없다.
  //
  //   단원명을 적으신 것만 보낸다. 그냥 문장 테스트는 성적이 아니라
  //   그날의 확인이라, 성적표에 줄이 서면 오히려 지저분해진다.
  await mirrorUnitScore(supabase, {
    studentId,
    date,
    unit: (form.sent_unit || "").trim(),
    correct: toInt(form.sent_correct),
    total: toInt(form.sent_total),
    passed: form.sent_passed === "" || form.sent_passed == null ? null : !!form.sent_passed,
  });

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

  // **무엇이 바뀌었는지 알려면 무엇이 있었는지 먼저 봐야 한다.**
  //   저장할 때마다 통째로 지우고 다시 넣기 때문에, 지우기 전에 적어둔다.
  //   그래야 「이 줄은 원래 있던 것」 과 「이번에 새로 생긴 것」 을 가를 수 있다.
  const { data: before } = await supabase
    .from("daily_report_items")
    .select("homework_item_id, status, textbook_unit_ids, range_note, changed_at")
    .eq("daily_report_id", report.id);
  const had = new Map(
    (before || []).map((x) => [`${x.homework_item_id}|${x.status}`, x])
  );
  // 이 리포트에 숙제가 한 번이라도 들어간 적이 있나.
  // 처음 주는 숙제는 「바뀐 것」 이 아니다 — 그날 원래 받은 것이다.
  const hadAny = (before || []).some((x) => x.status === "assigned");

  const { error: delErr } = await supabase
    .from("daily_report_items")
    .delete()
    .eq("daily_report_id", report.id);
  if (delErr) return { error: delErr.message };

  // 배정한 숙제에 붙은 단원/범위 { [homework_item_id]: { unitId, note } }
  const units = form.nextUnits || {};
  // 클카 자동 판정이 남기는 검사 메모 (0062 check_note) — 「안 한 세트가
  // 무엇인지」 가 학생 화면(💬 선생님)과 데일리리포트에 같이 나간다
  const checkNotes = form.checkNotes || {};
  const payload = [
    ...Object.entries(items)
      .filter(([, status]) => status)
      .map(([homework_item_id, status]) => ({
        daily_report_id: report.id,
        homework_item_id,
        status,
        check_note: (checkNotes[homework_item_id] || "").trim() || null,
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
  // 새로 생겼거나 범위가 달라진 줄에만 「바뀐 시각」 을 찍는다.
  // 안 바뀐 줄은 **원래 있던 시각을 그대로** 들고 간다 — 그러지 않으면
  // 저장을 한 번 더 누르는 것만으로 목록 전체가 「바뀜」 이 된다.
  const changedNames = [];
  payload.forEach((r) => {
    const at = doneAt.get(`${r.homework_item_id}|${r.status}`);
    if (at) r.student_done_at = at;
    if (r.status !== "assigned") return;
    const old = had.get(`${r.homework_item_id}|assigned`);
    const same =
      old &&
      (old.range_note || "") === (r.range_note || "") &&
      JSON.stringify(old.textbook_unit_ids || []) === JSON.stringify(r.textbook_unit_ids || []);
    if (same) {
      r.changed_at = old.changed_at || null;
      return;
    }
    if (!hadAny) return;                    // 그날 처음 주는 숙제
    r.changed_at = new Date().toISOString();
    changedNames.push(r.homework_item_id);
  });

  if (payload.length > 0) {
    let { error } = await supabase.from("daily_report_items").insert(payload);
    if (noColumn(error)) {
      // 0062 전이면 검사 메모 칸이 없다
      ({ error } = await supabase
        .from("daily_report_items")
        .insert(payload.map(({ check_note, ...rest }) => rest)));
    }
    if (noColumn(error)) {
      // 0087 전이면 「바뀐 시각」 칸이 없다
      ({ error } = await supabase
        .from("daily_report_items")
        .insert(payload.map(({ changed_at, ...rest }) => rest)));
    }
    if (noColumn(error)) {
      // 0034 전이면 학생 완료 표시 없이
      ({ error } = await supabase
        .from("daily_report_items")
        .insert(payload.map(({ student_done_at, ...rest }) => rest)));
    }
    if (noColumn(error)) {
      // 0009 전이면 단원 1개만, 0008 전이면 단원 없이 저장
      const noArray = payload.map(({ textbook_unit_ids, ...rest }) => rest);
      ({ error } = await supabase.from("daily_report_items").insert(noArray));
      if (noColumn(error)) {
        const bare = noArray.map(({ textbook_unit_id, range_note, ...rest }) => rest);
        ({ error } = await supabase.from("daily_report_items").insert(bare));
      }
    }
    if (error) return { error: error.message };
  }

  // 배정한 숙제 중 "내가 준비해야 하는 것" 은 내 할일로 올린다.
  // 여기서 실패해도 **오늘 기록은 살아 있어야 한다** — 할일은 다시 만들 수 있지만
  // 수업 기록이 날아가면 곤란하다. 대신 조용히 넘기지 않고 같이 알려준다.
  const prep = await syncPrepTasks(supabase, studentId, date, nextIds, units);

  // 숙제가 배정됐으면 학생 앱으로 알림 (요금 없음, 실패해도 저장은 그대로)
  if (nextIds.length > 0) {
    try {
      const { data: names } = await supabase
        .from("homework_items")
        .select("id, name")
        .in("id", nextIds);
      const nameById = new Map((names || []).map((n) => [n.id, n.name]));
      const changed = changedNames.map((id) => nameById.get(id)).filter(Boolean);
      const list = (names || []).map((n) => n.name).filter(Boolean);
      // **바뀐 것이 있으면 그것부터 말한다.** 「숙제가 올라왔어요」 만 오면
      // 아까 본 것과 무엇이 다른지 아이가 알 수가 없다
      await pushToStudents([studentId], {
        title: changed.length ? "숙제가 바뀌었어요" : "오늘 숙제가 올라왔어요",
        body: changed.length
          ? `${changed.join(", ")} — 앱에서 확인해주세요`
          : (list.length ? list.join(", ") : "앱에서 확인해주세요"),
        url: "/me",
        tag: "homework",
      });
    } catch {
      // 알림 실패는 무시한다
    }
  }

  /**
   * 클카 그림자 기록 (0132, 원장님 「시뮬레이션 한 달간 돌려봐」) —
   * 자동 판정 vs 원장님 실제 판정을 나란히. 원장님이 실제로 찍은
   * 항목만 비교가 된다. 실패해도 조용히 — 저장이 먼저다.
   */
  {
    const shadow = form.ccShadow || {};
    const shadowRows = Object.entries(shadow)
      .filter(([iid]) => items[iid])
      .map(([iid, v]) => ({
        student_id: studentId,
        date,
        item_id: iid,
        auto_status: v?.status || null,
        actual_status: items[iid],
        note: (v?.note || "").slice(0, 300) || null,
      }));
    if (shadowRows.length) {
      try { await supabase.from("classcard_shadow").upsert(shadowRows); } catch { /* 0132 전 */ }
    }
  }

  /**
   * **임시저장이면 화면을 안 갈아엎는다.** revalidatePath 가 돌면 열어둔
   * 학생 판이 접힌다 — 이어서 적으려고 임시저장을 눌렀는데 흐름이 끊긴다.
   * 서버에는 이미 들어갔으니, 다음 저장이나 새로고침 때 자연히 맞춰진다.
   */
  if (!form.draft) revalidatePath("/today");
  return {
    error: null,
    complete,
    unchecked: unchecked.length,
    warn: prep?.error || null,   // 기록은 됐지만 할일은 못 만든 경우
  };
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
  const { date, kind, scope, classId, school, grade, studentIds, body, title } = input || {};
  const text = (body || "").trim();
  const head = (title || "").trim();
  // 사진만 보내는 경우도 있다 — 학교에서 나눠준 종이를 찍어서.
  // 그때는 제목만 있으면 된다.
  if (!date || (!text && !head)) return { error: "내용을 적어주세요." };

  const supabase = createClient();
  const user = await sessionUser(supabase);

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
        .filter((s) => inTarget(s, { school, grade }))
        .map((s) => s.id);
    }
    targets = ids;
  }
  if (targets.length === 0) return { error: "대상 학생이 없어요." };

  const row = {
    date,
    kind: safeKind(kind),
    scope: scope || "all",
    class_id: scope === "class" ? classId : null,
    school: scope === "grade" ? school || null : null,
    grade: scope === "grade" ? grade || null : null,
    body: text || head,
    title: head || null,
    created_by: user?.id || null,
  };
  let { data: notice, error } = await supabase.from("notices").insert(row).select("id").single();
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0064 전이면 제목 없이
    const { title: _t, ...noTitle } = row;
    ({ data: notice, error } = await supabase.from("notices").insert(noTitle).select("id").single());
  }
  if (error) return { error: error.message };

  const { error: rErr } = await supabase
    .from("notice_receipts")
    .insert(targets.map((student_id) => ({ notice_id: notice.id, student_id })));
  if (rErr) {
    // **고아 공지를 남기지 않는다** (전수검사 A16) — 받는 사람 없이 목록에
    // 남으면 「보냈는데요」 의 근거가 되어버린다 (postAppNotices 와 같은 규칙)
    await supabase.from("notices").delete().eq("id", notice.id);
    return { error: rErr.message };
  }

  /**
   * **여기서는 알림을 안 보낸다** (원장님, 2026-08-07 —
   * 「수업 중에 얼굴 보고 말할 거를 잊지 않게 메모하는 용도인 거라
   *  알림이 가면 안 돼」 · 「공지는 알림 없이 숙제에 포함되었으면」).
   *
   * ── 무엇을 잘못 알고 있었나 ─────────────────────────────
   *
   * 예전에는 「올렸으면 알린다」 였다. 올려두기만 하면 앱을 열어야 아는데
   * 앱은 대개 숙제할 때 여니까 늦다는 생각이었다.
   *
   * 그런데 이 화면의 공지는 **보내는 글이 아니라 원장님의 메모**다.
   * 수업 중에 얼굴 보고 말할 것을 잊지 않으려고 적어두는 자리다 —
   * 말은 교실에서 하고, 여기 체크는 「말했다」 는 표시일 뿐이다.
   * 그런데 적는 순간 아이 폰이 울렸다. 아직 아무 말도 안 했는데.
   *
   * ── 그럼 어떻게 닿나 ────────────────────────────────────
   *
   *   숙제 공지(homework)     그날 숙제 안내에 함께
   *   리포트 공지(notice)      데일리리포트에 함께
   *   수업 메모(memo)          교실에서 말로 — 아무 데도 안 나감
   *
   * 셋 다 **어차피 나가는 글에 실려서** 가거나, 아예 안 나간다.
   * 따로 울릴 이유가 없다.
   *
   * ── 그런데 지금 당장 알려야 하는 일이 있다 (2026-08-07) ──
   *
   * 오늘 휴원, 지금 오지 마세요, 앞 수업이 늦어집니다 — 이건 리포트에
   * 실어 보낼 수가 없다. 적을 자리가 없어서 발송 화면으로 건너가
   * 따로 보내셨고, 그래서 수업 중 동선이 꼬였다.
   *
   * **울리는 갈래를 두 개 따로 냈다** — 「학생 알림」 · 「학부모 알림」.
   * 이름에 「알림」 이 붙은 것만 울린다. 그러면 실수로 울릴 일이 없다.
   */
  let sent = 0;
  if (isAlert(row.kind)) {
    const title = row.kind === "alert_student" ? "학생 알림" : "학부모 알림";
    const res = row.kind === "alert_student"
      ? await pushToStudents(targets, { title, body: text || head, url: "/me" })
      : await pushToFamilies(targets, { title, body: text || head, url: "/parent" }, "parent");
    sent = res?.sent || 0;
  }

  revalidatePath("/today");
  revalidatePath("/me");
  revalidatePath("/parent");
  return { error: null, count: targets.length, id: notice.id, sent, kind: row.kind };
}

/**
 * 공지를 **제자리에서 고친다** (원장님, 2026-08-14 — 「확인했어도 수정 후
 * 재공지 필요할 수가 있어서」).
 *
 * 고친 시각(edited_at)을 새긴다 — 학생·학부모 길목(NoticeGate)은 공지를
 * 「id + 고친 시각」 으로 기억하므로, 고치는 순간 **확인했던 사람에게도
 * 새 공지처럼 다시 뜬다.** 사진은 그대로 둔다 (사진을 바꿀 일은 지우고
 * 다시 쓰는 편이 낫다 — 어중간하게 섞이면 어느 판이 맞는지 모른다).
 */
export async function updateNotice(id, { body } = {}) {
  if (!id) return { error: "공지를 찾지 못했어요." };
  if (!(body || "").trim()) return { error: "내용을 적어주세요." };
  const supabase = createClient();
  // 본문만 고친다 — 공지에 제목 칸은 없다는 확정 설계 그대로 (check-notice)
  let { error } = await supabase
    .from("notices")
    .update({ body: body.trim(), edited_at: new Date().toISOString() })
    .eq("id", id);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0121 전 — 시각 없이 내용만 (재공지는 0121 을 돌려야 켜진다)
    ({ error } = await supabase
      .from("notices")
      .update({ body: body.trim() })
      .eq("id", id));
  }
  revalidatePath("/today");
  revalidatePath("/me");
  revalidatePath("/parent");
  return { error: error ? error.message : null };
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
  if (noColumn(error)) {
    // 0046 전이면 시간 없이
    const { makeup_time: _t, ...noTime } = row;
    ({ error } = await supabase
      .from("attendance")
      .upsert(noTime, { onConflict: "student_id,date" }));
  }
  if (noColumn(error)) {
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
export async function syncPrepTasks(supabase, studentId, date, nextIds = [], units = {}) {
  // 0028 전이면 조용히 넘어간다
  const itemQ = nextIds.length
    ? await supabase.from("homework_items").select("id, name, prep_task").in("id", nextIds)
    : { data: [], error: null };
  if (itemQ.error) return { error: null };   // 0028 전이면 조용히 넘어간다

  const need = (itemQ.data || []).filter((i) => (i.prep_task || "").trim());

  // 이 학생·이 날짜로 만들어 둔 자동 할일
  const prefix = `prep:${studentId}:`;
  const curQ = await supabase
    .from("tasks")
    .select("id, auto_key, status")
    .like("auto_key", `${prefix}%`)
    .like("auto_key", `%:${date}`);
  if (curQ.error) return { error: null };   // auto_key 칸이 아직 없다

  const keep = new Set(need.map((i) => autoKey(studentId, i.id, date)));

  // 배정을 뺐으면 아직 안 한 할일은 지운다
  const stale = (curQ.data || [])
    .filter((t) => !keep.has(t.auto_key) && t.status === "open")
    .map((t) => t.id);
  if (stale.length > 0) await supabase.from("tasks").delete().in("id", stale);

  if (need.length === 0) return { error: null };

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

  const user = await sessionUser(supabase);

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
  const { error } = await supabase.from("tasks").upsert(rows, {
    onConflict: "auto_key",
    ignoreDuplicates: true,
  });
  // 여기서 조용히 실패하면 **할일이 안 생긴 줄도 모른다.** 실제로 그랬다
  // (0061 전에는 조건부 인덱스라 ON CONFLICT 가 걸리지 않았다).
  if (error) {
    console.error("숙제 → 내 할일 만들기 실패:", error.message);
    return { error: `할일을 만들지 못했어요: ${error.message}` };
  }

  revalidatePath("/tasks");
  return { error: null };
}

/**
 * **단원평가를 성적으로 옮겨 적는다** (0099).
 *
 * 원장님 (2026-08-06) — 「단원평가는 현재 오늘 수업에서 적는 그거랑 같은 거야」
 *
 * 오늘 수업에서 적으신 문법 테스트에 **단원명**이 붙어 있으면 그것이
 * 단원평가다. 노션에서 옮겨온 122줄과 같은 자리(`scores`, kind='unit')에
 * 넣어야 리포트에서 한 줄기로 보인다.
 *
 * **(학생·날짜·kind)를 열쇠로 덮어쓴다.** 같은 날 두 번 저장해도 한 줄이고,
 * 점수를 고치면 사본도 따라 고쳐진다. 사본이 스스로 달라질 길이 없다.
 *
 * **단원명을 지우면 사본도 지운다.** 잘못 적으신 것을 고치셨는데 성적표에는
 * 남아 있으면, 없는 시험이 영영 남는다.
 *
 * 실패해도 수업 기록 저장을 막지 않는다 — 0097·0099 를 아직 안 돌리셨을 수
 * 있고, 그것 때문에 오늘 수업이 저장이 안 되면 훨씬 큰일이다.
 */
async function mirrorUnitScore(supabase, { studentId, date, unit, correct, total, passed }) {
  try {
    const { data: have } = await supabase
      .from("scores")
      .select("id, source")
      .eq("student_id", studentId)
      .eq("kind", "unit")
      .eq("taken_on", date)
      .maybeSingle();

    if (!unit) {
      // 단원명을 지우셨다 — 이 화면이 만든 사본만 거둔다.
      // 원장님이 성적 화면에서 손으로 넣으신 것(source 가 class 가 아닌 것)은
      // 건드리지 않는다
      if (have?.id && have.source === "class") {
        await supabase.from("scores").delete().eq("id", have.id);
      }
      return;
    }

    const row = {
      student_id: studentId,
      kind: "unit",
      term: unit,
      taken_on: date,
      // 점수는 「맞은 개수 / 전체」 를 100점으로 환산해서 넣는다.
      // 노션에서 옮겨온 줄도 100점 만점이라 나란히 놓고 볼 수 있다
      raw_score: total > 0 && correct != null ? Math.round((correct / total) * 100) : null,
      full_score: total > 0 ? 100 : null,
      note: [
        passed == null ? "" : passed ? "통과" : "재시험",
        total > 0 ? `${total}문제 중 ${total - (correct ?? 0)}개 틀림` : "",
      ].filter(Boolean).join(" · ") || null,
      source: "class",
    };

    if (have?.id) await supabase.from("scores").update(row).eq("id", have.id);
    else await supabase.from("scores").insert(row);

    revalidatePath("/scores");
  } catch {
    // 조용히 넘어간다 — 수업 기록이 저장되는 것이 먼저다
  }
}
