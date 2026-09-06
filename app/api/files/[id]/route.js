/** 파일 열기 한 길 — 읽어도 되나는 v2.file 의 접근 규칙(RLS own_file · staff_all)이 정한다: 내 것 · 내 숙제·공지에 붙은 것 · 학원 사람은 전부. 남의 것은 「없음」(404). 보관함은 서버 자신이 읽어 흘려 준다(버킷은 비공개, 9000).
 *  ?dl=1 이면 내려받기(💾 저장 — 아이 폰에 남긴다. 앱 안에 두면 1달 뒤 안 보여서 「저장」이 아니게 된다, 목업 20) */
import { whoami } from "@/lib/session";
import { serviceClient } from "@/lib/supabase";
import { fileById, storageGet } from "@/lib/files";
export const dynamic = "force-dynamic";
export async function GET(req, { params }) {
  const { sb, user } = await whoami();
  if (!user) return new Response("로그인이 필요합니다", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(String(id ?? ""))) return new Response("파일이 아닙니다", { status: 400 });
  const f = await fileById(sb, id);
  if (!f) return new Response("없는 파일이거나 볼 수 없는 파일입니다", { status: 404 });
  let bytes; try { bytes = await storageGet(serviceClient(), f.path); } catch (e) { return new Response(String(e?.message ?? e), { status: 502 }); }
  const dl = new URL(req.url).searchParams.get("dl") === "1";
  const name = encodeURIComponent(f.orig_name ?? "file");
  return new Response(bytes, { headers: { "content-type": f.mime || "application/octet-stream", "content-length": String(bytes.length), "cache-control": "private, max-age=0", "content-disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${name}` } });
}
