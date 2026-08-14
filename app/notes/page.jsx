import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import NotesBoard from "./NotesBoard";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

/**
 * 상담일지 — 한 곳에서 본다.
 *
 * 재원생 목록에서 학생마다 펼쳐 보는 것만으로는 부족하다.
 * "이번 달에 누구랑 상담했더라", "이 학생 지난번에 뭐라고 했더라" 를
 * 한 화면에서 볼 수 있어야 한다.
 */
export default async function NotesPage({ searchParams }) {
  const supabase = createClient();
  const user = await sessionUser(supabase);

  let profile = null;
  if (user) {
    const { data } = await cachedProfile(supabase, user.id);
    profile = data;
  }

  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, status")
    .order("name", { ascending: true });

  const { data: notes, error } = await supabase
    .from("student_notes")
    .select("id, student_id, date, kind, title, raw, body, with_whom, minutes")
    .order("date", { ascending: false })
    // 옮겨온 것만 217건이다. 300 에서 자르면 지난해 것이 조용히 안 보이게 된다 —
    // 「한눈에 보이게」 를 만들면서 정작 오래된 것을 잘라내면 앞뒤가 안 맞는다
    .limit(2000);

  return (
    <>
      <TopBar profile={profile} active="notes" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">기록</p>
          <h1 className="h1">상담일지</h1>
          <Help>
            <p className="sub">
              상담·통화 내용을 남깁니다. <b>말씀하시면 받아쓰고</b>, 끝나고 한 번 다듬으면 됩니다.
            </p>
          </Help>
        </div>
        {error ? (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="err">
              {error.code === "42P01" || error.code === "PGRST205"
                ? "0049 SQL 을 먼저 실행해주세요."
                : error.message}
            </div>
          </div>
        ) : (
          <NotesBoard
            notes={notes || []}
            students={students || []}
            pick={searchParams?.s || ""}
          />
        )}
      </main>
    </>
  );
}
