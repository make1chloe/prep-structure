/**
 * 일정 화면이 **문을 여는 자리**. 판단은 한 줄도 없다 — 문을 열고, 누구인지 보고, 닫는다.
 *
 * ⚠️ **`app/today/db.js` · `app/_home/read.js` 와 같은 손씨다.** 화면마다 제 문을 연다 —
 *    옆 화면 파일을 들여오면 그 화면을 짓는 사람이 이름을 바꾸는 날 내 화면이 같이 죽는다.
 *    (지금 다른 판이 `app/settings` · `app/api/notify` 를 짓는 중이다.)
 *    ⚠️ 그래도 **두 벌은 두 벌이다.** `lib/` 에 「문 여는 한 벌」이 서면 셋 다 그것으로 바꾼다 —
 *       보고의 `notes` 에 적었다.
 *
 * ── 왜 `pg` 로 붙나
 *    `lib/session.js` · `lib/todo.js` 가 전부 `{ query(sql, params) }` 를 받는다.
 *    supabase-js 는 그 SQL 을 못 돌린다.
 *
 * ── ⚠️⚠️ `DATABASE_URL` 은 `postgres` 로 붙는다 — **접근 규칙을 통째로 지나간다.**
 *    그래서 문을 열자마자 **로그인한 그 사람으로 갈아탄다**
 *    (`set_config('request.jwt.claims', …)` + `set role authenticated`).
 *    갈아타기가 실패하면 **화면을 안 낸다.** 서비스 열쇠로 되돌아가지 않는다 —
 *    되돌아가면 그날부터 이 화면만 접근 규칙 밖에 선다.
 * ⚠️ 서비스 열쇠(`SUPABASE_SERVICE_ROLE_KEY` · `serviceDb`)는 이 폴더에 한 글자도 없다.
 */
import { cookies } from "next/headers";
import { Client } from "pg";
import { serverClientFromStore, roleOf, keys, SCHEMA } from "../../lib/supabase-server.js";
// ⚠️⚠️ **누가 무엇을 보나 — 판단은 `lib/perm.js` 한 벌이다**(대전제-4 · 원칙-1).
//    여기서 「강사는 …」을 다시 적지 않는다. 코드에는 켬/끔 값이 한 줄도 없다 —
//    켤지 끌지는 원장님이 화면에서 누르셔서 `v2.role_access` 에만 든다(원장님 2026-09-03).
import { loadPerm, blockedBy, PRINCIPAL } from "../../lib/perm.js";
import { isStaff } from "../../lib/menu.js";

/** 아이디 모양 — ⚠️ 글자를 SQL 에 끼워 넣기 전에 **반드시** 여기를 지난다 */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** 이 화면의 조회 상한 (계획 §속도 표 — `/schedule` 은 **조회 8 · 2단**) */
export const QUERY_CAP = 8;

/** 이 화면을 여는 역할 — 원장·강사뿐이다. **낱말은 `lib/menu.js` 한 곳에 있다** */
// ⚠️ 「원장·강사」 낱말을 여기 다시 적지 않는다 (원칙-1 · 어긋난 곳 ⑯).
//    안 하면 무엇이 터지나: 역할 낱말이 바뀌는 날 이 파일만 옛말을 해 문이 잘못 열리거나 잠긴다.

/**
 * **이 화면을 열 수 있는 사람인가.**
 *
 * ⚠️⚠️ 문지기(`middleware.js`)는 **첫 화면만 고른다 — 역할로 화면을 지키지 않는다.**
 *    그 파일 주석에 실측이 적혀 있다: 학생 세션으로 `GET /parent` 가 **200** 이었다.
 *    그러니 `/schedule` 은 **스스로** 봐야 한다.
 *
 * @returns { ok:true, profileId, role } | { ok:false, why, msg, how:[줄] }
 */
export async function staffOnly() {
  const k = keys();
  if (!k.ok) {
    return {
      ok: false, why: "no-keys",
      msg: "로그인 열쇠가 없어 **아무도 못 들어옵니다** — 그래서 이 화면이 비어 있습니다",
      how: [
        "`.env.local` 과 Vercel 에 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 넣어야 합니다 " +
        "(2026-09-02 실측 — URL·서비스키·DATABASE_URL 셋뿐입니다).",
        "그리고 Supabase → Settings → API → Exposed schemas 에 `v2` 를 넣어야 역할을 읽습니다.",
        "⚠️ 둘 다 코드로 못 고칩니다.",
      ],
    };
  }
  let who, sb;
  try {
    // ⚠️ 클라이언트를 **붙잡아 둔다.** 아래에서 「누가 무엇을 보나」를 같은 문으로 읽는다 —
    //    새로 만들면 쿠키를 두 번 풀고 조회도 한 번 더 는다(§속도).
    sb = serverClientFromStore(await cookies());
    who = await roleOf(sb);
  } catch (e) {
    return { ok: false, why: "read-failed", how: [],
             msg: `로그인을 못 읽었습니다 — ${String(e?.message ?? e).slice(0, 160)}` };
  }
  if (!who.user) return { ok: false, why: "no-user", msg: "로그인하지 않았습니다.", how: [] };
  // ⚠️ 모르면 **지어내지 않는다.** lib 이 준 까닭을 그대로 보여준다
  if (who.role == null) return { ok: false, why: who.why, msg: who.msg || "역할을 못 읽었습니다.", how: [] };
  if (!isStaff(who.role)) {
    return { ok: false, why: "not-staff", msg: "이 화면은 원장·강사·조교만 엽니다.",
             how: ["학생은 `/me`, 학부모는 `/parent` 가 첫 화면입니다."] };
  }
  /* ⚠️⚠️ **메뉴에서 빼는 것만으로는 못 막는다 — 주소를 치면 그대로 열린다.**
   *    문지기(`middleware.js`)는 첫 화면만 고르고 역할로 화면을 안 지킨다. 그래서 여기서 본다.
   *  ⚠️ 원장은 묻지 않는다(`canFor` 가 늘 참) → **조회를 아예 안 한다**(§속도).
   *  ⚠️ 못 읽으면 **기본값으로 돌지 않는다** — 기본값이 없다. 「못 읽었다」로 막고 그대로 말한다.
   *  ⚠️ 「아직 안 정하셨습니다」(unset)와 「꺼 두셨습니다」(off)를 **다르게** 말한다 —
   *     글은 `lib/perm.js` 의 `blockedBy()` 한 벌이 짓는다(원칙-1).
   *  ⚠️ 막힌 화면에도 **나가는 길**이 있다(대전제-10): 메뉴 줄의 「🚪 나가기」는 늘 그려지고,
   *     `how` 줄에도 그 길을 적는다. */
  const 권한 = who.role === PRINCIPAL ? { rows: null, why: null } : await loadPerm(sb.schema(SCHEMA));
  const 문 = blockedBy(who.role, "page.schedule", 권한.rows, 권한.why);
  if (!문.ok)
    return { ok: false, why: `perm-${문.state}`, msg: 문.msg, how: 문.how, role: who.role };

  return { ok: true, profileId: who.user.id, role: who.role, perm: 권한.rows, permWhy: 권한.why };
}

/**
 * 문을 연다 — **그 사람으로.**
 *
 * @returns { ok:true, db, count, log, end } | { ok:false, why }
 *          `db` 는 `{ query(sql, params) }` — `lib/` 이 그대로 받는 모양이다.
 */
export async function openAs(profileId) {
  const url = process.env.DATABASE_URL;
  if (!url) return { ok: false, why: "⚠️ `DATABASE_URL` 이 없어 DB 에 못 붙습니다 — Vercel 환경변수에 넣어야 합니다" };
  if (!UUID.test(String(profileId ?? "")))
    return { ok: false, why: "⚠️ 로그인한 사람의 아이디를 못 읽었습니다 — 아무것도 안 읽습니다" };

  const client = new Client({
    connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
  });
  try { await client.connect(); }
  catch (e) { return { ok: false, why: `⚠️ DB 에 못 붙었습니다 — ${String(e?.message ?? e).slice(0, 160)}` }; }

  try {
    // ⚠️ 값이 하나뿐이고 위에서 모양을 검사했다. 한 번에 보내 왕복을 하나로 줄인다
    await client.query(
      `select set_config('request.jwt.claims', '{"sub":"${profileId}","role":"authenticated"}', false);` +
      ` set role authenticated;`);
  } catch (e) {
    await client.end().catch(() => {});
    return { ok: false, why:
      "⚠️ 접근 규칙을 그대로 걸지 못했습니다 (`set role authenticated` 실패) — " +
      "규칙 밖으로 나가느니 화면을 안 냅니다: " + String(e?.message ?? e).slice(0, 140) };
  }

  const log = [];
  let n = 0;
  const db = {
    query(sql, params) {
      const s = String(sql);
      // ⚠️ `begin`·`commit` 은 조회가 아니다 — 상한에 안 센다
      if (!/^\s*(begin|commit|rollback)\b/i.test(s)) {
        n++;
        const tag = /\/\*\s*([^*]+?)\s*\*\//.exec(s);
        log.push(tag ? tag[1] : s.replace(/\s+/g, " ").trim().slice(0, 48));
      }
      return client.query(sql, params);
    },
  };
  return { ok: true, db, count: () => n, log: () => [...log], end: () => client.end().catch(() => {}) };
}
