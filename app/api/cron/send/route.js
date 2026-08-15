import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { runDueSends } from "@/app/report/scheduleActions";

export const dynamic = "force-dynamic";

/**
 * **바깥 시계** (원장님, 2026-08-16 — 「서버깨우는 외부앱으로 한시간에
 * 한번 보낼수있게 못해?」).
 *
 * 예약 발송은 원래 직원이 앱을 열 때 나간다. 이 주소를 바깥 크론
 * (cron-job.org 같은 무료 서비스)이 한 시간에 한 번 두드리면, 앱을 안
 * 열어도 때가 된 예약이 나간다. 로그인 쿠키가 없으므로 서버만 아는
 * 열쇠(SUPABASE_SERVICE_ROLE_KEY)로 돈다 — Vercel 환경변수에 있어야 한다.
 *
 * 문단속: 환경변수 CRON_SECRET 을 정해두면 ?key=그값 이 맞아야만 돈다.
 * 안 정해두면 그냥 돈다 — 남이 두드려봐야 「때가 된 예약」 이 예정대로
 * 나갈 뿐, 새 발송을 만들거나 내용을 볼 수는 없다.
 */
export async function GET(request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (secret) {
    const url = new URL(request.url);
    const got =
      url.searchParams.get("key") ||
      (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (got !== secret) {
      return NextResponse.json({ error: "키가 맞지 않아요." }, { status: 401 });
    }
  }

  const supa = adminClient();
  if (!supa) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 가 Vercel 환경변수에 없어요." },
      { status: 500 }
    );
  }

  try {
    const r = await runDueSends(supa);
    return NextResponse.json({ ok: true, ran: r?.ran ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "돌다 멈췄어요." }, { status: 500 });
  }
}
