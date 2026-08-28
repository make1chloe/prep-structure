import { addIds, pruneAdd } from "@/lib/routineAdd";

/**
 * **학습 항목의 이름표가 남는 곳** (원장님 2026-08-24 — 저장이
 * `daily_report_items_homework_item_id_fkey` 로 거절당했다).
 *
 * 항목을 지워도 그 이름표를 들고 있는 데가 **다섯**이다. 전부 **연결 고리가
 * 없는** 칸(jsonb·uuid[])이라 항목이 사라져도 조용히 남는다:
 *
 *   교재 활동→항목 지도    textbooks.act_items      (0138, {활동: 항목} 지도)
 *   진도루틴 단계          routine_steps            (0035 등원·숙제, 0139 항목 메모)
 *   학생 기본 목록         students.default_*       (0035)
 *   항목의 집짝            homework_items.home_item_id
 *   학생별 더한 항목       student_textbooks.routine_add (0182)
 *
 * 하나만 남아도 그 학생 판이 열릴 때마다 다시 담기고, 저장이 통째로 막힌다.
 * 그래서 **찾는 곳도 지우는 곳도 여기 한 벌**이다 (원칙 1) — 항목을 지울 때와
 * 관리자 점검(`?op=deaditems`)이 같은 길을 쓴다.
 *
 * @param dead  지울 이름표. null 이면 **살아 있지 않은 것 전부** (죽은 것 찾기)
 * @param apply true 면 지운다. false 면 찾기만 한다
 */
export async function stripItemRefs(supabase, { dead = null, apply = false } = {}) {
  const [hiQ, tbQ, rsQ, stQ, addQ0] = await Promise.all([
    supabase.from("homework_items").select("id, name"),
    supabase.from("textbooks").select("id, name, act_items"),
    supabase.from("routine_steps").select("id, textbook_id, label, inclass_items, home_items, item_notes"),
    supabase.from("students").select("id, name, default_inclass, default_home").eq("status", "enrolled"),
    // 0182 — 학생별로 더한 항목. 칸이 없는 DB 면 조용히 건너뛴다
    supabase.from("student_textbooks").select("student_id, textbook_id, routine_add"),
  ]);
  const addRows = addQ0?.error ? [] : addQ0?.data || [];
  const alive = new Set((hiQ.data || []).map((x) => x.id));
  // 지울 대상을 정한다 — 딱 집어줬으면 그것만, 아니면 살아 있지 않은 전부
  const kill = dead ? new Set(dead) : null;
  const isDead = (id) => (kill ? kill.has(id) : !alive.has(id));
  const keepable = (id) => id && !isDead(id);

  const 상세 = [];
  const 고칠것 = [];
  const deadIn = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && isDead(x));

  // ① 교재 활동 → 항목. **배열이 아니라 {활동: 항목} 지도**다
  const bookName = new Map((tbQ.data || []).map((b) => [b.id, b.name]));
  for (const b of tbQ.data || []) {
    const map =
      b.act_items && typeof b.act_items === "object" && !Array.isArray(b.act_items) ? b.act_items : {};
    const keep = {};
    const gone = [];
    for (const [act, v] of Object.entries(map)) {
      if (Array.isArray(v)) {
        const live = v.filter(keepable);
        v.filter((x) => x && isDead(x)).forEach((x) => gone.push(`${act}:${x}`));
        if (live.length) keep[act] = live;
      } else if (v && isDead(v)) {
        gone.push(`${act}:${v}`);
      } else if (v) {
        keep[act] = v;
      }
    }
    if (!gone.length) continue;
    상세.push({ 어디: "교재 활동→항목", 이름: b.name, 죽은것: gone.length, 무엇: gone });
    고칠것.push(() => supabase.from("textbooks").update({ act_items: keep }).eq("id", b.id));
  }

  // ② 진도루틴 단계 — 등원 학습 · 숙제 · 항목 메모
  for (const st of rsQ.data || []) {
    const dIn = deadIn(st.inclass_items);
    const dHome = deadIn(st.home_items);
    const notes =
      st.item_notes && typeof st.item_notes === "object" && !Array.isArray(st.item_notes) ? st.item_notes : {};
    const dNote = Object.keys(notes).filter((k) => isDead(k));
    if (!dIn.length && !dHome.length && !dNote.length) continue;
    상세.push({
      어디: "진도루틴 단계",
      교재: bookName.get(st.textbook_id) || "(없는 교재)",
      단계: st.label || st.id,
      죽은것: dIn.length + dHome.length + dNote.length,
      무엇: [...dIn, ...dHome, ...dNote],
    });
    const patch = {};
    if (dIn.length) patch.inclass_items = (st.inclass_items || []).filter(keepable);
    if (dHome.length) patch.home_items = (st.home_items || []).filter(keepable);
    if (dNote.length) {
      const keep = {};
      for (const [k, v] of Object.entries(notes)) if (!isDead(k)) keep[k] = v;
      patch.item_notes = keep;
    }
    고칠것.push(() => supabase.from("routine_steps").update(patch).eq("id", st.id));
  }

  // ③ 학생 기본 등원 목록 · 기본 숙제
  for (const s2 of stQ.data || []) {
    const dIn = deadIn(s2.default_inclass);
    const dHome = deadIn(s2.default_home);
    if (!dIn.length && !dHome.length) continue;
    상세.push({ 어디: "학생 기본 목록", 이름: s2.name, 죽은것: dIn.length + dHome.length, 무엇: [...dIn, ...dHome] });
    const patch = {};
    if (dIn.length) patch.default_inclass = (s2.default_inclass || []).filter(keepable);
    if (dHome.length) patch.default_home = (s2.default_home || []).filter(keepable);
    고칠것.push(() => supabase.from("students").update(patch).eq("id", s2.id));
  }

  // ④ 집에서 못 하는 학습의 짝 — 이게 죽은 것을 가리키면 숙제로 바꿔 낼 때 터진다
  const { data: twins } = await supabase
    .from("homework_items").select("id, name, home_item_id").not("home_item_id", "is", null);
  for (const t of twins || []) {
    if (!isDead(t.home_item_id)) continue;
    상세.push({ 어디: "항목의 집짝(home_item_id)", 이름: t.name, 죽은것: 1, 무엇: [t.home_item_id] });
    고칠것.push(() => supabase.from("homework_items").update({ home_item_id: null }).eq("id", t.id));
  }

  /**
   * ⑤ **학생별로 더한 항목** (0182). 여기 죽은 이름표가 남으면 그 학생 판을
   * 열 때마다 다시 담기고, 저장이 `daily_report_items_homework_item_id_fkey`
   * 로 통째로 막힌다 — 이 파일이 생긴 바로 그 사고다.
   */
  {
    const stuName = new Map((stQ.data || []).map((x) => [x.id, x.name]));
    for (const r of addRows) {
      const { add, cut } = pruneAdd(r.routine_add, new Set([...alive].filter(keepable)));
      if (!cut) continue;
      const gone = addIds(r.routine_add).filter((x) => isDead(x));
      상세.push({
        어디: "학생별 더한 항목",
        이름: stuName.get(r.student_id) || "(퇴원생)",
        교재: bookName.get(r.textbook_id) || "(없는 교재)",
        죽은것: gone.length,
        무엇: gone,
      });
      고칠것.push(() => supabase
        .from("student_textbooks").update({ routine_add: add })
        .eq("student_id", r.student_id).eq("textbook_id", r.textbook_id));
    }
  }

  let 고친곳 = 0;
  const 못고침 = [];
  if (apply) {
    for (const run of 고칠것) {
      const { error } = await run();
      if (error) 못고침.push(error.message);
      else 고친곳 += 1;
    }
  }
  return { 살아있는항목수: alive.size, 찾은곳: 상세.length, 고친곳, 못고침, 상세 };
}
