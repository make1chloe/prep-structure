/** 🃏 클래스카드 받는 길 — **확장이 여기로 보낸다**(POST /api/cc). 길은 이 하나뿐이고, 셈·쓰기는 lib/cc.js 한 벌이 한다.
 *  열쇠: 헤더 `Authorization: Bearer <확장 열쇠>` — 설정 🔌 연동 열쇠의 🃏 줄(v2.integration 'classcard' token)과 견준다(확정-72).
 *  열쇠가 없거나 다르면 401 · 짐이 크면 413 · 꼴이 아니면 400. 어떤 경우에도 **열쇠는 답에 안 싣는다**(대전제-9). */
import { serviceClient } from "@/lib/supabase";
import { ccToken, receive, sameToken } from "@/lib/cc";
export const dynamic = "force-dynamic";
const MAX_BYTES = 1_000_000;   // 1MB — 아이 200명 · 줄 600개면 넉넉하다(lib/cc-plan.js 의 상한과 짝)
export async function POST(req) {
  const svc = serviceClient();
  let want; try { want = await ccToken(svc); } catch (e) { return Response.json({ error: String(e?.message ?? e) }, { status: 500 }); }
  if (!want) return Response.json({ error: "확장 열쇠가 아직 없습니다 — 설정 🔌 연동 열쇠에서 넣어 주세요" }, { status: 401 });
  const auth = req.headers.get("authorization") ?? "";
  if (!sameToken(auth.replace(/^Bearer\s+/i, "").trim(), want)) return Response.json({ error: "열쇠가 다릅니다" }, { status: 401 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: `짐이 너무 큽니다(${text.length}바이트 · ${MAX_BYTES}까지)` }, { status: 413 });
  let body; try { body = JSON.parse(text); } catch { return Response.json({ error: "JSON 이 아닙니다" }, { status: 400 }); }
  try { return Response.json({ ok: true, ...(await receive(svc, body)) }); }
  catch (e) { return Response.json({ error: String(e?.message ?? e) }, { status: 400 }); }
}
export async function GET() { return Response.json({ error: "POST 로 보냅니다" }, { status: 405 }); }
