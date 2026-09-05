/** 자동화 뼈대(뼈대-1) — 큐는 v2.job_queue(0012) 하나다: 상태(wait·taking·done·fail) · 시도(tries) · 다음 시도(next_at) · 잠금(locked_at) · 오류(last_error).
 *  자물쇠는 locked_at 이다 — 「보낸 때」가 아니다. 임계값은 v2.rule 에서 읽는다(뼈대-5).
 *  손(handlers)은 일마다 여기 등록한다 — 크론(app/api/cron)은 새 셈을 만들지 않고 runDue 를 부르기만 한다(뼈대-9).
 *  사람은 큐에 직접 못 쓴다(0017) — 넣는 것은 v2.enqueue(), 집고 끝내는 것은 서버 자신(service role)이다. */
import { db } from "./supabase.js";
import { ruleInt, ruleList } from "./rule.js";
export const handlers = {};   // kind → async (payload, ctx) => void
/** 왜 생겼는지(why {table,id})는 payload 에 담는다(뼈대-3) */
export async function enqueue(sb, kind, payload = {}, why = null, nextAt = null) {
  const { data, error } = await db(sb).rpc("enqueue", { p_kind: kind, p_payload: why ? { ...payload, why } : payload, p_next_at: nextAt ?? new Date().toISOString() });
  if (error) throw new Error(`큐에 못 넣음: ${error.message}`);
  return data;
}
/** 지금 할 것을 잠근다 — 10분 넘게 잠긴 taking 은 죽은 자물쇠로 보고 다시 잡는다 */
export async function claim(sb, limit = 20) {
  const now = new Date().toISOString(), stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await db(sb).from("job_queue").select("*")
    .or(`and(state.in.(wait,fail),next_at.lte.${now}),and(state.eq.taking,locked_at.lt.${stale})`).order("next_at").limit(limit);
  if (error) throw new Error(`큐를 못 읽음: ${error.message}`);
  const got = [];
  for (const row of data ?? []) {
    const { data: locked } = await db(sb).from("job_queue").update({ state: "taking", locked_at: now, tries: row.tries + 1 })
      .eq("id", row.id).eq("state", row.state).eq("tries", row.tries).select("*").maybeSingle();   // 같은 줄을 둘이 집지 않게 — 읽은 그대로일 때만(0-3)
    if (locked) got.push(locked);
  }
  return got;
}
export async function done(sb, id) { await db(sb).from("job_queue").update({ state: "done", locked_at: null }).eq("id", id); }
/** 실패 — 다음 시도를 v2.rule 의 간격대로 미룬다. 시도가 상한을 넘으면 fail 인 채로 남아 원장님께 뜬다(gave up) */
export async function fail(sb, row, err) {
  const max = await ruleInt(sb, "queue.max_attempts"), backoff = await ruleList(sb, "queue.backoff_minutes");
  const gaveUp = row.tries >= max;
  const minutes = parseInt(backoff[Math.min(row.tries, backoff.length) - 1] ?? backoff.at(-1), 10) || 1;
  await db(sb).from("job_queue").update({ state: "fail", locked_at: null, last_error: String(err?.message ?? err).slice(0, 500), next_at: new Date(Date.now() + (gaveUp ? 365 * 24 * 60 : minutes) * 60 * 1000).toISOString() }).eq("id", row.id);
  return gaveUp;
}
/** 한 바퀴 — 크론이 「학원의 오늘」과 함께 부른다(뼈대-10). 손이 없는 kind 는 실패로 남긴다(조용히 삼키지 않는다) */
export async function runDue(sb, today) {
  const rows = await claim(sb); let ok = 0, bad = 0, gaveUp = 0;
  for (const row of rows) {
    const h = handlers[row.kind];
    try { if (!h) throw new Error(`손이 없는 일: ${row.kind}`); await h(row.payload ?? {}, { sb, today, row }); await done(sb, row.id); ok++; }
    catch (e) { bad++; if (await fail(sb, row, e)) gaveUp++; }
  }
  return { claimed: rows.length, ok, bad, gaveUp };
}
