/** 알림 아이콘 — ⚠️ **옛 SW 가 `/api/icon/192` 를 부른다.** 없으면 아이콘 없는 알림이 뜬다 */
export const dynamic = "force-static";

export async function GET(_req, { params }) {
  const { size } = await params;
  const s = Math.min(512, Math.max(16, parseInt(size, 10) || 192));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 192 192">
<rect width="192" height="192" rx="42" fill="#1F4E79"/>
<text x="96" y="128" font-family="system-ui,-apple-system,sans-serif" font-size="104"
 font-weight="700" fill="#fff" text-anchor="middle">C</text></svg>`;
  return new Response(svg, { headers: {
    "content-type": "image/svg+xml", "cache-control": "public, max-age=31536000, immutable" } });
}
