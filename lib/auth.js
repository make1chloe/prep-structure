/**
 * 로그인 — **아이디를 짓고, 화면이 받은 글자를 로그인용으로 바꾼다.**
 *
 * 여기엔 판단만 산다. 화면은 없다. DB 는 `{ query(sql, params) }` 하나로 받는다
 * (검사가 가짜 DB 를 끼워 실제로 돌린다 — scripts/check-auth.mjs).
 *
 * ── 어디까지 SQL 이고 어디부터 JS 인가 (원칙 1 — 같은 판단을 두 벌로 두지 않는다)
 *
 *   **SQL 이 이미 갖고 있다. JS 는 부르기만 한다:**
 *     v2.make_login_id(role, phone)   아이디를 짓는 규칙        (0033)
 *     v2.login_id_odd()               어긋난 아이디를 세운다     (0034)
 *     profiles_login_id_shape         모양 제약                 (0034, NOT VALID)
 *     profiles_login_id_key           login_id 유일 (부분 유니크 인덱스, 0032)
 *
 *   **JS 만 갖는다 (SQL 에 아예 없다):**
 *     '@chloe-eng.internal' 을 붙이는 일   ← **이 파일에서만** 붙인다
 *     원장·강사의 **진짜 이메일**과 아이·학부모를 가르는 일
 *     로그인 화면에서 친 글자를 다듬는 일 (아직 로그인 전이라 눈앞에서 해야 한다)
 *
 *   ⚠️ **두 벌이 되는 자리가 딱 하나 있다 — 전화번호를 숫자만 남기는 일.**
 *      SQL 의 `regexp_replace(phone,'[^0-9]','','g')` 와 여기 `normPhone` 이 같은 일을 한다.
 *      로그인 화면은 로그인 **전**이라 DB 왕복 없이 눈앞에서 다듬어야 해서 어쩔 수 없다.
 *      그래서 scripts/check-auth.mjs 가 **같은 입력으로 SQL 과 JS 를 맞대어** 어긋나면 실패시킨다.
 *      **그 맞대는 검사를 지우면 두 벌이 조용히 갈린다** — 지우지 마라.
 *
 * ── ⚠️ 대전제 12 — **비밀번호는 만들지도 바꾸지도 않는다.**
 *      이 파일에는 비밀번호를 건드리는 함수가 **하나도 없다.** 앞으로도 넣지 마라.
 *      까닭: 임시 비밀번호는 `0000` 하나뿐이고 `must_change_pw` 를 켜는 것이 곧 초기화다.
 *      켜는 순간 **그 아이는 그날 지금 쓰는 앱에 못 들어간다.** 새 앱 계정이 아니라
 *      운영 중인 그 아이 계정이다. 로그인 판정은 `v2.profiles` 가 아니라 `auth` 가 한다.
 *      → 이 파일은 `must_change_pw` 를 **읽지도 쓰지도 않는다.**
 */

/**
 * 화면에는 **절대 안 보이는** 속 도메인 (원장님 확정).
 * 인증이 이메일 자리를 요구해서 속으로만 붙이는 것이고, 원장님·아이가 칠 글자가 아니다.
 * ⚠️ 이 글자는 **이 파일 밖 어디에도 두지 마라.** 두 군데가 되면 한쪽만 고쳐져
 *    그날부터 그 화면으로 들어온 사람만 로그인이 안 되고, 원장님 화면은 멀쩡해서 며칠간 모른다.
 */
export const INTERNAL_DOMAIN = "chloe-eng.internal";

/**
 * 전화번호 모양.
 * ⚠️ 지어낸 정규식이 아니라 **DB 제약 `profiles_login_id_shape`(0034)에서 그대로 가져왔다.**
 *    DB 쪽이 바뀌면 scripts/check-auth.mjs 가 제약 원문과 맞대어 보고 실패한다.
 */
const PHONE_SHAPE = /^01[0-9]{8,9}$/;

/** 아이디를 못 지은 까닭 — 화면은 이 코드로 갈래를 잡고, 글은 `msg` 를 그대로 쓴다 */
const hold = (why, msg, extra = {}) => ({ ok: false, why, msg, loginId: null, ...extra });

/**
 * 전화번호에서 숫자만 남긴다.
 * `010-1234-5678` · `01012345678` · ` 010 1234 5678 ` 가 **같은 것**이 되게 하는 유일한 자리.
 */
export function normPhone(raw) {
  return String(raw ?? "").replace(/[^0-9]/g, "");
}

/**
 * 두 전화번호가 같은 번호인가.
 * ⚠️ **둘 다 비어 있으면 「같다」가 아니다.** 빈 것끼리 같다고 하면
 *    전화번호가 없는 학생 23명이 전부 한 사람으로 뭉쳐 남의 계정에 붙는다.
 */
export function samePhone(a, b) {
  const x = normPhone(a), y = normPhone(b);
  return x !== "" && x === y;
}

/** 전화번호로 쓸 만한 모양인가 (DB 제약과 같은 잣대) */
export function phoneOk(raw) {
  return PHONE_SHAPE.test(normPhone(raw));
}

/**
 * 화면이 받은 글자 → **로그인용 이메일**. `@chloe-eng.internal` 은 여기서만 붙는다.
 *
 * 받는 것 세 가지 — 세 갈래로 갈린다:
 *   `bdyj10@gmail.com`   진짜 이메일 → **그대로** 쓴다 (원장·강사). 도메인을 덧붙이면 원장님이 못 들어온다
 *   `010-1234-5678`      전화번호   → 숫자만 남겨 붙인다 (학부모)
 *   `chloe0515`          아이디     → 그대로 붙인다 (학생)
 *
 * ⚠️ 속 도메인을 **이미 붙여 친 글자**도 받는다 (`chloe0515@chloe-eng.internal`).
 *    두 번 붙이면 `...internal@...internal` 이 되어 아무도 못 들어온다.
 *
 * @returns { ok, email, id, typedAs:'email'|'phone'|'id', why?, msg? }
 */
export function toLoginEmail(typed) {
  const raw = String(typed ?? "").trim();
  if (!raw) return { ok: false, why: "empty", msg: "아이디를 안 쳤다", email: null, id: null, typedAs: null };

  const low = raw.toLowerCase();               // 이메일은 대소문자를 안 가린다. 아이디도 전부 소문자다
  const at = low.lastIndexOf("@");
  if (at > 0) {
    const dom = low.slice(at + 1);
    // 바깥 이메일 — 원장·강사다. 손대지 않는다
    if (dom !== INTERNAL_DOMAIN) return { ok: true, email: low, id: low, typedAs: "email" };
    // 속 도메인을 이미 붙여 쳤다 — 벗겨서 아래로 보낸다 (두 번 안 붙는다)
    return fromTypedId(low.slice(0, at));
  }
  return fromTypedId(low);
}

/** 도메인이 안 붙은 글자를 이메일로 바꾼다 */
function fromTypedId(part) {
  // ⚠️ 폰 자판이 끝에 공백을 넣는다. 로그인 아이디에는 공백이 없으므로 안쪽까지 턴다
  const bare = String(part ?? "").replace(/\s+/g, "");
  if (!bare) return { ok: false, why: "empty", msg: "아이디를 안 쳤다", email: null, id: null, typedAs: null };

  // 숫자·전화 기호만 쳤으면 전화번호로 본다 (학부모)
  if (/^[0-9+\-().]+$/.test(bare)) {
    const digits = normPhone(bare);
    if (!PHONE_SHAPE.test(digits)) {
      return { ok: false, why: "bad-phone", email: null, id: digits, typedAs: "phone",
               msg: `전화번호 모양이 아니다 — 010 으로 시작하는 10~11자리여야 한다 (${digits.length}자리를 쳤다)` };
    }
    return { ok: true, email: `${digits}@${INTERNAL_DOMAIN}`, id: digits, typedAs: "phone" };
  }
  return { ok: true, email: `${bare}@${INTERNAL_DOMAIN}`, id: bare, typedAs: "id" };
}

/**
 * 로그인용 이메일 → **화면에 보일 아이디.** 속 도메인을 벗긴다.
 * ⚠️ 화면에 `@chloe-eng.internal` 이 뜨면 원장님이 그걸 아이에게 불러 주게 되고,
 *    아이는 그걸 이메일이라 믿는다. 어디에도 안 보인다 — 그러라고 있는 함수다.
 */
export function displayLoginId(emailOrId) {
  const s = String(emailOrId ?? "").trim().toLowerCase();
  if (!s) return "";
  const suf = "@" + INTERNAL_DOMAIN;
  return s.endsWith(suf) ? s.slice(0, -suf.length) : s;   // 진짜 이메일은 그대로 보여 준다
}

/**
 * 아이디를 짓는다 — **규칙은 SQL 이 갖고 있다.** 여기서는 부르고, 못 지을 자리를 **보류**로 막는다.
 *
 * ⚠️ **실측 2026-09-02 — `v2.profiles.phone` 이 48명 전원 비어 있다** (학생 23·학부모 21·원장 2·강사 2).
 *    그래서 **지금은 이 함수로 아무의 아이디도 다시 지을 수 없다.** 전부 보류로 돌아온다.
 *    이미 있는 아이디 21개(학생)·20개(학부모)는 옛 앱에서 넘어온 값이고, 되돌려 계산할 근거가 없다.
 *
 * ⚠️ **SQL 을 그대로 믿지 않는다.** 실측으로 확인한 함정:
 *      make_login_id('student', null)    → `'chloe'`      (아이디가 아니다)
 *      make_login_id('student', '')      → `'chloe'`
 *      make_login_id('student', '010-12')→ `'chloe1012'`  (**그럴듯해서 더 위험하다**)
 *    `'chloe'` 를 그대로 저장하면 전화번호 없는 아이 전부가 같은 아이디가 되어
 *    두 번째 아이부터 유니크 인덱스에서 터지고, 첫 아이는 **틀린 아이디로 조용히 산다.**
 *    → 전화번호가 제 모양이 아니면 **SQL 을 부르지도 않는다.**
 *
 * @returns { ok:true, loginId } | { ok:false, why, msg, loginId:null }
 */
export async function makeLoginId(db, role, phone) {
  if (role !== "student" && role !== "parent")
    return hold("staff-no-id", "원장·강사는 진짜 이메일로 들어온다 — 아이디를 안 만든다");

  const digits = normPhone(phone);
  if (!digits)
    return hold("no-phone", "전화번호가 없어 아이디를 지을 수 없다 — **보류**. 원장님이 번호를 넣어 주셔야 한다");
  if (!PHONE_SHAPE.test(digits))
    return hold("bad-phone",
      `전화번호가 010 으로 시작하는 10~11자리가 아니다 (${digits.length}자리) — **보류**`);

  const { rows } = await db.query(`select v2.make_login_id($1,$2) as login_id`, [role, digits]);
  const loginId = rows?.[0]?.login_id ?? null;

  // ⚠️ SQL 이 반쪽짜리를 돌려줬는지 마지막으로 본다 — 뒤 4자리가 안 들어 있으면 아이디가 아니다
  if (!loginId || !loginId.includes(digits.slice(-4)))
    return hold("sql-empty", `DB 가 아이디를 못 지었다 (받은 값: ${JSON.stringify(loginId)}) — **보류**`);

  return { ok: true, loginId };
}

/** 그 아이디를 이미 쓰는 사람 (없으면 null) */
export async function findByLoginId(db, loginId) {
  if (!loginId) return null;
  const { rows } = await db.query(
    `select id, role, name, login_id from v2.profiles where login_id = $1`, [loginId]);
  return rows?.[0] ?? null;
}

/**
 * 아이디를 **발급**한다 — 짓고, 겹치는지 보고, 로그인용 이메일까지 돌려준다.
 * **저장은 안 한다.** 저장은 부르는 쪽이 한다 (여기서 쓰면 아이디 발급이 두 군데가 된다).
 *
 * ⚠️ **겹치면 여기서 멈춘다 — 뒤에 숫자를 붙이지 않는다.** 규칙이 아직 없기 때문이다.
 *    실측: 지금 DB 에 `chloe8729`(박주영)와 `chloe8729-2`(박주하)가 **둘 다 있다.**
 *    박주영 학부모 폰이 `01062908729` 라 뒤 4자리가 같아서 벌어진 일이고,
 *    옛 앱은 `-2` 를 붙여 풀었다. **그런데 지금 제약 `profiles_login_id_shape` 는
 *    `^chloe[0-9]{4}$` 만 허용해서 `-2` 를 새로 넣으면 DB 가 거절한다**
 *    (기존 줄은 `NOT VALID` 라 살아 있을 뿐이다).
 *    → 규칙이 서로 어긋난 채다. **원장님이 정하실 자리**이므로 지어내지 않고 보류로 돌려준다.
 *
 * @returns { ok:true, loginId, email } | { ok:false, why, msg, loginId?, holder? }
 */
export async function issueLoginId(db, { role, phone } = {}) {
  const made = await makeLoginId(db, role, phone);
  if (!made.ok) return made;

  const holder = await findByLoginId(db, made.loginId);
  if (holder) {
    return { ok: false, why: "taken", loginId: made.loginId, holder,
      msg: `이 아이디는 ${holder.name} 님이 이미 쓴다 — 형제이거나 뒤 4자리가 같다. ` +
           `**규칙이 아직 없어 보류**한다 (옛 앱은 '-2' 를 붙였지만 지금 제약이 그 모양을 막는다)` };
  }
  return { ok: true, loginId: made.loginId, email: `${made.loginId}@${INTERNAL_DOMAIN}` };
}

/**
 * 규칙에 안 맞는 아이디를 세운다 — **세는 일도 SQL 이 한다** (원칙 1·5).
 * 실측 2026-09-02 — 1건 (`chloe8729-2`, 박주하).
 */
export async function loginIdOdd(db) {
  const { rows } = await db.query(`select * from v2.login_id_odd()`);
  return rows ?? [];
}

/**
 * 아이디를 다시 지을 수 있는 사람이 몇이나 되나 — **전화번호가 있어야 지을 수 있다.**
 * ⚠️ 실측 2026-09-02 — `canMake` 가 **0명**이다. `phone` 이 전원 비어 있어서다.
 *    전화번호를 채우기 전에는 아이디 발급 화면을 만들어도 아무 일도 안 일어난다.
 */
export async function loginIdCoverage(db) {
  const { rows } = await db.query(
    `select role,
            count(*)::int                                             as people,
            count(login_id)::int                                      as has_id,
            count(*) filter (where phone is not null and phone <> '')::int as has_phone
       from v2.profiles
      where role in ('student','parent')
      group by role order by role`);
  return (rows ?? []).map(r => ({ ...r, canMake: r.has_phone }));
}
