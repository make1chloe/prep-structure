"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { unitOptions } from "@/lib/unitTree";
import { pushToStudents, pushToFamilies } from "@/app/push/actions";
import { queuePush } from "@/lib/pushQueue";
import { safeKind, isAlert } from "@/lib/notices";
import { todaySeoul, addDays } from "@/lib/day";
import { rosterOn } from "@/lib/roster";
import { openAnswers } from "@/lib/answers";
import { checkMany } from "@/lib/checkWrite";
import { planMany } from "@/lib/planWrite";
import { taskTitle, nextClassDate, autoKey } from "@/lib/prepTask";
import { inTarget } from "@/lib/who";
import { noColumn } from "@/lib/sqlError";
import { sessionUser } from "@/lib/session";
// 회독·되돌리기 금지 규칙째로 재사용한다 (원칙 1 — 같은 판단을 두 벌 안 만든다)
import { applyCheckProgress } from "@/lib/checkProgress";

// 교재 하나의 단원을 숙제 배정용 선택지로 내려준다 (교재DB의 단원명과 연동)
export async function listUnitOptions(textbookId) {
  if (!textbookId) return { options: [], error: null };
  const supabase = await createClient();

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
  const supabase = await createClient();
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
  const supabase = await createClient();
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
/**
 * 오늘 진도 판에 찍은 ○·◐ 를 리포트 문구로 (0134 marked_on).
 * 예: "그래머인사이드1: UNIT 3 ○ · UNIT 4 ◐ 하는 중 / 쓰작1: 1과 ○"
 * marked_on 이 없는 DB(0134 전)면 조용히 빈 값 — 손 문구만 쓰던 그대로.
 */
async function todayProgressDraft(supabase, studentId, date) {
  const { data: prog, error } = await supabase
    .from("student_unit_progress")
    .select("textbook_unit_id, status, round, marked_on")
    .eq("student_id", studentId)
    .eq("marked_on", date)
    .in("status", ["done", "doing"]);
  if (error || !prog?.length) return "";

  const ids = [...new Set(prog.map((r) => r.textbook_unit_id))];
  const { data: units } = await supabase
    .from("textbook_units")
    .select("id, name, textbook_id")
    .in("id", ids);
  const uById = new Map((units || []).map((u) => [u.id, u]));
  const bookIds = [...new Set((units || []).map((u) => u.textbook_id))];
  if (!bookIds.length) return "";
  const [{ data: books }, { data: st }] = await Promise.all([
    supabase.from("textbooks").select("id, name").in("id", bookIds),
    supabase
      .from("student_textbooks")
      .select("textbook_id, round")
      .eq("student_id", studentId)
      .in("textbook_id", bookIds),
  ]);
  const bName = new Map((books || []).map((b) => [b.id, b.name]));
  const bRound = new Map((st || []).map((r) => [r.textbook_id, r.round || 1]));

  const byBook = new Map();
  prog.forEach((r) => {
    const u = uById.get(r.textbook_unit_id);
    if (!u) return;
    if ((r.round || 1) !== (bRound.get(u.textbook_id) || 1)) return; // 지금 회독만
    if (!byBook.has(u.textbook_id)) byBook.set(u.textbook_id, []);
    byBook.get(u.textbook_id).push(`${u.name}${r.status === "done" ? " ○" : " ◐ 하는 중"}`);
  });
  return [...byBook.entries()]
    .map(([bid, names]) => `${bName.get(bid) || "교재"}: ${names.join(" · ")}`)
    .join(" / ");
}

export async function saveStudentDay(studentId, date, form) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = await createClient();

  // 1) 출결
  if (form.attendance) {
    const { error } = await supabase.from("attendance").upsert(
      { student_id: studentId, date, status: form.attendance },
      { onConflict: "student_id,date" }
    );
    if (error) return { error: error.message };
  }

  // 1.5) 월간용 키워드 메모 (0146) — 원장만 읽는 표. 빈 값도 upsert 해
  //      지운 것이 지워지게 한다. 표가 없으면(0146 전) 적었을 때만 알린다
  if ("monthKeyword" in form) {
    const kw = (form.monthKeyword || "").trim() || null;
    const { error: kwErr } = await supabase
      .from("report_keywords")
      .upsert({ student_id: studentId, date, body: kw }, { onConflict: "student_id,date" });
    if (kwErr && kw) {
      return { error: "월간 키워드를 쓰려면 설정 → Supabase SQL 에서 0146 을 먼저 실행해주세요." };
    }
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
    // 비워두면 **오늘 진도 판에 찍은 ○·◐** 로 채운다 (0134, 원장님
    // 2026-08-19 — 「오늘 수업 한 부분을 데일리 리포트에 반영하고 싶어」).
    // 손으로 적은 것이 있으면 늘 그것이 이긴다.
    own_progress:
      (form.own_progress || "").trim() ||
      (await todayProgressDraft(supabase, studentId, date)) ||
      null,
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
  const items = { ...(form.items || {}) };   // 검사 결과 { id: "done"|"weak"|"missing" }
  let nextIds = Array.isArray(form.nextHomework) ? form.nextHomework : []; // 다음 숙제
  const nextUnitsIn = { ...(form.nextUnits || {}) };

  /**
   * **급한 숙제는 글로 바로** (원장님, 2026-08-21 — 「급하면 영역별 숙제에
   * 대해 텍스트로 직접 숙제 적을 수 있도록」). 항목·교재·단원을 고를 짬이
   * 없을 때 한 줄 적으면, 「직접 적은 숙제」 항목의 범위 메모로 실려
   * 학생 화면·리포트·검사까지 여느 숙제처럼 흐른다 (두 번 안 적는다).
   */
  /**
   * **급한 숙제는 영역마다** (원장님 2026-08-24 — 「직접 적은 숙제는 영역이
   * 없는 게 문제야. 영역마다 그냥 텍스트를 추가할 칸을 줘」 · 「학생 어플에서
   * 내가 직접 적은 숙제가 '직접 적은 숙제' 라고 나올 필요 없어」).
   *
   * 적은 자리가 곧 영역이다 — 항목의 분류(category)로 넣으면 아이 화면의
   * 영역별 묶음에 제 자리로 간다. `quick`(0157) 을 켜 두면 아이 화면이
   * **이름을 감추고 적은 글만** 보여준다.
   *
   * 항목은 한 리포트에 한 줄뿐이라 줄마다 슬롯을 판다 — 「영작 직접」
   * 「영작 직접 2」 … 이름은 원장님 관리용일 뿐 아이에게는 안 보인다.
   */
  const quickIn = form.quickHomework;
  const quickMap = typeof quickIn === "string"
    ? (quickIn.trim() ? { 기타: quickIn } : {})      // 옛 판(한 칸)에서 온 것
    : (quickIn && typeof quickIn === "object" ? quickIn : {});
  for (const [area, text] of Object.entries(quickMap)) {
    const lines = (text || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 8);
    for (let li = 0; li < lines.length; li += 1) {
      const NAME = `${area} 직접${li === 0 ? "" : ` ${li + 1}`}`;
      let { data: qi } = await supabase
        .from("homework_items").select("id").eq("name", NAME).maybeSingle();
      if (!qi) {
        // 이름 충돌(동시 저장·대소문자 등)이어도 조용히 삼키지 않는다 —
        // ignoreDuplicates 라 기존 행은 안 덮이고, 충돌이면 빈 배열이
        // 오므로 **반드시 재조회**한다 (0잔여-A #6, 2026-08-27).
        let ins = await supabase
          .from("homework_items")
          .upsert({ name: NAME, category: area, quick: true },
                  { onConflict: "name", ignoreDuplicates: true })
          .select("id").maybeSingle();
        if (ins.error && noColumn(ins.error)) {
          // 0157 전 — quick 칸 없이 (이름이 그대로 뜬다)
          ins = await supabase
            .from("homework_items")
            .upsert({ name: NAME, category: area },
                    { onConflict: "name", ignoreDuplicates: true })
            .select("id").maybeSingle();
        }
        qi = ins.data;
        if (!qi?.id) {
          const again = await supabase
            .from("homework_items").select("id").eq("name", NAME).maybeSingle();
          qi = again.data;
        }
      }
      if (!qi?.id) {
        // 재조회까지 실패 — 이 줄이 조용히 사라지던 것이 #6 의 병.
        return { error: `급한 숙제 「${NAME}」 를 저장하지 못했어요. 다시 눌러주세요.` };
      }
      if (!nextIds.includes(qi.id)) nextIds = [...nextIds, qi.id];
      const prev = (nextUnitsIn[qi.id]?.note || "").trim();
      nextUnitsIn[qi.id] = {
        unitIds: nextUnitsIn[qi.id]?.unitIds || [],
        note: prev ? `${prev} · ${lines[li]}` : lines[li],
      };
    }
  }

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
  let inClassIds = Array.isArray(form.inClass) ? form.inClass : [];
  let planNextIds = Array.isArray(form.planNext) ? form.planNext : [];

  /**
   * **지워진 학습 항목은 빼고 저장한다** (원장님 2026-08-24 — 저장이
   * 「violates foreign key constraint daily_report_items_homework_item_id_fkey」
   * 로 거절당했다).
   *
   * 학습 항목을 지워도 그 이름표를 들고 있는 데가 여럿이다 — 교재의 등원 학습
   * 목록(textbooks.act_items) · 진도루틴의 항목 메모 · 학생 기본 등원 목록 ·
   * 브라우저에 남은 임시본. 전부 **연결 고리가 없는 jsonb** 라 항목이 사라져도
   * 조용히 남는다.
   *
   * 그중 하나만 섞여도 **적은 것 전체가** 저장 안 됐다. 수업 중에 제일 나쁜
   * 실패다 — 30분 적은 것이 통째로 날아간다. 그래서 죽은 이름표만 빼고
   * 저장하고, 무엇을 뺐는지 돌려준다.
   */
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let deadItems = 0;
  {
    const used = [...new Set([
      ...Object.keys(items), ...inClassIds, ...planNextIds, ...nextIds,
    ].filter(Boolean))];
    const shaped = used.filter((id) => UUID.test(id));
    let alive = new Set();
    if (shaped.length) {
      const { data: rows } = await supabase
        .from("homework_items").select("id").in("id", shaped);
      alive = new Set((rows || []).map((x) => x.id));
    }
    const dead = new Set(used.filter((id) => !alive.has(id)));
    if (dead.size) {
      deadItems = dead.size;
      for (const id of dead) delete items[id];
      inClassIds = inClassIds.filter((id) => !dead.has(id));
      planNextIds = planNextIds.filter((id) => !dead.has(id));
      nextIds = nextIds.filter((id) => !dead.has(id));
    }
  }
  // 지워진 **단원** 이름표도 저장을 통째로 죽인다 (textbook_unit_id FK —
  // 배정줄수술 v2 §3 미보호 FK. RPC 는 전부-또는-무라 하나가 전체를
  // 물귀신한다). 항목은 살리고 죽은 단원만 뺀다.
  {
    const uids = [...new Set(nextIds.flatMap((id) => nextUnitsIn[id]?.unitIds || []))]
      .filter((id) => UUID.test(id));
    if (uids.length) {
      const { data: urows } = await supabase
        .from("textbook_units").select("id").in("id", uids);
      const ualive = new Set((urows || []).map((x) => x.id));
      const deadU = new Set(uids.filter((id) => !ualive.has(id)));
      if (deadU.size) {
        for (const id of nextIds) {
          const u = nextUnitsIn[id];
          if (u?.unitIds?.length) u.unitIds = u.unitIds.filter((x) => !deadU.has(x));
        }
      }
    }
  }
  // 오늘 목록이 실제로 바뀌었는지 — 바뀌면 학생에게 알림 (원장님 2026-08-20
  // 「내가 뭔가 바꾸고 저장하면 학생에게 알람이 가야 해」)
  const { data: oldInclassRows } = await supabase
    .from("daily_report_items")
    .select("homework_item_id, inclass_sort")
    .eq("daily_report_id", report.id)
    .eq("status", "inclass");
  const oldInclass = (oldInclassRows || [])
    .sort((a, b) => (a.inclass_sort ?? 999) - (b.inclass_sort ?? 999))
    .map((x) => x.homework_item_id);
  // (keepDone·before/had/hadAny 스냅샷·복구 원본은 0165 plan_many 와
  //  함께 소멸 — 목록 3그룹이 제자리에서 고쳐지니 살려 옮길 것도
  //  되살릴 것도 없고, changed_at 판정은 RPC 가 delete 전에 스스로
  //  확정한다. 배정줄수술 v2 §4-C2)


  // ── 검사 쓰기 = check_many 한 문 (0163 — 계획서 v2 §2-4-①) ──
  //
  // 빈 값(칩 재클릭 = 지우기)까지 **전부** 보낸다 — 지우기가 blanket
  // delete 에 얹혀 살던 시절이 끝났으니, RPC 의 status null 이 정식
  // 경로다. note 는 클카 근거가 있을 때만 문자열이고 나머지는 null(유지)
  // — 조교가 /check 에서 단 메모가 판 저장에 안 쓸려 나간다.
  // 덤: 판이 안 그린 항목(marks 에 키 없음 — 예: 페이지 연 뒤 대기줄에서
  // 찍은 것)은 아예 안 건드린다. 전량 delete 시절에는 그것까지 지웠다.
  const checkNotes = form.checkNotes || {};
  if (form.items) {
    const checkItems = Object.entries(items).map(([homework_item_id, status]) => ({
      item_id: homework_item_id,
      status: status || null,
      note: (checkNotes[homework_item_id] || "").trim() || null,
    }));
    if (checkItems.length) {
      const { error: ckErr } = await checkMany(supabase, report.id, checkItems);
      if (ckErr) return { error: ckErr };
    }
  }

  // ── 목록 3그룹 = plan_many 한 문 (0165 — 배정줄수술 v2 §2) ──
  //
  // form 키 존재 = 그 그룹 전체 교체(키 없음 = 무접촉 — 결석 기록처럼
  // 출결만 만지는 저장은 배정을 스치지도 않는다). 행이 제자리라 제출물
  // 소속·학생 「다 했어요」 가 저장에도 살고, changed_at 은 RPC 가
  // delete 전에 확정한다. 실패는 전부-또는-무 — 복구 코드가 필요 없다.
  const units = nextUnitsIn;   // 급한 숙제(quickHomework)의 범위 메모까지 합친 한 벌
  let changedNames = [];
  {
    const groups = {};
    if (form.inClass) {
      groups.inclass = inClassIds.map((homework_item_id, i2) => ({
        item_id: homework_item_id,
        sort: i2,
        carry_next: Array.isArray(form.carryNext) && form.carryNext.includes(homework_item_id),
      }));
    }
    if (form.planNext) {
      groups.plan_next = planNextIds.map((homework_item_id, i2) => ({
        item_id: homework_item_id,
        sort: i2,
      }));
    }
    if (form.nextHomework) {
      groups.assigned = nextIds.map((homework_item_id) => ({
        item_id: homework_item_id,
        unit_id: (units[homework_item_id]?.unitIds || [])[0] || null,
        unit_ids: (units[homework_item_id]?.unitIds || []).length
          ? units[homework_item_id].unitIds
          : null,
        range_note: (units[homework_item_id]?.note || "").trim() || null,
      }));
    }
    if (Object.keys(groups).length) {
      const r = await planMany(supabase, report.id, groups);
      if (r.error) return { error: r.error };
      changedNames = r.changed || [];
    }
  }

  /**
   * 3.5) **검사 결과 → 진도 자동 반영** (원장님 확정, 2026-08-22 —
   * 원장님의 「저장」 이 곧 확정 행위다).
   *
   * 지난 배정 숙제(toCheck)에 붙여둔 단원(checkUnits — 지난 배정의
   * textbook_unit_ids)을, 검사가 ○(done)이면 done + done_on=그 날짜로,
   * △(weak)면 doing(하는 중)으로 찍는다.
   *
   * **정정하면 진도도 따라 내려간다** (원장님 2026-08-23 — 「내려가야지」).
   * ○ 로 저장했다가 ✕ 로 고치면 그 날 찍힌 진도를 지우고, △ 로 고치면
   * 하는 중으로 낮춘다. 다만 **그 날 찍은 것만** 건드린다(reCheckOn) —
   * 지난 회차에 끝낸 단원이 이번 숙제에 다시 걸렸을 때 예전 완료까지
   * 지워지면 안 된다. 미검사(빈 값)는 그대로 둔다 — 아직 안 본 것과
   * 진도판에서 직접 찍은 것을 구별할 수 없기 때문이다.
   *
   * 회독(round) 규칙과 「이미 done 인 단원을 되돌리지 않기」 는
   * setUnitProgress 한 곳에 있다 (원칙 1 — 판단 복붙 금지).
   * 임시저장은 확정이 아니라서 뺀다. 실패해도 수업 기록은 살린다 —
   * warn 으로만 같이 알린다 (할일 만들기와 같은 태도).
   */
  let progressWarn = null;
  if (!form.draft) {
    // 3분기·승자 규칙은 lib/checkProgress 한 벌 — /check·대기줄 검사와
    // 같은 판단을 탄다 (계획서 v2 §2-4-②)
    progressWarn = await applyCheckProgress(studentId, date, toCheck, items, form.checkUnits || {});
  }

  /**
   * 3.6) **검사 저장이 답지를 연다** (0148, 원장님 2026-08-22 — 원장의
   * 「저장」 이 곧 확정 행위다. 3.5 진도 반영과 같은 태도).
   *
   * 판정(○△✕)을 찍은 항목의 답지를 연다. 검사 대상은 지난 수업의
   * 배정이라 **검사일 전날까지**의 답지 줄만 본다 — 방금 다음 숙제에
   * 붙인 답지가 같이 열리면 안 된다. 임시저장은 확정이 아니라서 뺀다.
   * 실패해도 저장은 그대로 (lib/answers 가 조용히 삼킨다).
   */
  if (!form.draft) {
    // ✕(안 해옴)는 답지를 열지 않는다 (0잔여-A #22) — 안 해온 아이에게
    // 답을 먼저 주는 셈이었다. 다시 해와서 ○/△ 받을 때 열린다.
    // (제출물 「봤어요」 경로의 답지 열림은 확인 사건이라 의도적으로 유지.)
    const checkedIds = Object.keys(items).filter(
      (iid) => items[iid] && items[iid] !== "missing"
    );
    if (checkedIds.length) {
      await openAnswers(supabase, { studentId, itemIds: checkedIds, upTo: addDays(date, -1) });
    }
  }

  // 배정한 숙제 중 "내가 준비해야 하는 것" 은 내 할일로 올린다.
  // 여기서 실패해도 **오늘 기록은 살아 있어야 한다** — 할일은 다시 만들 수 있지만
  // 수업 기록이 날아가면 곤란하다. 대신 조용히 넘기지 않고 같이 알려준다.
  const prep = await syncPrepTasks(supabase, studentId, date, nextIds, units);

  // 숙제가 배정됐으면 학생 앱으로 알림 (요금 없음, 실패해도 저장은 그대로).
  // **임시저장은 알림을 안 보낸다** (0잔여-A #10) — draft 는 「기록만」이
  // 계약인데 알림 2건이 새고 있었다. 성적 사본(mirrorUnitScore)은 일부러
  // 유지 — 막으면 임시저장만 한 날 성적표에 구멍이 난다(검토 판정).
  if (!form.draft && nextIds.length > 0) {
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
      // 배치 규칙 (2026-08-21) — 다음 정각에 나간다. 그 전엔 보낼 것에서 취소 가능
      await queuePush(supabase, {
        studentIds: [studentId],
        who: "student",
        title: changed.length ? "숙제가 바뀌었어요" : "오늘 숙제가 올라왔어요",
        body: changed.length
          ? `${changed.join(", ")} — 앱에서 확인해주세요`
          : (list.length ? list.join(", ") : "앱에서 확인해주세요"),
        url: "/me",
      }, "숙제 알림");
    } catch {
      // 알림 실패는 무시한다
    }
  }

  // 클카 그림자 기록(0132)은 자동 판정과 함께 종료 (원장님 확정
  // 2026-08-26 「클카 자동판정 애매한 건 없애」) — 실험 표는 기록만
  // 남기고 더 쓰지 않는다.

  /**
   * **임시저장이면 화면을 안 갈아엎는다.** revalidatePath 가 돌면 열어둔
   * 학생 판이 접힌다 — 이어서 적으려고 임시저장을 눌렀는데 흐름이 끊긴다.
   * 서버에는 이미 들어갔으니, 다음 저장이나 새로고침 때 자연히 맞춰진다.
   */
  /**
   * **오늘 목록이 바뀌었으면 학생에게 알림** (원장님 2026-08-20 —
   * 「내가 뭔가 바꾸고 저장하면 학생에게 알람이 가야 해」).
   * 오늘 날짜의 저장에서만, 순서까지 비교해 정말 바뀐 경우에만 보낸다.
   */
  try {
    if (!form.draft && date === todaySeoul() && JSON.stringify(oldInclass) !== JSON.stringify(inClassIds) && inClassIds.length) {
      await queuePush(supabase, {
        studentIds: [studentId],
        who: "student",
        title: "오늘 할 일이 바뀌었어요",
        body: "화면을 열어 새 순서를 확인해 주세요.",
        url: "/me",
      }, "오늘 할 일 변경");
    }
  } catch { /* 알림 실패는 저장을 막지 않는다 */ }

  if (!form.draft) revalidatePath("/today");
  return {
    error: null,
    complete,
    unchecked: unchecked.length,
    warn:
      (deadItems
        ? `이미 지워진 학습 항목 ${deadItems}개는 빼고 저장했어요 — 교재의 등원 학습 목록이나 진도루틴에 옛 항목이 남아 있습니다`
        : null) || prep?.error || progressWarn || null,   // 기록은 됐지만 할일·진도는 못 만진 경우
  };
}

// 완료 취소: 기록을 '미완료'로 되돌린다 (입력값은 그대로 둠)
export async function reopenReport(studentId, date) {
  if (!studentId || !date) return { error: "값이 부족해요." };
  const supabase = await createClient();
  // 이미 학부모께 나간 리포트는 여기서 못 되돌린다 (0잔여-A #8) —
  // 발송 표시까지 지우려면 발송 화면의 「발송 취소」가 그 자리다.
  {
    const sent = await supabase
      .from("daily_reports").select("sent_at")
      .eq("student_id", studentId).eq("date", date).maybeSingle();
    if (!sent.error && sent.data?.sent_at) {
      return { error: "이미 학부모께 보낸 날이에요. 발송 화면에서 「발송 취소」 후에 고칠 수 있어요." };
    }
    // sent_at 칸이 없는 옛 DB(0012 전)는 그냥 통과
  }
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


// 「그날 오는 학생」 은 lib/roster 한 곳이 정한다 — 특강(0164) 학생을
// 포함하고, 종강한 반은 뺀다 (전에는 여기서 요일만 봐서 종강한 반
// 학생이 공지 대상에 계속 남았다). scope==="class" 는 uuid 로 거르고,
// 특강 그룹(extra:라벨)은 label 공지(0167)가 따로 잡는다.
const rosterOf = rosterOn;

export async function createNotice(input) {
  const { date, kind, scope, classId, school, grade, studentIds, body, title, extraLabel } = input || {};
  const text = (body || "").trim();
  const head = (title || "").trim();
  // 사진만 보내는 경우도 있다 — 학교에서 나눠준 종이를 찍어서.
  // 그때는 제목만 있으면 된다.
  if (!date || (!text && !head)) return { error: "내용을 적어주세요." };

  const supabase = await createClient();
  const user = await sessionUser(supabase);

  /**
   * **특강 label 공지** (0167 — 이행계획서 v2 §8, 원장 확정 「필요함」).
   * 특강은 반이 아니라 재원생 속성(0164)이라 class_id (uuid) 에 못 담는다.
   * 화면이 label 을 따로 주지만, 옛 판이 「extra:라벨」 을 반 자리에 실어
   * 보내도 여기서 받아준다 — 비-uuid 가 uuid 칸으로 흘러들어 22P02 로
   * 죽던 잠복 버그(「보강」 가상 그룹)의 서버 쪽 봉합이다.
   */
  let label = (extraLabel || "").trim() || null;
  let cid = classId || null;
  if (scope === "class" && cid && String(cid).startsWith("extra:")) {
    label = String(cid).slice("extra:".length);
    cid = null;
  }
  if (scope === "class" && cid && !/^[0-9a-f-]{36}$/i.test(String(cid))) {
    // 「makeup(보강)」 같은 가상 그룹 — 반이 아니라서 공지의 반이 될 수 없다
    return { error: "반이 아닌 그룹이에요. 반을 다시 골라주세요." };
  }

  // 대상 학생 확정
  let targets = [];
  if (scope === "student") {
    targets = Array.isArray(studentIds) ? [...new Set(studentIds)] : [];
  } else {
    const roster = await rosterOf(supabase, date);
    let ids = [...new Set(roster.map((m) => m.student_id))];
    if (label) {
      // 그날 유효한 그 label 특강 학생 — 판단은 rosterOn(meetsOn) 한 곳 (원칙 1)
      ids = [...new Set(
        roster.filter((m) => m.class_id === `extra:${label}`).map((m) => m.student_id)
      )];
    } else if (scope === "class") {
      if (!cid) return { error: "반을 골라주세요." };
      ids = [...new Set(roster.filter((m) => m.class_id === cid).map((m) => m.student_id))];
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
  if (targets.length === 0) return { error: label ? "그날 그 특강에 오는 학생이 없어요." : "대상 학생이 없어요." };

  const row = {
    date,
    kind: safeKind(kind),
    // label 공지는 scope 'extra' 로 남는다 — class_id 는 uuid 라 담을 수 없고,
    // 어느 특강에 보냈는지(extra_label)가 재발송·감사의 근거다 (0167)
    scope: label ? "extra" : scope || "all",
    class_id: !label && scope === "class" ? cid : null,
    school: scope === "grade" ? school || null : null,
    grade: scope === "grade" ? grade || null : null,
    body: text || head,
    title: head || null,
    created_by: user?.id || null,
  };
  if (label) row.extra_label = label;
  let { data: notice, error } = await supabase.from("notices").insert(row).select("id").single();
  if (error && noColumn(error) && label) {
    // 정체성 칸 없이 남기면 「어느 특강에 보냈는지」 를 영영 모른다 — 조용히
    // 빼고 저장하는 대신 멈추고 알린다
    return { error: "0167 SQL 을 먼저 실행해주세요. (특강 label 공지)" };
  }
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
  const supabase = await createClient();
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
  const supabase = await createClient();
  const { error } = await supabase.from("notices").delete().eq("id", id);
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

// 하원 전 "전달했어요" 체크
export async function setDelivered(noticeId, studentId, delivered) {
  if (!noticeId || !studentId) return { error: null };
  const supabase = await createClient();
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
  const supabase = await createClient();
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
  const supabase = await createClient();

  // 그날 이미 출결이 있으면 덮어쓰지 않는다 (2026-08-21) — 기본 날짜가
  // 다음 보강 요일이라 정규 수업일과 겹치기 쉬웠고, upsert 가 정시·지각을
  // 소리 없이 「보강」 으로 바꿔 수강료 집계까지 틀어질 수 있었다
  {
    const { data: clash } = await supabase
      .from("attendance")
      .select("status")
      .eq("student_id", studentId)
      .eq("date", makeupDate)
      .maybeSingle();
    if (clash && clash.status !== "makeup") {
      return { error: `${makeupDate} 에는 이미 출결 기록(${clash.status})이 있어요. 다른 날짜로 잡아주세요.` };
    }
  }
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
