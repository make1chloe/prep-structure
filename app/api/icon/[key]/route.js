import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * 홈 화면 아이콘 — `/api/icon/512` 처럼 부른다.
 *
 * 원장님이 설정에서 올린 로고를 내어준다 (0080). 아직 안 올렸으면 코드에
 * 들어 있는 기본 그림으로 물러난다 — 아이콘이 아예 안 나오면 폰 바탕에
 * 빈 네모가 생긴다.
 *
 * **로그인 없이 열린다.** 브라우저가 manifest 를 읽을 때는 로그인 정보가
 * 없을 수 있고, 담기는 것은 학원 로고뿐이라 감출 것이 없다.
 */
const FALLBACK = {
  "192": "icon-192.png",
  "512": "icon-512.png",
  "192m": "icon-192-maskable.png",
  "512m": "icon-512-maskable.png",
  apple: "apple-touch-icon.png",
  favicon: "favicon.png",
};

export async function GET(_req, { params }) {
  const key = (params?.key || "").replace(/[^a-z0-9]/gi, "");
  if (!FALLBACK[key]) return new Response("없는 아이콘", { status: 404 });

  // 1) 올려두신 것이 있으면 그것
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await supabase
      .from("app_assets")
      .select("mime, data, updated_at")
      .eq("key", `icon-${key}`)
      .maybeSingle();
    if (data?.data) {
      return new Response(Buffer.from(data.data, "base64"), {
        headers: {
          "Content-Type": data.mime || "image/png",
          // 폰이 아이콘을 오래 들고 있으므로 바꾸면 바로 보이게 짧게 잡는다
          "Cache-Control": "public, max-age=300, must-revalidate",
          ETag: `"${data.updated_at}"`,
        },
      });
    }
  } catch {
    /* 0080 전이거나 DB 가 잠깐 안 될 때 — 아래 기본 그림으로 간다 */
  }

  // 2) 아직 안 올리셨으면 코드에 들어 있는 기본 그림
  try {
    const buf = await readFile(path.join(process.cwd(), "public", FALLBACK[key]));
    return new Response(buf, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return new Response("아이콘을 못 찾았어요", { status: 404 });
  }
}
