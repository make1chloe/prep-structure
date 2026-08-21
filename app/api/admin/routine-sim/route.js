import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";
import { fetchAll } from "@/lib/fetchAll";
import { inUseOn } from "@/lib/bookUse";
import { todaySeoul, addDays } from "@/lib/day";
import { loadReportRows } from "@/lib/reportData";
import DRAFTS from "./drafts.json";
import { nextRoutine } from "@/app/today/routineActions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * **가상 한 달 수업** (원장님, 2026-08-20 — 「교재단원·루틴·학습항목이
 * 너무 복잡해져서 문제가 심각해 보여. 가상으로 현재 학생들에게 1개월씩
 * 배정해서 수업해보고 문제점 파악해서 개선할 계획 세워줘」).
 *
 * 아무것도 쓰지 않는다 — 읽고 셈만 한다. 지금 재원생·배정·단원·반 요일
 * 위에 루틴 초안(drafts.json)을 얹어 4주를 돌린다:
 *   수업마다: 루틴 있는 모든 교재의 등원·숙제·예습이 한꺼번에 차려진다
 *   (지금 「⟳ 루틴 다음」 동작 그대로) → 세션당 항목 수가 곧 부하다.
 *   단원은 수업마다 하나씩 나간다고 가정하고 소진·회독 넘김을 센다.
 */

/** 폰 브라우저가 charset 없는 JSON 의 한글을 깨뜨린다 (원장님 스샷 2026-08-21) */
function jsonKo(body, init = {}) {
  return new NextResponse(JSON.stringify(body, null, 1), {
    status: init.status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(request) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return jsonKo({ error: guard.error }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const op = sp.get("op");
  if (op === "rebuild") return rebuildRoutines(supabase, sp.get("force") === "1");
  if (op === "flow") return flowSim(supabase);
  if (op === "retest") return retestList(supabase);
  if (op === "month") return monthSim(supabase);
  if (op === "safety") return safetyCheck(supabase);

  const today = todaySeoul();

  const [stQ, sbQ, bkQ, csQ, clQ] = await Promise.all([
    supabase.from("students").select("id, name, grade").eq("status", "enrolled"),
    supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, assigned_on, ended_on, round")
      .neq("status", "dropped"),
    supabase.from("textbooks").select("id, name, area, status"),
    supabase.from("class_students").select("class_id, student_id"),
    supabase.from("classes").select("id, name, days, ends_on"),
  ]);
  const students = stQ.data || [];
  const bookById = new Map((bkQ.data || []).map((b) => [b.id, b]));

  // 반 요일 수 → 주당 수업 수 (없으면 주 2회로 본다)
  const classDays = new Map((clQ.data || []).map((c) => [c.id, (c.days || []).length]));
  const weekly = new Map();
  (csQ.data || []).forEach((m) => {
    const n = classDays.get(m.class_id) || 0;
    weekly.set(m.student_id, (weekly.get(m.student_id) || 0) + n);
  });

  // 단원 (잎만, 순서대로) — 전 교재 한 번에
  const { data: units } = await fetchAll(() =>
    supabase
      .from("textbook_units")
      .select("id, textbook_id, parent_id, name, sort")
      .order("sort", { ascending: true })
      .order("id")
  );
  const hasChild = new Set((units || []).map((u) => u.parent_id).filter(Boolean));
  const leavesOf = new Map();
  (units || []).forEach((u) => {
    if (hasChild.has(u.id)) return;
    if (!leavesOf.has(u.textbook_id)) leavesOf.set(u.textbook_id, []);
    leavesOf.get(u.textbook_id).push(u);
  });

  // 진도 — 지금 위치에서 시작한다
  const { data: prog } = await fetchAll(() =>
    supabase
      .from("student_unit_progress")
      .select("student_id, textbook_unit_id, status, round")
      .order("student_id")
      .order("textbook_unit_id")
  );
  const doneSet = new Set(
    (prog || [])
      .filter((p) => p.status === "done")
      .map((p) => `${p.student_id}|${p.textbook_unit_id}|${p.round || 1}`)
  );

  const routineOf = (name) => {
    let r = DRAFTS.books[name];
    if (typeof r === "string") r = DRAFTS.books[r];
    return r || null;
  };
  const stripNote = (s) => s.replace(/\s*\[[^\]]*\]\s*$/, "").trim();

  // 초안 교재명이 실제 교재 목록에 없는 것 — 오타·옛 이름 (무조건 잡는다)
  const dbNames = new Set((bkQ.data || []).map((b) => b.name.trim()));
  const draftNameMiss = Object.keys(DRAFTS.books).filter(
    (n) => typeof DRAFTS.books[n] !== "string" && !dbNames.has(n)
  );

  const perStudent = [];
  const issues = { 루틴없는교재: new Map(), 단원없는교재: new Map(), 한달안소진: [], 예습다음단원없음: new Set() };
  const itemNames = new Set();
  const sessionsTotal = { count: 0, inclassSum: 0, homeSum: 0, max: 0, maxWho: "" };

  for (const s of students) {
    const myBooks = (sbQ.data || [])
      .filter((r) => r.student_id === s.id && inUseOn(r, today))
      .map((r) => ({ ...r, book: bookById.get(r.textbook_id) }))
      .filter((r) => r.book);
    if (myBooks.length === 0) continue;

    const perWeek = weekly.get(s.id) || 2;
    const sessions = Math.max(1, perWeek) * 4;

    // 교재별 상태: 루틴 · 단원 포인터
    const tracks = myBooks.map((r) => {
      const steps = routineOf(r.book.name) || (DRAFTS.areas[r.book.area || ""] || null);
      const leaves = leavesOf.get(r.textbook_id) || [];
      const round = r.round || 1;
      let ptr = leaves.findIndex((u) => !doneSet.has(`${s.id}|${u.id}|${round}`));
      if (ptr < 0) ptr = leaves.length; // 이미 소진
      // 단어책은 루틴이 없는 게 맞다 (원장님 2026-08-20 확정) — 단어시험 체계가 담당
      if (!steps && (r.book.area || "") !== "단어") {
        const m = issues.루틴없는교재;
        m.set(r.book.name, (m.get(r.book.name) || 0) + 1);
      }
      if (steps && leaves.length === 0) {
        const m = issues.단원없는교재;
        m.set(r.book.name, (m.get(r.book.name) || 0) + 1);
      }
      return { r, steps, leaves, round, ptr, stepIdx: 0, ranOut: null, roundsAdvanced: 0 };
    });

    let maxLoad = 0;
    let inclassSum = 0;
    let homeSum = 0;
    for (let sess = 1; sess <= sessions; sess += 1) {
      let inclassN = 0;
      let homeN = 0;
      for (const t of tracks) {
        if (!t.steps || t.leaves.length === 0) continue;
        // 회독 규칙: round<=cur 중 가장 큰 정의, 없으면 round 없는 줄
        const cur = t.round;
        const rounded = t.steps.filter((x) => x.round != null && x.round <= cur);
        const maxR = rounded.length ? Math.max(...rounded.map((x) => x.round)) : null;
        const list = t.steps.filter((x) => (x.round == null && maxR == null) || x.round === maxR);
        if (list.length === 0) continue;
        const step = list[t.stepIdx % list.length];
        t.stepIdx += 1;
        inclassN += (step.inclass || []).length;
        homeN += (step.home || []).length + (step.homeNext || []).length;
        [...(step.inclass || []), ...(step.home || []), ...(step.homeNext || [])]
          .forEach((x) => itemNames.add(stripNote(x)));
        if ((step.homeNext || []).length && t.ptr + 1 >= t.leaves.length) {
          issues.예습다음단원없음.add(`${s.name}·${t.r.book.name}`);
        }
        // 단원 하나 소화
        t.ptr += 1;
        if (t.ptr >= t.leaves.length) {
          if (!t.ranOut) t.ranOut = sess;
          t.round += 1;
          t.roundsAdvanced += 1;
          t.ptr = 0;
        }
      }
      const load = inclassN + homeN;
      inclassSum += inclassN;
      homeSum += homeN;
      if (load > maxLoad) maxLoad = load;
      sessionsTotal.count += 1;
      sessionsTotal.inclassSum += inclassN;
      sessionsTotal.homeSum += homeN;
      if (load > sessionsTotal.max) {
        sessionsTotal.max = load;
        sessionsTotal.maxWho = `${s.name} ${sess}번째 수업`;
      }
    }

    tracks.forEach((t) => {
      if (t.ranOut && (t.leaves.length > 0))
        issues.한달안소진.push(`${s.name}·${t.r.book.name} (${t.ranOut}번째 수업에 소진${t.roundsAdvanced ? ` · 회독 +${t.roundsAdvanced}` : ""})`);
    });

    perStudent.push({
      name: s.name,
      grade: s.grade || "",
      books: myBooks.length,
      routined: tracks.filter((t) => t.steps && t.leaves.length > 0).length,
      sessions,
      avgLoad: Math.round(((inclassSum + homeSum) / sessions) * 10) / 10,
      avgInclass: Math.round((inclassSum / sessions) * 10) / 10,
      avgHome: Math.round((homeSum / sessions) * 10) / 10,
      maxLoad,
    });
  }

  perStudent.sort((a, b) => b.avgLoad - a.avgLoad);
  return jsonKo({
    ok: true,
    학생수: perStudent.length,
    세션: {
      평균등원항목: Math.round((sessionsTotal.inclassSum / Math.max(1, sessionsTotal.count)) * 10) / 10,
      평균숙제항목: Math.round((sessionsTotal.homeSum / Math.max(1, sessionsTotal.count)) * 10) / 10,
      최대부하: sessionsTotal.max,
      최대부하학생: sessionsTotal.maxWho,
    },
    새로생길학습항목수: itemNames.size,
    학습항목목록: [...itemNames].sort(),
    학생별: perStudent,
    문제: {
      초안이름불일치: draftNameMiss,
      루틴없는교재: [...issues.루틴없는교재.entries()].map(([n, c]) => `${n}(${c}명)`),
      단원없는교재: [...issues.단원없는교재.entries()].map(([n, c]) => `${n}(${c}명)`),
      한달안소진: issues.한달안소진,
      예습다음단원없음: [...issues.예습다음단원없음],
    },
  });
}


/**
 * **빈 곳만 씨앗 심기** (원장님, 2026-08-21 — 「루틴을 엑셀로 넣기만 하지
 * 말고 수정·삭제 가능하게 해줘」).
 *
 * **화면(루틴 편집기)이 원본이다. drafts.json 은 초기 씨앗일 뿐이다.**
 * 전에는 전삭제 후 재주입이라, 편집기에서 고친 것이 다음 재주입에 전부
 * 날아갔다 — 대전제 2(docs/업무루틴-규칙.md — 「원장님이 손으로 적은 것은
 * 자동이 절대 덮지 않는다」) 위반. 그래서 기본 동작은:
 *
 * ① 단계가 **하나도 없는** 교재·영역만 drafts 로 채운다 — 한 줄이라도
 *    있으면 원장님이 고쳤을 수 있는 곳이니 통째로 건너뛴다
 * ② 없는 학습항목은 만들고, [대괄호]는 항목별 주의사항(item_notes)으로
 *
 * `&force=1` 일 때만 옛 동작(전삭제 후 전량 재주입 + 잘게 쪼갠 항목 정리).
 * 학생의 현재 단계 기억(routine_step_id)은 다음 「루틴 다음」 때 처음
 * 단계로 폴백된다. 응답에 경고와 건드린/건너뛴 목록을 담는다.
 */
async function rebuildRoutines(supabase, force = false) {
  const out = { deletedSteps: 0, insertedSteps: 0, createdItems: [], removedItems: [], hiddenItems: [] };

  // 지금 심겨 있는 곳 — 원장님이 화면에서 고쳤을 수 있는 곳이다 (대전제 2)
  let { data: existing, error: exErr } = await supabase.from("routine_steps").select("id, textbook_id, area");
  if (exErr) {
    // 0137 전 — 영역 칸 없이. 이 조회가 실패한 채 심으면 「있는 곳」 을
    // 못 보고 덮어 심게 된다 — 그래서 끝까지 못 읽으면 아예 멈춘다
    ({ data: existing, error: exErr } = await supabase.from("routine_steps").select("id, textbook_id"));
  }
  if (exErr)
    return jsonKo({ error: `기존 루틴을 못 읽어 중단: ${exErr.message}` }, { status: 500 });
  const hasBookSteps = new Set((existing || []).filter((r) => r.textbook_id).map((r) => r.textbook_id));
  const hasAreaSteps = new Set((existing || []).filter((r) => !r.textbook_id && r.area).map((r) => r.area));

  if (force) {
    // 통째 갈아엎기 — force 를 명시했을 때만. 화면에서 고친 것까지 덮는다
    const { data: gone } = await supabase.from("routine_steps").delete().not("id", "is", null).select("id");
    out.deletedSteps = (gone || []).length;
    hasBookSteps.clear();
    hasAreaSteps.clear();
  }

  const [{ data: books }, { data: items0 }] = await Promise.all([
    supabase.from("textbooks").select("id, name, area"),
    supabase.from("homework_items").select("id, name").eq("active", true),
  ]);
  const bookByName = new Map((books || []).map((b) => [b.name.trim(), b.id]));
  const itemByName = new Map((items0 || []).map((i) => [i.name.trim(), i.id]));

  const parse = (x) => {
    const m = x.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    return m ? { name: m[1].trim(), note: m[2].trim() } : { name: x.trim(), note: "" };
  };
  const guessCat = (n) =>
    /단어/.test(n) ? "단어"
    : /문법/.test(n) ? "문법"
    : /노트/.test(n) ? "노트"
    : /내신/.test(n) ? "내신"
    : /step|예습|독해|해석|지문|워크북/i.test(n) ? "독해"
    : "기타";

  // 심을 대상 고르기 — 이미 단계가 있는 교재·영역은 통째로 건너뛴다 (대전제 2)
  const targets = [];
  const skipped = [];
  const missBooks = [];
  for (const [name, val] of Object.entries(DRAFTS.books)) {
    const steps = typeof val === "string" ? DRAFTS.books[val] : val;
    if (!Array.isArray(steps)) continue; // 별칭이 끊긴 초안 — GET 의 초안이름불일치가 잡는다
    const bid = bookByName.get(name.trim());
    if (!bid) { missBooks.push(name); continue; }
    if (hasBookSteps.has(bid)) { skipped.push(name); continue; }
    targets.push({ bookName: name, bid, steps });
  }
  for (const [area, steps] of Object.entries(DRAFTS.areas)) {
    if (hasAreaSteps.has(area)) { skipped.push(`영역:${area}`); continue; }
    targets.push({ area, steps });
  }

  // 필요한 항목 — **이번에 실제로 심는 단계 것만.** 건너뛴 교재 때문에
  // 항목을 만들면, 안 심은 루틴의 흔적이 학습항목에 남는다
  const need = new Set();
  targets.forEach((t) =>
    t.steps.forEach((st) =>
      [...(st.inclass || []), ...(st.home || []), ...(st.homeNext || [])].forEach((x) =>
        need.add(parse(x).name)
      )
    )
  );
  const toMake = [...need].filter((n) => !itemByName.has(n));
  if (toMake.length) {
    const { data: made, error } = await supabase
      .from("homework_items")
      .insert(toMake.map((n, i) => ({ name: n, category: guessCat(n), active: true, sort: 900 + i })))
      .select("id, name");
    if (error) return jsonKo({ ...out, error: `항목 만들기 실패: ${error.message}` }, { status: 500 });
    (made || []).forEach((i2) => { itemByName.set(i2.name.trim(), i2.id); out.createdItems.push(i2.name); });
  }

  const rows = [];
  targets.forEach((target) => {
    target.steps.forEach((st, i) => {
      const item_notes = {};
      const ids = (arr) =>
        (arr || []).map((x) => {
          const { name, note } = parse(x);
          const id = itemByName.get(name);
          if (id && note) item_notes[id] = note;
          return id;
        }).filter(Boolean);
      rows.push({
        textbook_id: target.bid || null,
        ...(target.area ? { area: target.area } : {}),
        sort: (i + 1) * 10,
        label: st.label || "",
        inclass_items: ids(st.inclass),
        home_items: ids(st.home),
        home_next: ids(st.homeNext),
        item_notes,
        round: st.round ?? null,
      });
    });
  });
  if (rows.length) {
    const { data: ins, error } = await supabase.from("routine_steps").insert(rows).select("id");
    if (error) return jsonKo({ ...out, error: `루틴 심기 실패: ${error.message}` }, { status: 500 });
    out.insertedSteps = (ins || []).length;
  }

  // 잘게 쪼갠 항목 정리는 **force(전면 재주입) 때만** — 빈 곳만 채울 때는
  // 화면에서 짠 루틴이 그 항목을 아직 쓰고 있을 수 있다 (need 가 부분집합이라
  // 여기서 지우면 멀쩡한 루틴이 없는 항목을 가리키게 된다)
  if (force) {
    const FINE = [
      "클카 단어 3초훈련", "클카 입해석", "클카 낭독", "클카 녹음", "클카 스크램블",
      "클카 암기 100%", "클카 단어매칭", "Step3 기호표시", "Step4 한글뜻쓰기", "Step5 영작",
      "테스트북 영작", "SVOCM 표시", "틀린 문장 해석쓰기", "예습 문제풀기", "예습숙제 채점",
      "품사 쇼츠 빈칸채우기", "불규칙동사 녹음 인증", "워크북 채점", "세모별표 검사",
      "워크북 문제풀기", "끊어읽기 표시", "한줄해석쓰기", "구조정리·문제풀기", "구조정리",
      "모르는 단어 뜻쓰기", "예습 단어문제풀기", "예습 지문문제풀기", "틀린문제 클카 3단계",
      "자유 1회독", "분석지 정독", "N회독 날짜기록", "변형문제 풀기", "형광펜 중요표시",
      "문답노트 요약정리",
    ].filter((n) => need.has(n) === false);
    const { data: fineRows } = await supabase
      .from("homework_items").select("id, name").in("name", FINE);
    for (const it of fineRows || []) {
      const { data: used } = await supabase
        .from("daily_report_items").select("id").eq("homework_item_id", it.id).limit(1);
      if ((used || []).length) {
        await supabase.from("homework_items").update({ active: false }).eq("id", it.id);
        out.hiddenItems.push(it.name);
      } else {
        const { error } = await supabase.from("homework_items").delete().eq("id", it.id);
        if (!error) out.removedItems.push(it.name);
        else { await supabase.from("homework_items").update({ active: false }).eq("id", it.id); out.hiddenItems.push(it.name); }
      }
    }
  }

  return jsonKo({
    ok: true,
    ...(force
      ? { 경고: "force=1 — 화면에서 고친 것까지 전부 덮었습니다" }
      : { 방식: "화면이 원본 — 단계가 하나도 없는 교재·영역만 채웠습니다 (전부 덮으려면 &force=1)" }),
    ...out,
    건드린곳: targets.map((t) => t.bookName || `영역:${t.area}`),
    건너뛴곳: skipped,
    missBooks,
  });
}


/**
 * **전원 · 전체 흐름 한 달 시뮬** (원장님, 2026-08-20 — 「한 달치 모든
 * 학생에게. 숙제 배정이 안 된 경우 가상으로라도 진도를 설정해서라도 다
 * 돌려봐」). 결정론(난수 없음)으로 수업 사슬 전체를 돌린다:
 *
 *   검사(1차 판단 프리필 → 손 판정 수) → 미제출은 오늘수업으로 ·
 *   미흡은 숙제 다시 → 등원 소화(세션당 5개) → 남으면 이월(carry)
 *   → 다음 숙제(루틴 home·예습) → 다음 수업 계획(peek) → 반복
 *
 * 재는 것: 세션당 손 판정 수 · 등원 밀림(backlog) 추이 · 재숙제 루프 ·
 * 회독 경계의 peek 오류 · 씨앗 중복. 단원 없는 루틴 교재는 가상 단원
 * 20개로 돌린다 (멈추지 않는 것이 목적).
 */
async function flowSim(supabase) {
  const today = todaySeoul();
  const [stQ, sbQ, bkQ, csQ, clQ] = await Promise.all([
    supabase.from("students").select("id, name, grade").eq("status", "enrolled"),
    supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, assigned_on, ended_on, round")
      .neq("status", "dropped"),
    supabase.from("textbooks").select("id, name, area"),
    supabase.from("class_students").select("class_id, student_id"),
    supabase.from("classes").select("id, days"),
  ]);
  const bookById = new Map((bkQ.data || []).map((b) => [b.id, b]));
  const classDays = new Map((clQ.data || []).map((c) => [c.id, (c.days || []).length]));
  const weekly = new Map();
  (csQ.data || []).forEach((m) => {
    weekly.set(m.student_id, (weekly.get(m.student_id) || 0) + (classDays.get(m.class_id) || 0));
  });
  const { data: units } = await fetchAll(() =>
    supabase.from("textbook_units").select("id, textbook_id, parent_id, name, sort")
      .order("sort", { ascending: true }).order("id"));
  const hasChild = new Set((units || []).map((u) => u.parent_id).filter(Boolean));
  const leavesOf = new Map();
  (units || []).forEach((u) => {
    if (hasChild.has(u.id)) return;
    if (!leavesOf.has(u.textbook_id)) leavesOf.set(u.textbook_id, []);
    leavesOf.get(u.textbook_id).push(u);
  });

  const routineOf = (name) => {
    let r = DRAFTS.books[name];
    if (typeof r === "string") r = DRAFTS.books[r];
    return r || null;
  };
  const CAP = 5;               // 세션당 등원 소화량 (가정)
  const SESS_CAP_NOTE = "세션당 등원 5개 소화 가정";
  const isCc = (n) => /클카/.test(n);

  const perStudent = [];
  const findings = { peek오류: [], 씨앗중복: [], 가상단원교재: new Set(), 루틴전무학생: [] };
  let counter = 0;             // 결정론 패턴용

  for (const s of stQ.data || []) {
    const myBooks = (sbQ.data || [])
      .filter((r) => r.student_id === s.id && inUseOn(r, today))
      .map((r) => ({ ...r, book: bookById.get(r.textbook_id) }))
      .filter((r) => r.book);
    const sessions = Math.max(1, weekly.get(s.id) || 2) * 4;

    const tracks = myBooks
      .map((r) => {
        const steps = routineOf(r.book.name) || DRAFTS.areas[r.book.area || ""] || null;
        if (!steps) return null;
        let leaves = (leavesOf.get(r.textbook_id) || []).map((u) => u.name);
        if (leaves.length === 0) {
          findings.가상단원교재.add(r.book.name);
          leaves = Array.from({ length: 20 }, (_, i) => `가상 ${i + 1}과`);
        }
        return { name: r.book.name, steps, leaves, round: r.round || 1, ptr: 0, stepIdx: 0 };
      })
      .filter(Boolean);
    if (tracks.length === 0) {
      findings.루틴전무학생.push(`${s.name}(교재 ${myBooks.length})`);
      continue;
    }

    const stepOf = (t, idxShift = 0) => {
      const rounded = t.steps.filter((x) => x.round != null && x.round <= t.round);
      const maxR = rounded.length ? Math.max(...rounded.map((x) => x.round)) : null;
      const list = t.steps.filter((x) => (x.round == null && maxR == null) || x.round === maxR);
      if (!list.length) return null;
      return list[(t.stepIdx + idxShift) % list.length];
    };

    let homework = [];           // [{name}] 이번 세션에 검사할 숙제
    let inclassQueue = [];       // 이월 포함 등원 대기열
    let plan = null;             // 지난 세션에 세워둔 계획
    let handMarks = 0, autoMarks2 = 0, redo = 0, pulledIn = 0, notified = 0;
    let maxBacklog = 0, endBacklog = 0;

    for (let sess = 1; sess <= sessions; sess += 1) {
      // ① 검사 — 1차 판단(클카·제출물)/손 판정, 결정론 패턴으로 결과 배정
      const todayInclassExtra = [];
      homework.forEach((h) => {
        counter += 1;
        const outcome = counter % 4 === 0 ? "missing" : counter % 9 === 0 ? "weak" : "done";
        const auto = isCc(h) || counter % 5 !== 0;   // 클카거나 제출물 있음
        if (auto) autoMarks2 += 1; else handMarks += 1;
        if (outcome === "missing") { todayInclassExtra.push(h); pulledIn += 1; }
        if (outcome === "weak") redo += 1;           // 숙제 다시
      });

      // ② 등원 목록 = 미제출 끌어온 것 + 이월 + 계획(또는 루틴 현재 단계)
      let list = [...todayInclassExtra, ...inclassQueue];
      const base = plan
        ? plan
        : tracks.flatMap((t) => (stepOf(t)?.inclass || []));
      base.forEach((x) => { if (!list.includes(x)) list.push(x); });
      const dupCheck = new Set(list);
      if (dupCheck.size !== list.length) {
        // 어느 항목이 겹치는지 이름으로 (원장님 2026-08-21 「뭐가 중복이라는거지」)
        const seen = new Set();
        const dups = [...new Set(list.filter((x) => (seen.has(x) ? true : (seen.add(x), false))))];
        findings.씨앗중복.push(`${s.name} ${sess}회: ${dups.join(" · ")}`);
      }
      if (plan && sess > 1) notified += 0;           // 계획 그대로면 알림 없음 (변경 모델 생략)

      // ③ 소화 — CAP 개까지, 나머지는 이월
      const donePart = list.slice(0, CAP);
      inclassQueue = list.slice(CAP);
      maxBacklog = Math.max(maxBacklog, inclassQueue.length);

      // ④ 진도 — 오늘 다룬 교재(등원에 항목이 있던 교재) 단원 하나씩
      tracks.forEach((t) => {
        const st = stepOf(t);
        if (!st) return;
        const touched = (st.inclass || []).some((x) => donePart.includes(x));
        if (!touched) return;
        t.ptr += 1;
        t.stepIdx += 1;
        if (t.ptr >= t.leaves.length) { t.round += 1; t.ptr = 0; }
      });

      // ⑤ 다음 숙제 + 다음 수업 계획(peek)
      homework = tracks.flatMap((t) => {
        const st = stepOf(t);
        return st ? [...(st.home || []), ...(st.homeNext || [])] : [];
      });
      for (let r2 = 0; r2 < redo && r2 < 1; r2 += 1) homework.push("재숙제");
      plan = tracks.flatMap((t) => {
        const nxt = stepOf(t, 1);
        if (!nxt) {
          findings.peek오류.push(`${s.name}·${t.name} ${sess}회 (다음 단계 없음)`);
          return [];
        }
        return nxt.inclass || [];
      });
    }
    endBacklog = inclassQueue.length;

    perStudent.push({
      name: s.name,
      sessions,
      루틴교재: tracks.length,
      평균손판정: Math.round((handMarks / sessions) * 10) / 10,
      평균자동판정: Math.round((autoMarks2 / sessions) * 10) / 10,
      미제출끌어옴: pulledIn,
      재숙제: redo,
      최대밀림: maxBacklog,
      한달뒤밀림: endBacklog,
    });
  }

  perStudent.sort((a, b) => b.한달뒤밀림 - a.한달뒤밀림 || b.최대밀림 - a.최대밀림);
  const worst = perStudent.filter((x) => x.한달뒤밀림 > 0);
  return jsonKo({
    ok: true,
    가정: SESS_CAP_NOTE,
    학생수: perStudent.length,
    자동판정비율: (() => {
      const h = perStudent.reduce((a, x) => a + x.평균손판정, 0);
      const a2 = perStudent.reduce((a, x) => a + x.평균자동판정, 0);
      return h + a2 ? Math.round((a2 / (h + a2)) * 100) : 0;
    })(),
    밀림있는학생: worst.length,
    학생별: perStudent,
    발견: {
      peek오류: findings.peek오류.slice(0, 10),
      씨앗중복: findings.씨앗중복.slice(0, 10),
      가상단원교재: [...findings.가상단원교재],
      루틴전무학생: findings.루틴전무학생,
    },
  });
}


/**
 * **오늘 단어 재시험 명단 + 시험 방식** (원장님, 2026-08-20 — 「재시험
 * 뜬 학생들 확인해서 클로드가 크롬에서 재시험지 클래스카드로 인쇄」 +
 * 「(시험지 유형은) 앱의 학생별 시험 방식을 그대로 — 그게 포인트임」).
 *
 * 읽기만 한다. 클로드가 이 목록을 받아 클카에서 학생별 오늘 세트로
 * 시험지를 생성한다. 유형 매핑:
 *   단어제시 객관식=mc_meaning · 주관식=sa_meaning
 *   의미제시 객관식=mc_word   · 주관식=sa_word
 *   first_hint → 「주관식 첫 글자 힌트」 체크
 */
async function retestList(supabase) {
  const today = todaySeoul();
  const { data: reps } = await supabase
    .from("daily_reports")
    .select("student_id, word_correct, word_total, skip_kinds")
    .eq("date", today)
    .gt("word_total", 0);
  const failed = (reps || []).filter((r) => {
    if ((r.skip_kinds || []).includes("retest")) return false;   // 오늘은 건너뛰기
    if (r.word_correct == null) return false;
    return (r.word_correct / r.word_total) * 100 < 90;
  });
  if (!failed.length) return jsonKo({ ok: true, today, students: [] });

  const ids = failed.map((r) => r.student_id);
  const [{ data: sts }, { data: sb }, { data: bks }] = await Promise.all([
    supabase.from("students").select("id, name, login_id, classcard_login").in("id", ids),
    supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, round, status")
      .in("student_id", ids)
      .neq("status", "dropped"),
    supabase.from("textbooks").select("id, name, area"),
  ]);
  const bookById = new Map((bks || []).map((b) => [b.id, b]));
  const wordBookOf = new Map();
  (sb || []).forEach((r) => {
    const b = bookById.get(r.textbook_id);
    if (b?.area === "단어" && !wordBookOf.has(r.student_id))
      wordBookOf.set(r.student_id, { id: b.id, name: b.name, round: r.round || 1 });
  });
  let wt = [];
  {
    const q = await supabase
      .from("word_test_settings")
      .select("student_id, textbook_id, round, mc_meaning, sa_meaning, mc_word, sa_word, first_hint, units_per")
      .in("student_id", ids);
    if (!q.error) wt = q.data || [];
  }
  const stById = new Map((sts || []).map((x) => [x.id, x]));
  const students = failed.map((r) => {
    const st = stById.get(r.student_id) || {};
    const wb = wordBookOf.get(r.student_id) || null;
    const w = wt.find(
      (x) => x.student_id === r.student_id && (!wb || x.textbook_id === wb.id)
    ) || null;
    return {
      name: st.name || "학생",
      ccLogin: st.classcard_login || st.login_id || "",
      score: `${r.word_correct}/${r.word_total}`,
      wordBook: wb?.name || "",
      방식: w
        ? {
            단어제시_객관식: w.mc_meaning || 0,
            단어제시_주관식: w.sa_meaning || 0,
            의미제시_객관식: w.mc_word || 0,
            의미제시_주관식: w.sa_word || 0,
            첫글자힌트: !!w.first_hint,
            한번에단원: w.units_per || 1,
          }
        : null,
    };
  });
  return jsonKo({ ok: true, today, students });
}


/**
 * **실전 데이터 한 달 시뮬 + 오류 사냥** (원장님, 2026-08-21 — 「시뮬레이션
 * 한 달치 돌리고 오류 잡아」). drafts 가 아니라 **DB 에 심긴 루틴**으로
 * 돌리고, 첫 세션은 실제 서비스 코드(nextRoutine)와 맞대조한다 —
 * 시뮬과 실코드가 다른 말을 하면 그게 곧 버그다. 아무것도 안 쓴다.
 */
async function monthSim(supabase) {
  const today = todaySeoul();
  const [stQ, sbQ, bkQ, csQ, clQ, itQ, rsQ] = await Promise.all([
    supabase.from("students").select("id, name").eq("status", "enrolled"),
    supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, assigned_on, ended_on, round, routine_step, routine_step_id, skip_acts")
      .neq("status", "dropped"),
    supabase.from("textbooks").select("id, name, area"),
    supabase.from("class_students").select("class_id, student_id"),
    supabase.from("classes").select("id, days"),
    supabase.from("homework_items").select("id, name, active"),
    supabase
      .from("routine_steps")
      .select("id, textbook_id, area, sort, label, inclass_items, home_items, home_next, item_notes, round")
      .order("sort", { ascending: true }),
  ]);
  const bookById = new Map((bkQ.data || []).map((b) => [b.id, b]));
  const itemById = new Map((itQ.data || []).map((i) => [i.id, i]));
  const classDays = new Map((clQ.data || []).map((c) => [c.id, (c.days || []).length]));
  const weekly = new Map();
  (csQ.data || []).forEach((m) =>
    weekly.set(m.student_id, (weekly.get(m.student_id) || 0) + (classDays.get(m.class_id) || 0))
  );
  const { data: units } = await fetchAll(() =>
    supabase.from("textbook_units").select("id, textbook_id, parent_id, name, sort")
      .order("sort", { ascending: true }).order("id"));
  const hasChild = new Set((units || []).map((u) => u.parent_id).filter(Boolean));
  const leavesOf = new Map();
  (units || []).forEach((u) => {
    if (hasChild.has(u.id)) return;
    if (!leavesOf.has(u.textbook_id)) leavesOf.set(u.textbook_id, []);
    leavesOf.get(u.textbook_id).push(u);
  });
  const { data: prog } = await fetchAll(() =>
    supabase.from("student_unit_progress").select("student_id, textbook_unit_id, status, round")
      .order("student_id").order("textbook_unit_id"));
  const doneSet = new Set(
    (prog || []).filter((p) => p.status === "done")
      .map((p) => `${p.student_id}|${p.textbook_unit_id}|${p.round || 1}`)
  );

  // DB 루틴 색인
  const stepsOfBook = new Map();
  const stepsOfArea = new Map();
  (rsQ.data || []).forEach((r) => {
    if (r.textbook_id) {
      if (!stepsOfBook.has(r.textbook_id)) stepsOfBook.set(r.textbook_id, []);
      stepsOfBook.get(r.textbook_id).push(r);
    } else if (r.area) {
      if (!stepsOfArea.has(r.area)) stepsOfArea.set(r.area, []);
      stepsOfArea.get(r.area).push(r);
    }
  });

  const errors = [];
  const warns = [];
  // 오류 사냥 ①: 루틴이 가리키는 항목이 실제로 있나(활성인가)
  (rsQ.data || []).forEach((r) => {
    [...(r.inclass_items || []), ...(r.home_items || []), ...(r.home_next || [])].forEach((iid) => {
      const it = itemById.get(iid);
      const whereName = r.textbook_id ? bookById.get(r.textbook_id)?.name : `영역:${r.area}`;
      if (!it) errors.push(`루틴(${whereName} ${r.label || ""})이 없는 항목 id 를 가리킴`);
      else if (!it.active) errors.push(`루틴(${whereName})이 숨긴 항목 「${it.name}」 을 가리킴`);
    });
  });

  const stepFor = (all, curRound, stepIdx) => {
    const rounded = all.filter((x) => x.round != null && x.round <= curRound);
    const maxR = rounded.length ? Math.max(...rounded.map((x) => x.round)) : null;
    const list = all.filter((x) => (x.round == null && maxR == null) || x.round === maxR);
    if (!list.length) return { step: null, list };
    return { step: list[stepIdx % list.length], list };
  };

  const perStudent = [];
  const CAP = 5;
  for (const s of stQ.data || []) {
    const myBooks = (sbQ.data || [])
      .filter((r) => r.student_id === s.id && inUseOn(r, today))
      .map((r) => ({ ...r, book: bookById.get(r.textbook_id) }))
      .filter((r) => r.book);
    if (!myBooks.length) continue;
    const sessions = Math.max(1, weekly.get(s.id) || 2) * 4;

    const tracks = myBooks
      .map((r) => {
        const all = stepsOfBook.get(r.textbook_id)?.length
          ? stepsOfBook.get(r.textbook_id)
          : stepsOfArea.get(r.book.area || "") || null;
        if (!all) return null;
        const leaves = leavesOf.get(r.textbook_id) || [];
        if (!leaves.length) {
          warns.push(`${s.name}·${r.book.name} — 루틴은 있는데 단원 0`);
          return null;
        }
        const round = r.round || 1;
        let ptr = leaves.findIndex((u) => !doneSet.has(`${s.id}|${u.id}|${round}`));
        if (ptr < 0) ptr = 0;
        return { r, all, leaves, round, ptr, stepIdx: 0, name: r.book.name };
      })
      .filter(Boolean);
    if (!tracks.length) continue;

    // 오류 사냥 ②: 첫 세션을 실제 nextRoutine 과 맞대조
    let firstDiff = null;
    try {
      const real = await nextRoutine(s.id);
      const realBooks = new Set((real.steps || []).map((x) => x.textbookId));
      const simBooks = new Set(tracks.map((t) => t.r.textbook_id));
      const missing = [...simBooks].filter((b) => !realBooks.has(b)).map((b) => bookById.get(b)?.name);
      const extra = [...realBooks].filter((b) => !simBooks.has(b)).map((b) => bookById.get(b)?.name);
      if (missing.length || extra.length)
        firstDiff = `실코드와 다름 — 시뮬만: ${missing.join(",") || "-"} · 실코드만: ${extra.join(",") || "-"}`;
    } catch (e) {
      firstDiff = `nextRoutine 이 던짐: ${e?.message || e}`;
    }
    if (firstDiff) errors.push(`${s.name}: ${firstDiff}`);

    let queue = [];
    let maxBacklog = 0;
    let lastNoNext = 0;
    for (let sess = 1; sess <= sessions; sess += 1) {
      let list = [...queue];
      tracks.forEach((t) => {
        const { step } = stepFor(t.all, t.round, t.stepIdx);
        if (!step) {
          errors.push(`${s.name}·${t.name} — 회독 ${t.round}에 맞는 루틴 줄이 없음`);
          return;
        }
        (step.inclass_items || []).forEach((x) => { if (!list.includes(x)) list.push(x); });
        if ((step.home_next || []).length && t.ptr + 1 >= t.leaves.length) lastNoNext += 1;
        t.stepIdx += 1;
        t.ptr += 1;
        if (t.ptr >= t.leaves.length) { t.round += 1; t.ptr = 0; }
      });
      queue = list.slice(CAP);
      maxBacklog = Math.max(maxBacklog, queue.length);
    }
    perStudent.push({
      name: s.name,
      루틴교재: tracks.length,
      sessions,
      한달뒤밀림: queue.length,
      최대밀림: maxBacklog,
      마지막단원예습없음횟수: lastNoNext,
    });
  }

  perStudent.sort((a, b) => b.한달뒤밀림 - a.한달뒤밀림);
  return jsonKo({
    ok: true,
    학생수: perStudent.length,
    오류: [...new Set(errors)].slice(0, 30),
    주의: [...new Set(warns)].slice(0, 20),
    학생별: perStudent,
  });
}


/**
 * **실전 투입 전 안전 점검** (원장님, 2026-08-21 — 「학부모한테 다른
 * 학부모·다른 학생 정보가 잘못 공지되거나, 숙제 문자가 다 꼬여서 당일
 * 아무것도 못 나가면 어떡할건데」).
 *
 * 반복해서 돌리는 검사다. **아무것도 쓰지 않는다** — 지금 DB 에 실제로
 * 담긴 알림·공지·리포트를, 실제 발송이 쓰는 코드(loadReportRows ·
 * monthlyBriefing 의 재료 쿼리)와 맞대조해서 「남의 집으로 새는 길」과
 * 「빈 문자로 나가는 길」을 미리 잡는다. errorTotal 0 이면 통과.
 */
async function safetyCheck(supabase) {
  const today = todaySeoul();
  const weekAgo = addDays(today, -7);
  const checks = [];

  // 학생 명부 — 여러 검사가 같은 명부를 본다 (재원생 + 전체)
  const { data: allStudents } = await fetchAll(() =>
    supabase.from("students").select("id, name, status").order("id")
  );
  const enrolled = (allStudents || []).filter((s) => s.status === "enrolled");
  const enrolledSet = new Set(enrolled.map((s) => s.id));
  const knownSet = new Set((allStudents || []).map((s) => s.id));
  const nameOf = new Map((allStudents || []).map((s) => [s.id, s.name]));

  // ── ① 알림 대상 정합 — 대기 중인 앱 알림(push)이 엉뚱한 집으로 갈 길이 있나
  {
    const errors = [];
    const { data: pend } = await fetchAll(() =>
      supabase
        .from("scheduled_sends")
        .select("id, kind, due_at, note, payload, sent_at")
        .eq("kind", "push")
        .is("sent_at", null)
        .order("due_at", { ascending: true })
        .order("id")
    );
    const now = Date.now();
    let multiFamily = 0;
    (pend || []).forEach((j) => {
      const label = j.note || j.payload?.title || j.id;
      const ids = [...new Set((j.payload?.studentIds || []).filter(Boolean))];
      if (ids.length === 0) errors.push(`예약알림 「${label}」 — 보낼 학생이 없다 (빈 대상)`);
      const ghosts = ids.filter((x) => !enrolledSet.has(x));
      if (ghosts.length)
        errors.push(`예약알림 「${label}」 — 재원생 아닌 id ${ghosts.length}개 (${ghosts.map((x) => nameOf.get(x) || x).join(", ")})`);
      if (ids.length > 1) {
        multiFamily += 1;
        // 학생 여럿(=여러 집)에 한 통 — note 에 사유가 없으면 실수로 본다
        if (!(j.note || "").trim())
          errors.push(`예약알림 — 학생 ${ids.length}명이 한 건에 묶였는데 note 에 사유가 없다 (${ids.map((x) => nameOf.get(x) || x).join(", ")})`);
      }
      if (j.due_at && new Date(j.due_at).getTime() <= now)
        errors.push(`예약알림 「${label}」 — 발송 시각(${j.due_at})이 지났는데 아직 대기 중`);
    });
    checks.push({
      name: "알림 대상 정합",
      ok: errors.length === 0,
      errors,
      세부: { 대기건수: (pend || []).length, 여러학생묶음: multiFamily },
    });
  }

  // ── ② 공지 수신자 정합 — 최근 7일 공지가 지목한 학생 밖으로 샜나
  {
    const errors = [];
    const { data: nts } = await fetchAll(() =>
      supabase
        .from("notices")
        .select("id, date, kind, task_id")
        .gte("date", weekAgo)
        .lte("date", today)
        .order("date", { ascending: true })
        .order("id")
    );
    const nIds = (nts || []).map((n) => n.id);
    const { data: recs } = nIds.length
      ? await fetchAll(() =>
          supabase
            .from("notice_receipts")
            .select("notice_id, student_id")
            .in("notice_id", nIds)
            .order("notice_id")
            .order("student_id")
        )
      : { data: [] };
    const recsOf = new Map();
    (recs || []).forEach((r) => {
      if (!recsOf.has(r.notice_id)) recsOf.set(r.notice_id, []);
      recsOf.get(r.notice_id).push(r.student_id);
    });
    // 수신자가 재원생인가
    (nts || []).forEach((n) => {
      const ghosts = (recsOf.get(n.id) || []).filter((x) => !enrolledSet.has(x));
      if (ghosts.length)
        errors.push(`공지(${n.date} ${n.kind}) — 재원생 아닌 수신자 ${ghosts.length}명 (${ghosts.map((x) => nameOf.get(x) || x).join(", ")})`);
    });
    // 학생 지목 일정(deliver_student_ids)에서 온 공지가 다른 학생에게 새지 않았나
    const taskIds = [...new Set((nts || []).map((n) => n.task_id).filter(Boolean))];
    let pinned = 0;
    if (taskIds.length) {
      const { data: tks } = await fetchAll(() =>
        supabase.from("tasks").select("id, deliver_student_ids").in("id", taskIds).order("id")
      );
      const deliverOf = new Map((tks || []).map((t) => [t.id, t.deliver_student_ids || []]));
      (nts || []).forEach((n) => {
        const picked = deliverOf.get(n.task_id) || [];
        if (!picked.length) return; // 전체·반 대상 일정은 지목이 아니다 — 대조 불가
        pinned += 1;
        const allow = new Set(picked);
        const leaked = (recsOf.get(n.id) || []).filter((x) => !allow.has(x));
        if (leaked.length)
          errors.push(`공지(${n.date} ${n.kind}) — 일정이 지목한 학생 밖으로 receipts 가 샜다: ${leaked.map((x) => nameOf.get(x) || x).join(", ")}`);
      });
    }
    checks.push({
      name: "공지 수신자 정합",
      ok: errors.length === 0,
      errors,
      세부: { 최근7일공지: (nts || []).length, 수신줄: (recs || []).length, 학생지목공지: pinned },
    });
  }

  // ── ③ 데일리리포트 소유 정합 — 한 학생 하루 한 장, 남의 리포트에 붙은 항목 없음
  {
    const errors = [];
    const { data: reps } = await fetchAll(() =>
      supabase
        .from("daily_reports")
        .select("id, student_id, date")
        .gte("date", weekAgo)
        .lte("date", today)
        .order("date", { ascending: true })
        .order("id")
    );
    const seen = new Map();
    (reps || []).forEach((r) => {
      const k = `${r.student_id}|${r.date}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    });
    [...seen.entries()]
      .filter(([, c]) => c > 1)
      .forEach(([k, c]) => {
        const [sid, d] = k.split("|");
        errors.push(`리포트 중복 — ${nameOf.get(sid) || sid} ${d} 에 ${c}장 (문자가 두 벌 나갈 길)`);
      });
    // 고아 항목 — 리포트 없이 떠 있는 검사 줄 (FK cascade 가 지켜주지만 선언만 믿지 않는다)
    let orphanNote = "FK 정상";
    try {
      const q = await supabase
        .from("daily_report_items")
        .select("id, daily_report_id, daily_reports(id)")
        .is("daily_reports", null)
        .limit(20);
      if (q.error) orphanNote = "조회 불가 — FK(on delete cascade) 선언에 맡김";
      else if ((q.data || []).length)
        errors.push(`고아 항목 ${q.data.length}건 — 리포트 없이 떠 있는 daily_report_items`);
    } catch {
      orphanNote = "조회 불가 — FK(on delete cascade) 선언에 맡김";
    }
    // 키워드 메모(0146) — 실재 학생 것인가
    let kwCount = null;
    try {
      const { data: kws } = await fetchAll(() =>
        supabase
          .from("report_keywords")
          .select("student_id, date")
          .gte("date", weekAgo)
          .lte("date", today)
          .order("date", { ascending: true })
          .order("student_id")
      );
      kwCount = (kws || []).length;
      (kws || []).forEach((k) => {
        if (!knownSet.has(k.student_id))
          errors.push(`키워드 메모(${k.date}) — 명부에 없는 학생 id ${k.student_id}`);
      });
    } catch {
      kwCount = null; // 0146 전 — 표가 없으면 검사할 것도 없다
    }
    checks.push({
      name: "데일리리포트 소유 정합",
      ok: errors.length === 0,
      errors,
      세부: { 최근7일리포트: (reps || []).length, 고아항목: orphanNote, 키워드줄: kwCount },
    });
  }

  // ── ④ 숙제 문자 조립 검증 — 실제 발송 코드(loadReportRows)로 문구를 만들어 본다
  {
    const errors = [];
    const 세부 = {};
    const { data: catalog } = await fetchAll(() =>
      supabase.from("homework_items").select("id, name").order("id")
    );
    const catalogNames = (catalog || [])
      .map((i) => (i.name || "").trim())
      .filter((n) => n.length >= 3); // 두 글자짜리는 일상어와 겹쳐 오탐이 된다
    for (const date of [today, addDays(today, -1)]) {
      const { rows } = await loadReportRows(supabase, date);
      // 학생별 「내 리포트에 실제로 붙은 항목 이름」 — 발송 코드와 별도로 다시 읽어 맞대조
      const repIds = rows.map((r) => r.id);
      const { data: dri } = repIds.length
        ? await fetchAll(() =>
            supabase
              .from("daily_report_items")
              .select("daily_report_id, homework_item_id")
              .in("daily_report_id", repIds)
              .order("daily_report_id")
          )
        : { data: [] };
      const itemName = new Map((catalog || []).map((i) => [i.id, (i.name || "").trim()]));
      const ownOf = new Map();
      (dri || []).forEach((x) => {
        if (!ownOf.has(x.daily_report_id)) ownOf.set(x.daily_report_id, new Set());
        const n = itemName.get(x.homework_item_id);
        if (n) ownOf.get(x.daily_report_id).add(n);
      });
      for (const row of rows) {
        const hw = row.hwText || "";
        const own = ownOf.get(row.id) || new Set();
        // 그 학생 리포트에 없는 배정이 문구에 들어갔나 (항목은 공용 카탈로그 — 이름으로 판정)
        const foreign = catalogNames.filter(
          (n) => hw.includes(n) && !own.has(n) && ![...own].some((o) => o.includes(n))
        );
        if (foreign.length)
          errors.push(`${date} ${row.name} 숙제 문자 — 이 학생 리포트에 없는 항목이 실렸다: ${foreign.join(", ")}`);
        // 다른 학생 이름이 문구에 있나 (같은 이름 학생은 제 이름이니 뺀다)
        const otherNames = [...new Set(
          (allStudents || []).map((s) => (s.name || "").trim()).filter((n) => n.length >= 2 && n !== row.name)
        )];
        const leakedName = otherNames.filter((n) => hw.includes(n) || (row.text || "").includes(n));
        if (leakedName.length)
          errors.push(`${date} ${row.name} 문자 — 다른 학생 이름이 들어 있다: ${leakedName.join(", ")}`);
        // 빈 문구로 「보냄」 처리될 위험
        if (!(row.skip || []).includes("homework") && !hw.trim())
          errors.push(`${date} ${row.name} — 숙제 문자가 빈 채로 발송 대상`);
      }
      세부[date] = { 대상: rows.length };
    }
    checks.push({ name: "숙제 문자 조립 검증", ok: errors.length === 0, errors, 세부 });
  }

  // ── ⑤ 월간 브리핑 재료 격리 — 표본 학생의 재료가 전부 제 것인가
  //     (app/ai/actions.js monthlyBriefing 의 재료 쿼리와 같은 조건으로 돌린다)
  {
    const errors = [];
    const ym = today.slice(0, 7);
    const from = `${ym}-01`;
    const to = `${ym}-31`;
    const sample = [...enrolled].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko")).slice(0, 5);
    // 이 달 리포트 공지 전체의 수신 명부 — 학생별 결과를 이걸로 맞춰본다
    let nq = await supabase
      .from("notices").select("id, date, body, task_id")
      .eq("kind", "notice").gte("date", from).lte("date", to);
    if (nq.error)
      nq = await supabase.from("notices").select("id, date, body").eq("kind", "notice").gte("date", from).lte("date", to);
    const monthNotices = (nq.data || []).filter((n) => !n.task_id && (n.body || "").trim());
    const mnIds = monthNotices.map((n) => n.id);
    const { data: allRecs } = mnIds.length
      ? await fetchAll(() =>
          supabase
            .from("notice_receipts")
            .select("notice_id, student_id")
            .in("notice_id", mnIds)
            .order("notice_id")
            .order("student_id")
        )
      : { data: [] };
    for (const s of sample) {
      // 실코드와 같은 쿼리 — 이 학생의 receipts 만
      const { data: rec } = mnIds.length
        ? await supabase
            .from("notice_receipts")
            .select("notice_id, student_id")
            .eq("student_id", s.id)
            .in("notice_id", mnIds)
        : { data: [] };
      (rec || []).forEach((r) => {
        if (r.student_id !== s.id)
          errors.push(`${s.name} 월간 재료 — 남의 수신줄이 섞여 왔다 (${nameOf.get(r.student_id) || r.student_id})`);
      });
      // 전체 명부와 맞대조 — 이 학생 것으로 실릴 공지가 정말 이 학생 수신인가
      const trueMine = new Set(
        (allRecs || []).filter((r) => r.student_id === s.id).map((r) => r.notice_id)
      );
      (rec || []).forEach((r) => {
        if (!trueMine.has(r.notice_id))
          errors.push(`${s.name} 월간 재료 — 수신 명부에 없는 공지가 실린다 (notice ${r.notice_id})`);
      });
      // 키워드 메모 — 전부 이 학생 것인가
      try {
        const { data: kws } = await supabase
          .from("report_keywords")
          .select("student_id, date")
          .eq("student_id", s.id)
          .gte("date", from).lte("date", to)
          .order("date", { ascending: true });
        (kws || []).forEach((k) => {
          if (k.student_id !== s.id)
            errors.push(`${s.name} 월간 재료 — 남의 키워드 메모가 섞여 왔다 (${nameOf.get(k.student_id) || k.student_id})`);
        });
      } catch { /* 0146 전 */ }
    }
    checks.push({
      name: "월간 브리핑 재료 격리",
      ok: errors.length === 0,
      errors,
      세부: { 표본: sample.map((s) => s.name), 이달공지: monthNotices.length },
    });
  }

  // ── ⑥ RLS 선언 검사 — 원장만 읽어야 하는 표가 is_staff() 로 잠겨 있나
  //     (DB 를 직접 캐물을 수는 없다 — 마이그레이션 선언 기준으로 본다)
  {
    const errors = [];
    const 세부 = {};
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const want = [
      ["report_keywords", "0146_report_keywords.sql"],
      ["classcard_shadow", "0132_classcard_shadow.sql"],
    ];
    for (const [table, file] of want) {
      try {
        const body = await fs.readFile(path.join(dir, file), "utf8");
        const rlsOn = new RegExp(`alter table public\\.${table} enable row level security`).test(body);
        const staffOnly = new RegExp(
          `create policy [^;]*on public\\.${table}[\\s\\S]*?using \\(public\\.is_staff\\(\\)\\) with check \\(public\\.is_staff\\(\\)\\)`
        ).test(body);
        if (!rlsOn) errors.push(`${table} — RLS enable 선언이 없다 (${file})`);
        if (!staffOnly) errors.push(`${table} — is_staff() 정책(using+with check) 선언이 없다 (${file})`);
        세부[table] = rlsOn && staffOnly ? "is_staff() 잠금 확인" : "선언 미비";
      } catch {
        errors.push(`${file} 을 읽지 못했다 — RLS 선언을 확인할 수 없다`);
        세부[table] = "파일 없음";
      }
    }
    checks.push({ name: "RLS 선언 검사", ok: errors.length === 0, errors, 세부 });
  }

  const errorTotal = checks.reduce((a, c) => a + c.errors.length, 0);
  return jsonKo({
    ok: errorTotal === 0,
    students: enrolled.length,
    checks,
    errorTotal,
  });
}
