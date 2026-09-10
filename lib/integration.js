/** 연동 열쇠의 손((터) 확정-72) — 표는 v2.integration 하나(0031). **원장만** 쓴다.
 *  읽기는 서버 자신(service role)으로 읽되 **가려서** 돌려준다 — 진짜 열쇠는 화면·자취·오류 글 어디에도 안 나온다(대전제-9).
 *  쓰기도 서버 자신 — 사람은 insert·update 가 revoke 되어 있다(0031). 판단은 lib/integration-plan.js(순수) */
import { db, serviceClient } from "./supabase.js";
import { KEYS, keyDef, keyRows, mergeConfig, changedText } from "./integration-plan.js";
import { sms, smsReady } from "./notify.js";
import { phoneDigits } from "./sms-plan.js";
import { changed, rows } from "./sqlError.js";
/** 설정 화면이 그리는 판 — 갈래마다 가린 값 · 다 찼나 · 마지막으로 됐던 때·오류 */
export async function keyBoard(svc = serviceClient()) {
  const ids = KEYS.map((k) => k.id);
  const got = rows(await db(svc).from("integration").select("id,config,last_ok_at,last_error,updated_at").in("id", ids), "연동을 못 읽음");
  const by = Object.fromEntries(got.map((r) => [r.id, r]));
  return keyRows(Object.fromEntries(got.map((r) => [r.id, r.config ?? {}]))).map((r) => ({
    ...r, last_ok_at: by[r.id]?.last_ok_at ?? null, last_error: by[r.id]?.last_error ?? null, updated_at: by[r.id]?.updated_at ?? null,
  }));
}
/** 저장 — 적은 칸만 바꾼다(비운 칸은 그대로 · 「-」 한 글자면 지운다). 줄이 없으면 만든다. 무엇을 고쳤는지만 돌려준다(값은 안 돌려준다) */
export async function saveKeys(id, form = {}, svc = serviceClient()) {
  const def = keyDef(id); if (!def) throw new Error(`연동이 아닙니다: ${id}`);
  const cur = (await db(svc).from("integration").select("config").eq("id", id).maybeSingle());
  if (cur.error) throw new Error(`연동을 못 읽음: ${cur.error.message}`);
  const old = cur.data?.config ?? {}, next = mergeConfig(def, old, form);
  const text = changedText(def, old, next);
  if (text === "바뀐 것이 없습니다") return { id, text, ready: keyRows({ [id]: next }).find((r) => r.id === id)?.ready ?? false };
  if (cur.data) changed(await db(svc).from("integration").update({ config: next, updated_at: new Date().toISOString(), last_error: null }).eq("id", id).select("id"), "열쇠를 못 적음");
  else changed(await db(svc).from("integration").insert({ id, config: next }).select("id"), "열쇠를 못 적음");
  return { id, text, ready: keyRows({ [id]: next }).find((r) => r.id === id)?.ready ?? false };
}
/** ✉️ 시험 문자 — 원장님 번호로 한 통. 됐으면 last_ok_at, 안 됐으면 last_error(까닭만 · 열쇠는 안 적는다) */
export async function testSms(to, svc = serviceClient()) {
  if (!phoneDigits(to)) throw new Error("받을 번호를 010… 으로 적어 주세요");
  if (!(await smsReady(svc))) throw new Error("솔라피 열쇠가 다 차야 보냅니다 — API Key · Secret · 발신번호");
  const r = await sms(svc, { kind: "notice", to, text: "[클로이영어] 문자 길 시험입니다. 이 글이 오면 연결이 된 것입니다.", url: "/settings" });
  const now = new Date().toISOString();
  await db(svc).from("integration").update(r.sent ? { last_ok_at: now, last_error: null } : { last_error: String(r.why ?? (r.sink === "off" ? "리허설(NOTIFY_SINK=off) — 자취만 남았습니다" : "안 나갔습니다")).slice(0, 300) }).eq("id", "solapi");   /* 0줄 허용(부기) */
  return r;
}
