/** 솔라피 문자 한 벌 — 문자 서버를 부르는 자리는 여기뿐(검사-① · 대전제-7: 부르는 쪽은 lib/notify.js 하나).
 *  열쇠(v2.integration 'solapi')는 서명에만 쓰고 어디에도 안 적는다 · 짐·답 읽기는 lib/sms-plan.js(순수 — 화면도 가져오는 파일이라 node:crypto 가 없다) */
import { createHmac, randomBytes } from "node:crypto";
import { smsBody, readSolapi } from "./sms-plan.js";
export const SOLAPI_URL = "https://api.solapi.com/messages/v4/send";
/** 솔라피 서명 — Authorization: HMAC-SHA256 apiKey=…, date=…, salt=…, signature=HMAC_SHA256(secret, date + salt). 열쇠를 만지므로 서버 쪽(화면은 lib/sms-plan.js 만 가져온다) */
export function solapiAuth({ key, secret, date = new Date().toISOString(), salt = randomBytes(16).toString("hex") }) {
  if (!key || !secret) throw new Error("솔라피 열쇠가 없습니다");
  const signature = createHmac("sha256", String(secret)).update(date + salt).digest("hex");
  return { date, salt, signature, header: `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}` };
}
export async function sendOne(cfg, { to, text, subject = null }, fetchImpl = fetch) {
  const auth = solapiAuth({ key: cfg?.key, secret: cfg?.secret });
  let res, json = null;
  try { res = await fetchImpl(SOLAPI_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth.header }, body: JSON.stringify(smsBody({ to, from: cfg?.from, text, subject })), cache: "no-store" }); }
  catch (e) { return { ok: false, id: null, why: `솔라피를 부르지 못했습니다: ${String(e?.message ?? e).slice(0, 120)}` }; }
  try { json = await res.json(); } catch { /* 본문이 JSON 이 아닐 수 있다 */ }
  return readSolapi(json, res.status);
}
