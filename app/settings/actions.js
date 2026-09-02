"use server";

/**
 * 설정 화면이 **쓰는** 자리.
 *
 * ⚠️ **판단이 아니다.** 여기 있는 것은 전부 「원장님이 고른 값을 그대로 옮겨 적기」다.
 *    세는 것·가르는 것은 한 줄도 없다.
 *
 * ⚠️ **진도 체크 「끄기」를 여기서 새로 짜지 않았다.** 그 문장은 이미
 *    `app/_home/actions.js` 의 `turnProgressEditOff()` 하나뿐이다 (대시보드 맨 위 줄이 부른다).
 *    여기서 같은 `update` 를 한 벌 더 적으면 **원칙 1 위반**이고,
 *    한쪽만 고치는 날 「대시보드에서는 꺼지는데 설정에서는 안 꺼진다」가 된다.
 *    → **켜기만 여기 있다.** 대시보드에는 켜는 자리가 없기 때문이다.
 *
 * ⚠️ **몇 줄이 실제로 바뀌었나를 확인한다** (계획 자동 검사 ⑪).
 *    접근 규칙이 막았는데 화면이 「저장됨」이라 말하면, 원장님은 바꿨다고 믿고 값은 그대로다.
 *    0줄이면 **실패로 돌려준다.**
 *
 * ⚠️ 여기서도 **그 사람이 되어** 쓴다 (`set local role authenticated`).
 *    서비스 열쇠를 쓰면 학생·학부모가 이 동작을 불러도 그대로 통과한다.
 *
 * ⚠️ `alert`/`confirm` 을 안 쓴다 — 부르는 쪽(`app/settings/parts.js`)이 화면 안에 글로 띄운다.
 *
 * ⚠️ **비밀번호를 바꾸거나 되돌리는 자리가 여기 없다** (대전제 12).
 *    설정 화면에 그런 단추가 서면 원장님이 아이 계정을 대신 만지게 되고,
 *    그 순간 「누가 눌렀나」가 뜻을 잃는다. 계정은 그 사람이 자기 손으로만 바꾼다.
 */

import { cookies } from "next/headers";
import { serverClientFromStore, roleOf } from "../../lib/supabase-server.js";
import { setupSql } from "./read.js";
import { turnProgressEditOff } from "../_home/actions.js";

/**
 * **설정은 원장만 연다** — 원장님 2026-09-03: 「아니 강사는 수강료 설정 못보게」.
 *
 * ⚠️ 판단은 `lib/menu.js` 의 `canSettings` 한 곳이다(대전제-4 · 원칙-1). 메뉴에서 「설정」을
 *    빼는 것도 **같은 판단**을 쓴다 — 두 벌이면 메뉴엔 없는데 주소로는 열리는 날이 온다.
 * ⚠️ 안 하면 무엇이 터지나: 문지기(`middleware.js`)는 첫 화면만 고르고 역할로 화면을 안 지킨다.
 *    메뉴에서만 빼면 강사가 `/settings` 를 그대로 열어 배색·문구·진도 스위치를 고친다.
 * ⚠️⚠️ **이것도 화면 가리개일 뿐이다.** 설정 표들의 접근 규칙은 `staff_all(is_staff())` 라
 *    강사에게 DB 쪽은 열려 있다(2026-09-03 실측 · 보고에 올렸다).
 */
import { canSettings } from "../../lib/menu.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `v2.students.progress_edit` 의 검사 제약과 **같은 낱말**이다 (0008) */
const MODES = new Set(["follow", "on", "off"]);
/** `v2.stop_rule.level` 의 검사 제약과 **같은 낱말**이다 (0006) */
const LEVELS = new Set(["elem", "middle", "high"]);
/**
 * 주 수의 위쪽 선.
 * ⚠️ **계획서에 없는 숫자다 — 화면이 스스로 그은 방어선이지 규칙이 아니다.**
 *    (계획이 정한 것은 고등 6 · 중등 4 뿐이다.)
 *    ⚠️ 그리고 **DB 에는 이 제약이 없다** — 엑셀이나 SQL 로 들어오면 그냥 들어간다.
 *    「고르는 값은 DB 에도 건다」(계획 (d)) 이므로 보고의 needsDb 에 check 한 줄을 적었다.
 */
const WEEK_MAX = 52;

/* ═══════════════════════════════════════════════════════════════════
 * 문 — 열고, 쓰고, 반드시 닫는다
 * ═══════════════════════════════════════════════════════════════════ */

/** 쓰기 문 하나. `begin read only` 가 **아니다** */
async function writeAs(profileId, sql, params) {
  const url = process.env.DATABASE_URL;
  if (!url) return { ok: false, why: "⚠️ DATABASE_URL 이 없다 — 저장할 곳이 없다" };
  let client = null;
  try {
    const { default: pg } = await import("pg");
    client = new pg.Client({
      connectionString: url, ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000, query_timeout: 8000, statement_timeout: 8000,
    });
    await client.connect();
    // ⚠️ 읽기전용이 아니라 그냥 트랜잭션이다 — `setupSql` 의 `read only` 를 뺀 것
    await client.query(setupSql(profileId).replace("begin read only;", "begin;"));
    const r = await client.query(sql, params);
    const n = r.rowCount ?? 0;
    if (n === 0) {
      await client.query("rollback");
      return { ok: false, n: 0, rows: [], why: "⚠️ 한 줄도 안 바뀌었다 — 접근 규칙이 막았거나 그 줄이 없다" };
    }
    await client.query("commit");
    // ⚠️ `returning` 이 준 값을 그대로 올려 보낸다 — 화면이 오늘 날짜를 **지어내지 않게** 하려는 것
    return { ok: true, n, rows: r.rows ?? [], why: "" };
  } catch (e) {
    try { await client?.query("rollback"); } catch { /* 이미 끊겼다 */ }
    // ⚠️ Postgres 의 영어 오류를 그대로 보여 드리면 원장님은 무엇을 해야 할지 모르신다
    const raw = String(e?.message ?? e);
    if (/permission denied/i.test(raw))
      return { ok: false, n: 0, why:
        "DB 가 이 표를 못 고치게 막고 있습니다 (권한이 없습니다). " +
        "마이그레이션 한 줄이 모자란 것이라 화면에서는 못 고칩니다 — " +
        "`grant update on … to authenticated` 가 들어가야 합니다." };
    return { ok: false, n: 0, why: raw };
  } finally {
    try { await client?.end(); } catch { /* 이미 끊겼다 */ }
  }
}

/** 로그인한 사람이 원장·강사인가 — **`lib/supabase-server.js` 한 곳을 지난다** */
async function staffId() {
  const supabase = serverClientFromStore(await cookies());
  const { user, role, msg } = await roleOf(supabase);
  if (!user) return { id: null, why: "로그인이 풀렸다 — 다시 로그인해 주세요" };
  if (!canSettings(role)) return { id: null, why: msg || "설정은 원장님만 고칠 수 있다" };
  return { id: user.id, why: "" };
}

/* ── ① 진도 체크 켜기 (절 ㊶) ──────────────────────────────────────
 * ⚠️⚠️ **이미 켜져 있으면 한 줄도 안 건드린다** (`and is_open = false`).
 *    안 걸면 다시 누를 때마다 `opened_on` 이 오늘로 새로 찍혀
 *    「12일째 열려 있습니다」가 **매번 0 으로 되돌아간다** — 켜 놓고 잊는 것을 막는
 *    장치가 그 한 줄뿐인데, 그 줄이 영영 안 자란다.
 * ⚠️ 날짜 자동 만료는 **안 쓴다** (원장님 2026-09-02 — 「그 관리화면에서 on off 하고 싶어」).
 *    그래서 「언제까지」 칸이 여기 없다.                                            */
const EDIT_ON = `/* q:set-edit-on */
  update v2.progress_edit
     set is_open = true, opened_on = v2.today(), opened_by = v2.me()
   where scope = 'academy' and is_open = false
  returning opened_on::text as opened_on`;

/**
 * 학원 전체 진도 체크를 켜고 끈다.
 * @param on true 면 켠다. false 면 **대시보드와 같은 한 벌**(`turnProgressEditOff`)을 부른다
 */
export async function setAcademyProgressEdit(on) {
  const { id, why } = await staffId();
  if (!id) return { ok: false, why };

  if (on !== true) return turnProgressEditOff();

  const r = await writeAs(id, EDIT_ON, []);
  // ⚠️ 「이미 켜져 있었다」는 실패가 아니다 — 두 사람이 같이 눌렀을 때 뒤엣사람이 놀란다
  if (!r.ok && /한 줄도 안 바뀌었다/.test(r.why))
    return { ok: true, n: 0, openedOn: null, why: "이미 켜져 있었습니다 (켠 날짜는 그대로 둡니다)" };
  return { ...r, openedOn: r.rows?.[0]?.opened_on ?? null };
}

/* ── ② 학생별 예외 (절 ㊶ 표 4-9) ──────────────────────────────────
 * ⚠️ 「그래서 이 아이가 지금 고칠 수 있나」는 여기서 안 센다 —
 *    `v2.can_edit_progress()` 가 판정하고 화면은 그것을 받아 그린다.                 */
const STUDENT_MODE = `/* q:set-student-mode */
  update v2.students set progress_edit = $2
   where id = $1::uuid`;

export async function setStudentProgressEdit(studentId, mode) {
  const { id, why } = await staffId();
  if (!id) return { ok: false, why };
  if (!UUID.test(String(studentId ?? "")))
    return { ok: false, why: "⚠️ 어느 아이인지 모른다 — 아무것도 안 바꾼다" };
  if (!MODES.has(String(mode)))
    return { ok: false, why: `⚠️ 모르는 값 「${mode}」 — 학원 따라감·늘 켬·늘 끔 셋뿐이다` };
  return writeAs(id, STUDENT_MODE, [studentId, mode]);
}

/* ── ③ 교재 멈춤 기본 (절 ㊺-b) ────────────────────────────────────
 * 고등 6주 · 중등 4주 — 원장님이 확정하신 값이고, 여기서 고칠 수 있다.               */
const STOP_WEEKS = `/* q:set-stop-weeks */
  update v2.stop_rule set weeks = $2 where level = $1`;

export async function saveStopWeeks(level, weeks) {
  const { id, why } = await staffId();
  if (!id) return { ok: false, why };
  if (!LEVELS.has(String(level)))
    return { ok: false, why: `⚠️ 모르는 학교급 「${level}」` };
  const w = Number(weeks);
  if (!Number.isInteger(w) || w < 0 || w > WEEK_MAX)
    return { ok: false, why: `⚠️ 주 수는 0 부터 ${WEEK_MAX} 사이의 정수만 받는다 (받은 값 「${weeks}」)` };
  return writeAs(id, STOP_WEEKS, [level, w]);
}

/* ── ④ 문구 (계획 (e) ⑧) ──────────────────────────────────────────
 * ⚠️ **갈래(`kind`)를 여기서 만들지 않는다.** 갈래는 발송 코드가 정한다 —
 *    표에 줄을 더한다고 그 문구가 나가지 않는다. 「표에 줄을 더하면 채워진다」는
 *    착각을 만들지 않으려고 **새 줄 만들기 단추가 없다.**                            */
const TEMPLATE = `/* q:set-template */
  update v2.msg_template set title = $2, body = $3 where id = $1::uuid`;

export async function saveTemplate({ id: rowId, title, body } = {}) {
  const { id, why } = await staffId();
  if (!id) return { ok: false, why };
  if (!UUID.test(String(rowId ?? "")))
    return { ok: false, why: "⚠️ 어느 문구인지 모른다 — 아무것도 안 바꾼다" };
  const b = String(body ?? "").trim();
  // DB 가 `body not null` 이다. 빈 글로 저장하면 그 갈래 발송이 통째로 빈 통이 된다
  if (!b) return { ok: false, why: "⚠️ 본문이 비었다 — 빈 문구는 저장하지 않는다" };
  return writeAs(id, TEMPLATE, [rowId, String(title ?? "").trim() || null, b]);
}

/* ── ⑤ 되풀이 규칙의 임계값 (계획 (e) ⑤) ──────────────────────────
 * 「몇 번째부터 재시험지」 같은 값. **코드에 박으면 원장님이 못 바꾼다.**
 * ⚠️ 여기서도 **새 규칙 만들기 단추가 없다** — `kind` 를 읽는 코드가 없으면
 *    그 규칙은 만들어도 한 번도 안 돈다. 그건 「고쳤다」는 착각만 남긴다.       */
const RULE = `/* q:set-rule */
  update v2.auto_rule set threshold = $2::jsonb, active = $3 where id = $1::uuid`;

export async function saveRule({ id: rowId, threshold, active } = {}) {
  const { id, why } = await staffId();
  if (!id) return { ok: false, why };
  if (!UUID.test(String(rowId ?? "")))
    return { ok: false, why: "⚠️ 어느 규칙인지 모른다 — 아무것도 안 바꾼다" };

  const t = String(threshold ?? "").trim();
  // ⚠️ 잘못된 JSON 을 DB 로 보내면 Postgres 의 영어 오류가 그대로 원장님께 간다.
  //    여기서 먼저 읽어 보고, 못 읽으면 **어디가 틀렸는지**를 한국어로 돌려준다
  if (t) {
    try { JSON.parse(t); }
    catch (e) {
      return { ok: false, why:
        `⚠️ 임계값을 못 읽었다 — 저장하지 않았다. { "n": 3 } 처럼 적어 주세요 ` +
        `(${String(e?.message ?? e).slice(0, 80)})` };
    }
  }
  return writeAs(id, RULE, [rowId, t || null, active === true]);
}
