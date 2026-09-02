/**
 * 교재 화면이 DB 에 붙는 자리. **판단은 한 줄도 없다** — 문을 여는 일만 한다.
 *
 * ── 왜 `pg` 로 붙나 (supabase-js 를 안 쓰고)
 *    `lib/excel.js` 의 미리보기·올리기가 `{ query(sql, params) }` 를 받는다.
 *    supabase-js 는 raw SQL 을 못 돌리므로 이 화면의 엑셀 왕복이 그 자리에서 막힌다
 *    (`app/today/db.js`·`app/api/cron/route.js` 도 같은 까닭으로 `pg` 를 쓴다).
 *
 * ── ⚠️⚠️ `DATABASE_URL` 은 `postgres` 로 붙는다 — **접근 규칙을 통째로 지나간다.**
 *    그래서 문을 열자마자 **로그인한 그 사람으로 갈아탄다**:
 *      set_config('request.jwt.claims', {"sub": 그 사람}) + set role authenticated
 *    이러면 `v2.me()`·`v2.is_staff()` 가 제대로 답하고 RLS 가 그대로 걸린다.
 *
 * ⚠️ **갈아타기가 실패하면 화면을 안 낸다.** 서비스 열쇠나 postgres 로 되돌아가지 않는다.
 * ⚠️ 서비스 열쇠(`SUPABASE_SERVICE_ROLE_KEY`)는 이 파일에 한 글자도 없다.
 *
 * ⚠️⚠️ **이 파일은 `app/today/db.js` 와 같은 일을 하는 두 벌째다** (원칙 1 에 걸린다).
 *    지금 두 벌인 까닭은 `lib/` 에 문 여는 한 벌이 없고, 이 판이 `lib/` 을 못 고치기 때문이다.
 *    → 보고의 `notes` 에 「`lib/screen-db.js` 로 한 벌 내리기」를 적었다.
 *    그때까지 갈리지 않게 `scripts/check-screen-books.mjs` 가 **두 파일의 갈아타는 SQL 이
 *    같은지 매번 견준다.** 한쪽만 고치면 그 검사가 빨개진다.
 */
import { Client } from "pg";

/** 아이디 모양 — ⚠️ 글자를 SQL 에 끼워 넣기 전에 **반드시** 여기를 지난다 */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * 이 화면의 조회 상한.
 * ⚠️ 이 화면은 **탭이 없다.** 한 번에 다 읽고 나머지는 접기로 줄인다 (§속도 1) —
 *    그래서 첫 조회가 여러 번이고, 접었다 펴는 데는 **한 번도 안 든다.**
 *    탭 일곱이면 화면 전체 재조회가 일곱 번이다.
 */
export const QUERY_CAP = 14;

/**
 * 문을 연다 — **그 사람으로.**
 *
 * @param profileId 로그인한 사람의 `v2.profiles.id`
 * @returns { ok:true, db, count, log, end } | { ok:false, why }
 */
export async function openAs(profileId) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return { ok: false, why: "⚠️ `DATABASE_URL` 이 없어 DB 에 못 붙습니다 — Vercel 환경변수에 넣어야 합니다" };
  }
  if (!UUID.test(String(profileId ?? ""))) {
    // 지어내지 않는다 — 누구인지 모르면 아무것도 안 읽는다
    return { ok: false, why: "⚠️ 로그인한 사람의 아이디를 못 읽었습니다 — 아무것도 안 읽습니다" };
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  try {
    await client.connect();
  } catch (e) {
    return { ok: false, why: `⚠️ DB 에 못 붙었습니다 — ${String(e?.message ?? e).slice(0, 160)}` };
  }

  try {
    // ⚠️ 값이 하나뿐이고 위에서 모양을 검사했다. 한 번에 보내 왕복을 하나로 줄인다
    await client.query(
      `select set_config('request.jwt.claims', '{"sub":"${profileId}","role":"authenticated"}', false);` +
      ` set role authenticated;`
    );
  } catch (e) {
    await client.end().catch(() => {});
    return {
      ok: false,
      why: "⚠️ 접근 규칙을 그대로 걸지 못했습니다 (`set role authenticated` 실패) — " +
           "규칙 밖으로 나가느니 화면을 안 냅니다: " + String(e?.message ?? e).slice(0, 140),
    };
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
  return {
    ok: true, db,
    count: () => n,
    log: () => [...log],
    end: () => client.end().catch(() => {}),
  };
}
