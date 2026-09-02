/**
 * **「내 할 일」 하나** — 옛 보드 A·B·D 를 합친 것. (계획 절 ㊴·㉟·㊵·㊱)
 *
 * 원장님(9/2): 「보드 B 가 사실상 A 에 통합되는 게 맞아 보여. A 랑 D 가 어떻게 다른 건지
 * 모르겠어. 그럴 거면 학교별이 아니라 **할 일 별로** 분류하는 게 맞지 않아?」
 *
 * ── 이 파일이 지키는 것 넷 ─────────────────────────────────
 *  ① **바깥 축은 「할 일 종류」다.** 학교는 거르개 한 줄이다.
 *     ⚠️ 학교를 바깥 축으로 두면 **인쇄 목록이 다섯 군데로 흩어지고 겹치는 것이 아홉 번 뜬다**
 *        (㉞ 실측: 인쇄 92장 · 같은 할 일이 9자리에서 겹침).
 *  ② **내신은 파이프라인이 아니다**(㉟). 시험 하나 = 「남은 것」 목록이고
 *     **마감만 있고 순서는 없다.** 단계 아홉을 차례로 밟게 만들지 않는다.
 *     순서가 있는 곳은 **자료 하나 안**뿐이다 — 만들기 → 인쇄 → 배부 → 풀이 → 채점.
 *  ③ **재활용은 고르는 것이 아니다**(㊵). 같은 범위로 지난번에 만든 것이 있으면
 *     **「만들기」가 체크된 채로** 선다. 단추 셋(그대로 쓰기/고쳐 쓰기/배정만)을 만들지 않는다.
 *  ④ **되풀이 할일은 `lib/queue.js` 가 만든다.** 여기서 다시 만들지 않고 부르기만 한다.
 *
 * ⚠️ 이 파일은 **DB 를 얕은 어댑터로 받는다** — `{ query(sql, params) }`.
 *    `lib/notify.js` · `lib/queue.js` 와 같은 계약이다. 검사가 가짜 DB 를 끼울 수 있어야 한다.
 *    SQL 안에 `${…}` 를 끼워 넣지 않는다 — 값은 전부 `$1`·`$2` 다.
 *
 * ⚠️ 셈은 **저장하지 않는다**(원칙 5). 「남은 것 8개」·「D-5」·「배부 3/15」는 전부
 *    여기서 세어 돌려줄 뿐이고, 그런 칸을 DB 에 만들지 않는다.
 */

import { ymd, countDates, DOW_NAME } from "./session.js";
import { planRecurring, autoRules, assertToday, addDays } from "./queue.js";
// ⚠️ 시험 **통과 판정**은 `lib/word.js` 한 곳에만 산다(원칙 1). 여기서 quiz 를 직접 읽지 않는다
import { failedToday } from "./word.js";

// ─────────────────────────────────────────────────────────────
// 0. 바깥 축 — 할 일 종류 일곱 (계획 ㊴)
// ─────────────────────────────────────────────────────────────

/**
 * **화면의 바깥 축.** 차례는 계획서 ㊴ 그대로다 — 바꾸면 원장님 손이 다시 헤맨다.
 *
 * ⚠️ `v2.todo.kind` 는 **자유 글자**다(check 제약이 없다). 여기 없는 갈래가 들어와도
 *    DB 는 안 막는다 — 그래서 `groupOf()` 가 **모르는 갈래를 버리지 않고** 받는다.
 */
export const KINDS = Object.freeze([
  { key: "make",      label: "자료 만들기", icon: "✏️" },
  { key: "print",     label: "인쇄",        icon: "🖨" },
  { key: "hand",      label: "배부",        icon: "📤" },
  { key: "unit_test", label: "출제",        icon: "📝" },
  { key: "retest",    label: "재시험",      icon: "🔁" },
  { key: "score",     label: "성적 받기",   icon: "📊" },
  { key: "repeat",    label: "되풀이",      icon: "🔔" },
]);

/** 일곱에 안 드는 것이 가는 자리. **버리지 않는다**(대전제 6) */
export const OTHER = Object.freeze({ key: "other", label: "그 밖", icon: "•" });

/**
 * ⚠️ **옛 앱에서 넘어온 학사일정이 `todo` 에 226줄 앉아 있다** (`kind='schedule'`, 실측 2026-09-02).
 *    학사일정은 원장님 할 일이 아니라 **일정 › 학교·시험** 것이다(㊲).
 *    그렇다고 `where kind in (일곱)` 으로 거르면 **226줄이 오류 없이 사라진다** —
 *    화면은 멀쩡하고 아무도 못 알아챈다. 그래서 **옆으로 치우고 세어서 말한다.**
 */
export const ASIDE_KINDS = Object.freeze(["schedule"]);

const KIND_KEYS = new Set(KINDS.map((k) => k.key));

/** 갈래 → 바깥 축 칸. **모르는 갈래는 `other` 로 간다 — 절대 버리지 않는다** */
export function groupOf(kind) {
  const k = String(kind ?? "").trim();
  return KIND_KEYS.has(k) ? k : OTHER.key;
}

/** 화면에 뭐라고 쓰나 */
export function kindLabel(kind) {
  const g = groupOf(kind);
  return (KINDS.find((k) => k.key === g) ?? OTHER).label;
}

// ─────────────────────────────────────────────────────────────
// 1. 자료 하나 안의 걸음 — **순서가 있는 유일한 자리** (계획 ㉟)
// ─────────────────────────────────────────────────────────────

/**
 * 자료 한 장의 걸음. `v2.material_type.steps` 의 기본값과 같은 차례다.
 *
 * ⚠️⚠️ **`score` 라는 글자가 두 뜻이다.**
 *    걸음의 `score` = **채점**(자료 한 장을 매기는 것),
 *    할 일 종류의 `score` = **성적 받기**(학교 시험 점수를 받아 적는 것).
 *    섞으면 「채점 다 했다」가 「성적 다 받았다」로 보여 **성적 받기 카드가 화면에서 사라진다.**
 *    → 걸음은 `STEPS`·`stepLabel()` 로만, 할 일 종류는 `KINDS`·`kindLabel()` 로만 다룬다.
 *       둘을 한 함수에 같이 넘기지 마라.
 */
export const STEPS = Object.freeze(["make", "print", "hand", "solve", "score"]);
const STEP_LABEL = Object.freeze({
  make: "만들기", print: "인쇄", hand: "배부", solve: "풀이", score: "채점",
});
export const stepLabel = (s) => STEP_LABEL[s] ?? String(s ?? "");

/**
 * 이 자료가 밟는 걸음. **자료 종류가 걸음을 정한다** —
 * 클래스카드는 인쇄가 없어 **네 걸음**이다(㉟).
 *
 * ⚠️ 종류에 걸음이 안 적혀 있으면 **다섯 걸음을 지어내지 않는다.**
 *    `null` 로 답하고, 화면이 「자료 종류에 걸음이 안 적혀 있습니다」를 띄운다.
 *    지어내면 클래스카드에 **없는 인쇄 칸**이 생겨 영원히 안 채워진다.
 *
 * ⚠️⚠️ **모르는 걸음도 안 버린다**(대전제 6 · `groupOf()` 와 같은 손씨).
 *    예전에는 `STEPS` 에 없는 글자를 조용히 걸러 냈다. 그래서
 *    `steps=['make','print','upload','hand','solve','score']`(클래스카드 업로드가 든 종류)가
 *    `['make','print','hand','solve','score']` 로 짧아지고, **업로드를 안 했는데
 *    `stepNow().finished === true`** 가 나왔다 — 클카에 안 올린 자료가 「끝」으로 올라간다.
 *    이제는 그대로 들고 있고, `stepNow()` 가 「모르는 걸음」으로 세워 끝으로 안 올린다.
 */
export function stepsOf(type) {
  const raw = type?.steps;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw.map(String);
}

/** 걸음표에 든 **모르는 걸음**(`STEPS` 밖). 화면이 「이 걸음은 찍을 칸이 없습니다」를 띄운다 */
export function unknownSteps(type) {
  return (stepsOf(type) ?? []).filter((s) => !STEPS.includes(s));
}

/**
 * **지금 어느 걸음인가** — 시각에서 **세어 나온다**(원칙 5 · 계획 보드 A).
 * 상태 칸을 따로 두지 않고, 체크한 시각만 보고 자리를 정한다.
 *
 * @param m     v2.material 한 줄 — { made_at, printed_at, state }
 * @param type  v2.material_type — { steps }
 * @param give  v2.material_give 요약 — { n, handed, got, done, scored }
 *
 * ⚠️ **채점을 찍을 칸이 아직 없다.** `material_give` 에 `scored_at` 이 없어서
 *    마지막 걸음만 「모른다」로 답한다. 지어내서 「끝」으로 올리면
 *    **채점 안 한 자료가 완료로 사라진다.** → 보고의 needsDb 에 SQL 로 적어 두었다.
 */
export function stepNow(m = {}, type = {}, give = {}) {
  const steps = stepsOf(type);
  if (!steps) return { steps: null, at: null, done: [], left: null,
                       why: "⚠️ 자료 종류에 걸음이 안 적혀 있다" };

  const n = Number(give.n ?? 0);
  const all = (x) => n > 0 && Number(x ?? 0) >= n;      // 배정된 아이 전부
  const doneOf = {
    make:  m.made_at != null,
    print: m.printed_at != null,
    hand:  all(give.handed),
    solve: all(give.done),
    score: give.scored == null ? null : all(give.scored),   // ⚠️ 칸이 없다 → null
  };
  // ⚠️ `STEPS` 밖의 걸음(예: 'upload')은 **모른다**(null)로 본다 — 버리지도, 끝난 것으로 치지도 않는다
  const stateOf = (s) => (Object.hasOwn(doneOf, s) ? doneOf[s] : null);

  const done = steps.filter((s) => stateOf(s) === true);
  // ⚠️ **첫 번째 안 끝난 걸음**이 지금 자리다. 뒤엣것을 먼저 체크해도 앞으로 안 건너뛴다 —
  //    건너뛰면 인쇄 안 한 자료가 「배부」 칸에 서서 원장님이 빈손으로 나눠 준다.
  const at = steps.find((s) => stateOf(s) !== true) ?? null;
  const unknown = steps.filter((s) => stateOf(s) === null);
  return {
    steps, at, done,
    left: steps.filter((s) => stateOf(s) !== true),
    finished: at === null,
    unknown,
    why: unknown.length ? `⚠️ 확인 안 됨 — ${unknown.map(stepLabel).join("·")} 을 찍을 칸이 없다` : null,
    // ⚠️ 두 벌 경보 — 시각으로 센 것과 `material.state` 가 어긋나면 **한쪽이 늙은 것**이다(원칙 1)
    stale: m.state != null && at !== null && m.state === "done",
  };
}

// ─────────────────────────────────────────────────────────────
// 2. 재활용 — **고르는 것이 아니라 체크된 채로 서는 것** (계획 ㊵)
// ─────────────────────────────────────────────────────────────

/**
 * 원장님: 「그냥 있다는 표시만 되어 있으면 돼. … 그냥 그게 **체크된 상태로 추가**되면 돼.」
 *
 * @param reuseOf   v2.material.reuse_of — 지난번에 만든 자료 id (없으면 null)
 * @param sameBook  지난 자료와 **같은 교재 줄**인가.
 *                  true=같음 · false=다름(개정판 의심) · null=모름
 *
 * ⚠️ **개정판이면 체크하지 않는다** — 쪽수가 달라 그대로 못 쓴다.
 * ⚠️ **모르면 체크하지 않는다**(대전제 0). 안전한 쪽이 「안 체크」다 —
 *    잘못 체크하면 원장님이 그 자료를 **안 만든 채로 지나쳐** 시험 날 자료가 없다.
 *    잘못 안 체크하면 한 번 더 확인하실 뿐이다.
 */
export function reuseState({ reuseOf = null, sameBook = null } = {}) {
  if (!reuseOf) return { checked: false, reused: false, note: null,
                         why: "지난번에 만든 것이 없다" };
  if (sameBook === true)
    return { checked: true, reused: true, note: "♻️ 지난번에 만든 것이 있습니다",
             why: "같은 범위·같은 교재로 지난번에 만들었다" };
  if (sameBook === false)
    return { checked: false, reused: true, revised: true,
             note: "⚠️ 쪽수가 다를 수 있습니다 (개정판)",
             why: "지난 자료와 교재 줄이 다르다 — 그대로 못 쓴다" };
  return { checked: false, reused: true, note: "⚠️ 확인 안 됨 — 같은 교재인지 모릅니다",
           why: "지난 자료의 교재를 모른다 — 체크하지 않는다" };
}

/** DB 한 줄(loadMaterials 의 결과)에서 바로 */
export function reuseOfRow(row = {}) {
  const same = row.reuse_of == null ? null
    : row.book_id == null || row.reuse_book_id == null ? null
    : row.book_id === row.reuse_book_id;
  return reuseState({ reuseOf: row.reuse_of, sameBook: same });
}

// ─────────────────────────────────────────────────────────────
// 3. 마감 — 주말에 서면 앞 수업일로 당긴다 (㉞ 실측 3)
// ─────────────────────────────────────────────────────────────

/** 서울 기준 요일 — 0=일 … 6=토. `class_schedule.weekdays` 와 같은 셈이다 */
export function dowOf(day) {
  const [y, m, d] = String(day).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export const isWeekend = (day) => { const w = dowOf(day); return w === 0 || w === 6; };

/**
 * **토·일에 선 할 일을 앞 수업일로 당긴다.** (실측 7개가 주말에 섰다)
 *
 * @param due        'YYYY-MM-DD'
 * @param classDays  학원 수업이 있는 날들 (Set 또는 배열) — `academyDays()` 가 준다
 * @param when       'weekend'(기본) = 토·일만 당긴다 · 'nonclass' = 수업 없는 날은 다 당긴다
 * @param maxBack    며칠까지 되돌아볼까 (기본 7)
 *
 * ⚠️ **뒤로는 절대 안 민다.** 뒤로 밀면 「D-7 배부」가 시험 뒤가 되는 날이 온다.
 * ⚠️ 기본이 `weekend` 인 까닭 — 실측으로 잡힌 것이 **토·일 7개**뿐이다.
 *    「평일인데 수업 없는 날」도 당길지는 **계획서에 없다.** 지어내지 않았다(대전제 0).
 * ⚠️ 앞 `maxBack` 일 안에 수업일이 없으면 **그대로 둔다.** 조용히 옮기면
 *    방학처럼 수업이 통째로 없는 구간에서 마감이 몇 주 앞으로 튄다.
 */
export function pullBack(due, classDays = [], { when = "weekend", maxBack = 7 } = {}) {
  if (!due) return { on: null, moved: false, why: "마감이 없다" };
  const day = ymd(due);
  const set = classDays instanceof Set ? classDays : new Set([...classDays].map(ymd));
  const bad = when === "nonclass" ? !set.has(day) : isWeekend(day);
  if (!bad) return { on: day, moved: false, why: null };
  for (let i = 1; i <= maxBack; i++) {
    const back = addDays(day, -i);
    if (set.has(back))
      return { on: back, moved: true, from: day,
               why: `${DOW_NAME[dowOf(day)]}요일에 서서 앞 수업일(${back})로 당겼다` };
  }
  return { on: day, moved: false, from: day,
           why: `⚠️ 앞 ${maxBack}일 안에 수업일이 없다 — 그대로 둔다` };
}

/** D-N. 시험일을 모르면 **답하지 않는다**(㉞ 실측 2 — 기간 끝으로 잡으면 루틴 아홉이 3일 늦게 선다) */
export function dday(examDay, today) {
  if (!examDay || !today) return null;
  const a = ymd(today), b = ymd(examDay);
  const ms = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(b) - ms(a)) / 86400000);
}
/** 화면 글자 — 「D-5」 · 「D-DAY」 · 「D+3」 */
export function ddayLabel(n) {
  if (n == null) return "⚠️ 영어 시험일을 넣어 주세요";
  return n === 0 ? "D-DAY" : n > 0 ? `D-${n}` : `D+${-n}`;
}

// ─────────────────────────────────────────────────────────────
// 4. 겹치는 것을 한 카드로 (㉞ 실측 4 — 9자리에서 겹쳤다)
// ─────────────────────────────────────────────────────────────

/**
 * 신송중·옥련여고 시험일이 같아 **같은 할 일이 9자리에서 겹쳤다.**
 * 한 카드로 묶어 **아홉 번 볼 것을 네 번**으로 줄인다.
 *
 * 묶는 열쇠 — 갈래 · 제목 · 마감 · 학생 · 자료. **시험만 다른 것**을 묶는다.
 * ⚠️ 학생이 다르면 **안 묶는다.** 「강민서 재시험」과 「구도은 재시험」을 한 카드로 묶으면
 *    한 번 체크할 때 안 본 아이까지 끝난 것이 된다.
 * ⚠️ 묶은 카드는 **속에 든 id 를 전부 들고 있어야 한다**(`ids`).
 *    하나만 체크하면 나머지 여덟이 남아 **다음 날 또 뜬다** — 원장님은 「체크했는데 또 나온다」로 겪는다.
 */
/**
 * 상태의 「안 끝난 정도」. **작을수록 안 끝난 것**이고, 묶을 때 작은 쪽이 이긴다.
 * ⚠️ 모르는 상태는 **0(안 끝난 것)** 으로 본다 — 모른다고 끝난 것으로 치면 일이 숨는다(대전제 0·6).
 */
const RANK = Object.freeze({ todo: 0, doing: 0, dropped: 1, done: 2 });
const STATE_RANK = (s) => RANK[String(s ?? "")] ?? 0;

export function mergeSame(rows = []) {
  const map = new Map();
  for (const r of rows) {
    // ⚠️⚠️ **열쇠에 `groupOf()` 를 쓰지 마라 — `kind` 원본을 쓴다.**
    //    `groupOf()` 는 일곱 밖을 전부 `other` 한 바구니에 넣어서, 학사일정(`schedule`)과
    //    원장님 손할일(`todo`)이 **같은 열쇠**가 됐다. 제목·마감이 같으면 학사일정이 진짜 할 일을
    //    **삼켜서** ① 할 일이 「일정 화면에서 봅니다」 상자로 숨고
    //    ② 학사일정을 한 번 체크하면 안 본 할 일까지 끝난 것이 됐다.
    const key = [String(r.kind ?? ""), r.title ?? "", r.due_on ? ymd(r.due_on) : "",
                 r.student_id ?? "", r.material_id ?? ""].join("");
    const got = map.get(key);
    if (!got) {
      map.set(key, {
        ...r, ids: [r.id], n: 1,
        // ⚠️ `scope` 도 같이 싣는다 — 이게 없으면 「전국 시험」 거르개가 묶인 카드를 못 본다
        exams: r.exam_id
          ? [{ id: r.exam_id, name: r.exam_name ?? null, scope: r.exam_scope ?? null,
               schoolId: r.school_id ?? null, school: r.school_name ?? null }]
          : [],
      });
      continue;
    }
    got.ids.push(r.id);
    got.n += 1;
    if (r.exam_id && !got.exams.some((e) => e.id === r.exam_id))
      got.exams.push({ id: r.exam_id, name: r.exam_name ?? null, scope: r.exam_scope ?? null,
                       schoolId: r.school_id ?? null, school: r.school_name ?? null });
    // ⚠️ 하나라도 안 끝났으면 **안 끝난 것**이다. 끝난 것만 보고 카드를 지우면 남은 일이 숨는다.
    //    ⚠️⚠️ `done` 만 되돌리면 **`dropped` 가 안 걸린다** — 먼저 온 줄이 `dropped` 면
    //    뒤에 온 안 끝난 줄이 dropped 로 덮여 인쇄해야 할 진짜 일이 배지에서 사라졌다.
    //    (`v2.todo.state` 는 todo·doing·done·**dropped** 넷이다 — 진짜 DB 의 check 제약으로 확인)
    if (STATE_RANK(r.state) < STATE_RANK(got.state)) got.state = r.state;
  }
  return [...map.values()];
}

// ─────────────────────────────────────────────────────────────
// 5. 보드 — 바깥 축은 갈래, **학교는 거르개 한 줄** (계획 ㊴)
// ─────────────────────────────────────────────────────────────

/**
 * 거르개의 고정 값 셋. **그 밖의 값은 학교 id** 로 본다.
 *
 * ⚠️⚠️ **`national`(전국 시험) 이 없으면 학평·수능 할 일이 어느 거르개에도 안 잡힌다.**
 *    `v2.exams` 의 `exam_scope_school` 제약이 scope='national' 이면 school_id 를 **NULL 로 못 박는다**
 *    (진짜 DB 로 확인). 그래서 학교 거르개는 NULL 이라 버리고, 「시험 없는 것」은 exam_id 가 있어서
 *    또 버린다 — 모의고사 변형문제(자료 30가지 중 8가지)가 **통째로 사라졌다.**
 */
export const FILTERS = Object.freeze([
  { key: "all",      label: "전체" },
  { key: "national", label: "전국 시험 (학평·수능)" },
  { key: "noexam",   label: "시험 없는 것" },
]);

/** 거르개 — 'all' · 'national' · 'noexam' · 학교 id */
export function passesFilter(row, filter) {
  if (!filter || filter === "all") return true;
  const exams = row.exams ?? [];
  // ⚠️ 묶인 카드는 **`exams` 도 같이 본다.** exam_id 하나만 보면, 시험 없는 줄이 먼저 온 카드가
  //    (mergeSame 이 카드의 exam_id 를 null 로 두므로) 내신 자료인데 「시험 없는 것」에 뜬다
  if (filter === "noexam") return row.exam_id == null && exams.length === 0;
  if (filter === "national")
    return row.exam_scope === "national" || exams.some((e) => e.scope === "national");
  return row.school_id === filter || exams.some((e) => e.schoolId === filter);
}

/**
 * **「내 할 일」 한 판.**
 *
 * @param rows    loadTodos() 결과
 * @param filter  'all' · 학교 id · 'noexam'
 * @param today   '학원의 오늘'
 * @param classDays  수업일 (주말 당기기에 쓴다)
 *
 * @returns { groups[], aside, counts, late, moved }
 *
 * ⚠️ **칸을 순서로 읽지 마라**(㉟). 갈래는 「어느 단계까지 왔나」가 아니라
 *    **같은 일을 몰아서 하려고 묶은 것**이다. 왼쪽 칸을 다 비워야 오른쪽으로 가는 것이 아니다.
 */
export function board(rows = [], { filter = "all", today = null, classDays = [] } = {}) {
  // ⚠️⚠️ **학사일정을 맨 먼저 갈라낸다.** 예전에는 `pullBack()` 을 먹인 **뒤에** 갈랐다.
  //    학사일정은 원장님 할 일이 아니라 **학교가 정한 날**이라 당길 대상이 아닌데(㊲),
  //    개천절 2026-10-03 이 화면에 **2026-10-01** 로, 추석연휴 09-26 이 09-23 으로 떴다
  //    (진짜 DB 실측 3건 · 토·일에 선 kind='schedule' 이 28줄). 원장님이 휴강을 딴 날에 잡으신다.
  //    덤으로 `moved` 가 「3개를 앞 수업일로 당겼습니다」라고 세는데 셋 다 학사일정이라
  //    **진짜 할 일은 하나도 안 가리켰다.**
  const asideRows = [], mineRows = [];
  for (const r of rows) (ASIDE_KINDS.includes(String(r.kind)) ? asideRows : mineRows).push(r);

  // ⚠️ 학사일정은 **진짜 할 일과 섞어 묶지 않는다** — 섞으면 제목·마감이 같을 때 할 일을 삼킨다
  const merged = mergeSame(mineRows);
  const aside = mergeSame(asideRows)
    .map((r) => ({ ...r, due_on: r.due_on ? ymd(r.due_on) : null, pulled: null }));

  const bins = new Map(KINDS.map((k) => [k.key, []]));
  bins.set(OTHER.key, []);
  let moved = 0;

  for (const r of merged) {
    // 마감을 앞 수업일로 — **당긴 사실을 카드에 남긴다**. 조용히 옮기면 원장님이 딴 날을 기억하신다
    const pull = pullBack(r.due_on ? ymd(r.due_on) : null, classDays);
    const row = { ...r, due_on: pull.on ?? (r.due_on ? ymd(r.due_on) : null),
                  pulled: pull.moved ? pull : null,
                  // ⚠️ **못 당긴 까닭도 남긴다.** `pulled` 는 당겼을 때만 실리니, 「앞 7일에 수업일이
                  //    없다」는 토·일 마감은 사유조차 없이 주말에 그대로 서서 조용히 지나갔다
                  pullWarn: !pull.moved && /⚠️/.test(pull.why ?? "") ? pull.why : null,
                  dday: today ? dday(r.english_on, today) : null };
    // ⚠️ 거르개를 지난 것만 센다 — 화면에 없는 카드를 「N개를 당겼습니다」에 넣으면 숫자가 또 거짓말한다
    if (!passesFilter(row, filter)) continue;
    if (pull.moved) moved++;
    const bin = bins.get(groupOf(r.kind));
    // ⚠️ 여기서 던지는 것이 **일부러**다. `groupOf()` 가 일곱·`other` 밖의 답을 내면
    //    그 줄은 갈 칸이 없어 **조용히 사라진다** — 화면은 멀쩡하고 아무도 못 알아챈다.
    //    시끄럽게 터지는 쪽이 낫다(대전제 6 — 지우지 않는다).
    if (!bin) throw new Error(
      `⚠️ 갈 칸이 없는 할 일이 있다: kind=${JSON.stringify(r.kind)} → ${JSON.stringify(groupOf(r.kind))}. ` +
      `groupOf() 는 KINDS 일곱이나 '${OTHER.key}' 만 답해야 한다 — 그 밖을 답하면 줄이 사라진다`);
    bin.push(row);
  }

  const cmp = (a, b) =>
    (a.due_on ?? "9999-99-99").localeCompare(b.due_on ?? "9999-99-99") ||
    String(a.title ?? "").localeCompare(String(b.title ?? ""));

  const groups = [...KINDS, OTHER]
    .map((k) => ({ ...k, rows: (bins.get(k.key) ?? []).sort(cmp) }))
    .map((g) => ({ ...g, n: g.rows.length,
                   left: g.rows.filter((r) => r.state !== "done" && r.state !== "dropped").length }));

  const open = groups.flatMap((g) => g.rows).filter((r) => r.state !== "done" && r.state !== "dropped");
  return {
    groups,
    // ⚠️ 치운 것도 **세어서 말한다** — 조용히 사라지면 아무도 못 알아챈다
    aside: { key: "schedule", label: "옛 앱 학사일정 (일정 화면에서 봅니다)", rows: aside, n: aside.length },
    counts: { all: merged.length + aside.length, open: open.length, aside: aside.length },
    late: today ? open.filter((r) => r.due_on && r.due_on < ymd(today)) : [],
    moved,
  };
}

// ─────────────────────────────────────────────────────────────
// 6. 못 따라가는 시험에는 **「줄이기」를 먼저 권한다** (계획 ㉟)
// ─────────────────────────────────────────────────────────────

/**
 * 옥련여고는 **D-5 에 시작해 자료 8개가 남았다.** 지문 11개를 다 못 만든다.
 * → 「어느 것을 뺄지」를 그 자리에서 고르시게 한다. 밀린 뒤에 말하면 늦다.
 *
 * @param dday      남은 날 (음수면 시험이 지났다)
 * @param left      아직 안 만든 자료 (배열 또는 갯수)
 * @param perDay    하루에 몇 개까지 만드나 — **기본 1**
 * @param daysLeft  남은 **수업일** 수. 주면 이걸 쓴다 (없으면 남은 날)
 *
 * ⚠️ **`perDay` 기본 1 은 지어낸 속도가 아니라 「가장 느슨한 바닥」이다.**
 *    하루에 하나씩 해도 안 되면 확실히 못 따라간다. 원장님의 **진짜 속도는 ⚠️ 확인 안 됨** —
 *    계획서에 없다. 숫자를 지어내면 「괜찮다」고 해 놓고 시험 전날 자료가 없다.
 *    원장님이 바꾸실 값이면 `v2.auto_rule.threshold` 로 뺀다(자동화 뼈대 ⑤).
 */
export function trimAdvice({ dday: d = null, left = [], perDay = 1, daysLeft = null } = {}) {
  // ⚠️⚠️ **셈과 후보는 같은 자를 쓴다.** 예전에는 남은 갯수 `n` 이 `left` 를 **전부** 세는데
  //    뺄 후보 `pick` 은 **아직 안 만든 것만** 골랐다. 여덟 중 일곱을 이미 만들어 뒀는데도
  //    「3개를 빼시겠어요?」가 떴고 뺄 수 있는 것은 1개뿐이었다 — 원장님이 **안 빼도 될 자료를
  //    빼시면 시험 날 그 자료가 없다.** ㉟ 가 막으려던 것과 정반대다.
  const raw = Array.isArray(left) ? left : [];
  // 아직 손 안 댄 것 — **이것만이 「남은 일」이고, 뺄 수 있는 것도 이것뿐이다**
  const items = raw.filter(
    (x) => !x?.made_at && x?.state !== "made" && x?.state !== "printed" && x?.state !== "done");
  const n = Array.isArray(left) ? items.length : Number(left ?? 0);
  const already = Array.isArray(left) ? raw.length - items.length : 0;
  const madeNote = already ? ` (이미 만든 ${already}개는 뺐습니다)` : "";

  if (d == null) return { trim: false, why: "⚠️ 영어 시험일을 몰라 못 센다 — 한 줄 넣어 주세요" };
  if (n === 0) return { trim: false, n: 0, already, why: `남은 자료가 없다${madeNote}` };

  // ⚠️ 고친 값을 **한 번만 만들어** 셈과 글에 같이 쓴다. 예전에는 글이 `perDay` 를 날것으로 찍어
  //    「하루 0개로는 5개까지입니다」·「하루 -3개로는…」처럼 **글과 숫자가 서로 안 맞았다.**
  const per = Math.max(Number(perDay) || 1, 1);
  const days = daysLeft == null ? Math.max(d, 0) : Math.max(Number(daysLeft) || 0, 0);
  const can = Math.floor(days * per);        // 자료는 낱개다 — 2.5개까지 만든다고 하지 않는다

  // ⚠️ **시험이 지났으면 「빼시겠어요」가 아니다.** 이미 지난 시험에 8개를 빼라고 물으면
  //    원장님이 무엇을 하라는 것인지 알 수 없다 — 갈래를 나눈다.
  if (d < 0) return {
    trim: false, past: true, n, already, can, days, perDay: per, pick: items,
    ask: `${ddayLabel(d)} — 시험이 지났습니다. 남은 ${n}개를 어떻게 할까요?${madeNote}`,
    why: "시험이 지났다 — 줄이기를 권할 자리가 아니다",
  };

  if (n <= can) return { trim: false, over: 0, can, days, n, already, perDay: per,
                         why: `남은 ${n}개 · ${days}일이면 하루 ${per}개로 된다${madeNote}` };

  // 뺄 수 있는 것 — **아직 손 안 댄 것만.** 이미 만든 자료를 빼는 것은 한 일을 버리는 것이다.
  // ⚠️ **차례를 매기지 않는다.** 「무엇을 빼는 것이 나은가」는 계획서에 없다 —
  //    원장님이 그 자리에서 고르신다(㉟). 앱이 순위를 지어내면 잘못된 것을 먼저 권한다.
  return {
    trim: true, over: n - can, can, days, n, already, perDay: per,
    pick: items,
    ask: `${ddayLabel(d)} 인데 자료가 ${n}개 남았습니다. 하루 ${per}개로는 ${can}개까지입니다 — ` +
         `**${n - can}개를 빼시겠어요?**${madeNote}`,
    why: "⚠️ 못 따라간다 — 밀린 뒤가 아니라 지금 고르시는 것이 낫다",
  };
}

// ─────────────────────────────────────────────────────────────
// 7. DB 를 읽는 자리 — 값은 전부 $1·$2 로 (${…} 를 안 쓴다)
// ─────────────────────────────────────────────────────────────

const SQL_TODOS = `
  select t.id, t.kind, t.title, t.note, t.due_on, t.due_time, t.state, t.why,
         t.rule_id, t.student_id, t.exam_id, t.material_id, t.private, t.done_at,
         st.name as student_name,
         e.name as exam_name, e.english_on, e.scope as exam_scope, e.school_id,
         sc.name as school_name,
         m.title as material_title, m.state as material_state,
         m.made_at, m.printed_at, m.reuse_of,
         mt.name as type_name, mt.steps
    from v2.todo t
    left join v2.students st on st.id = t.student_id
    left join v2.exams e on e.id = t.exam_id
    left join v2.schools sc on sc.id = e.school_id
    left join v2.material m on m.id = t.material_id
    left join v2.material_type mt on mt.id = m.type_id
   where t.state = any($1::text[])
     -- ⚠️⚠️ 뒤쪽 창($2)은 **끝난 것에만** 건다. 안 끝난 것은 아무리 오래 밀렸어도 안 자른다 —
     --    예전에는 today-14 보다 오래 밀린 미완료가 **오류 없이 사라졌다**(실측 2026-09-02:
     --    미완료 7줄 중 「고등 클카 자료 업로드」·「중1~2 클카 자료 업로드」 둘이 빠져
     --    원장님은 밀린 일이 4개인 줄 아셨다). 가장 오래 밀린 것이 먼저 숨는 창이었다(대전제 6).
     -- ⚠️ **학사일정($6)은 그대로 창을 탄다** — 그건 원장님 할 일이 아니라 지나간 사실이라
     --    안 자르면 옆 상자가 32줄에서 168줄로 불어난다(실측). 안 자르는 것은 **할 일**뿐이다
     and ($2::date is null or t.due_on is null or t.due_on >= $2
          or (t.state not in ('done', 'dropped') and not (t.kind = any($6::text[]))))
     and ($3::date is null or t.due_on is null or t.due_on <= $3)
     and ($4::uuid is null or e.school_id = $4)
     and ($5::uuid is null or t.exam_id = $5)
   order by t.due_on nulls last, t.kind, t.title`;

/**
 * 할 일을 읽는다.
 * ⚠️ 기본 상태가 `todo·doing` 인 것에 주의 — **끝난 것까지 보려면 `state` 를 넘겨라.**
 *    기본에 `done` 을 넣으면 매일 목록이 길어져 원장님이 안 보시게 된다(대전제 3).
 */
export async function loadTodos(db, opts = {}) {
  const { rows } = await db.query(SQL_TODOS, [
    opts.state ?? ["todo", "doing"],
    opts.from ?? null, opts.to ?? null,
    opts.schoolId ?? null, opts.examId ?? null,
    [...ASIDE_KINDS],
  ]);
  return rows;
}

const SQL_MATERIALS = `
  select m.id, m.title, m.state, m.made_at, m.printed_at, m.reuse_of,
         m.exam_id, m.scope_id,
         -- 시험의 학교·범위를 여기서 같이 뽑는다. 안 뽑으면 자료로 세운 카드가
         --   passesFilter() 의 학교(row.school_id)·전국(row.exam_scope) 어디에도 안 걸려,
         --   원장님이 신정중 것만으로 좁히시는 순간 만들 자료가 통째로 사라진다
         --   (전국 시험이 어느 거르개에도 안 잡히던 사고 3 과 같은 사고다).
         e.scope as exam_scope, e.school_id, e.name as exam_name, e.english_on,
         sc.name as school_name,
         mt.id as type_id, mt.name as type_name, mt.steps, mt.sort,
         ps.book_id, ps.unit_id, ps.removed_on,
         rp.book_id as reuse_book_id,
         (select count(*)::int from v2.material_give g where g.material_id = m.id) as give_n,
         (select count(*)::int from v2.material_give g
           where g.material_id = m.id and g.handed_at is not null) as handed_n,
         (select count(*)::int from v2.material_give g
           where g.material_id = m.id and g.got_at is not null) as got_n,
         (select count(*)::int from v2.material_give g
           where g.material_id = m.id and g.stage = 'done') as done_n
    from v2.material m
    join v2.material_type mt on mt.id = m.type_id
    left join v2.exams e on e.id = m.exam_id
    left join v2.schools sc on sc.id = e.school_id
    left join v2.prep_scope ps on ps.id = m.scope_id
    left join v2.material r on r.id = m.reuse_of
    left join v2.prep_scope rp on rp.id = r.scope_id
   where m.state <> 'dropped'
     and ($1::uuid is null or m.exam_id = $1)
   order by mt.sort, m.title`;

/**
 * 시험 하나에 딸린 자료 — **「남은 것」 목록이다. 파이프라인이 아니다**(㉟).
 * ⚠️ **범위에서 빠진 것(`removed_on`)은 빼고 센다.** 학교가 3과를 빼면 12줄이 사라져야 하는데
 *    안 빼면 원장님이 **없어진 범위의 자료를 계속 만드신다**.
 */
export async function loadMaterials(db, { examId = null, on = null } = {}) {
  const { rows } = await db.query(SQL_MATERIALS, [examId]);
  const day = on ? ymd(on) : null;
  return rows
    .filter((r) => !(r.removed_on && (!day || ymd(r.removed_on) <= day)))
    .map((r) => ({
      ...r,
      reuse: reuseOfRow(r),
      step: stepNow(r, { steps: r.steps },
                    { n: r.give_n, handed: r.handed_n, got: r.got_n, done: r.done_n, scored: null }),
    }));
}

/**
 * 재시험 카드 — **못 넘은 시험을 할 일로 세운다.**
 *
 * ⚠️⚠️ **여기서 시험 표를 직접 읽지 않는다.** 통과 판정은 `lib/word.js` **한 곳**에 산다
 *    (원칙 1). 여기서 통과선을 한 번 더 비교하면 두 벌이 되고, 원장님이 어느 아이의 통과선만
 *    바꾸신 날 **두 화면이 서로 다른 아이를 재시험 대상이라고 말한다.**
 *    `scripts/check-word.mjs` 가 파일을 훑어 이 규칙을 지킨다 — 처음에 내가 여기서 걸렸다.
 *    → 시험방식·통과선이 필요하면 `word.js` 의 `styleOf()`·`cutFor()` 를 부른다.
 *
 * ⚠️ **확인 안 됨 — 「며칠 전 미통과가 아직 안 풀렸다」를 물을 자리가 없다.**
 *    `word.js` 의 `failedToday()` 는 **판 하나**를 본다. 기간으로 훑는 DB 함수가 없어서
 *    **지난주 미통과는 이 목록에 안 뜬다.** 지어내서 quiz 를 직접 읽으면 위의 두 벌이 된다.
 *    → 보고의 needsDb 에 `v2.retest_left()` 를 완성된 SQL 로 적어 두었다.
 *
 * ⚠️ 할 일에는 **교재명·시험방식**을 실어 준다 (사고대장 129 — 앱이 못 줄여 주는 진짜 일).
 *
 * @param sheets [{ id, student_id, student_name, date }] — 그날의 판들
 */
export async function retestCards(db, { sheets = [] } = {}) {
  const out = [];
  // ⚠️ 차례로 묻는다 — 연결 하나짜리 어댑터에 겹쳐 물으면 한쪽이 조용히 빈 답을 받는다
  for (const s of sheets) {
    for (const f of await failedToday(db, s.id)) {
      const pct = f.pct == null ? "미통과" : `${f.pct}%`;
      out.push({
        id: `retest:${f.quizId}`, kind: "retest",
        title: `${s.student_name ?? ""} ${f.label} ${pct} 재시험`.trim(),
        student_id: s.student_id ?? null, quiz_id: f.quizId,
        due_on: s.date ? ymd(s.date) : null, state: "todo",
        // ⚠️ **`v2.todo` 의 줄이 아니다** — 화면이 눌러도 아무 일이 안 나는 체크 단추를 안 붙이게 표시한다
        counted: true,
        why: "시험을 못 넘었다 — 앱이 세었다(원장님이 찾지 않는다)",
      });
    }
  }
  return out;
}

const SQL_SCORE_LEFT = `
  select st.id as student_id, st.name as student_name
    from v2.students st
    join v2.exams e on e.id = $1::uuid
   where st.state = 'active'
     and (e.scope = 'national' or st.school_id = e.school_id)
     and (e.grade is null or st.grade = e.grade)
     and not exists (select 1 from v2.score s
                      where s.student_id = st.id and s.exam_id = e.id)
   order by st.name`;

/** 성적 안 받은 아이. 세어 나오는 값이라 **저장하지 않는다**(원칙 5) */
export async function loadScoreLeft(db, examId) {
  const { rows } = await db.query(SQL_SCORE_LEFT, [examId]);
  return rows;
}

const SQL_EXAMS = `
  select e.id, e.scope, e.name, e.grade, e.term_from, e.term_to, e.english_on,
         e.school_id, sc.name as school_name
    from v2.exams e
    left join v2.schools sc on sc.id = e.school_id
   where e.state = 'active'
     and ($1::date is null or coalesce(e.english_on, e.term_to, e.term_from) >= $1)
   order by e.english_on nulls last, e.term_from nulls last, e.name`;

/**
 * 앞으로 올 시험.
 * ⚠️ **영어 시험일을 모르면 루틴을 안 세운다**(㉞ 실측 2). 나이스는 **기간만** 준다 —
 *    기간 끝으로 잡으면 **루틴 아홉이 전부 3일 늦게** 서서 D-7 배부가 D-4 가 된다.
 *    → `needsEnglishDate` 를 켜 두고 화면이 「영어일을 넣어 주세요」 한 줄을 띄운다.
 */
export async function loadExams(db, { from = null, today = null } = {}) {
  const { rows } = await db.query(SQL_EXAMS, [from]);
  return rows.map((e) => ({
    ...e,
    needsEnglishDate: e.english_on == null,
    dday: e.english_on && today ? dday(e.english_on, today) : null,
  }));
}

const SQL_SCHEDULE_ALL = `
  select from_date, to_date, weekdays
    from v2.class_schedule
   where from_date <= $2::date and (to_date is null or to_date >= $1::date)
   order by from_date`;

/** ⚠️ **학원 전체 휴강만** 본다. 반 하나만 쉬는 날은 원장님이 학원에 안 계신 날이 아니다 */
const SQL_HOLIDAY_ALL = `
  select date, class_id
    from v2.holiday
   where date between $1::date and $2::date and class_id is null`;

/**
 * 학원에 수업이 있는 날들 — **주말 당기기가 이걸 쓴다.**
 * ⚠️ 셈은 `lib/session.js` 의 `countDates()` 를 **그대로 부른다.** 여기서 다시 세면
 *    회차 화면과 할 일 화면이 **서로 다른 수업일**을 말하는 날이 온다(원칙 1).
 */
export async function academyDays(db, from, to) {
  const a = ymd(from), b = ymd(to);
  // ⚠️ **한 줄씩 차례로 묻는다.** `Promise.all` 로 겹쳐 물으면 연결 하나짜리 어댑터(`pg.Client`)에서
  //    「이미 다른 질문이 도는 중」이 되어 한쪽이 조용히 빈 답을 받는다 —
  //    수업일이 0개가 되고 **주말 당기기가 통째로 안 듣는다.** 오류는 안 난다.
  const sch = await db.query(SQL_SCHEDULE_ALL, [a, b]);
  const hol = await db.query(SQL_HOLIDAY_ALL, [a, b]);
  const { dates } = countDates({
    schedules: sch.rows, holidays: hol.rows, first: a, last: b, today: null,
  });
  return new Set(dates);
}

// ─────────────────────────────────────────────────────────────
// 8. 되풀이 — **`lib/queue.js` 가 만든다. 여기선 부르기만** (계획 ㊴)
// ─────────────────────────────────────────────────────────────

const SQL_ADD = `
  insert into v2.todo(kind, title, note, due_on, why, rule_id, student_id, exam_id, material_id)
  values ($1, $2, $3, $4::date, $5, $6::uuid, $7::uuid, $8::uuid, $9::uuid)
  returning id, kind, title, due_on, state, why, rule_id`;

/**
 * 할 일 한 줄을 세운다.
 * ⚠️ 저절로 생긴 것은 **「왜 생겼는지」를 외래키로** 가리킨다 — `rule_id` 와 `why` 를 같이 채운다.
 *    안 채우면 원장님이 「이게 왜 여기 있지」를 물을 자리가 없고, 규칙을 꺼도 카드가 남는다.
 */
export async function addTodo(db, one = {}) {
  const kind = groupOf(one.kind) === OTHER.key && !one.allowOther
    ? (() => { throw new Error(`⚠️ 모르는 할 일 종류: ${one.kind} — 아는 것: ${KINDS.map((k) => k.key).join(" · ")}`); })()
    : one.kind;
  if (!one.title) throw new Error("⚠️ 할 일에 제목이 없다 — 화면에 빈 줄이 선다");
  const { rows } = await db.query(SQL_ADD, [
    kind, one.title, one.note ?? null, one.dueOn ?? null, one.why ?? null,
    one.ruleId ?? null, one.studentId ?? null, one.examId ?? null, one.materialId ?? null,
  ]);
  return rows[0];
}

/**
 * 되풀이 할 일을 세운다 — **`planRecurring()` 을 부르기만 한다.**
 *
 * ⚠️ 열쇠(`auto_key`)·따라잡기·「이미 만들었나」는 전부 queue.js 가 이미 한다.
 *    여기서 다시 만들면 **두 벌**이 되고(원칙 1), 한쪽이 늙어 할 일이 하루에 둘씩 선다.
 *
 * ⚠️ 확인 안 됨 — `auto_rule.threshold` 의 모양이 계획서에 없다.
 *    `{ title, due_days }` 로 읽되, 없으면 **규칙 이름**과 **기준 날짜**를 그대로 쓴다.
 *    (기준 날짜를 마감으로 쓰는 것은 지어낸 숫자가 아니라 「안 미룬다」는 뜻이다.)
 * ⚠️ `baseDate` 는 **열쇠**다. 마감을 원장님이 미루셔도 열쇠는 안 건드린다 —
 *    건드리면 크론이 미룬 그 날짜 것을 **새로 하나 더 만든다**.
 */
/**
 * 되풀이 **할 일**을 세우는 `v2.auto_rule.kind` 값들.
 *
 * ⚠️⚠️ **확인 안 됨** — `auto_rule.kind` 에는 check 제약도, 계획서의 값 목록도 없고,
 *    진짜 DB 의 `auto_rule` 은 **0줄**이다(실측 2026-09-02). 레포 안의 유일한 실물은
 *    `scripts/check-cron.mjs` 의 fixture 인 `kind:'repeat'` 하나다.
 *    그래서 **한 글자에 걸지 않고 둘 다 받는다** — 맞는 쪽을 빼면 그 규칙이 **영영 안 서고**,
 *    틀린 쪽을 넣어도 그 갈래 규칙이 없으면 아무 일도 안 일어난다(안전한 쪽으로 틀린다).
 * ⚠️ 여기 없는 갈래(notify·purge…)를 **조용히 안 버린다** — 몇 개를 왜 건너뛰었는지
 *    `planRepeats()` 가 `skippedKinds` 로 돌려주고 화면이 그대로 띄운다(대전제 6).
 *    원장님이 진짜 값을 알려 주시면 여기 한 줄로 좁힌다.
 */
export const REPEAT_KINDS = Object.freeze(["repeat", "todo"]);

export async function planRepeats(db, opts = {}) {
  const today = assertToday(opts.today, "planRepeats");
  // ⚠️⚠️ **갈래를 못 박는다.** `autoRules(db)` 는 kind 가 기본 null 이라 **켜져 있는 규칙 전부**를
  //    가져온다. 그래서 kind='notify'(데일리리포트)·kind='purge'(파기 훑기)까지 **원장님이 손으로
  //    체크할 할 일 카드**로 섰다 — 앱이 저절로 하는 일인데 원장님 손이 는다(대전제 3).
  //    게다가 같은 규칙이 발송 쪽에서도 돌면 `auto_key`(rule_id, base_date) 도장이 하나뿐이라
  //    **먼저 찍는 쪽이 이기고 다른 쪽은 조용히 건너뛴다**(원칙 1 두 벌).
  const kinds = opts.kinds ?? (opts.kind ? [opts.kind] : REPEAT_KINDS);
  // ⚠️ 거르는 자리를 **JS 한 곳**으로 둔다 — `autoRules(db, kind)` 는 글자 하나만 받아서
  //    갈래가 둘 이상이면 두 번 물어야 하고, 그러면 「무엇을 건너뛰었나」를 셀 수가 없다
  const allRules = opts.rules ?? await autoRules(db);
  const rules = opts.rules ?? allRules.filter((r) => kinds.includes(String(r.kind)));
  const skippedKinds = opts.rules
    ? [] : [...new Set(allRules.filter((r) => !kinds.includes(String(r.kind)))
                               .map((r) => String(r.kind)))];

  // ⚠️ 수업일을 안 넘기면 **스스로 읽는다.** 빈 채로 돌면 pullBack 이 앞 7일에서 수업일을 못 찾아
  //    마감이 **일요일에 그대로 서고** 오류도 화면도 멀쩡하다(㉞ 실측 3 이 통째로 안 듣는다).
  const classDays = opts.classDays ?? await academyDays(db, today, addDays(today, 60));
  const noDays = (classDays instanceof Set ? classDays.size : [...classDays].length) === 0;

  const made = [], failed = [];
  const out = await planRecurring(db, {
    ...opts, today, rules,
    // ⚠️⚠️ **여기서 던지면 되풀이 할일이 영영 안 선다.** queue.js 는 `claimKey`(도장)를 `make` 보다
    //    **먼저** 찍는다(lib/queue.js:415). 그래서 한 번 던지면 auto_key 만 남고 할일은 안 남아,
    //    다음 날부터 크론이 조용히 `already` 만 올린다 — 원장님은 첫날 500 을 한 번 보고
    //    그 뒤로는 「수납안내가 그냥 안 뜬다」로 몇 달을 겪는다.
    //    → 모양이 틀리면 **던지지 말고 `failed` 로 돌려주고 화면이 그 까닭을 띄운다.**
    //    (도장을 지우는 길은 만들지 않는다 — 대전제 6)
    make: async ({ rule, baseDate }) => {
      const th = rule.threshold ?? {};
      const title = th.title || rule.name;
      if (!title) {
        failed.push({ rule, why: `⚠️ 규칙(${rule.id})에 제목도 이름도 없어 할 일을 안 세웠습니다` });
        return;
      }
      if (th.due_days != null && !Number.isFinite(Number(th.due_days))) {
        // ⚠️ 이걸 안 막으면 addDays(baseDate, NaN) 이 "NaN-NaN-Na" 를 만들고
        //    진짜 Postgres 가 'invalid input syntax for type date' 로 거절한다(진짜 DB 로 확인)
        failed.push({ rule, why: `⚠️ 규칙 「${rule.name}」의 due_days 가 숫자가 아니라` +
                                 `(${JSON.stringify(th.due_days)}) 할 일을 안 세웠습니다` });
        return;
      }
      const raw = th.due_days == null ? baseDate : addDays(baseDate, Number(th.due_days));
      const due = pullBack(raw, classDays);
      // ⚠️ `due.why` 는 **당겼을 때만이 아니라 늘** 싣는다 — 「앞 7일에 수업일이 없다」도 카드에 남아야
      //    수업일을 몰라 안 당긴 것이 조용히 지나가지 않는다
      const why = `되풀이 규칙 「${rule.name}」 — ${baseDate} 몫`
        + (due.why ? ` (${due.why})` : "")
        + (noDays && isWeekend(due.on) ? " ⚠️ 수업일을 몰라 안 당겼다" : "");
      try {
        made.push(await addTodo(db, { kind: "repeat", title, dueOn: due.on, ruleId: rule.id, why }));
      } catch (e) {
        // ⚠️ 여기서 다시 던지지 않는다 — 도장은 이미 찍혔고, 던지면 그 규칙이 영영 안 선다
        failed.push({ rule, why: `⚠️ 규칙 「${rule.name}」 — ${e.message}` });
      }
    },
  });
  // ⚠️ `made` 는 「도장을 찍었다」는 뜻이고 `todos` 가 「실제로 선 할 일」이다. 다르면 `failed` 를 보라
  return { ...out, todos: made, failed, kinds, skippedKinds,
           why: skippedKinds.length
             ? `되풀이 할 일로 안 세운 규칙 갈래: ${skippedKinds.join(" · ")}` +
               ` (할 일로 보는 갈래: ${kinds.join(" · ")})`
             : null };
}

const SQL_SHEETS_ON = `
  select s.id, s.student_id, s.date::text as date, st.name as student_name
    from v2.day_sheet s
    join v2.students st on st.id = s.student_id
   where s.date = $1::date
   order by st.name`;

/**
 * 그날의 판들 — **재시험 카드를 세우는 데만 쓴다. 읽기만 한다.**
 * ⚠️ 판을 **쓰는** 자리는 `lib/attend.js` 한 곳뿐이다(원칙 1 · check-attend.mjs 가 지킨다).
 */
export async function sheetsOn(db, on) {
  const { rows } = await db.query(SQL_SHEETS_ON, [ymd(on)]);
  return rows.map((r) => ({ id: r.id, student_id: r.student_id,
                            student_name: r.student_name, date: r.date }));
}

/** 자료 걸음에서 **일곱 칸에 그대로 서는** 걸음 셋. ⚠️ `solve`·`score` 는 여기 안 넣는다 —
 *  걸음의 `score`(채점)를 할 일 종류의 `score`(성적 받기)와 섞으면
 *  **성적 받기 카드가 화면에서 사라진다**(위의 ⚠️⚠️) */
export const MATERIAL_CARD_STEPS = Object.freeze(["make", "print", "hand"]);

/**
 * **찍을 칸이 없어 멈춘 걸음**의 갈래 글자. `KINDS` 일곱에 절대 안 겹치게 앞에 `step:` 을 붙인다 —
 * 붙이지 않으면 `at='score'`(채점) 카드가 `groupOf('score')` 로 **성적 받기 칸**에 서서
 * 위의 ⚠️⚠️ 를 그대로 낸다. 앞을 붙여 두면 `groupOf()` 가 「그 밖」으로 보낸다.
 */
export const stuckKind = (step) => `step:${String(step ?? "")}`;

/**
 * **세어 나오는 카드** — DB 의 `v2.todo` 에 줄이 없어도 서야 하는 것들. (원칙 5 — 저장하지 않는다)
 *
 * ⚠️⚠️ 이걸 안 합치면 「내 할 일」의 **일곱 칸이 전부 빈다.** 실측(2026-09-02)으로
 *    `myTodos()` 는 옛 앱 손할일 5줄 말고는 아무것도 안 세웠다 — 오늘 단어를 못 넘은 아이도,
 *    성적을 안 받은 아이도 안 떴다. 원장님이 재시험 대상을 손으로 찾으셔야 했다(대전제 3).
 *
 * ⚠️ **마감을 지어내지 않는다.** 재시험만 판의 날짜라는 근거가 있고,
 *    성적 받기·자료 걸음은 계획서에 마감 규칙이 없어 `due_on = null` 로 둔다(대전제 0).
 * ⚠️ **두 벌을 막는다**(원칙 1) — 같은 자료를 가리키는 `v2.todo` 줄이 이미 있으면 카드를 안 세운다.
 *
 * ⚠️⚠️ 여기서 나오는 카드는 **`v2.todo` 의 줄이 아니다**(id 가 `retest:…`·`score:…`·`material:…`).
 *    그래서 전부 `counted: true` 를 달고 나간다 — 화면이 이걸 보고 「체크하면 어디에 쓸지」가
 *    아직 없는 카드에 **눌러도 아무 일이 안 나는 체크 단추**를 안 붙일 수 있다.
 */
export async function countedCards(db, { today, from = null, sheets = null, todos = [] } = {}) {
  assertToday(today, "countedCards");
  const out = [];

  // ① 재시험 — 판정은 lib/word.js 한 곳(원칙 1). 판 하나씩 **차례로** 묻는다
  out.push(...await retestCards(db, { sheets: sheets ?? await sheetsOn(db, today) }));

  // ② 성적 받기 — **영어 시험일이 지난** 시험만 (아직 안 온 시험 성적을 달라고 할 수는 없다)
  for (const e of await loadExams(db, { from, today })) {
    if (!e.english_on || ymd(e.english_on) > ymd(today)) continue;
    for (const st of await loadScoreLeft(db, e.id))
      out.push({ id: `score:${e.id}:${st.student_id}`, kind: "score",
                 title: `${st.student_name ?? ""} ${e.name} 성적 받기`.trim(),
                 student_id: st.student_id, exam_id: e.id, exam_name: e.name,
                 exam_scope: e.scope ?? null, school_id: e.school_id ?? null,
                 school_name: e.school_name ?? null, english_on: e.english_on,
                 due_on: null, state: "todo", counted: true,
                 why: "시험이 끝났는데 성적이 안 들어왔다 — 앱이 세었다(원장님이 찾지 않는다)" });
  }

  // ③ 자료 걸음 — 「지금 어느 걸음인가」를 그 갈래의 카드로
  const already = new Set(todos.map((t) => t.material_id).filter(Boolean));
  for (const m of await loadMaterials(db, { on: today })) {
    if (already.has(m.id)) continue;
    const at = m.step?.at;
    // ⚠️⚠️ **시험의 학교·범위를 카드에 같이 싣는다.** 안 실으면 `passesFilter()` 가 학교도 전국도
    //    못 봐서, 신정중 시험 자료인데 「신정중 것만」으로 좁히는 순간 **통째로 사라진다**.
    const of = { material_id: m.id, exam_id: m.exam_id ?? null,
                 exam_name: m.exam_name ?? null, exam_scope: m.exam_scope ?? null,
                 school_id: m.school_id ?? null, school_name: m.school_name ?? null,
                 english_on: m.english_on ?? null,
                 due_on: null, state: "todo", counted: true, step: at ?? null };
    // ⚠️ **걸음표가 아예 없는 자료도 안 버린다.** `stepNow()` 는 「⚠️ 자료 종류에 걸음이 안 적혀
    //    있다」로 제대로 답하는데, 카드를 안 세우면 `at` 이 null 이라 아래 `continue` 에 걸려
    //    **끝난 자료와 똑같이 조용히 사라진다** — 위의 upload 와 같은 사고다(대전제 6).
    if (m.step?.steps == null) {
      out.push({ id: `material:${m.id}:nosteps`, kind: stuckKind("nosteps"),
                 title: `${m.title} — ⚠️ 자료 종류에 걸음이 안 적혀 있다`, ...of,
                 why: m.step?.why ?? "⚠️ 확인 안 됨 — 자료 종류에 걸음이 안 적혀 있다" });
      continue;
    }
    if (at == null) continue;                     // 걸음을 다 밟았다 — 세울 카드가 없다
    if (MATERIAL_CARD_STEPS.includes(at)) {
      out.push({ id: `material:${m.id}:${at}`, kind: at, title: m.title, ...of,
                 why: `자료 걸음 — 지금은 「${stepLabel(at)}」다 (앱이 세었다)` });
      continue;
    }
    // ⚠️⚠️ **찍을 칸이 없어 멈춘 걸음도 카드로 세운다.** 예전에는 걸음 셋만 세워서,
    //    `steps` 에 'upload' 가 든 클래스카드 자료가 `stepNow()` 는 ⚠️ 까지 제대로 답하는데
    //    **카드도 안 서고 경보도 안 떠서** 끝도 할 일도 아닌 자리로 조용히 사라졌다(대전제 6).
    //    갈래는 `stuckKind()` 로 「그 밖」에 보낸다 — 걸음의 `score`(채점)를 그대로 쓰면
    //    할 일 종류의 `score`(성적 받기) 칸에 서서 그 칸을 어지럽힌다.
    if (m.step?.unknown?.includes(at))
      out.push({ id: `material:${m.id}:${at}`, kind: stuckKind(at),
                 title: `${m.title} — ⚠️ 「${stepLabel(at)}」 걸음을 찍을 칸이 없다`,
                 ...of, unknown: m.step.unknown,
                 why: m.step.why ?? `⚠️ 확인 안 됨 — ${stepLabel(at)} 을 찍을 칸이 없다` });
    // ⚠️ `solve`(아이가 푸는 중)는 세지 않는다 — 찍을 칸(`material_give.stage`)이 있어서
    //    「모른다」가 아니고, 원장님 손이 갈 일도 아니다(대전제 3)
  }
  return out;
}

/**
 * 한 판 — 화면 하나가 부르는 자리.
 * ⚠️ **여기서 아무것도 안 쓴다.** 읽고 세기만 한다(원칙 5 · 계획 (e) ⑨).
 *
 * ⚠️ **화면은 이것 하나만 부르면 된다.** `v2.todo` 줄과 **세어 나오는 카드**(재시험·성적 받기·
 *    자료 걸음)를 여기서 합쳐 준다 — 화면이 `retestCards()` 를 따로 부르지 않아도 된다.
 *    (`counted: false` 로 끄면 DB 줄만 본다.)
 */
export async function myTodos(db, { today, filter = "all", from = null, to = null,
                                    sheets = null, counted = true } = {}) {
  assertToday(today, "myTodos");
  const a = from ?? addDays(today, -14), b = to ?? addDays(today, 60);
  // ⚠️ 차례로 묻는다 — `academyDays()` 의 까닭과 같다
  // ⚠️⚠️ **학교 거르개를 SQL 에 안 넘긴다.** SQL 의 `e.school_id = $4` 는 시험이 안 붙은 줄
  //    (학사일정 226줄 · 되풀이 · 손할일)과 **전국 시험**(제약이 school_id 를 NULL 로 못 박는다)을
  //    통째로 버린다 — 학교를 고르는 순간 「학사일정 32개」 줄까지 사라졌다.
  //    거르는 자리는 `passesFilter()` **한 곳**이다(원칙 1).
  const rows = await loadTodos(db, { from: a, to: b });
  // ⚠️ 수업일만 **앞으로 7일 더 넓게** 읽는다 — `pullBack()` 이 앞 7일을 되돌아보는데 그 7일이
  //    창 밖이면 창 왼쪽 끝의 토·일 마감이 **안 당겨지고 사유까지 거짓말**이 된다
  //    (실측 today='2026-09-05': 창으로는 「앞 7일에 수업일이 없다」, 넓게 보면 8/20 목요일이 수업일).
  //    목록(`loadTodos`)의 창은 그대로 둔다 — 길어지면 원장님이 안 보신다.
  // ⚠️⚠️ **수업일의 왼쪽 끝은 창이 아니라 「가장 오래 밀린 줄」이 정한다.** 안 끝난 할 일은
  //    아무리 오래 밀렸어도 창을 안 타고 그대로 오는데(위의 SQL), 수업일만 `a-7` 까지 읽으면
  //    창보다 훨씬 오래된 토·일 마감은 앞 수업일을 못 찾아 **주말 당기기가 그 줄에서만 안 듣는다**
  //    (실측 2026-09-02: 마감 2026-06-06(토)이 그대로 서고 `pulled` 도 null — 넓게 보면 06-04 가 수업일).
  const earliest = rows.reduce(
    (min, r) => (r.due_on && ymd(r.due_on) < min ? ymd(r.due_on) : min), ymd(a));
  const classDays = await academyDays(db, addDays(earliest, -7), b);
  const extra = counted ? await countedCards(db, { today, from: a, sheets, todos: rows }) : [];
  return board([...rows, ...extra], { filter, today, classDays });
}
