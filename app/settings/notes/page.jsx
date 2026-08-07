import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import PrincipalOnly from "@/components/PrincipalOnly";
import NotesForm from "./NotesForm";
import { listNotes } from "../noteActions";

export const dynamic = "force-dynamic";

/**
 * 화면 안내 문구 (0093).
 *
 * 원장님 (2026-08-06)
 *   「메뉴에 대한 안내는 설정페이지에서 내가 직접 적게해줘 특히 학생학부모용」
 *
 * 화면의 안내는 지금까지 전부 내가 코드에 적어 넣은 것이었다. 아이들에게
 * 하는 말은 원장님이 제일 잘 아시고, 고치려고 매번 나를 부르셔야 하는 것도
 * 이상하다. **자리만 코드가 잡고, 말은 원장님이 적으신다.**
 */
export default async function NotesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    profile = data;
  }
  if (!["principal", "instructor"].includes(profile?.role)) {
    return <PrincipalOnly profile={profile} what="화면 안내 문구" />;
  }

  const { notes, error } = await listNotes();

  return (
    <>
      <TopBar profile={profile} active="guide" />
      <main className="wrap" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <p className="eyebrow">설정 · 화면</p>
          <h1 className="h1">안내 문구</h1>
          <p className="sub">
            화면마다 맨 위에 뜨는 안내를 <b>직접 적으실 수 있습니다</b>.
            안 적으시면 지금 나오는 문구가 그대로 나옵니다.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <p className="hint" style={{ margin: 0, lineHeight: 1.8 }}>
            <b>학생·학부모 화면이 제일 중요합니다.</b> 알림톡을 끊고 안내를 전부 앱으로
            들였기 때문에, 이제 그 화면이 학원의 말이 닿는 자리입니다.
            <br />
            여기 적은 글은 <b>그 화면을 여는 모든 아이·어머니에게 똑같이</b> 보입니다.
            한 사람에게만 할 말은 <b>재원생 정보 → 일정</b> 이나 <b>발송 → 안내</b> 를 쓰세요.
            <br />
            <Link className="sky" href="/settings/screen">화면 설정(메뉴 · 테마 · 로고)</Link>
            {" · "}
            <Link className="sky" href="/me">학생 화면 보기</Link>
            {" · "}
            <Link className="sky" href="/parent">학부모 화면 보기</Link>
          </p>
        </div>

        <NotesForm notes={notes} unavailable={error} />
      </main>
    </>
  );
}
