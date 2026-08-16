// 클래스카드 판정 — **한 곳** (docs/클래스카드-연동-설계.md).
//
// 확장이 보내온 것(classcard_day·classcard_planner)을 화면이 읽을 때
// 쓰는 셈들. 화면마다 따로 세면 오늘 수업과 대시보드가 다른 말을 한다.

/**
 * 앱 학생 ↔ 클카 학생 잇기.
 * 규칙: 재원생 정보의 「클카 아이디」(classcard_login — 학교에서 이미
 * 계정을 만든 아이들)가 있으면 그것, 없으면 앱 아이디(login_id).
 */
export function ccLoginOf(student) {
  return (student?.classcard_login || student?.login_id || "").trim().toLowerCase();
}

/** roster(classcard_students 줄들)에서 이 학생의 user_idx 를 찾는다 */
export function ccUserIdxOf(student, roster = []) {
  const login = ccLoginOf(student);
  if (!login) return null;
  const hit = roster.find((r) => (r.login_id || "").trim().toLowerCase() === login);
  return hit?.user_idx || null;
}

/** 그날 마감 세트 요약 — 오늘 수업 태그가 그린다 */
export function ccDaySummary(sets = []) {
  const total = sets.length;
  const done = sets.filter((s) => s.complete).length;
  return { total, done, allDone: total > 0 && done === total };
}

/**
 * 플래너 소진 판정 (감시② — 원장님 「꼭 필요」).
 * 이번 달+다음 달 마감일 중 오늘 이후가 없거나, 마지막이 3일 안이면
 * 「새로 잡아야 함」.
 */
export function plannerRunningOut(days = [], today) {
  const future = [...new Set(days)].filter((d) => d >= today).sort();
  if (future.length === 0) return { out: true, last: null };
  const last = future[future.length - 1];
  const soon = new Date(last) - new Date(today) <= 3 * 86400000;
  return { out: soon, last };
}

/**
 * **클카가 자동으로 채우는 학습항목** (원장님, 2026-08-17 — 「클래스카드
 * 단어세트 취합결과가 단어(온라인), 문장세트 결과가 문장암기(온라인)」).
 * 항목 이름이 바뀌면 여기도 바꿔야 한다 — 이름으로 잇는다.
 */
export const CC_ITEM_KIND = {
  "단어(온라인)": "word",
  "문장암기(온라인)": "sent",
};

/** 클카 세트 종류 — 단어 세트가 "1" 인 것은 실물로 확인(2026-08-17),
 *  문장 "2" 는 세트 만들기 순서에서 온 추정이라 실물이 오면 다시 본다 */
export function ccKindOf(setType) {
  const t = String(setType || "");
  if (t === "1") return "word";
  if (t === "2") return "sent";
  return "other";
}

/**
 * 그날 마감 세트로 한 항목을 판정한다.
 *   전부 완료 = done · 일부 = weak · 하나도 안 함 = missing
 * 그 종류 세트가 없으면 null — 판정하지 않는다 (없는 숙제를 ✕로 찍으면 안 된다).
 */
export function ccJudge(sets = [], kind) {
  const mine = sets.filter((s) => ccKindOf(s.type) === kind);
  if (mine.length === 0) return null;
  const missed = mine.filter((s) => !s.complete).map((s) => s.name);
  return {
    status: missed.length === 0 ? "done" : missed.length === mine.length ? "missing" : "weak",
    missed,
    total: mine.length,
  };
}
