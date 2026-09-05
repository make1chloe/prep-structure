/** 자동화 뼈대(뼈대-1) — 큐 한 건은 상태·시도 횟수·다음 시도·잠금 시각·마지막 오류를 갖는다. 자물쇠는 locked_at 이다.
 *  손(handlers)은 일마다 여기 등록한다 — 크론(app/api/cron)은 새 셈을 만들지 않고 이것을 부르기만 한다(뼈대-9). */
import { db } from "./supabase.js";
import { ruleInt, ruleList } from "./rule.js";
export const handlers = {};   // kind → async (payload, ctx) => void
export async function enqueue(sb, kind, payload = {}, why = {}) {
  const { data, error } = await db(sb).from("queue").insert({ kind, payload, why_table: why.table ?? null, why_id: why.id == null ? null : String(why.id) }).select("id").single();
  if (error) throw new Error(`큐에 못 넣음: ${error.message}`);
  return data.id;
}
/** 지금 할 것을 잠근다 — 10분 넘게 잠긴 것은 죽은 자물쇠로 보고 다시 잡는다 */
export async function claim(sb, limit = 20) {
  const now = new Date().toISOString(), stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await db(sb).from("queue").select("*").in("state", ["waiting", "failed"]).lte("next_try_at", now).or(`locked_at.is.null,locked_at.lt.${stale}`).order("next_try_at").limit(limit);
  if (error) throw new Error(`큐를 못 읽음: ${error.message}`);
  const got = [];
  for (const row of data ?? []) {
    const { data: locked } = await db(sb).from("queue").update({ state: "running", locked_at: now, attempts: row.attempts + 1 }).eq("id", row.id).eq("state", row.state).select("*").maybeSingle();
    if (locked) got.push(locked);
  }
  return got;
}
export async function done(sb, id) { await db(sb).from("queue").update({ state: "done", done_at: new Date().toISOString(), locked_at: null }).eq("id", id); }
export async function fail(sb, row, err) {
  const max = await ruleInt(sb, "queue.max_attempts"), backoff = await ruleList(sb, "queue.backoff_minutes");
  const gaveUp = row.attempts >= max;
  const minutes = parseInt(backoff[Math.min(row.attempts, backoff.length) - 1] ?? backoff.at(-1), 10) || 1;
  await db(sb).from("queue").update({ state: gaveUp ? "gave_up" : "failed", locked_at: null, last_error: String(err?.message ?? err).slice(0, 500), next_try_at: new Date(Date.now() + minutes * 60 * 1000).toISOString() }).eq("id", row.id);
  return gaveUp;
}
/** 한 바퀴 — 크론이 「학원의 오늘」과 함께 부른다(뼈대-10). 손이 없는 kind 는 실패로 남긴다(조용히 삼키지 않는다) */
export async function runDue(sb, today) {
  const rows = await claim(sb); let ok = 0, bad = 0, gaveUp = 0;
  for (const row of rows) {
    const h = handlers[row.kind];
    try { if (!h) throw new Error(`손이 없는 일: ${row.kind}`); await h(row.payload, { sb, today, row }); await done(sb, row.id); ok++; }
    catch (e) { bad++; if (await fail(sb, row, e)) gaveUp++; }
  }
  return { claimed: rows.length, ok, bad, gaveUp };
}
