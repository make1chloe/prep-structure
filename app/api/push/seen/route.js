/** 알림 자취 회신 — ⚠️ **옛 SW 가 이 주소로 회신한다.** 없으면 404 로 사라지고
 *  알림은 뜨지만 「읽음」이 영영 안 쌓인다. 오류도 안 난다. */
import { NextResponse } from "next/server";
import { serviceDb } from "@/lib/db";

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const r = body?.r, opened = body?.opened === true;
  if (r == null) return NextResponse.json({ ok: false }, { status: 400 });

  // ⚠️ **「했다」는 서버가 정한다.** 앱이 보낸 시각을 믿지 않는다 (대전제).
  //    처음 본 때는 안 덮고, 마지막 본 때와 횟수만 갈아 끼운다.
  const { error } = await serviceDb().rpc("mark_notify_seen", { p_id: r, p_opened: opened });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
