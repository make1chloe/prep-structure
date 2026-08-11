import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { shownName } from "@/lib/noticeFile";

/**
 * **공지에 붙은 파일 한 개를 연다.**
 *
 * 전에는 화면이 열릴 때 10분짜리 링크를 미리 만들어 두고 그것을 걸어놨다.
 * 화면을 열어두고 십 분이 지난 뒤에 누르면 —
 *
 *   {"statusCode":"400","error":"InvalidJWT","message":"\"exp\" claim
 *    timestamp check failed"}
 *
 * 이 영어 글이 통째로 떴다 (원장님, 2026-08-11). 파일이 없어진 것도,
 * 권한이 없는 것도 아닌데 **화면을 오래 켜뒀다는 이유로** 그렇게 보인다.
 *
 * 그래서 **누를 때 만든다.** 이 주소는 안 늙는다.
 *
 * 권한은 여기서 따로 보지 않는다 — 로그인한 그 사람의 자격으로 보관함에
 * 물어보고, 못 볼 사람에게는 보관함이 링크를 안 준다 (0064 의 규칙).
 * 규칙을 두 벌로 적으면 반드시 어긋난다.
 */
export async function GET(request) {
  const p = request.nextUrl.searchParams.get("p") || "";
  const dl = request.nextUrl.searchParams.get("dl") === "1";
  if (!p) return new NextResponse("파일을 찾지 못했어요.", { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("notices")
    .createSignedUrl(p, 300, dl ? { download: shownName(p) } : undefined);

  if (error || !data?.signedUrl) {
    return new NextResponse("이 파일을 열 수 없어요. 선생님께 말씀해주세요.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.redirect(data.signedUrl, { status: 302 });
}
