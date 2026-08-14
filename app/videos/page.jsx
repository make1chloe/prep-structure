import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Help from "@/components/Help";
import VideoBoard from "./VideoBoard";
import { rollup } from "@/lib/video";
import YoutubeKeyBox from "./YoutubeKeyBox";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const supabase = createClient();
  const user = await sessionUser(supabase);

  // **파도** (속도 대원칙 — 원칙 6): 서로 필요한 것이 없는 조회를 한꺼번에
  const [profileQ, foldersQ, videosQ, asgQ, viewsQ, studentsQ, classesQ, rosterQ, ytQ] =
    await Promise.all([
      user
        ? cachedProfile(supabase, user.id)
        : Promise.resolve({ data: null }),
      supabase.from("video_folders").select("id, name, note, sort").order("sort", { ascending: true }),
      supabase
        .from("videos")
        .select("id, folder_id, title, url, provider, vid, note, active, sort")
        .order("sort", { ascending: true })
        .order("created_at", { ascending: false }),
      supabase.from("video_assignments").select("video_id, student_id, assigned_on, due_on"),
      supabase.from("video_views").select("video_id, student_id, opened_at, last_at, opens, done_at"),
      supabase
        .from("students")
        .select("id, name, status")
        .eq("status", "enrolled")
        .order("name", { ascending: true }),
      // 반 — 「이 반 전체」 로 한 번에 고를 수 있게
      supabase.from("classes").select("id, name").order("name", { ascending: true }),
      supabase.from("class_students").select("class_id, student_id"),
      // 유튜브 키는 넣어뒀는지만 본다 — 키 자체는 화면으로 안 내려간다
      supabase.from("integrations").select("config").eq("id", "youtube").maybeSingle(),
    ]);
  const profile = profileQ?.data || null;
  const { data: folders, error: fErr } = foldersQ;
  const { data: videos } = videosQ;
  const { data: assignments } = asgQ;
  const { data: views } = viewsQ;
  const { data: students } = studentsQ;
  const { data: classes } = classesQ;
  const { data: roster } = rosterQ;
  const { data: ytRow } = ytQ;
  const ytSaved = !!ytRow?.config?.key;

  const rows = rollup(videos || [], assignments || [], views || [], students || []);
  const needSql = !!fErr && (fErr.code === "42P01" || fErr.code === "PGRST205");

  return (
    <>
      <TopBar profile={profile} active="videos" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">교재</p>
          <h1 className="h1">영상</h1>
          <Help>
            <p className="sub">
              유튜브 주소를 붙여넣고 학생에게 냅니다. 학생 화면에서 영상을 열면{" "}
              <b>연 시각이 저절로 적혀요</b> — 물어보지 않아도 누가 안 봤는지 보입니다.
              <b> 안 봄 · 열어만 봄 · 다 봄</b> 세 가지로 나눠서 보여줍니다.
            </p>
          </Help>
        </div>

        {needSql ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="notice">
              영상을 쓰려면 설정 → Supabase SQL 에서 <b>0065</b> 를 한 번 실행해주세요.
            </div>
          </div>
        ) : (
          <>
          <div style={{ marginTop: 12 }}>
            <YoutubeKeyBox saved={ytSaved} />
          </div>
          <VideoBoard
            folders={folders || []}
            videos={rows}
            students={students || []}
            classes={classes || []}
            roster={roster || []}
          />
          </>
        )}
      </main>
    </>
  );
}
