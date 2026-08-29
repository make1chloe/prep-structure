// **단원평가 결과는 두 곳에서 들어온다** — 판과 아이.
//
// 원장님이 오늘 판의 「테스트」 칸에 적으시면 daily_reports 의
// sent_unit·sent_correct·sent_total·sent_passed 에 들어가고, mirrorUnitScore
// 가 성적표(scores, kind='unit', source='class')에 사본을 만든다.
//
// 아이가 학생 화면에서 직접 내면(0106 — 원장님이 미리 배정하고 다음 시간에
// 결과만 제출) **scores 에만** 들어간다 (source='form'). 아이는 판을 못 쓴다
// (daily_reports 는 학생에게 읽기만 열려 있다 — 0158 이후 쭉 그렇다).
//
// 그런데 sent_* **만** 보는 곳이 있었다 (2026-08-28 감사 ⑥-3):
//   · 월간리포트의 단원평가 문구 (app/monthly/actions.js)
//   · 「단원평가 점수 안 적힘」 배지 (lib/menuBadges.js)
// 그래서 아이가 냈는데도 배지에 「점수 안 적힘」 이 계속 뜨고, 월간리포트
// 문구에는 그 단원평가가 안 실렸다. 원장님은 아이가 안 냈다고 여기게 된다.
//
// 그 판단을 여기 한 벌로 둔다 — 세는 곳마다 따로 적으면 또 한쪽만 고친다.

/**
 * 아이가 낸 단원평가 줄(scores, kind='unit', source='form')인가.
 *
 * source 칸이 없는 옛 DB 에서는 아무것도 안 걸린다 — 그때는 아이가 내는
 * 길 자체가 없었으니 맞다.
 */
export function isStudentUnit(s = {}) {
  return s.kind === "unit" && s.source === "form";
}

/**
 * 판이 부르는 이름과 **같은 이름**으로 맞춘다.
 *
 * 월간리포트는 (학생|날짜|이름)으로 같은 시험을 하나로 센다. 판 쪽은
 * 못 통과했으면 이름 뒤에 「(재시험)」 을 붙이는데(monthly/actions), 아이가
 * 낸 줄은 note 에 「재시험」 이 적힌다. 이름이 다르면 같은 시험이 두 줄로
 * 실린다 — 그래서 여기서 같은 규칙으로 붙인다.
 */
export function unitExamName(s = {}) {
  const name = (s.term || "").trim() || "단원평가";
  const retry = /재시험/.test(s.note || "");
  return retry ? `${name} (재시험)` : name;
}

/**
 * 아이가 낸 줄 → 월간리포트의 단원평가 모양 { student_id, date, name, score, total }.
 *
 * 점수는 이미 100점으로 환산되어 들어 있다(raw_score / full_score=100) —
 * 노션에서 옮겨온 옛 줄도 그렇게 되어 있어서 나란히 놓고 볼 수 있다.
 */
export function toExamShape(s = {}) {
  return {
    student_id: s.student_id,
    date: s.taken_on,
    name: unitExamName(s),
    score: s.raw_score ?? null,
    total: s.full_score ?? null,
  };
}

/**
 * **그 아이가 그날 단원평가 점수를 남겼나** — 판이든 아이가 낸 것이든.
 *
 * @param report        daily_reports 한 줄 { student_id, sent_unit, sent_total }
 * @param studentUnits  「학생id|날짜」 Set — 아이가 낸 줄들 (madeKeys 로 만든다)
 * @param date          그 판의 날짜 (report.date 가 없을 때 쓴다)
 */
export function unitScored(report = {}, studentUnits = new Set(), date = null) {
  if (report.sent_total != null) return true;
  if ((report.sent_unit || "").trim()) return true;
  const d = report.date || date;
  return studentUnits.has(`${report.student_id}|${d}`);
}

/** 아이가 낸 줄들 → 「학생id|날짜」 Set */
export function madeKeys(scoreRows = []) {
  return new Set(
    scoreRows.filter(isStudentUnit).map((s) => `${s.student_id}|${s.taken_on}`)
  );
}
