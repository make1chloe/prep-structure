/**
 * **오늘 검사할 것 판정** — 판(오늘 수업)과 /check(검사 화면)가 같은
 * 판단을 쓴다 (선행공사 계획서 v2 §2-2 — 판단은 lib, 화면은 그리기만).
 *
 * 여기 있는 것은 전부 **순수 함수**다: 조회 결과(행)를 받아 맵과 판정을
 * 돌려준다. 조회 자체는 호출자가 한다 — 판의 배치판(모든 학생 한 번에)과
 * /check 의 배치판, assignedUnitsFor(한 학생만)가 조회는 따로 하되 판단은
 * 이 한 벌을 탄다.
 * 판단이 두 벌이면 「판에서는 검사 대상인데 /check 에선 아닌」 학생이
 * 생기고, 그 어긋남은 오류도 없이 진도만 조용히 어긋나게 한다.
 *
 * ── 2026-08-28: 실제로 두 벌이었다 ─────────────────────────
 * 위 문장은 이사(B-2, afe4ede) 때부터 적혀 있었지만 /check 는 **옮겨지지
 * 않았다** — 그 커밋이 손댄 것은 app/today/page.jsx 뿐이다. 그래서 규칙이
 * 갈렸다:
 *   · lib(판)  — 「배정이 있었던 **가장 최근 리포트 한 판**」 만 본다
 *   · /check   — 창 안의 **모든 배정 중 아직 안 본 것 전부**를 본다
 * 8/3 에 단어·독해를 내고 8/5 에 단어만 검사하며 문법을 새로 냈다면,
 * 판은 문법만 물어보고 독해는 조용히 사라졌다. /check 는 둘 다 물어봤다.
 * **두 화면이 서로 다른 학생·다른 항목을 냈다.**
 *
 * 어느 쪽이 옳은가 — /check 쪽이다.
 *   1) 이 파일의 아래 주석부터가 「최근 한 판만 보면 사슬이 끊긴다」 고
 *      적어놓고, 정작 고친 것은 「배정이 빈 판은 건너뛴다」 까지였다.
 *      배정이 **있는** 판이 새로 서면 그 앞의 못 본 숙제는 여전히 끊긴다.
 *   2) 0171(마이그, 원장 확정 8/27)이 창을 학생별 40판(≈2~3개월)으로
 *      넓힌 이유가 「장기 결석생 사슬도 안 끊긴다」 였다. 한 판만 볼
 *      거라면 창을 넓힐 까닭이 없다.
 *   3) /check 의 저장(app/check/actions.js)은 이미 assignedUnitsFor —
 *      즉 lib 판단 — 로 배정 단원을 찾는다. 화면에는 뜨는데 lib 은 모르는
 *      항목을 찍으면 단원이 안 잡혀 **진도가 안 움직였다.**
 * 그래서 lib 을 넓은 쪽(항목별 누적)으로 맞추고, /check 는 이 lib 을
 * 부르게 했다. 판에는 그동안 빠져 있던 「밀린 숙제」 가 다시 뜬다.
 */

// 단원 id 묶음 — 0009(배열) 뒤 DB 는 배열, 그 전 DB 는 한 칸
export const idsOf = (x) =>
  (x.textbook_unit_ids && x.textbook_unit_ids.length
    ? x.textbook_unit_ids
    : x.textbook_unit_id
    ? [x.textbook_unit_id]
    : []);

/**
 * 지난 수업에서 '배정한' 숙제 중 **아직 안 본 것** = 오늘 검사해야 할 항목.
 *
 * 안 본 것의 뜻: 그 항목을 배정한 날 **뒤에** ○△✕(done·weak·missing)로
 * 찍은 기록이 없다. 학생·항목 하나하나를 따로 센다 —
 *   예) 8/3 단어·독해 배정 → 8/5 단어만 검사 + 문법 배정
 *       → 8/10 검사 대상: 독해(8/3부터 밀림) · 문법(8/5)
 * 같은 항목을 여러 번 냈으면 **가장 최근 배정**의 범위·단원을 쓴다.
 *
 * @param prevReports 지난 리포트들 (id · student_id · date). 순서는 안 탄다.
 */
export function buildCheckSource({ prevReports, prevAssignedRows, prevAllRows }) {
  const prevReportStudent = new Map(
    (prevReports || []).map((r) => [r.id, r.student_id])
  );
  const dateOfReport = new Map((prevReports || []).map((r) => [r.id, r.date]));

  // 학생·항목별 **마지막으로 검사한 날**.
  // 「검사됐다」 = 검사 3상태만이다 (대장 #20). 전에는 assigned 만
  // 빼고 다 검사로 쳐서, 같은 항목이 등원 학습(inclass)·다음 계획
  // (plan_next)에 섰던 것만으로 검사 대상에서 조용히 사라졌다.
  const checkedAt = new Map(); // `${studentId}|${itemId}` → 날짜(가장 나중)
  (prevAllRows || []).forEach((x) => {
    if (!["done", "weak", "missing"].includes(x.status)) return;
    const sid = prevReportStudent.get(x.daily_report_id);
    const d = dateOfReport.get(x.daily_report_id);
    if (!sid || !d) return;
    const k = `${sid}|${x.homework_item_id}`;
    if (!checkedAt.has(k) || d > checkedAt.get(k)) checkedAt.set(k, d);
  });

  const openOf = new Map();        // studentId → [itemId] — 아직 안 본 것 (만난 차례)
  const openOn = new Map();        // `${sid}|${iid}` → 그 항목을 마지막으로 낸 날
  const prevUnitOf = new Map();    // `${sid}|${iid}` → { unitIds, note }
  const lastAssignedDate = new Map(); // studentId → 배정이 있었던 가장 최근 날
  const sinceOf = new Map();       // studentId → 제일 오래 밀린 배정일

  (prevAssignedRows || []).forEach((x) => {
    const sid = prevReportStudent.get(x.daily_report_id);
    const on = dateOfReport.get(x.daily_report_id);
    if (!sid || !on) return;
    const iid = x.homework_item_id;
    if (!lastAssignedDate.has(sid) || on > lastAssignedDate.get(sid))
      lastAssignedDate.set(sid, on);
    // 배정한 날 뒤에 검사한 적이 있으면 끝난 것이다
    const seen = checkedAt.get(`${sid}|${iid}`);
    if (seen && seen > on) return;

    // 제일 오래 밀린 날 — 「8/03 부터 아직 안 본 숙제입니다」
    if (!sinceOf.has(sid) || on < sinceOf.get(sid)) sinceOf.set(sid, on);

    const k = `${sid}|${iid}`;
    const had = openOn.get(k);
    if (had === undefined) {
      if (!openOf.has(sid)) openOf.set(sid, []);
      openOf.get(sid).push(iid);
    } else if (had >= on) {
      return;                        // 같은 숙제를 여러 번 냈으면 가장 최근 것
    }
    openOn.set(k, on);
    prevUnitOf.set(k, { unitIds: idsOf(x), note: x.range_note || "" });
  });

  return {
    prevReportStudent,
    dateOfReport,
    checkedAt,
    openOf,
    openOn,
    prevUnitOf,
    lastAssignedDate,
    sinceOf,
  };
}

/**
 * 판정 네 개를 묶어 돌려준다.
 *
 * @param unitTestIds 검사 대상이 아닌 항목 id — 단원평가·공지·다음테스트
 *   (원장님 2026-08-07: 「검사할 대상이 아니라 공지의 개념」. 목록에 남으면
 *   매일 「미완료」 로 뜨고 그것이 경고가 된다. 규칙은
 *   app/homework/categories.js 의 isNoCheck 한 곳에 있다 — 호출자가
 *   그 규칙으로 이 집합을 만든다)
 *
 * toCheckOf 의 todayItems: 오늘 리포트의 항목별 상태 map (있으면 **오늘
 *   검사한 것도 목록에 남긴다**, 2026-08-21 — 저장 후 다시 열면 「지난
 *   숙제가 없어요」 가 떠서 △를 ○로 고치려면 3클릭을 돌아야 했다).
 *   지난 다른 날 검사한 것은 여전히 뺀다 — 그건 다시 물을 일이 아니다.
 */
export function makeDayCheck(src, unitTestIds) {
  const toCheckOf = (sid, todayItems = null) => {
    // 차례는 **아직 안 본 배정을 처음 만난 순서** — 옛 /check 의 Map 차례와
    // 같다. 이미 본 항목은 여기 없고, 오늘 다시 찍은 것은 아래 extra 로 붙는다
    const base = (src.openOf.get(sid) || []).filter((iid) => !unitTestIds.has(iid));
    // 오늘 임의로 검사한 항목(대기줄·「다른 항목도 검사」)도 판정이 보여야 한다
    const extra = Object.keys(todayItems || {}).filter(
      (iid) => !base.includes(iid) && !unitTestIds.has(iid)
    );
    return [...base, ...extra];
  };
  // 판의 「8/03 수업에 낸 숙제」 — 배정이 있었던 가장 최근 날
  const assignedFromOf = (sid) => src.lastAssignedDate.get(sid) || null;
  // /check 의 「8/03 부터 아직 안 본 숙제입니다」 — 제일 오래 밀린 날
  const assignedSinceOf = (sid) => src.sinceOf.get(sid) || null;
  // 그 항목을 마지막으로 낸 날 (얼마나 밀렸는지 항목마다 보여준다)
  const assignedOnOf = (sid, iid) => src.openOn.get(`${sid}|${iid}`) || null;
  const assignedNoteOf = (sid, iid) => src.prevUnitOf.get(`${sid}|${iid}`)?.note || "";
  const assignedUnitsOf = (sid) => {
    const out = {};
    toCheckOf(sid).forEach((iid) => {
      const u = src.prevUnitOf.get(`${sid}|${iid}`);
      if (u) out[iid] = u;
    });
    return out;
  };
  return {
    toCheckOf,
    assignedFromOf,
    assignedSinceOf,
    assignedOnOf,
    assignedNoteOf,
    assignedUnitsOf,
  };
}

/**
 * **한 학생의 배정 단원** — /check 의 검사가 진도를 움직이려면(2-4-②)
 * 그 학생·그 항목의 배정 단원을 알아야 하는데, /check 의 항목 조회에는
 * 단원 칸이 없다 (check/page.jsx ITEM — 검토 D-2). 판의 배치판과 같은
 * 판단(buildCheckSource + makeDayCheck)을 1학생 조회로 태운다.
 *
 * @returns assignedUnitsOf(studentId) 결과 그대로 —
 *   `{ [itemId]: { unitIds, note } }`
 */
export async function assignedUnitsFor(supabase, studentId, date, unitTestIds = new Set()) {
  const { data: reps } = await supabase
    .from("daily_reports")
    .select("id, student_id, date")
    .is("archived_at", null)
    .eq("student_id", studentId)
    .lt("date", date)
    .order("date", { ascending: false })
    .limit(40);
  const prevReports = reps || [];
  const ids = prevReports.map((r) => r.id);
  if (!ids.length) return {};

  // 판의 loadItems 사다리(0140→0009→…)의 축약판 — 여기 필요한 칸까지만
  const BASE = "daily_report_id, homework_item_id, status";
  let { data: rows, error } = await supabase
    .from("daily_report_items")
    .select(`${BASE}, textbook_unit_id, textbook_unit_ids, range_note`)
    .in("daily_report_id", ids);
  if (error)
    ({ data: rows } = await supabase
      .from("daily_report_items")
      .select(`${BASE}, textbook_unit_id, range_note`)
      .in("daily_report_id", ids));
  const all = rows || [];

  const src = buildCheckSource({
    prevReports,
    prevAssignedRows: all.filter((x) => x.status === "assigned"),
    prevAllRows: all,
  });
  return makeDayCheck(src, unitTestIds).assignedUnitsOf(studentId);
}
