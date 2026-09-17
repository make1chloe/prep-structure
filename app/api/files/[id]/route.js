/** 파일 열기 한 길 — 읽어도 되나는 v2.file 의 접근 규칙(RLS own_file · staff_all)이 정한다: 내 것 · 내 숙제·공지에 붙은 것 · 학원 사람은 전부. 남의 것은 「없음」(404). 보관함은 서버 자신이 읽어 흘려 준다(버킷은 비공개, 9000).
 *  ?dl=1 이면 내려받기(💾 저장 — 아이 폰에 남긴다. 앱 안에 두면 1달 뒤 안 보여서 「저장」이 아니게 된다, 목업 20)
 *  (어76) **구간 요청(Range)에 답한다** — 원장님 2026-09-17 「음성 녹음숙제 검사할 때 단순히 재생만 해 보는 게 아니고
 *  재생 위치를 이동해서 아무데서나 확인할 수 있게도 해 줘」. 막대를 끄는 일은 브라우저가 하지만,
 *  서버가 206 을 안 주면 폰·브라우저가 **막대를 잠근다**. 파일은 어차피 통째로 읽으니 잘라서 주기만 하면 된다 */
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
  const head = { "content-type": f.mime || "application/octet-stream", "cache-control": "private, max-age=0", "accept-ranges": "bytes", "content-disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${name}` };
  const rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.get("range") ?? "").trim());
  if (rg && !dl) {
    const total = bytes.length;
    const last = total - 1;
    let from = rg[1] === "" ? null : Number(rg[1]), to = rg[2] === "" ? null : Number(rg[2]);
    if (from === null) { from = Math.max(0, total - (to ?? 0)); to = last; }        // bytes=-500 (끝에서 500)
    else if (to === null || to > last) to = last;
    if (!(from >= 0) || from > last || to < from) return new Response("구간이 파일 밖입니다", { status: 416, headers: { "content-range": `bytes */${total}` } });
    const part = bytes.subarray(from, to + 1);
    return new Response(part, { status: 206, headers: { ...head, "content-length": String(part.length), "content-range": `bytes ${from}-${to}/${total}` } });
  }
  return new Response(bytes, { headers: { ...head, "content-length": String(bytes.length) } });
}
