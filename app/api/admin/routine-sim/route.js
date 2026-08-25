import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";
import { fetchAll } from "@/lib/fetchAll";
import { inUseOn } from "@/lib/bookUse";
import { todaySeoul, addDays } from "@/lib/day";
import { stripItemRefs } from "@/lib/itemRefs";
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
  const supabase = await createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return jsonKo({ error: guard.error }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const op = sp.get("op");
  if (op === "rebuild") return rebuildRoutines(supabase, sp.get("force") === "1");
  if (op === "flow") return flowSim(supabase);
  if (op === "retest") return retestList(supabase);
  if (op === "month") return monthSim(supabase);
  if (op === "safety") return safetyCheck(supabase);
  if (op === "noassign") return noAssign(supabase);
  if (op === "mockmerge") return mockMerge(supabase, sp.get("apply") === "1");
  if (op === "peek") return progressPeek(supabase, sp.get("days") || "3");
  if (op === "tree") return workbookTree(supabase, sp.get("book") || "");
  if (op === "wbmove") return workbookMove(supabase, sp.get("book") || "", sp.get("apply") === "1");
  if (op === "outline") return bookOutline(supabase, sp.get("book") || "", sp.get("top") || "2");
  if (op === "whoroutine") return whoRoutine(supabase, sp.get("student") || "");
  if (op === "deaditems") return deadItems(supabase, sp.get("apply") === "1");

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


/**
 * **검사할 배정이 없는 재원생** (원장님 2026-08-21 — 「진도가 배정되지
 * 않아서 숙제 검사할 수 없는 게 누구누구야?」). 읽기만 한다.
 * 마지막으로 숙제(assigned)가 나간 날을 학생마다 찾아 — 없으면 「배정
 * 없음」, 14일 넘었으면 「오래됨」 으로 가른다.
 */
async function noAssign(supabase) {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const [stQ, repQ] = await Promise.all([
    supabase.from("students").select("id, name, grade").eq("status", "enrolled").order("name"),
    fetchAll(() => supabase
      .from("daily_reports").select("id, student_id, date")
      .lte("date", today).order("date", { ascending: false }).order("id")),
  ]);
  const reps = repQ.data || [];
  const repIds = reps.map((r) => r.id);
  const assignedSet = new Set();
  for (let i = 0; i < repIds.length; i += 300) {
    const { data } = await supabase
      .from("daily_report_items").select("daily_report_id")
      .eq("status", "assigned").in("daily_report_id", repIds.slice(i, i + 300));
    (data || []).forEach((x) => assignedSet.add(x.daily_report_id));
  }
  const lastAssigned = new Map();
  reps.forEach((r) => {
    if (assignedSet.has(r.id) && !lastAssigned.has(r.student_id)) lastAssigned.set(r.student_id, r.date);
  });
  const 없음 = [], 오래됨 = [], 정상 = [];
  const old = new Date(Date.now() + 9 * 3600 * 1000 - 14 * 86400000).toISOString().slice(0, 10);
  (stQ.data || []).forEach((s2) => {
    const d = lastAssigned.get(s2.id);
    const tag = `${s2.name}${s2.grade ? `(${s2.grade})` : ""}`;
    if (!d) 없음.push(tag);
    else if (d < old) 오래됨.push(`${tag} — 마지막 배정 ${d.slice(5)}`);
    else 정상.push(tag);
  });
  return jsonKo({ ok: true, 배정없음: 없음, 배정오래됨_14일: 오래됨, 정상: 정상.length });
}


/**
 * **모의고사 교재 통합** (원장님, 2026-08-22 — 「대단원을 기존의 교재명으로,
 * 중단원을 번호로 만들어서 고1 모의고사·고2·고3으로 교재 통합시켜줘」).
 *
 * 「2026년 3월 고1 모의고사」 처럼 회차마다 한 권씩 생긴 교재(prep 의
 * makeMockBook 산물)를 학년별 한 권(「고1 모의고사」)으로 합친다.
 * 원본 교재명이 대상 교재의 **대단원**이 되고, 문항 단원(18번~45번)은
 * **id 를 그대로 둔 채** 그 밑으로 이동한다 — 그래서 진도
 * (student_unit_progress) · 검사 기록(daily_report_items.textbook_unit_ids) ·
 * 내신 범위(prep_scopes.unit_ids)는 전부 unit id 를 물고 있어 손대지 않아도
 * 따라온다.
 *
 * 기본은 **미리보기** — 아무것도 안 쓴다. `&apply=1` 일 때만 바꾼다.
 * 모든 단계가 멱등이라 두 번 눌러도 안전하다:
 *   · 원본 후보 = 이름이 정확히 「YYYY년 M월 고N 모의고사」 이고 status 가
 *     아직 active 인 것만 — 「첫모의고사」 같은 유사명은 절대 안 걸린다
 *   · apply 후 재실행하면 원본이 전부 절판(discontinued)이라 「이미 통합됨」
 *
 * 단원 sort 는 연월 오프셋(yyyymm*100)을 더해 옮긴다 — 진도 포인터
 * (routineActions.currentUnits)가 트리를 안 보고 교재 전체를 sort 순으로
 * 납작하게 읽기 때문에, 오프셋 없이 합치면 여러 달의 「18번」이 전부
 * 붙어버려 다음 단원이 엉킨다. 같은 원본 안의 상대 순서는 그대로다.
 */
async function mockMerge(supabase, apply = false) {
  const RE = /^(\d{4})년 (\d{1,2})월 고([123]) 모의고사$/;
  const TARGET_NAME = (g) => `고${g} 모의고사`;

  const { data: books, error: bErr } = await supabase
    .from("textbooks")
    .select("id, name, area, target_grade, total_pages, price, feature, purchase_url, status");
  if (bErr) return jsonKo({ error: bErr.message }, { status: 500 });

  // 유사명은 절대 포함하지 않는다 — 무엇을 제외했는지도 밝힌다
  const 유사명제외 = (books || [])
    .map((b) => (b.name || "").trim())
    .filter((n) => /모의고사/.test(n) && !RE.test(n) && !/^고[123] 모의고사$/.test(n));

  const sources = (books || [])
    .map((b) => {
      const m = RE.exec((b.name || "").trim());
      return m ? { b, y: +m[1], mo: +m[2], g: m[3], yyyymm: +m[1] * 100 + +m[2] } : null;
    })
    .filter(Boolean)
    .filter((x) => !x.b.status || x.b.status === "active")   // 이미 절판이면 = 이미 통합됨
    .sort((a, z) => a.yyyymm - z.yyyymm);

  const targetOf = new Map(); // 학년 → 기존 대상 교재 (있으면)
  ["1", "2", "3"].forEach((g) => {
    const t = (books || []).find((b) => (b.name || "").trim() === TARGET_NAME(g));
    if (t) targetOf.set(g, t);
  });

  if (sources.length === 0) {
    const done = ["1", "2", "3"].some((g) => targetOf.has(g));
    return jsonKo({
      ok: true,
      메시지: done
        ? "이미 통합됨 — 정규식에 맞는 active 원본이 없고 학년별 교재가 있습니다"
        : "할 것 없음 — 정규식에 맞는 모의고사 교재가 없습니다",
      유사명제외,
    });
  }

  const srcIds = sources.map((x) => x.b.id);
  const tgtIds = [...targetOf.values()].map((t) => t.id);
  const [uQ, sbQ2, rsQ2] = await Promise.all([
    fetchAll(() =>
      supabase
        .from("textbook_units")
        .select("id, textbook_id, parent_id, name, sort")
        .in("textbook_id", [...srcIds, ...tgtIds])
        .order("sort", { ascending: true })
        .order("id")
    ),
    fetchAll(() =>
      supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, status, assigned_on, ended_on, round, skip_acts")
        .in("textbook_id", [...srcIds, ...tgtIds])
        .order("student_id")
    ),
    fetchAll(() =>
      supabase
        .from("routine_steps")
        .select("id, textbook_id")
        .in("textbook_id", [...srcIds, ...tgtIds])
    ),
  ]);
  const units = uQ.data || [];
  const assigns = sbQ2.data || [];
  const steps = rsQ2.data || [];
  const unitsOf = new Map();   // textbook_id → units
  units.forEach((u) => {
    if (!unitsOf.has(u.textbook_id)) unitsOf.set(u.textbook_id, []);
    unitsOf.get(u.textbook_id).push(u);
  });
  const stepsOf = new Map();   // textbook_id → 루틴 줄 수
  steps.forEach((r) => stepsOf.set(r.textbook_id, (stepsOf.get(r.textbook_id) || 0) + 1));

  // 학생 이름 (미리보기 표기용)
  const stuIds = [...new Set(assigns.map((a) => a.student_id))];
  const { data: stus } = stuIds.length
    ? await supabase.from("students").select("id, name").in("id", stuIds)
    : { data: [] };
  const stuName = new Map((stus || []).map((s) => [s.id, s.name]));

  const 처리 = {
    만든교재: [],
    만든대단원: 0,
    옮긴단원: 0,
    이관배정: 0,
    접은배정: 0,
    옮긴루틴: 0,
    지운루틴: 0,
    절판처리: 0,
  };
  const 학년별 = [];

  for (const g of ["1", "2", "3"]) {
    const mySources = sources.filter((x) => x.g === g);
    if (mySources.length === 0) continue;
    let target = targetOf.get(g) || null;
    const 경고 = [];

    // ── 1) 대상 교재 find-or-create — 속성은 원본과 같게, 학년만 명시
    if (!target && apply) {
      const first = mySources[0].b;
      const { data: made, error } = await supabase
        .from("textbooks")
        .insert({
          name: TARGET_NAME(g),
          area: first.area || null,
          target_grade: `고${g}`,
          total_pages: first.total_pages || null,
          price: first.price || null,
          feature: first.feature || null,
          purchase_url: first.purchase_url || null,
        })
        .select("id, name")
        .single();
      if (error) return jsonKo({ error: `고${g} 대상 교재 만들기 실패: ${error.message}`, 처리 }, { status: 500 });
      target = made;
      처리.만든교재.push(made.name);
    }
    const tgtUnits = target ? unitsOf.get(target.id) || [] : [];
    const bigOf = new Map(); // 대단원 이름 → unit (대상 교재 최상위)
    tgtUnits.filter((u) => !u.parent_id).forEach((u) => bigOf.set(u.name.trim(), u));

    const 옮길원본 = [];
    const 새로만들대단원 = [];
    const 이관학생 = new Set();

    for (const src of mySources) {
      const srcUnits = unitsOf.get(src.b.id) || [];
      const srcAssigns = assigns.filter((a) => a.textbook_id === src.b.id && a.status !== "dropped");
      옮길원본.push({
        이름: src.b.name,
        단원수: srcUnits.length,
        배정학생수: srcAssigns.length,
        루틴단계수: stepsOf.get(src.b.id) || 0,
      });
      srcAssigns.forEach((a) => {
        이관학생.add(a.student_id);
        if (a.ended_on) 경고.push(`${stuName.get(a.student_id) || a.student_id}·${src.b.name} 배정에 종료일(${a.ended_on})이 있음 — 대상 배정은 활성으로 만든다`);
        if ((a.round || 1) > 1) 경고.push(`${stuName.get(a.student_id) || a.student_id}·${src.b.name} 배정이 ${a.round}회독 — 대상 배정은 1회독으로 시작한다`);
      });
      // 단원이 0인 원본은 대단원을 안 만든다 — 빈 대단원은 자식이 없어
      // 잎(진도 대상)으로 잡힌다 (currentUnits 의 잎 = 자식 없는 단원)
      if (srcUnits.length && !bigOf.has(src.b.name.trim())) 새로만들대단원.push(src.b.name);
      if (!srcUnits.length) 경고.push(`${src.b.name} — 단원이 0이라 대단원 없이 배정·상태만 정리`);

      if (apply && srcUnits.length) {
        // ── 2) 대단원 find-or-create + 단원 id 보존 이동
        let big = bigOf.get(src.b.name.trim()) || null;
        if (!big) {
          const { data: madeBig, error } = await supabase
            .from("textbook_units")
            .insert({ textbook_id: target.id, parent_id: null, name: src.b.name, sort: src.yyyymm })
            .select("id, textbook_id, parent_id, name, sort")
            .single();
          if (error) return jsonKo({ error: `대단원 만들기 실패(${src.b.name}): ${error.message}`, 처리 }, { status: 500 });
          big = madeBig;
          bigOf.set(src.b.name.trim(), big);
          처리.만든대단원 += 1;
        }
        if (srcUnits.length) {
          // 최상위만 새 대단원 밑으로, 안에 이미 계층이 있으면 그대로 유지.
          // sort 는 연월 오프셋을 일괄로 더한다 (상대 순서 보존 — 함수 머리 주석)
          const moved = srcUnits.map((u) => ({
            id: u.id,
            name: u.name,                       // not null 칸이라 같이 싣는다 (값 그대로)
            textbook_id: target.id,
            parent_id: u.parent_id || big.id,
            sort: (u.sort || 0) + src.yyyymm * 100,
          }));
          const { data: mv, error } = await supabase
            .from("textbook_units")
            .upsert(moved, { onConflict: "id" })
            .select("id");
          if (error) return jsonKo({ error: `단원 이동 실패(${src.b.name}): ${error.message}`, 처리 }, { status: 500 });
          처리.옮긴단원 += (mv || []).length;
        }
      }
    }

    // ── 3) 배정 이관 — 대상 배정 find-or-create, 원본 배정은 dropped 로 접는다
    const tgtAssigned = new Set(
      assigns.filter((a) => target && a.textbook_id === target.id).map((a) => a.student_id)
    );
    const 배정이관 = [...이관학생]
      .filter((sid) => !tgtAssigned.has(sid))
      .map((sid) => stuName.get(sid) || sid)
      .sort((a, b) => String(a).localeCompare(String(b), "ko"));
    if (apply && 이관학생.size) {
      const srcIdSet = new Set(mySources.map((x) => x.b.id));
      const rows = [...이관학생].map((sid) => {
        const mine = assigns.filter(
          (a) => a.student_id === sid && srcIdSet.has(a.textbook_id) && a.status !== "dropped"
        );
        const dates = mine.map((a) => a.assigned_on).filter(Boolean).sort();
        const acts = [...new Set(
          mine.flatMap((a) => (a.skip_acts || "").split(",").map((x) => x.trim()).filter(Boolean))
        )];
        return {
          student_id: sid,
          textbook_id: target.id,
          status: "active",
          assigned_on: dates[0] || todaySeoul(),
          skip_acts: acts.length ? acts.join(",") : null,
          // routine_step_id 는 일부러 비운다 — 번호(routine_step 기본 0) 폴백이 잇는다
        };
      });
      // 이미 있는 배정은 그대로 둔다 (find-or-create — 원장님이 손댄 줄을 안 덮는다)
      const { data: ins, error } = await supabase
        .from("student_textbooks")
        .upsert(rows, { onConflict: "student_id,textbook_id", ignoreDuplicates: true })
        .select("student_id");
      if (error) return jsonKo({ error: `고${g} 배정 이관 실패: ${error.message}`, 처리 }, { status: 500 });
      처리.이관배정 += (ins || []).length;

      const { data: folded, error: fErr } = await supabase
        .from("student_textbooks")
        .update({ status: "dropped" })                      // 절판 교재와 함께 안 보이는 값
        .in("textbook_id", [...srcIdSet])
        .neq("status", "dropped")
        .select("student_id");
      if (fErr) return jsonKo({ error: `고${g} 원본 배정 접기 실패: ${fErr.message}`, 처리 }, { status: 500 });
      처리.접은배정 += (folded || []).length;
    }

    // ── 4) 루틴 — 원본 중 한 권 것을 대상으로 이동, 나머지는 삭제.
    //     루틴 삭제는 대전제 2(docs/업무루틴-규칙.md — 원장님이 손으로 적은
    //     것은 자동이 절대 덮지 않는다)와 안 어긋난다: 이 통합 자체가
    //     원장님의 명시 지시(2026-08-22 「교재 통합시켜줘」)이고, 같은 루틴이
    //     회차마다 복제된 것을 대상 한 벌로 합치는 일이기 때문이다.
    const donor = mySources.find((x) => (stepsOf.get(x.b.id) || 0) > 0) || null;
    const targetHasSteps = target ? (stepsOf.get(target.id) || 0) > 0 : false;
    if (donor && targetHasSteps)
      경고.push(`대상에 루틴이 이미 있어 원본 루틴 이동은 건너뜀 (원본 루틴 줄은 삭제)`);
    if (apply) {
      if (donor && !targetHasSteps) {
        const { data: mvR, error } = await supabase
          .from("routine_steps")
          .update({ textbook_id: target.id })
          .eq("textbook_id", donor.b.id)
          .select("id");
        if (error) return jsonKo({ error: `고${g} 루틴 이동 실패: ${error.message}`, 처리 }, { status: 500 });
        처리.옮긴루틴 += (mvR || []).length;
      }
      const rest = mySources.filter((x) => !(donor && !targetHasSteps && x.b.id === donor.b.id)).map((x) => x.b.id);
      if (rest.length) {
        const { data: del, error } = await supabase
          .from("routine_steps")
          .delete()
          .in("textbook_id", rest)
          .select("id");
        if (error) return jsonKo({ error: `고${g} 원본 루틴 삭제 실패: ${error.message}`, 처리 }, { status: 500 });
        처리.지운루틴 += (del || []).length;
      }

      // ── 5) 원본 교재 절판 — 기록 보존 (삭제 금지)
      const { data: dead, error } = await supabase
        .from("textbooks")
        .update({ status: "discontinued" })
        .in("id", mySources.map((x) => x.b.id))
        .select("id");
      if (error) return jsonKo({ error: `고${g} 원본 절판 처리 실패: ${error.message}`, 처리 }, { status: 500 });
      처리.절판처리 += (dead || []).length;
    }

    학년별.push({
      대상: `${TARGET_NAME(g)} (${targetOf.get(g) ? "이미 있음" : apply ? "새로 만듦" : "새로 만들 것"})`,
      옮길원본,
      새로만들대단원,
      배정이관,
      경고,
    });
  }

  // ── 진도·검사 기록이 정말 따라오는지 — unit id 기준인 소비처를 세어 명시
  //     (id 보존 이동이라 이 줄들은 한 글자도 안 바뀐다. 세기만 한다.)
  const srcUnitIds = sources.flatMap((x) => (unitsOf.get(x.b.id) || []).map((u) => u.id));
  let 진도줄 = 0;
  let 리포트항목줄 = 0;
  for (let i = 0; i < srcUnitIds.length; i += 100) {
    const chunk = srcUnitIds.slice(i, i + 100);
    const [p, d] = await Promise.all([
      supabase
        .from("student_unit_progress")
        .select("student_id", { count: "exact", head: true })
        .in("textbook_unit_id", chunk),
      supabase
        .from("daily_report_items")
        .select("id", { count: "exact", head: true })
        .overlaps("textbook_unit_ids", chunk),
    ]);
    진도줄 += p.count || 0;
    리포트항목줄 += d.count || 0;
  }

  return jsonKo({
    ok: true,
    모드: apply ? "실행 완료" : "미리보기 — 아무것도 안 바꿈 (&apply=1 로 실행)",
    ...(apply ? { 처리 } : {}),
    학년별,
    따라오는기록: {
      설명: "단원 id 를 보존한 채 옮기므로 아래 줄들은 자동으로 따라온다 (수정 0)",
      진도줄_student_unit_progress: 진도줄,
      검사줄_daily_report_items: 리포트항목줄,
      내신범위_prep_scopes: "unit_ids 가 unit id 배열 — 동일하게 자동",
    },
    유사명제외,
    참고: "내신 대비의 「모의고사 교재 만들기」(makeMockBook)는 회차 이름으로 찾으므로, 절판된 원본을 이름으로 다시 찾을 수 있다 — 새 회차부터는 새로 만들어지니 통합 후 같은 방식으로 다시 합치면 된다",
  });
}

/**
 * **진도가 어느 회독에 적혔나** (원장님 2026-08-23 — 「진도체크 다 한 게
 * 날아간 것 같은데」). 아무것도 쓰지 않는다 — 읽고 셈만 한다.
 *
 * 진도는 **회독별로** 쌓인다(학생·단원·회독이 한 줄). 그래서 「사라졌다」의
 * 대부분은 지워진 게 아니라 **다른 회독에 적혀 안 보이는 것**이다.
 * 최근 며칠에 찍은 줄을 학생·교재·회독으로 모아, 지금 회독과 다른 곳에
 * 적힌 것이 있으면 그것부터 보여준다.
 */
async function progressPeek(supabase, daysStr) {
  const today = todaySeoul();
  const days = Math.max(1, Math.min(30, parseInt(daysStr, 10) || 3));
  const since = addDays(today, -(days - 1));

  const [stQ, bkQ, sbQ, unitQ] = await Promise.all([
    supabase.from("students").select("id, name").eq("status", "enrolled"),
    supabase.from("textbooks").select("id, name"),
    fetchAll(() => supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, round")
      .order("student_id").order("textbook_id")),
    fetchAll(() => supabase
      .from("textbook_units")
      .select("id, textbook_id, name")
      .order("id")),
  ]);
  const nameOf = new Map((stQ.data || []).map((r) => [r.id, r.name]));
  const bookOf = new Map((bkQ.data || []).map((r) => [r.id, r.name]));
  const unitBook = new Map((unitQ.data || []).map((u) => [u.id, u.textbook_id]));
  const unitName = new Map((unitQ.data || []).map((u) => [u.id, u.name]));
  const curRound = new Map();
  for (const r of sbQ.data || []) curRound.set(`${r.student_id}|${r.textbook_id}`, r.round || 1);

  // 최근에 만진 진도 줄 (marked_on 이 없는 옛 줄은 done_on 으로 본다)
  let prog = await fetchAll(() => supabase
    .from("student_unit_progress")
    .select("student_id, textbook_unit_id, round, status, done_on, marked_on")
    .gte("marked_on", since)
    .order("student_id").order("textbook_unit_id"));
  if (prog.error) {
    prog = await fetchAll(() => supabase
      .from("student_unit_progress")
      .select("student_id, textbook_unit_id, round, status, done_on")
      .gte("done_on", since)
      .order("student_id").order("textbook_unit_id"));
  }
  if (prog.error) return jsonKo({ error: prog.error.message }, { status: 500 });

  const bins = new Map();   // 학생|교재|회독 -> { …, 단원: [] }
  for (const r of prog.data || []) {
    const tid = unitBook.get(r.textbook_unit_id);
    if (!tid) continue;
    const round = r.round == null ? 1 : r.round;
    const key = `${r.student_id}|${tid}|${round}`;
    if (!bins.has(key)) {
      bins.set(key, {
        학생: nameOf.get(r.student_id) || "(퇴원생)",
        교재: bookOf.get(tid) || "(없는 교재)",
        적힌회독: round,
        지금회독: curRound.get(`${r.student_id}|${tid}`) ?? "(배정 없음)",
        완료: 0, 하는중: 0, 마지막날: "", 단원: [],
      });
    }
    const b = bins.get(key);
    if (r.status === "done") b.완료 += 1;
    else if (r.status === "doing") b.하는중 += 1;
    const d = r.marked_on || r.done_on || "";
    if (d > b.마지막날) b.마지막날 = d;
    if (b.단원.length < 6) b.단원.push(unitName.get(r.textbook_unit_id) || r.textbook_unit_id);
  }

  const all = [...bins.values()].sort((a, b) => (b.마지막날 || "").localeCompare(a.마지막날 || ""));
  const 안보이는것 = all.filter((b) => b.적힌회독 !== b.지금회독);

  return jsonKo({
    설명: "쓰지 않고 읽기만 했습니다. 「안보이는것」은 지금 회독과 다른 회독에 적혀 화면에 안 나오는 진도입니다 — 지워진 게 아닙니다.",
    기간: `${since} ~ ${today}`,
    찍은줄: (prog.data || []).length,
    묶음: all.length,
    안보이는묶음: 안보이는것.length,
    안보이는것,
    전부: all,
  });
}

/**
 * **워크북이 어떤 모양으로 들어가 있나** (원장님 2026-08-23 — 「문법 교재의
 * 워크북이 단원별로 되어 있어야 하는데 지금 3가지로 되어 있어」).
 * 아무것도 쓰지 않는다 — 읽고 모양만 가른다.
 *
 * 원장님이 원하는 것은 ③ — **본교재 대단원 뒤에 그 대단원의 워크북**.
 *   ① 본교재 전체가 끝나고 워크북 전체가 뒤에 몰림
 *   ② 소단원마다 워크북이 붙어 대단원 안에서 반복
 *   ③ 대단원마다 그 대단원 워크북 (원하는 것)
 */
async function workbookTree(supabase, bookQ) {
  const isWb = (s) => /워크\s*북|work\s*book|WB(?![a-z])/i.test(s || "");

  let bq = supabase.from("textbooks").select("id, name, area, status").neq("status", "dropped");
  if (bookQ) bq = bq.ilike("name", `%${bookQ}%`);
  const { data: books, error: be } = await bq;
  if (be) return jsonKo({ error: be.message }, { status: 500 });
  const ids = (books || []).map((b) => b.id);
  if (ids.length === 0) return jsonKo({ 교재: [] });

  const uq = await fetchAll(() => supabase
    .from("textbook_units")
    .select("id, textbook_id, parent_id, label, name, sort")
    .in("textbook_id", ids)
    .order("textbook_id").order("sort").order("id"));
  if (uq.error) return jsonKo({ error: uq.error.message }, { status: 500 });

  const byBook = new Map();
  for (const u of uq.data || []) {
    if (!byBook.has(u.textbook_id)) byBook.set(u.textbook_id, []);
    byBook.get(u.textbook_id).push(u);
  }

  const out = [];
  for (const b of books || []) {
    const us = byBook.get(b.id) || [];
    const wb = us.filter((u) => isWb(u.name) || isWb(u.label));
    if (wb.length === 0) continue;

    const byId = new Map(us.map((u) => [u.id, u]));
    const kids = new Map();
    for (const u of us) {
      const k = u.parent_id || "root";
      if (!kids.has(k)) kids.set(k, []);
      kids.get(k).push(u);
    }
    const tops = kids.get("root") || [];

    // 각 줄의 깊이와 맨 위 조상
    const depthOf = new Map(), topOf = new Map();
    for (const u of us) {
      let d = 0, cur = u;
      while (cur.parent_id && byId.has(cur.parent_id) && d < 10) { cur = byId.get(cur.parent_id); d += 1; }
      depthOf.set(u.id, d);
      topOf.set(u.id, cur.id);
    }

    // 워크북이 어느 대단원 밑에 몇 장씩 있나
    const perTop = new Map();
    for (const w of wb) perTop.set(topOf.get(w.id), (perTop.get(topOf.get(w.id)) || 0) + 1);
    const 워크북있는대단원 = perTop.size;
    const 평균장수 = 워크북있는대단원 ? +(wb.length / 워크북있는대단원).toFixed(1) : 0;
    const 평균깊이 = +(wb.reduce((a, w) => a + depthOf.get(w.id), 0) / wb.length).toFixed(1);

    // 워크북만 담긴 대단원(= 뒤에 몰아둔 것)
    const 워크북전용대단원 = tops.filter((t) => {
      const under = us.filter((u) => topOf.get(u.id) === t.id);
      const w = under.filter((u) => isWb(u.name) || isWb(u.label));
      return w.length > 0 && w.length >= under.length - 1;
    });

    /**
     * 가르는 자는 **깊이**다 (2026-08-23 정정 — 원장님 예시
     * 「ch1. 워크북 unit1 / unit2 / unit3」 처럼 대단원 밑에 워크북이
     * 여럿 오는 것이 원하는 모양이다. 장수로 가르면 이걸 ②로 잘못 읽는다).
     *   깊이 2 = 소단원 밑에 매달림(②)   깊이 1 = 대단원 바로 밑(원하는 모양)
     *   워크북만 담긴 대단원이 따로 있으면 뒤에 몰아둔 것(①)
     */
    let 모양;
    if (워크북전용대단원.length > 0 && 워크북전용대단원.length >= 워크북있는대단원 - 1) {
      모양 = "① 뒤에 몰림";
    } else if (평균깊이 >= 1.5) {
      모양 = "② 소단원마다 반복";
    } else {
      모양 = "③ 대단원 밑에 (원하는 모양)";
    }

    // 본보기 — 워크북 한 장의 자리 (대단원 › 소단원 › 워크북)
    const w0 = wb[0];
    const path = [];
    let cur = w0;
    while (cur) { path.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : null; }

    out.push({
      교재: b.name, 영역: b.area, 모양,
      대단원수: tops.length, 전체단원수: us.length, 워크북장수: wb.length,
      워크북있는대단원, 대단원당평균: 평균장수, 워크북깊이: 평균깊이,
      본보기자리: path.join(" › "),
    });
  }

  const 묶음 = { "①뒤에몰림": [], "②소단원마다": [], "③대단원밑에(원하는것)": [] };
  for (const r of out) {
    if (r.모양.startsWith("①")) 묶음["①뒤에몰림"].push(r.교재);
    else if (r.모양.startsWith("②")) 묶음["②소단원마다"].push(r.교재);
    else 묶음["③대단원밑에(원하는것)"].push(r.교재);
  }
  return jsonKo({
    설명: "쓰지 않고 읽기만 했습니다. 워크북이 있는 교재만 추립니다. 깊이 0=대단원, 1=소단원, 2=그 아래.",
    한눈에: 묶음,
    교재: out.sort((x, y) => x.모양.localeCompare(y.모양)),
  });
}

/**
 * **워크북을 대단원 밑으로 올린다** (원장님 2026-08-23 — 「B로 ㄱㄱ」).
 * 자리만 옮기고 **장수는 그대로 둔다** — 합치지 않으므로 학생 진도 기록이
 * 한 줄도 안 없어진다 (진도는 단원 id 에 붙어 있고, id 는 안 바뀐다).
 *
 * 지금(②): 대단원 › 소단원 › 워크북   →  바꾼 뒤(③): 대단원 › …소단원들… › 워크북들
 * 이름은 어느 소단원 것인지 알 수 있게 「Unit 49 워크북」 꼴로 붙인다 —
 * 안 그러면 대단원 밑에 「워크북」이 넷씩 나란히 서서 구별이 안 된다.
 *
 * apply=1 이 없으면 **아무것도 안 바꾸고** 무엇을 할지만 보여준다.
 */
async function workbookMove(supabase, bookQ, apply) {
  const isWb = (s) => /워크\s*북|work\s*book|WB(?![a-z])/i.test(s || "");

  let bq = supabase.from("textbooks").select("id, name").neq("status", "dropped");
  if (bookQ) bq = bq.ilike("name", `%${bookQ}%`);
  const { data: books, error: be } = await bq;
  if (be) return jsonKo({ error: be.message }, { status: 500 });
  const ids = (books || []).map((b) => b.id);
  if (ids.length === 0) return jsonKo({ 교재: [] });

  const uq = await fetchAll(() => supabase
    .from("textbook_units")
    .select("id, textbook_id, parent_id, label, name, sort")
    .in("textbook_id", ids)
    .order("textbook_id").order("sort").order("id"));
  if (uq.error) return jsonKo({ error: uq.error.message }, { status: 500 });

  const 계획 = [];
  const 건너뜀 = [];
  for (const b of books || []) {
    const us = (uq.data || []).filter((u) => u.textbook_id === b.id);
    if (us.length === 0) continue;
    const byId = new Map(us.map((u) => [u.id, u]));
    const kids = new Map();
    for (const u of us) {
      const k = u.parent_id || "root";
      if (!kids.has(k)) kids.set(k, []);
      kids.get(k).push(u);
    }

    // 소단원(깊이1) 밑에 달린 워크북(깊이2)만 대상
    const moves = [];
    for (const u of us) {
      if (!isWb(u.name) && !isWb(u.label)) continue;
      const 부모 = u.parent_id ? byId.get(u.parent_id) : null;
      if (!부모 || !부모.parent_id) continue;           // 이미 대단원 밑이면 그대로
      const 할아버지 = byId.get(부모.parent_id);
      if (!할아버지 || 할아버지.parent_id) continue;    // 4단 이상은 손대지 않는다
      moves.push({ 줄: u, 소단원: 부모, 대단원: 할아버지 });
    }
    if (moves.length === 0) { 건너뜀.push(b.name); continue; }

    // 대단원마다: 남는 소단원들 뒤에 워크북을 원래 차례대로 붙인다
    const 대단원별 = new Map();
    for (const m of moves) {
      if (!대단원별.has(m.대단원.id)) 대단원별.set(m.대단원.id, []);
      대단원별.get(m.대단원.id).push(m);
    }
    const 줄들 = [];
    for (const [topId, list] of 대단원별) {
      const 남는소단원 = (kids.get(topId) || []).filter((c) => !isWb(c.name) && !isWb(c.label));
      let sort = Math.max(0, ...남는소단원.map((c) => c.sort || 0)) + 10;
      list.sort((x, y) => (x.소단원.sort || 0) - (y.소단원.sort || 0) || (x.줄.sort || 0) - (y.줄.sort || 0));
      for (const m of list) {
        // 「워크북 Unit 1」 꼴로 **앞에** 붙인다 (원장님 2026-08-23 예시) —
        // 앞에 붙어야 대단원 밑에서 워크북끼리 나란히 모여 보인다
        const 새이름 = `워크북 ${m.소단원.name}`;
        줄들.push({
          id: m.줄.id,
          지금: `${m.대단원.name} › ${m.소단원.name} › ${m.줄.name}`,
          바뀐뒤: `${m.대단원.name} › ${새이름}`,
          새부모: topId, 새이름, 새차례: sort,
        });
        sort += 10;
      }
    }

    계획.push({
      교재: b.name, 옮길장수: 줄들.length, 대단원수: 대단원별.size,
      본보기: 줄들.slice(0, 4).map((r) => `${r.지금}  →  ${r.바뀐뒤}`),
      줄들: apply ? 줄들 : undefined,
    });

    if (apply) {
      for (const r of 줄들) {
        const { error } = await supabase
          .from("textbook_units")
          .update({ parent_id: r.새부모, name: r.새이름, sort: r.새차례 })
          .eq("id", r.id);
        if (error) return jsonKo({ error: `${b.name} — ${error.message}` }, { status: 500 });
      }
    }
  }

  return jsonKo({
    모드: apply ? "실행함 — 자리를 옮겼습니다" : "미리보기 — 아무것도 안 바꿈 (&apply=1 로 실행)",
    방식: "자리만 옮기고 장수는 그대로 (합치지 않음) — 학생 진도 기록은 한 줄도 안 없어집니다",
    옮길교재수: 계획.length,
    옮길총장수: 계획.reduce((a, c) => a + c.옮길장수, 0),
    교재: 계획.map(({ 줄들, ...r }) => r),
    손대지않음: 건너뜀,
  });
}

/**
 * **교재 한 권을 눈으로 보는 차림표** (원장님 2026-08-23 — 「이렇게만 떠서
 * 뭔지 모르겠음」). 숫자 요약 말고 단원을 차례대로 들여쓴 줄로 보여준다.
 * 아무것도 쓰지 않는다.
 */
async function bookOutline(supabase, bookQ, topStr) {
  if (!bookQ) return jsonKo({ error: "교재 이름 조각을 &book= 으로 주세요" }, { status: 400 });
  const topN = Math.max(1, Math.min(20, parseInt(topStr, 10) || 2));
  const { data: books, error: be } = await supabase
    .from("textbooks").select("id, name").ilike("name", `%${bookQ}%`).neq("status", "dropped");
  if (be) return jsonKo({ error: be.message }, { status: 500 });
  if (!books || books.length === 0) return jsonKo({ error: "그 이름의 교재가 없어요" }, { status: 404 });

  const out = [];
  for (const b of books) {
    const uq = await fetchAll(() => supabase
      .from("textbook_units")
      .select("id, parent_id, label, name, sort, page_start, page_end")
      .eq("textbook_id", b.id)
      .order("sort").order("id"));
    if (uq.error) return jsonKo({ error: uq.error.message }, { status: 500 });
    const us = uq.data || [];
    const kids = new Map();
    for (const u of us) {
      const k = u.parent_id || "root";
      if (!kids.has(k)) kids.set(k, []);
      kids.get(k).push(u);
    }
    const 줄 = [];
    const walk = (id, depth) => {
      for (const c of (kids.get(id) || []).sort((x, y) => (x.sort || 0) - (y.sort || 0))) {
        const 쪽 = c.page_start ? ` (p${c.page_start}${c.page_end && c.page_end !== c.page_start ? `~${c.page_end}` : ""})` : "";
        줄.push(`${"　".repeat(depth)}${depth ? "└ " : "■ "}${c.name}${쪽}`);
        walk(c.id, depth + 1);
      }
    };
    const tops = (kids.get("root") || []).sort((x, y) => (x.sort || 0) - (y.sort || 0));
    for (const t of tops.slice(0, topN)) {
      줄.push(`■ ${t.name}`);
      walk(t.id, 1);
    }
    out.push({
      교재: b.name,
      대단원수: tops.length,
      전체단원수: us.length,
      보여준대단원: Math.min(topN, tops.length),
      차림표: 줄,
      다음대단원들: tops.slice(topN).map((t) => t.name),
    });
  }
  return jsonKo({ 설명: "읽기만 했습니다. &top=숫자 로 몇 개 대단원을 펼칠지 정합니다.", 교재: out });
}

/**
 * **이 학생에게 지금 무엇이 차려지나** (원장님 2026-08-23 — 「배정받지 않은
 * 교재의 루틴 숙제까지 들어가 있어」). 배정 목록과 차려질 것을 나란히 놓아
 * 어디서 새는지 본다. 아무것도 쓰지 않는다.
 */
async function whoRoutine(supabase, nameQ) {
  if (!nameQ) return jsonKo({ error: "학생 이름을 &student= 로 주세요" }, { status: 400 });
  const { data: sts } = await supabase
    .from("students").select("id, name, status").ilike("name", `%${nameQ}%`);
  const st = (sts || [])[0];
  if (!st) return jsonKo({ error: "그 이름의 학생이 없어요" }, { status: 404 });

  const today = todaySeoul();
  const [{ data: mine }, { data: books }] = await Promise.all([
    supabase.from("student_textbooks")
      .select("textbook_id, status, assigned_on, ended_on, pause, round, routine_step")
      .eq("student_id", st.id),
    supabase.from("textbooks").select("id, name, area"),
  ]);
  const nameOfBook = new Map((books || []).map((b) => [b.id, b.name]));
  const 배정 = (mine || []).map((r) => ({
    교재: nameOfBook.get(r.textbook_id) || "(없는 교재)",
    상태: r.status || "active",
    시작: r.assigned_on || "(없음)",
    끝: r.ended_on || "",
    멈춤: r.pause || "",
    회독: r.round || 1,
    지금쓰나: inUseOn(r, today) && r.pause !== "all",
  })).sort((a, b) => Number(b.지금쓰나) - Number(a.지금쓰나));

  const r = await nextRoutine(st.id, { peek: false });
  const 차림 = {
    등원: (r.inclass || []).length,
    숙제: (r.home || []).length,
    단계: (r.steps || []).map((s) => `${s.book} ${s.no}/${s.total}${s.unit ? ` · ${s.unit}` : ""}`),
  };
  const 쓰는교재 = new Set(배정.filter((b) => b.지금쓰나).map((b) => b.교재));
  const 샌것 = (r.steps || [])
    .map((s) => s.book)
    .filter((b) => b && !쓰는교재.has(b));

  /**
   * **검사 목록에 무엇이 들어 있나** (원장님 2026-08-23 — 「배정 안 된
   * 교재의 루틴이 숙제 검사에 들어간다」). 검사 목록은 **지난 배정**에서
   * 온다 — 그때는 배정돼 있었는데 지금은 끝냈거나 뺀 교재일 수 있다.
   * 항목마다 어느 교재에서 나온 것인지, 그 교재가 지금 쓰는 것인지 적는다.
   */
  const 검사목록 = [];
  {
    // 그 학생의 가장 최근 「배정」 리포트
    const { data: reps } = await supabase
      .from("daily_reports").select("id, date").eq("student_id", st.id)
      .order("date", { ascending: false }).limit(20);
    const ids = (reps || []).map((x) => x.id);
    let items = [];
    if (ids.length) {
      const q = await supabase
        .from("daily_report_items")
        .select("daily_report_id, homework_item_id, status, textbook_unit_ids")
        .in("daily_report_id", ids)
        .eq("status", "assigned");
      items = q.error ? [] : q.data || [];
    }
    const firstRep = (reps || []).find((x) => items.some((i) => i.daily_report_id === x.id));
    const mineItems = items.filter((i) => i.daily_report_id === firstRep?.id);
    const { data: hw } = await supabase
      .from("homework_items").select("id, name, textbook_id, category");
    const hwById = new Map((hw || []).map((h) => [h.id, h]));
    const usedBookId = new Map((mine || []).map((x) => [x.textbook_id, x]));
    for (const it of mineItems) {
      const h = hwById.get(it.homework_item_id);
      const bid = h?.textbook_id || null;
      const st2 = bid ? usedBookId.get(bid) : null;
      검사목록.push({
        항목: h?.name || "(없는 항목)",
        교재: bid ? nameOfBook.get(bid) || "(없는 교재)" : "(교재 없음)",
        그교재지금쓰나: bid ? !!(st2 && inUseOn(st2, today) && st2.pause !== "all") : null,
        배정일: firstRep?.date || "",
      });
    }
  }
  const 검사에샌것 = 검사목록.filter((x) => x.그교재지금쓰나 === false);

  return jsonKo({
    설명: "읽기만 했습니다. 「샌것」 이 있으면 배정 안 된 교재가 차림에 들어간 것입니다.",
    학생: st.name,
    오늘: today,
    배정,
    차림,
    샌것: [...new Set(샌것)],
    검사목록,
    "검사에 샌 것 (지금 안 쓰는 교재인데 검사에 있음)": 검사에샌것,
  });
}

/**
 * **지워진 학습 항목의 이름표가 어디 남아 있나** (원장님 2026-08-24).
 * 찾는 길·지우는 길은 lib/itemRefs.js 한 벌뿐이다 — 항목을 지울 때도 같은 길을 쓴다.
 *   ?op=deaditems         찾기만 (아무것도 안 바꾼다)
 *   ?op=deaditems&apply=1 지우기
 */
async function deadItems(supabase, apply) {
  const r = await stripItemRefs(supabase, { apply });
  return jsonKo({
    설명: apply ? "죽은 이름표를 지웠습니다." : "읽기만 했습니다. 지우려면 주소 끝에 &apply=1 을 붙이세요.",
    ...r,
    "브라우저 임시본": "이 점검이 못 보는 곳입니다 — 폰에 남은 초안은 판 위쪽 「버리기」 로 지웁니다",
  });
}
