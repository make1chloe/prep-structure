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
