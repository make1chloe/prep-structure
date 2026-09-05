/** 크론 — vercel.json 이 매일 부른다. 「학원의 오늘」을 인자로 받고(뼈대-10), 오늘 이미 돌았나를 v2.day_ran 으로 본다(뼈대-6).
 *  새 셈을 만들지 않는다 — lib/queue.js 의 runDue 를 부르기만(뼈대-9). 열쇠(CRON_SECRET)가 안 맞으면 401. */
import { serviceClient, db } from "@/lib/supabase";
import { runDue } from "@/lib/queue";
export const dynamic = "force-dynamic";
export async function GET(req) {
  const want = process.env.CRON_SECRET;
  if (want && req.headers.get("authorization") !== `Bearer ${want}`) return Response.json({ error: "열쇠가 다르다" }, { status: 401 });
  const sb = serviceClient();
  const { data: today, error } = await db(sb).rpc("today");
  if (error) return Response.json({ error: `오늘을 못 읽음: ${error.message}` }, { status: 500 });
  const { data: already } = await db(sb).from("day_ran").select("ran_on").eq("kind", "queue").eq("ran_on", today).maybeSingle();
  const r = await runDue(sb, today);
  await db(sb).from("day_ran").upsert({ kind: "queue", ran_on: today });
  return Response.json({ today, already_today: Boolean(already), ...r });
}
