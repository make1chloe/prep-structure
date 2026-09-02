/**
 * 오늘 화면이 DB 에 붙는 자리. **판단은 한 줄도 없다** — 문을 여는 일만 한다.
 *
 * ── 왜 `pg` 로 붙나 (supabase-js 를 안 쓰고)
 *    `lib/` 의 셈들이 전부 `{ query(sql, params) }` 를 받는다. supabase-js 는 raw SQL 을
 *    못 돌린다 (`app/api/cron/route.js` 도 같은 까닭으로 `pg` 를 쓴다).
 *
 * ── ⚠️⚠️ 그런데 `DATABASE_URL` 은 `postgres` 로 붙는다 — **접근 규칙을 통째로 지나간다.**
 *    그래서 문을 열자마자 **로그인한 그 사람으로 갈아탄다**:
 *      set_config('request.jwt.claims', {"sub": 그 사람}) + set role authenticated
 *    이러면 `v2.me()`·`v2.is_staff()` 가 제대로 답하고 RLS 가 그대로 걸린다
 *    (실측 2026-09-02 — 원장으로 갈아타니 `is_staff()` 가 참, 학생 25명이 보였다).
 *    `scripts/check-v2-rls.mjs` 가 쓰는 것과 **같은 방법**이다.
 *
 * ⚠️ **갈아타기가 실패하면 화면을 안 낸다.** 서비스 열쇠나 postgres 로 되돌아가지 않는다 —
 *    되돌아가면 그날부터 이 화면만 접근 규칙 밖에 선다. 막힌 채로 밝히는 쪽이 낫다.
 * ⚠️ 서비스 열쇠(`SUPABASE_SERVICE_ROLE_KEY`)는 이 파일에 한 글자도 없다.
 *
 * ⚠️ 세션 단위(`set_config(..., false)`)로 건다. 트랜잭션 단위(`true`)로 걸면
 *    `lib/close.js` 의 `begin … commit` 안에서만 살아 있고 그 밖의 조회는 postgres 로 돈다.
 */
import { Client } from "pg";

/** 아이디 모양 — ⚠️ 글자를 SQL 에 끼워 넣기 전에 **반드시** 여기를 지난다 */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** 이 화면의 조회 상한 (계획 §속도 — `/today` 는 **조회 20 · 4단**) */
export const QUERY_CAP = 20;

/**
 * 문을 연다 — **그 사람으로.**
 *
 * @param profileId 로그인한 사람의 `v2.profiles.id`
 * @returns { ok:true, db, count, log, end } | { ok:false, why }
 *          `db` 는 `{ query(sql, params) }` — `lib/` 가 그대로 받는 모양이다.
 *          `count()` 는 이 문으로 몇 번 물었나 (상한을 넘었는지 화면이 밝힌다).
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
      // ⚠️ `begin`·`commit` 은 조회가 아니다 — 상한에 안 센다 (마감이 트랜잭션을 쓴다)
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
