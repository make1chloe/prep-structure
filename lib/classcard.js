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
  // 굵은 판 루틴 항목 (2026-08-20 「자동화 시급해」) — 문법훈련은 나중에
  "클카 문장훈련": "sent",
  "클카 단어훈련": "word",
};

/** 클카 세트 종류 — 단어 세트가 "1" 인 것은 실물로 확인(2026-08-17),
 *  문장 "2" 는 세트 만들기 순서에서 온 추정이라 실물이 오면 다시 본다 */
export function ccKindOf(setType) {
  const t = String(setType || "");
  if (t === "1") return "word";
  if (t === "2") return "sent";
  return "other";
}

/** 클카 학습 모드 — 이름과 단위 (매칭만 점수, 나머지는 %) */
export const CC_MODES = [
  ["mem", "암기", "%"],
  ["recall", "리콜", "%"],
  ["spell", "스펠", "%"],
  ["speaking", "스피킹", "%"],
  ["match", "매칭", "점"],
];

/**
 * **무엇이 미달인지** (원장님, 2026-08-17 — 「안 함 말고 안 한 부분이
 * 뭔지, day3 매칭 3000점 미달 이런 식으로」). 필수로 지정된 모드
 * (goal_yn=1)마다 목표 대비 결과를 견줘 미달만 말한다.
 */
export function ccLacks(goals = {}, got = {}) {
  const out = [];
  CC_MODES.forEach(([key, label, unit]) => {
    if (!(key in goals)) return;
    const need = Number(goals[key]) || 0;
    const have = Number(got[key]) || 0;
    if (have < need) out.push(`${label} ${need}${unit} 미달`);
  });
  return out;
}

/** 세트를 짧게 부른다 — 「Day 3」 「Unit 11」, 없으면 이름 끝자락 */
export function ccSetLabel(name) {
  const m = String(name || "").match(/(day|unit|lesson|part)\s*0*(\d{1,3})/i);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
  const n = String(name || "").trim();
  return n.length > 14 ? `…${n.slice(-12)}` : n;
}

/**
 * 그날 마감 세트로 한 항목을 판정한다.
 *   전부 완료 = done · 일부 = weak · 하나도 안 함 = missing
 * 그 종류 세트가 없으면 null — 판정하지 않는다 (없는 숙제를 ✕로 찍으면 안 된다).
 */
export function ccJudge(sets = [], kind) {
  const mine = sets.filter((s) => ccKindOf(s.type) === kind);
  if (mine.length === 0) return null;
  const missedSets = mine.filter((s) => !s.complete);
  // 「Day 3 매칭 3000점 미달」 — 모드 자료가 없으면(옛 확장) 이름만
  const missed = missedSets.map((s) => {
    const lacks = ccLacks(s.goals || {}, s.got || {});
    return `${ccSetLabel(s.name)}${lacks.length ? ` ${lacks.join(", ")}` : " 미완료"}`;
  });
  return {
    status: missed.length === 0 ? "done" : missed.length === mine.length ? "missing" : "weak",
    missed,
    total: mine.length,
  };
}
