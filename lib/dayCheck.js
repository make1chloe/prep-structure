/**
 * **오늘 검사할 것 판정** — 판(오늘 수업)과 /check(검사 화면)가 같은
 * 판단을 쓴다 (선행공사 계획서 v2 §2-2 — 판단은 lib, 화면은 그리기만).
 *
 * 여기 있는 것은 전부 **순수 함수**다: 조회 결과(행)를 받아 맵과 판정을
 * 돌려준다. 조회 자체는 호출자가 한다 — 판의 배치판(모든 학생 한 번에)과
 * assignedUnitsFor(한 학생만)가 조회는 따로 하되 판단은 이 한 벌을 탄다.
 * 판단이 두 벌이면 「판에서는 검사 대상인데 /check 에선 아닌」 학생이
 * 생기고, 그 어긋남은 오류도 없이 진도만 조용히 어긋나게 한다.
 */

// 단원 id 묶음 — 0009(배열) 뒤 DB 는 배열, 그 전 DB 는 한 칸
export const idsOf = (x) =>
  (x.textbook_unit_ids && x.textbook_unit_ids.length
    ? x.textbook_unit_ids
    : x.textbook_unit_id
    ? [x.textbook_unit_id]
    : []);

/**
 * 지난 수업에서 '배정한' 숙제 = 오늘 검사해야 할 항목.
 *
 * 주의: "가장 최근 리포트" 하나만 보면 사슬이 끊긴다.
 *   예) 8/3 숙제 냄 → 8/5 결석(출결만 저장, 숙제 없음) → 8/10 검사 대상 0개
 * 그래서 학생별로 **배정이 있었던 가장 최근 리포트**를 찾고,
 * 그 뒤에 검사된 적이 없으면 계속 검사 대상으로 남긴다.
 *
 * @param prevReports 지난 리포트들 — **날짜 내림차순** 전제 (판정이 이
 *   순서를 탄다: 내림차순 첫 번째 = 가장 최근)
 */
export function buildCheckSource({ prevReports, prevAssignedRows, prevAllRows }) {
  const prevAssigned = new Map();
  const prevUnitOf = new Map(); // `${studentId}|${itemId}` → { unitIds, note }
  const prevReportStudent = new Map(
    (prevReports || []).map((r) => [r.id, r.student_id])
  );
  (prevAssignedRows || []).forEach((x) => {
    if (!prevAssigned.has(x.daily_report_id)) prevAssigned.set(x.daily_report_id, []);
    prevAssigned.get(x.daily_report_id).push(x.homework_item_id);
  });

  // 학생별: 배정이 있었던 가장 최근 리포트 (날짜 내림차순으로 첫 번째)
  const lastAssignedReport = new Map();
  const lastAssignedDate = new Map();
  (prevReports || []).forEach((r) => {
    if (lastAssignedReport.has(r.student_id)) return;      // 이미 더 최근 것을 잡았다
    if (!(prevAssigned.get(r.id) || []).length) return;    // 이 리포트엔 배정이 없다 → 건너뛴다
    lastAssignedReport.set(r.student_id, r.id);
    lastAssignedDate.set(r.student_id, r.date);
  });

  // 그 배정이 이후 수업에서 이미 검사됐는지 확인 (검사됐으면 다시 안 물어본다)
  const checkedAfter = new Map(); // studentId → Set(itemId)
  (prevAllRows || []).forEach((x) => {
    if (x.status === "assigned") return;
    const sid = prevReportStudent.get(x.daily_report_id);
    if (!sid) return;
    const rep = (prevReports || []).find((r) => r.id === x.daily_report_id);
    const since = lastAssignedDate.get(sid);
    if (!rep || !since || rep.date <= since) return;       // 배정보다 뒤에 검사한 것만
    if (!checkedAfter.has(sid)) checkedAfter.set(sid, new Set());
    checkedAfter.get(sid).add(x.homework_item_id);
  });

  (prevReports || []).forEach((r) => {
    const rid = lastAssignedReport.get(r.student_id);
    if (rid !== r.id) return;
    (prevAssigned.get(r.id) || []).forEach((iid) => {
      prevUnitOf.set(`${r.student_id}|${iid}`, prevUnitOf.get(`${r.student_id}|${iid}`) || {});
    });
  });

  // 단원·범위 메모는 배정 줄에서 다시 읽는다 (같은 조회를 또 하지 않는다)
  (prevAssignedRows || []).forEach((x) => {
    const sid = prevReportStudent.get(x.daily_report_id);
    if (!sid || lastAssignedReport.get(sid) !== x.daily_report_id) return;
    prevUnitOf.set(`${sid}|${x.homework_item_id}`, {
      unitIds: idsOf(x),
      note: x.range_note || "",
    });
  });

  return {
    prevAssigned,
    prevReportStudent,
    lastAssignedReport,
    lastAssignedDate,
    checkedAfter,
    prevUnitOf,
  };
}

/**
 * 판정 세 개를 묶어 돌려준다.
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
    const rid = src.lastAssignedReport.get(sid);
    if (!rid) return [];
    const done = src.checkedAfter.get(sid) || new Set();
    const base = (src.prevAssigned.get(rid) || []).filter(
      (iid) =>
        !unitTestIds.has(iid) &&
        (!done.has(iid) || (todayItems && iid in todayItems))
    );
    // 오늘 임의로 검사한 항목(대기줄·「다른 항목도 검사」)도 판정이 보여야 한다
    const extra = Object.keys(todayItems || {}).filter(
      (iid) => !base.includes(iid) && !unitTestIds.has(iid)
    );
    return [...base, ...extra];
  };
  const assignedFromOf = (sid) => src.lastAssignedDate.get(sid) || null;
  const assignedUnitsOf = (sid) => {
    const out = {};
    toCheckOf(sid).forEach((iid) => {
      const u = src.prevUnitOf.get(`${sid}|${iid}`);
      if (u) out[iid] = u;
    });
    return out;
  };
  return { toCheckOf, assignedFromOf, assignedUnitsOf };
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
