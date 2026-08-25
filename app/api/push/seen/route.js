import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/session";

/**
 * 알림이 폰에 닿았거나, 눌러서 열렸을 때 (0105).
 *
 * public/sw.js 가 부른다. 서비스워커에서 서버액션을 부를 수는 없어서
 * 주소 하나를 둔다.
 *
 * **여기서는 아무것도 안 돌려준다.** 돌려주는 것이 있으면 언젠가 화면이
 * 그걸 읽고, 그러면 「읽음」 이 학부모·학생 눈에 띈다. 표 자체도 잠겨
 * 있고(0105 정책), 적는 것은 `mark_push_seen` 이라는 문 하나로만 한다 —
 * 그 문은 **자기 줄의 시각 두 칸**만 고칠 수 있다.
 *
 * 세다가 잘못돼도 조용히 넘어간다. 알림을 세는 일 때문에 무언가가
 * 멈추면 본말이 뒤집힌다.
 */
export async function POST(request) {
  try {
    const { r, opened } = await request.json();
    if (!r) return NextResponse.json({}, { status: 204 });

    const supabase = await createClient();
    const user = await sessionUser(supabase);
    if (!user) return NextResponse.json({}, { status: 204 });

    await supabase.rpc("mark_push_seen", { p_id: r, p_opened: !!opened });
  } catch {
    /* 조용히 */
  }
  return NextResponse.json({}, { status: 204 });
}
