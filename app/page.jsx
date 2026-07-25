import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function cut(t) {
  return t ? t.slice(0, 5) : "";
}

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  let counts = { students: 0, classes: 0, textbooks: 0 };
  let today = [];
  let doneCount = 0;
  let todayTotal = 0;

  const seoul = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const date = seoul.toISOString().slice(0, 10);
  const dow = DAYS[seoul.getDay()];

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;

    const [s, c, t, cls, mem, att] = await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("status", "enrolled"),
      supabase.from("classes").select("id", { count: "exact", head: true }),
      supabase.from("textbooks").select("id", { count: "exact", head: true }),
      supabase
        .from("classes")
        .select("id, name, days, start_time, end_time, room")
        .order("start_time", { ascending: true }),
      supabase.from("class_students").select("class_id, student_id"),
      supabase.from("attendance").select("student_id, status").eq("date", date),
    ]);

    counts = {
      students: s.count || 0,
      classes: c.count || 0,
      textbooks: t.count || 0,
    };

    const marked = new Set((att.data || []).map((a) => a.student_id));
    today = (cls.data || [])
      .filter((k) => (k.days || []).includes(dow))
      .map((k) => {
        const ids = (mem.data || [])
          .filter((m) => m.class_id === k.id)
          .map((m) => m.student_id);
        const done = ids.filter((id) => marked.has(id)).length;
        todayTotal += ids.length;
        doneCount += done;
        return { ...k, total: ids.length, done, left: ids.length - done };
      });
  }

  return (
    <>
      <TopBar profile={profile} active="home" />
      <main className="wrap-wide">
        <div className="page-head">
          <p className="eyebrow">대시보드</p>
          <h1 className="h1">안녕하세요, {profile?.name || "원장"}님</h1>
          <p className="sub">
            {seoul.getMonth() + 1}월 {seoul.getDate()}일 ({dow})
            {todayTotal > 0
              ? ` · 오늘 등원 ${todayTotal}명 중 ${doneCount}명 처리`
              : ""}
          </p>
        </div>

        {/* 오늘 수업 */}
        <div className="card" style={{ marginTop: 14, padding: 0, overflow: "hidden" }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", padding: "14px 16px 0" }}
          >
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>오늘 수업</h2>
            <Link href="/today" className="btn btn-primary btn-sm">
              출결 입력
            </Link>
          </div>

          {today.length === 0 ? (
            <p className="muted" style={{ padding: 16, margin: 0, fontSize: 13.5 }}>
              오늘({dow}) 수업이 없습니다. <b>반</b> 메뉴에서 요일을 설정하면 여기에 나타나요.
            </p>
          ) : (
            <table className="tbl" style={{ marginTop: 10 }}>
              <tbody>
                {today.map((k) => (
                  <tr key={k.id}>
                    <td style={{ fontWeight: 700, width: 110 }}>
                      {cut(k.start_time)}
                      {k.end_time ? `-${cut(k.end_time)}` : ""}
                    </td>
                    <td>
                      {k.name}
                      <span className="muted" style={{ fontSize: 12 }}>
                        {k.room ? ` · ${k.room}` : ""}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", width: 120 }}>
                      {k.left > 0 ? (
                        <span className="tag tag-amber">남은 {k.left}명</span>
                      ) : (
                        <span className="tag tag-mint">완료</span>
                      )}
                      <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
                        {k.total}명
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="stats" style={{ margin: "14px 0" }}>
          <div className="stat">
            <div className="k">재원생</div>
            <div className="v">{counts.students}</div>
          </div>
          <div className="stat">
            <div className="k">반</div>
            <div className="v">{counts.classes}</div>
          </div>
          <div className="stat">
            <div className="k">교재</div>
            <div className="v">{counts.textbooks}</div>
          </div>
        </div>

        {counts.students === 0 && (
          <div className="notice" style={{ marginBottom: 16 }}>
            아직 등록된 학생이 없습니다. <b>학생</b> 메뉴에서 엑셀로 한 번에 올릴 수 있어요.
          </div>
        )}

        <div className="row">
          <Link href="/students" className="btn btn-ghost">학생</Link>
          <Link href="/classes" className="btn btn-ghost">반</Link>
          <Link href="/textbooks" className="btn btn-ghost">교재 · 단원</Link>
        </div>
      </main>
    </>
  );
}
