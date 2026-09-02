"use server";

/**
 * 대시보드가 **쓰는** 자리 — 둘뿐이다.
 *   ① 진도 체크 끄기   (절 ㊶ — 맨 위 한 줄의 「끄기」)
 *   ② 카드 차례 저장   (절 ⑮ 1 — 사람마다 따로)
 *
 * ⚠️ **판단이 아니다.** 둘 다 「켜짐/꺼짐」과 「차례」를 그대로 옮겨 적는 것뿐이다.
 *    세는 것·가르는 것은 한 줄도 여기 없다.
 *
 * ⚠️ **몇 줄이 실제로 바뀌었나를 확인한다** (계획 자동 검사 ⑪).
 *    접근 규칙이 막았는데 화면이 「성공」이라고 말하면, 원장님은 껐다고 믿고 화면은 그대로다.
 *    0줄이면 **실패로 돌려준다.**
 *
 * ⚠️ 여기서도 **그 사람이 되어** 쓴다 (`set local role authenticated`).
 *    서비스 열쇠를 쓰면 학생·학부모가 이 동작을 불러도 그대로 통과한다.
 *
 * ⚠️ `alert`/`confirm` 을 안 쓴다 — 부르는 쪽(`app/_home/parts.js`)이 화면 안에 글로 띄운다.
 */

import { cookies } from "next/headers";
import { serverClientFromStore, roleOf } from "../../lib/supabase-server.js";
import { setupSql } from "./read.js";

/** 원장·강사만. ⚠️ 문지기는 v2 를 못 읽을 때 아무도 안 옮긴다 — **여기서 스스로 본다** */
const STAFF = new Set(["principal", "instructor"]);

/** 쓰기 문 하나 — 열고, 쓰고, 닫는다. `begin read only` 가 **아니다** */
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
      return { ok: false, why: "⚠️ 한 줄도 안 바뀌었다 — 접근 규칙이 막았거나 그 줄이 없다" };
    }
    await client.query("commit");
    return { ok: true, n, why: "" };
  } catch (e) {
    try { await client?.query("rollback"); } catch { /* 이미 끊겼다 */ }
    return { ok: false, why: String(e?.message ?? e) };
  } finally {
    try { await client?.end(); } catch { /* 이미 끊겼다 */ }
  }
}

/** 로그인한 사람이 원장·강사인가 — **`lib/supabase-server.js` 한 곳을 지난다** */
async function staffId() {
  const supabase = serverClientFromStore(await cookies());
  const { user, role, msg } = await roleOf(supabase);
  if (!user) return { id: null, why: "로그인이 풀렸다 — 다시 로그인해 주세요" };
  if (!STAFF.has(String(role))) return { id: null, why: msg || "원장·강사만 할 수 있다" };
  return { id: user.id, why: "" };
}

/* ── ① 진도 체크 끄기 (절 ㊶) ──────────────────────────────────────
 * ⚠️ **켠 날짜는 안 지운다.** 다시 켤 때 새로 찍힌다 —
 *    지우면 「몇 일째」의 뿌리가 사라진다.                                        */
const OFF = `/* q:home-edit-off */
  update v2.progress_edit set is_open = false
   where scope = 'academy' and is_open = true`;

export async function turnProgressEditOff() {
  const { id, why } = await staffId();
  if (!id) return { ok: false, why };
  const r = await writeAs(id, OFF, []);
  // ⚠️ 「이미 꺼져 있었다」는 실패가 아니다 — 두 사람이 같이 눌렀을 때 뒤엣사람이 놀란다
  if (!r.ok && /한 줄도 안 바뀌었다/.test(r.why))
    return { ok: true, n: 0, why: "이미 꺼져 있었습니다" };
  // ⚠️ **실측 2026-09-02 — 지금은 이 길로 온다.** `v2.progress_edit` 에 authenticated 의
  //    UPDATE 권한이 없다(SELECT 뿐). 규칙(`staff_all`)은 이미 있으니 **권한 한 줄만** 모자라다.
  //    Postgres 의 영어 오류를 그대로 보여 드리면 원장님은 무엇을 해야 할지 모르신다.
  if (!r.ok && /permission denied/i.test(r.why))
    return { ok: false, why:
      "DB 가 이 표를 못 고치게 막고 있습니다 (v2.progress_edit 에 쓰기 권한이 없습니다). " +
      "마이그레이션 한 줄이 모자란 것이라 화면에서는 못 고칩니다 — " +
      "grant update on v2.progress_edit to authenticated 가 들어가야 합니다." };
  return r;
}

/* ── ② 카드 차례 저장 (절 ⑮ 1) ─────────────────────────────────────
 * ⚠️ 사람마다 따로다. **그래서 안내 글에서 「세 번째 칸을 보세요」를 못 쓴다** —
 *    이름으로 가리켜야 한다 (계획 ⑮ 1 의 「대가」).                                */
const ORDER = `/* q:home-order */
  insert into v2.screen_pref (profile_id, screen, layout)
  values (v2.me(), 'home', jsonb_build_object('order', $1::text[]))
  on conflict (profile_id, screen)
  do update set layout = excluded.layout, updated_at = now()`;

export async function saveCardOrder(order) {
  const { id, why } = await staffId();
  if (!id) return { ok: false, why };
  const list = (Array.isArray(order) ? order : []).map(String).filter(Boolean);
  if (!list.length) return { ok: false, why: "⚠️ 빈 차례는 저장하지 않는다" };
  return writeAs(id, ORDER, [list]);
}
