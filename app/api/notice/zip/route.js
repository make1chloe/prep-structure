import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { makeZip } from "@/lib/zip";
import { shownName } from "@/lib/noticeFile";

/**
 * **공지에 붙은 파일을 몽땅 zip 하나로** (원장님, 2026-08-11 —
 * 「파일 여러개 한번에 다운받기 가능하게해줘」).
 *
 * 공지 id 만 받는다. 무엇이 붙어 있는지는 표에서 다시 읽는다 — 화면이
 * 경로 목록을 보내오게 하면, 오래 열려 있던 화면이 이미 떼어낸 파일을
 * 보내와서 「없는 파일」 로 깨진다.
 *
 * 권한은 보관함(RLS · 0064)이 가린다 — 로그인한 그 사람의 자격으로
 * 내려받으므로, 못 볼 사람은 표도 파일도 손에 못 넣는다.
 */
export async function GET(request) {
  const nid = request.nextUrl.searchParams.get("n") || "";
  if (!nid) return new NextResponse("공지를 찾지 못했어요.", { status: 400 });

  const supabase = createClient();
  const { data: notice } = await supabase
    .from("notices")
    .select("title, date, photos")
    .eq("id", nid)
    .maybeSingle();
  const paths = (notice?.photos || []).filter(Boolean);
  if (paths.length === 0) {
    return new NextResponse("붙은 파일이 없어요.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // 하나씩 받아서 담는다. **하나가 안 받아지면 통째로 멈춘다** —
  // 여덟 개 중 일곱 개만 든 zip 을 조용히 주면, 빠진 하나를 아무도 모른다.
  const entries = [];
  for (const p of paths) {
    const { data, error } = await supabase.storage.from("notices").download(p);
    if (error || !data) {
      return new NextResponse(`「${shownName(p)}」 을(를) 받지 못했어요. 다시 눌러주세요.`, {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    entries.push({ name: shownName(p), bytes: new Uint8Array(await data.arrayBuffer()) });
  }

  const zip = makeZip(entries);
  const base = `${notice?.date || ""} ${notice?.title || "전달사항"}`.trim();
  // 파일 이름에 한글을 그대로 — 브라우저 규격(RFC 5987)대로 적어야 안 깨진다
  const fname = encodeURIComponent(`${base}.zip`.replace(/[\\/]/g, " "));
  return new NextResponse(zip, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename*=UTF-8''${fname}`,
      "content-length": String(zip.length),
    },
  });
}
