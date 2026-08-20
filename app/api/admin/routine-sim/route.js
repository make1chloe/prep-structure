import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/guard";
import { fetchAll } from "@/lib/fetchAll";
import { inUseOn } from "@/lib/bookUse";
import { todaySeoul } from "@/lib/day";
import DRAFTS from "./drafts.json";

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
export async function GET(request) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return NextResponse.json({ error: guard.error }, { status: 403 });
  const op = new URL(request.url).searchParams.get("op");
  if (op === "rebuild") return rebuildRoutines(supabase);
  if (op === "flow") return flowSim(supabase);
  if (op === "retest") return retestList(supabase);

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
  return NextResponse.json({
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
 * **루틴 갈아엎고 굵은 판으로 다시 심기** (원장님, 2026-08-20 — 잘게 쪼갠
 * 1차 업로드를 굵은 판(ㅇㅇ 확정)으로 교체).
 *
 * ① routine_steps 전부 삭제 (교재별·영역별 모두 — 학생의 현재 단계
 *    기억(routine_step_id)은 다음 「루틴 다음」 때 처음 단계로 폴백된다)
 * ② drafts.json 의 굵은 루틴을 다시 심는다 — 없는 학습항목은 만들고,
 *    [대괄호]는 항목별 주의사항(item_notes)으로
 * ③ 1차 때 생긴 잘게 쪼갠 항목들: 기록에 쓰인 적 없으면 삭제,
 *    쓰였으면 숨김(active=false) — 기록은 절대 안 지운다
 */
async function rebuildRoutines(supabase) {
  const out = { deletedSteps: 0, insertedSteps: 0, createdItems: [], removedItems: [], hiddenItems: [] };

  // ① 루틴 전부 비우기
  {
    const { data: gone } = await supabase.from("routine_steps").delete().not("id", "is", null).select("id");
    out.deletedSteps = (gone || []).length;
  }

  // ② 굵은 판 심기
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

  // 필요한 항목 전부 모아 한 번에 만든다
  const need = new Set();
  const eachStep = (fn) => {
    for (const [name, val] of Object.entries(DRAFTS.books)) {
      const steps = typeof val === "string" ? DRAFTS.books[val] : val;
      fn({ bookName: name }, steps);
    }
    for (const [area, steps] of Object.entries(DRAFTS.areas)) fn({ area }, steps);
  };
  eachStep((_t, steps) =>
    steps.forEach((st) =>
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
    if (error) return NextResponse.json({ ...out, error: `항목 만들기 실패: ${error.message}` }, { status: 500 });
    (made || []).forEach((i2) => { itemByName.set(i2.name.trim(), i2.id); out.createdItems.push(i2.name); });
  }

  const rows = [];
  const missBooks = [];
  eachStep((target, steps) => {
    const bid = target.bookName ? bookByName.get(target.bookName.trim()) : null;
    if (target.bookName && !bid) { missBooks.push(target.bookName); return; }
    steps.forEach((st, i) => {
      const item_notes = {};
      const ids = (arr) =>
        (arr || []).map((x) => {
          const { name, note } = parse(x);
          const id = itemByName.get(name);
          if (id && note) item_notes[id] = note;
          return id;
        }).filter(Boolean);
      rows.push({
        textbook_id: bid,
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
  {
    const { data: ins, error } = await supabase.from("routine_steps").insert(rows).select("id");
    if (error) return NextResponse.json({ ...out, error: `루틴 심기 실패: ${error.message}` }, { status: 500 });
    out.insertedSteps = (ins || []).length;
  }

  // ③ 1차의 잘게 쪼갠 항목 정리 (굵은 판에서 안 쓰는 것만)
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

  return NextResponse.json({ ok: true, ...out, missBooks });
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
      if (dupCheck.size !== list.length) findings.씨앗중복.push(`${s.name} ${sess}회`);
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
  return NextResponse.json({
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
  if (!failed.length) return NextResponse.json({ ok: true, today, students: [] });

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
  return NextResponse.json({ ok: true, today, students });
}
