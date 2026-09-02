/**
 * 단어·문장 시험 — **통과인지 아닌지는 여기 한 곳에서만 말한다.**
 *
 * 리포트(부모님께 나갈 글) · 경고(재시험 대상) · 하원 사유(늦귀가)가
 * 저마다 통과선을 세면 **같은 아이가 리포트에서는 통과인데 늦귀가 목록에는 남는다.**
 * 오류가 안 나고, 원장님은 두 화면을 번갈아 보다가 앱을 못 믿게 된다.
 *
 * ── 어디까지 SQL 이고 어디부터 JS 인가 (원칙 1 — 두 벌 금지) ──────────────
 *
 *  SQL 이 하는 판단 (여기서 다시 만들지 않는다):
 *    v2.word_test_on(학생,교재,날짜)   교재멈춤이면 시험도 멈춘다        0037
 *    v2.word_tests_today(학생,날짜)    오늘 볼 단어시험 목록             0037
 *    v2.quiz_passed(판)                통과 판정 (틀린 개수 ÷ 전체)      0039
 *    v2.quiz_correct(판)               맞은 개수 — **세어 나온다**       0039
 *    v2.quiz_for_report(판지)          리포트 줄 · **값 없으면 뺀다**    0039
 *    v2.style_for(학생,교재,회독,갈래) 방식 고르기 (학생→교재→학원)      0040
 *    v2.style_text(방식)               사람이 읽는 말                    0040/0041
 *    v2.quiz_failed_today(판지)        미통과 목록                       0040
 *
 *  JS 가 하는 일 (판단이 아니라 **다듬기**):
 *    · SQL 이 준 칸을 화면이 쓰는 이름으로 바꾼다 (cut_pct → cutPct)
 *    · `style_for` 가 짝이 없어도 줄을 하나 뱉는 함정을 막는다 (아래 ⚠️)
 *    · 짝이 아예 없을 때 **학원 기본 통과선 90%** 로 떨어뜨린다
 *    · 「안 봤다 · 개수를 안 적었다 · 봤고 몇 점이다」 셋을 갈라 준다
 *    · 미통과 줄을 늦귀가 사유 한 줄로 적는다 (**세지 않는다 — 받은 줄을 읽기만**)
 *
 * @param db  { query(sql, params) } — pg 든 supabase 어댑터든. 검사가 가짜를 끼운다
 */

/** 학원 기본 통과선. 아이별·교재별 방식 줄이 **하나도 없을 때만** 여기까지 온다 (오류대장 60) */
export const ACADEMY_CUT = 90;

/**
 * ⚠️ 백분율 식이 **세 곳**에 적혀 있다 —
 *    0039 `quiz_for_report` · 0040 `quiz_failed_today` · 그리고 여기.
 *    반올림을 한 곳만 고치면 **리포트는 83% 인데 늦귀가 목록은 82.5%** 가 되고,
 *    두 숫자가 다른 것을 원장님이 먼저 발견한다. 오류는 안 난다.
 *    → DB 에 `v2.quiz_pct(uuid)` 한 벌을 만들어 주시면 이 줄을 지운다 (보고 needsDb ①).
 */
const PCT_SQL = `round((q.total - q.wrong)::numeric / nullif(q.total,0) * 100, 0)`;

const num = (v) => (v === null || v === undefined ? null : Number(v));

// ────────────────────────────────────────────────────────────────
// ① 시험 방식과 통과선
// ────────────────────────────────────────────────────────────────

/**
 * 이 아이 · 이 교재 · 이 회독의 시험 방식. 고르는 것은 SQL(`style_for`)이 한다.
 * 짝이 없으면 `null` — **비어 있는 줄을 돌려주지 않는다.**
 *
 * ⚠️ `v2.style_for` 는 짝이 없어도 **칸이 전부 NULL 인 줄을 하나 뱉는다** (실측 확인).
 *    `rows.length` 로 세면 늘 1이라 「없다」를 못 가른다 —
 *    그대로 쓰면 통과선이 `null` 인 채 흘러가 **통과 판정이 조용히 전부 미통과**가 된다.
 *    → `id` 가 비었는지로 가른다.
 */
export async function styleOf(db, { studentId = null, bookId = null, round = 1, kind = "word" } = {}) {
  const { rows } = await db.query(
    `select s.*, v2.style_text(s.id) as style_text
       from v2.style_for($1, $2, $3::smallint, $4) s`,
    [studentId, bookId, round, kind]
  );
  const r = rows[0];
  if (!r || r.id == null) return null;          // ⚠️ 위 함정 — 줄 수가 아니라 id 로 가른다
  return {
    id: r.id,
    kind: r.kind,
    round: num(r.round),
    cutPct: num(r.cut_pct),
    text: r.style_text,
    firstHint: r.first_hint === true,
    unitsPer: num(r.units_per),
    sWay: r.s_way ?? null,
    // 단어 — 네 가지 비율 (합 100. 합을 지키는 것은 DB 의 style_pct 제약이 한다)
    mix: {
      mcMeaning: num(r.mc_meaning), saMeaning: num(r.sa_meaning),
      mcWord: num(r.mc_word), saWord: num(r.sa_word),
    },
    // 어느 층에서 왔나 — 화면이 「이 아이만의 설정」을 표시할 때 쓴다
    from: r.student_id ? "student" : r.book_id ? "book" : "academy",
  };
}

/**
 * 통과선 하나 — **아이별 → 교재별 → 학원 방식줄 → 학원 기본 90%.**
 *
 * ⚠️ 판(`v2.quiz`)을 만드는 화면은 **반드시 이 값을 `cut_pct` 에 찍어야 한다.**
 *    `quiz.cut_pct` 는 기본값 90 으로 저절로 채워지고 `quiz_passed` 는 그 칸만 본다 —
 *    통과선 80% 인 아이의 판을 안 찍고 넣으면 **90% 로 판정되고 아무 오류도 안 난다.**
 *    83점이 미통과가 되어 재시험지가 나가고, 몇 달 뒤에야 드러난다.
 */
export async function cutFor(db, opts = {}) {
  const st = await styleOf(db, opts);
  if (!st || st.cutPct == null) return { pct: ACADEMY_CUT, from: "default", styleId: null };
  return { pct: st.cutPct, from: st.from, styleId: st.id };
}

// ────────────────────────────────────────────────────────────────
// ② 교재를 멈추면 시험도 멈춘다 (원장님 확정 2026-09-02 · 0037)
// ────────────────────────────────────────────────────────────────

/**
 * 오늘 이 아이가 이 교재로 시험을 보나. 판단은 SQL(`word_test_on`).
 * `book_off`(교재멈춤)면 **거짓**이다. `hw_off`(숙제멈춤)는 시험을 안 막는다 —
 * 단어시험은 학원에서 보는 것이라 숙제와 별개다.
 */
export async function testOn(db, { studentId, bookId, on = null } = {}) {
  const { rows } = await db.query(`select v2.word_test_on($1, $2, $3) as ok`, [studentId, bookId, on]);
  return rows[0]?.ok === true;
}

/** 오늘 이 아이가 볼 단어시험 목록. **멈춘 교재는 빠져서 온다** (SQL 이 뺀다) */
export async function testsToday(db, studentId, on = null) {
  const { rows } = await db.query(`select book_id, book_name from v2.word_tests_today($1, $2)`, [studentId, on]);
  return rows.map((r) => ({ bookId: r.book_id, bookName: r.book_name }));
}

// ────────────────────────────────────────────────────────────────
// ③ 통과 판정 — 리포트·경고·하원 사유가 **이것 하나**를 부른다
// ────────────────────────────────────────────────────────────────

/**
 * 한 판의 판정.
 *
 * 돌려주는 것 — `passed` 는 **셋**이다:
 *   `true`  통과   `false` 미통과   `null` **아직 값이 없다**
 *
 * ⚠️ `null` 을 0% 로 치지 마라. **「안 봤다」와 「0점」은 다르다.**
 *    0점으로 치면 시험을 안 본 아이가 리포트에 「0%」로 나가고 재시험지가 뽑힌다.
 *    → `shown` 이 거짓이면 리포트에 **줄을 세우지 않는다** (원장님 확정).
 *
 * ⚠️ 개수는 **틀린 개수 + 전체 개수**로 센다. 맞은 개수는 적는 값이 아니라
 *    `v2.quiz_correct` 가 세어 주는 값이다 (원칙 — 두 벌로 안 적는다).
 *
 * 없는 판이면 `null` 을 돌려준다 — `quiz_passed` 는 없는 판에도 `null` 을 주므로
 * 그것만으로는 「없다」와 「값이 아직 없다」를 못 가른다(실측 확인).
 */
export async function wordPass(db, quizId) {
  const { rows } = await db.query(
    `select q.id, q.kind, q.state, q.total, q.wrong, q.cut_pct, q.harder,
            v2.quiz_correct(q.id) as correct,
            v2.quiz_passed(q.id)  as passed,
            ${PCT_SQL}            as pct
       from v2.quiz q where q.id = $1`,
    [quizId]
  );
  const r = rows[0];
  if (!r) return null;                                   // 그런 판이 없다
  return shapePass(r);
}

/** 판 한 줄(위 select 모양)을 화면이 쓰는 말로. 판정은 이미 SQL 이 끝냈다 */
function shapePass(r) {
  const total = num(r.total), wrong = num(r.wrong);
  const passed = r.passed === null || r.passed === undefined ? null : r.passed === true;
  return {
    quizId: r.id,
    kind: r.kind,                                        // 'word' · 'sentence'
    state: r.state,
    total, wrong,
    correct: num(r.correct),                             // 세어 나온 값 — 저장하지 않는다
    cutPct: num(r.cut_pct),
    pct: passed === null ? null : num(r.pct),            // ⚠️ 값이 없으면 0 이 아니라 null
    harder: r.harder === true,
    passed,
    shown: passed !== null,                              // 리포트에 줄을 세울 수 있나
    why: whyNotShown(total, wrong),                      // 못 세우는 까닭 (셀 수 있으면 null)
  };
}

/** 왜 리포트에 안 나가나 — 「안 봤다」와 「개수를 안 적었다」를 가른다 */
function whyNotShown(total, wrong) {
  if (total !== null && wrong !== null) return total === 0 ? "전체 개수가 0이다" : null;
  if (total === null && wrong === null) return "아직 안 봤다";
  if (total === null) return "전체 개수를 안 적었다";
  return "틀린 개수를 안 적었다";
}

// ────────────────────────────────────────────────────────────────
// ④ 리포트 · 미통과 — **세지 말고 부르기만 한다**
// ────────────────────────────────────────────────────────────────

/**
 * 그날 판지에 나갈 시험 줄. 거르는 것은 SQL(`quiz_for_report`)이 한다 —
 * **개수를 안 적은 시험은 애초에 줄이 안 온다** (원장님 확정: 값 없으면 리포트 미출력).
 *
 * ⚠️ 이 줄에는 **판 id 가 없다** — 「이 줄의 재시험 만들기」를 붙이려면 DB 쪽이 필요하다
 *    (보고 needsDb ②). 지금 화면에서 판을 되찾으려고 이름으로 맞추지 마라 —
 *    같은 교재 같은 단원 시험이 하루에 둘이면 엉뚱한 판을 고친다.
 */
export async function reportLines(db, sheetId) {
  const { rows } = await db.query(
    `select part, kind, scope, total, wrong, pct, passed from v2.quiz_for_report($1)`, [sheetId]);
  return rows.map((r) => ({
    part: r.part,                                        // '오늘 본 것' · '다음 시간'
    kind: r.kind,
    scope: r.scope,
    total: num(r.total),
    wrong: num(r.wrong),
    pct: num(r.pct),
    passed: r.passed === null || r.passed === undefined ? null : r.passed === true,
  }));
}

/**
 * 오늘 미통과. 세는 것은 SQL(`quiz_failed_today`) —
 * **미통과 → 늦귀가 사유 · 재시험 대상**은 여기서 갈라져 나간다.
 * 원장님이 따로 찾지 않는다 (대전제 3).
 */
export async function failedToday(db, sheetId) {
  const { rows } = await db.query(
    `select quiz_id, kind, scope, pct from v2.quiz_failed_today($1)`, [sheetId]);
  return rows.map((r) => ({
    quizId: r.quiz_id,
    kind: r.kind,
    scope: r.scope,
    pct: num(r.pct),
    label: `${r.kind === "sentence" ? "문장" : "단어"} ${r.scope}`,
  }));
}

/**
 * 늦귀가 사유 한 줄. **받은 줄을 읽기만 한다 — 다시 세지 않는다.**
 * 이 글은 학부모에게 그대로 나간다 (절 ⑭).
 * 미통과가 없으면 `null` — 빈 글자를 주면 화면이 사유 없는 늦귀가를 만든다.
 */
export function lateReasonText(failed) {
  if (!failed || failed.length === 0) return null;
  const one = (f) => `${f.label} ${f.pct == null ? "미통과" : f.pct + "%"}`;
  return failed.map(one).join(" · ") + " 재시험";
}
