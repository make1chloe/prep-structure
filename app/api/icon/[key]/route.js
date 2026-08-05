import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * 홈 화면 아이콘 — `/api/icon/512` 처럼 부른다.
 *
 * 원장님이 설정에서 올린 로고를 내어준다 (0080).
 *
 * **기본 그림은 없다.** 예전에는 제가 도형으로 그린 로고를 넣어뒀는데,
 * 그건 원장님 로고가 아니었다. 진짜가 아닌 것을 학생 폰에 띄우느니
 * 아무것도 안 내놓는 편이 낫다 — 안 올렸으면 404 다.
 *
 * **로그인 없이 열린다.** 브라우저가 manifest 를 읽을 때는 로그인 정보가
 * 없을 수 있고, 담기는 것은 학원 로고뿐이라 감출 것이 없다.
 */
const KEYS = new Set(["192", "512", "192m", "512m", "apple", "favicon"]);

export async function GET(_req, { params }) {
  const key = (params?.key || "").replace(/[^a-z0-9]/gi, "");
  if (!KEYS.has(key)) return new Response("없는 아이콘", { status: 404 });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await supabase
      .from("app_assets")
      .select("mime, data, updated_at")
      .eq("key", `icon-${key}`)
      .maybeSingle();

    if (!data?.data) {
      return new Response("아직 로고를 안 올렸어요", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new Response(Buffer.from(data.data, "base64"), {
      headers: {
        "Content-Type": data.mime || "image/png",
        // 폰이 아이콘을 오래 들고 있는다. 바꾼 것이 바로 보이도록 짧게 잡고,
        // 화면에서는 주소 뒤에 시각을 붙여 한 번 더 확실히 한다.
        "Cache-Control": "public, max-age=60, must-revalidate",
        ETag: `"${data.updated_at}"`,
      },
    });
  } catch {
    // 0080 이 아직 안 들어갔거나 DB 가 잠깐 안 될 때
    return new Response("아이콘을 못 찾았어요", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
