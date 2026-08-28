// 클래스카드 판정 — **한 곳** (docs/클래스카드-연동-설계.md).
//
// 확장이 보내온 것(classcard_day·classcard_planner)을 화면이 읽을 때
// 쓰는 셈들. 화면마다 따로 세면 오늘 수업과 대시보드가 다른 말을 한다.

/**
 * 앱 학생 ↔ 클카 학생 잇기.
 * 규칙: 재원생 정보의 「클카 아이디」(classcard_login — 학교에서 이미
 * 계정을 만든 아이들)가 있으면 그것, 없으면 앱 아이디(login_id).
 */
function ccLoginOf(student) {
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
  // 오늘 공백 정정 때 원장님이 클카 단어 항목의 예로 드심 (2026-08-21)
  "내신단어(온라인)": "word",
};

/** 이 학습 항목이 **클카 단어 방식**인가 — 이름으로 잇는다 (CC_ITEM_KIND) */
export function ccWordItem(name) {
  return CC_ITEM_KIND[name] === "word";
}

/**
 * 수신이 오래됐나 — 12시간 넘으면 오늘 공백 검사(ccTodayGap)를 아예 쉰다.
 * 낡은 자료로 「마감 없음」을 외치면 늘 켜진 재촉이 된다 (규칙 7: 못 세면 0).
 */
const CC_STALE_MS = 12 * 60 * 60 * 1000;
export function ccStale(fetchedAt, now = Date.now()) {
  if (!fetchedAt) return true;
  return now - new Date(fetchedAt).getTime() > CC_STALE_MS;
}

/**
 * 감시③ **오늘 공백** — 클카 단어 배정인데 플래너에 오늘 마감 세트가 없다.
 *
 * 원장님 (2026-08-21): 「클래스카드 플래너 숙제가 없는 경우 = 단어교재
 * 숙제가 있는 경우야. 이거 잡을 수 있을까」
 * → 정정 (같은 날): 「단어는 교재숙제가 나갈 경우 클카 숙제가 없다는
 *   뜻이었어」 — 단어 숙제는 교재(책)와 클카가 **번갈아** 나가서, 교재
 *   단어가 나간 날은 클카 마감 0 이 **정상**이다. 그래서 「단어교재
 *   사용중」으로 재지 않고, **현재 배정(오늘 검사 대상·오늘 나간 숙제)에
 *   kind=word 클카 항목이 있는 날만** 잰다.
 *
 * 부르기 전에 거를 것: 클카 명단에 못 잇는 학생(연동 안 됨)과 수신이
 * 오래된 날(ccStale) — 연동 안 된 아이를 매일 경고하면 늘 켜진 재촉이다.
 *
 * @param hasCcWordItem 현재 배정에 클카 단어 항목(ccWordItem)이 있나
 * @param dayRow 그날 classcard_day 줄 ({ sets }) — 없으면 null (수신 없음.
 *   확장은 명단 전원에게 빈 세트라도 줄을 남기므로, 없음은 수신 실패다)
 * @returns "gap"(마감 세트 0 — 어긋남) · "nodata"(그 학생 수신 없음) ·
 *   null(클카 단어 배정이 아니거나 마감이 있다 — 검사할 것 없음)
 */
export function ccTodayGap(hasCcWordItem, dayRow) {
  if (!hasCcWordItem) return null;
  if (!dayRow) return "nodata";
  return (dayRow.sets || []).length === 0 ? "gap" : null;
}

/** 클카 세트 종류 — 단어 세트가 "1" 인 것은 실물로 확인(2026-08-17),
 *  문장 "2" 는 세트 만들기 순서에서 온 추정이라 실물이 오면 다시 본다 */
function ccKindOf(setType) {
  const t = String(setType || "");
  if (t === "1") return "word";
  if (t === "2") return "sent";
  return "other";
}

/** 클카 학습 모드 — 이름과 단위 (매칭만 점수, 나머지는 %) */
const CC_MODES = [
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
function ccLacks(goals = {}, got = {}) {
  const out = [];
  CC_MODES.forEach(([key, label, unit]) => {
    if (!(key in goals)) return;
    const need = Number(goals[key]) || 0;
    const have = Number(got[key]) || 0;
    if (have < need) out.push(`${label} ${need}${unit} 미달`);
  });
  return out;
}

/**
 * **이름에서 Day 숫자를 뽑는다 — 한 벌.**
 *
 * 「Day 12」 · 「day012」 · 「12과」 처럼 적힌 단원·세트 이름에서 숫자만.
 * 「Day」 가 없으면 이름 속 첫 숫자를 쓴다 (원장님 단어 교재 단원이
 * 「12」 처럼 숫자만인 경우가 있다).
 *
 * ── 왜 여기로 나왔나 (2026-08-28) ───────────────────────
 *
 * 이 규칙은 lib/dashboard 안의 지역 함수였다. 그런데 대시보드가
 * 「진도 어긋남」을 **재는** 잣대이자, 「플래너에 맞추기」 단추가 무엇을
 * 완료로 찍을지 **고르는** 잣대다. 두 벌이 되면 단추를 눌러도 대시보드가
 * 여전히 어긋났다고 말하거나(맞췄는데 안 없어짐), 안 어긋난 것을
 * 고치게 된다. **재는 자와 고치는 자가 같아야 한다.**
 *
 * ⚠️ ccSetLabel 의 정규식과 비슷하지만 **다른 것**이다 — 저건 사람이
 *    읽을 이름표(「Day 3」)를 만들고, 이건 견줄 숫자를 뽑는다.
 *    같아 보인다고 하나로 합치지 말 것.
 */
export function dayNum(name) {
  const m =
    String(name || "").match(/day\s*0*(\d{1,3})/i) ||
    String(name || "").match(/(\d{1,3})/);
  return m ? parseInt(m[1], 10) : null;
}

/** 세트를 짧게 부른다 — 「Day 3」 「Unit 11」, 없으면 이름 끝자락 */
function ccSetLabel(name) {
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
