/** 폰이 알림을 받았거나(opened:false) 눌렀을 때(opened:true) — public/sw.js 가 부른다(서비스워커 계약 ④). 아무것도 돌려주지 않는다 — 돌려주면 언젠가 화면이 읽고 「읽음」이 학부모 눈에 띈다.
 *  로그인이 끊긴 폰에서도 온다 — 막으면 「읽음」이 조용히 안 쌓인다(0050). 자취 번호를 아는 것 자체가 열쇠다. 세다가 잘못돼도 조용히 — 알림을 세는 일 때문에 알림이 멈추면 본말이 뒤집힌다 */
import { serviceClient, db } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export async function POST(req) {
  try {
    const { r, opened } = await req.json();
    const id = Number(r);
    if (Number.isInteger(id) && id > 0) await db(serviceClient()).rpc("mark_notify_seen", { p_id: id, p_opened: Boolean(opened) });
  } catch { /* 조용히 */ }
  return new Response(null, { status: 204 });
}
