/** 홈 화면·알림 아이콘 — /api/icon/192 처럼 부른다(서비스워커 계약 ② · manifest). 그림은 v2.app_asset(id icon-192 … · url) — 원장님이 올린 로고.
 *  기본 그림은 없다 — 진짜가 아닌 것을 아이 폰에 띄우느니 404(폰이 제 기본 그림을 쓴다). 로그인 없이 열린다(manifest 를 읽을 때는 로그인 정보가 없다 · 담기는 것은 학원 로고뿐) */
import { serviceClient, db } from "@/lib/supabase";
export const dynamic = "force-dynamic";
const CHAIN = { 192: ["icon-192", "icon-512"], 512: ["icon-512", "icon-192"], apple: ["icon-apple", "icon-512", "icon-192"], favicon: ["icon-favicon", "icon-192", "icon-512"] };
export async function GET(_req, ctx) {
  const { size } = await ctx.params;
  const chain = CHAIN[String(size ?? "").replace(/[^a-z0-9]/gi, "")];
  if (!chain) return new Response("없는 아이콘", { status: 404 });
  try {
    const { data } = await db(serviceClient()).from("app_asset").select("id,url").in("id", chain);
    const hit = chain.map((k) => (data ?? []).find((r) => r.id === k && r.url)).find(Boolean);   // 앞에 적힌 것부터(in 은 순서를 안 지킨다)
    if (!hit) return new Response("아직 로고를 안 올렸어요", { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.redirect(hit.url, 302);
  } catch { return new Response("아이콘을 못 찾았어요", { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
