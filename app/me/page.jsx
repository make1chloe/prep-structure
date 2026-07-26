import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PushToggle from "./PushToggle";
import InstallHint from "./InstallHint";
import HomeworkCards from "./HomeworkCards";
import RequestForm from "./RequestForm";

export const dynamic = "force-dynamic";

function dayLabel(d) {
  const t = new Date(`${d}T00:00:00+09:00`);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][t.getDay()];
  return `${t.getMonth() + 1}월 ${t.getDate()}일 (${dow})`;
}

export default async function MePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  // 학생 본인 (학부모 계정이면 자녀 중 첫 명)
  let { data: student } = await supabase
    .from("students")
    .select("id, name, school, grade")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!student) {
    const { data: link } = await supabase
      .from("parent_student")
      .select("student_id")
      .eq("parent_profile_id", user.id)
      .limit(1)
      .maybeSingle();
    if (link) {
      const { data: s } = await supabase
        .from("students")
        .select("id, name, school, grade")
        .eq("id", link.student_id)
        .maybeSingle();
      student = s;
    }
  }

  if (!student) {
    return (
      <main className="wrap" style={{ maxWidth: 560 }}>
        <div className="page-head">
          <h1 className="h1">클로이영어</h1>
        </div>
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            {profile?.role === "principal" || profile?.role === "instructor"
              ? "이 화면은 학생용이에요. 선생님 화면은 위 메뉴에서 볼 수 있습니다."
              : "학생 정보가 연결되지 않았어요. 선생님께 말씀해주세요."}
          </p>
        </div>
      </main>
    );
  }

  // 가장 최근 수업의 리포트 = 지금 해야 할 숙제가 담긴 곳
  const { data: reports } = await supabase
    .from("daily_reports")
    .select("id, date, own_progress, notice, word_correct, word_total, sent_correct, sent_total")
    .eq("student_id", student.id)
    .order("date", { ascending: false })
    .limit(6);

  const latest = reports?.[0] || null;
  const reportIds = (reports || []).map((r) => r.id);

  let dri = [];
  if (reportIds.length > 0) {
    const BASE = "daily_report_id, homework_item_id, status";
    let { data, error } = await supabase
      .from("daily_report_items")
      .select(`${BASE}, textbook_unit_id, textbook_unit_ids, range_note`)
      .in("daily_report_id", reportIds);
    if (error) {
      ({ data } = await supabase.from("daily_report_items").select(BASE).in("daily_report_id", reportIds));
    }
    dri = data || [];
  }

  // 숙제 항목 (학습 방법 포함)
  let { data: items, error: itemErr } = await supabase
    .from("homework_items")
    .select("id, name, category, method");
  if (itemErr) {
    ({ data: items } = await supabase.from("homework_items").select("id, name, category"));
  }
  const itemById = new Map((items || []).map((i) => [i.id, i]));

  // 단원 이름
  const idsOf = (x) =>
    x.textbook_unit_ids && x.textbook_unit_ids.length
      ? x.textbook_unit_ids
      : x.textbook_unit_id
      ? [x.textbook_unit_id]
      : [];
  const unitIds = new Set();
  dri.forEach((x) => idsOf(x).forEach((id) => unitIds.add(id)));

  const unitLabel = new Map();
  if (unitIds.size > 0) {
    const { data: picked } = await supabase
      .from("textbook_units")
      .select("id, textbook_id")
      .in("id", [...unitIds]);
    const bookIds = [...new Set((picked || []).map((u) => u.textbook_id))];
    const { data: all } = bookIds.length
      ? await supabase
          .from("textbook_units")
          .select("id, name, parent_id, textbook_id, page_start, page_end")
          .in("textbook_id", bookIds)
      : { data: [] };
    const { data: bookRows } = bookIds.length
      ? await supabase.from("textbooks").select("id, name").in("id", bookIds)
      : { data: [] };
    const bookName = new Map((bookRows || []).map((b) => [b.id, b.name]));
    const byId = new Map((all || []).map((u) => [u.id, u]));
    (all || [])
      .filter((u) => unitIds.has(u.id))
      .forEach((u) => {
        const chain = [];
        let cur = u;
        const seen = new Set();
        while (cur && !seen.has(cur.id)) {
          seen.add(cur.id);
          chain.unshift(cur.name);
          cur = cur.parent_id ? byId.get(cur.parent_id) : null;
        }
        const pages = u.page_start && u.page_end ? ` ${u.page_start}~${u.page_end}p` : "";
        unitLabel.set(u.id, `${bookName.get(u.textbook_id) || ""} ${chain.join(" ")}${pages}`.trim());
      });
  }

  const toCard = (x) => {
    const item = itemById.get(x.homework_item_id);
    return {
      key: `${x.daily_report_id}-${x.homework_item_id}-${x.status}`,
      name: item?.name || "숙제",
      method: item?.method || "",
      units: idsOf(x).map((id) => unitLabel.get(id)).filter(Boolean),
      note: x.range_note || "",
      status: x.status,
    };
  };

  // 지금 해야 할 숙제 = 가장 최근 수업에서 배정한 것
  const todo = latest
    ? dri.filter((x) => x.daily_report_id === latest.id && x.status === "assigned").map(toCard)
    : [];

  // 지난 수업 검사 결과
  const checked = latest
    ? dri.filter((x) => x.daily_report_id === latest.id && x.status !== "assigned").map(toCard)
    : [];

  // 내가 보낸 요청
  const { data: myRequests } = await supabase
    .from("requests")
    .select("id, kind, from_date, to_date, body, status, reply")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(5);

  const notices = (reports || [])
    .filter((r) => r.notice)
    .slice(0, 3)
    .map((r) => ({ date: r.date, body: r.notice }));

  return (
    <main className="wrap" style={{ maxWidth: 560, paddingBottom: 40 }}>
      <div className="page-head">
        <p className="eyebrow">클로이영어</p>
        <h1 className="h1">{student.name} 학생</h1>
        <p className="sub">
          {[student.school, student.grade].filter(Boolean).join(" ")}
          {latest ? ` · 최근 수업 ${dayLabel(latest.date)}` : ""}
        </p>
      </div>

      <div className="stack" style={{ gap: 14, marginTop: 12 }}>
        <InstallHint />
        <PushToggle />
        <RequestForm studentId={student.id} mine={myRequests || []} />

        <div className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800 }}>
            해야 할 숙제 {todo.length > 0 && <span className="tag tag-lav">{todo.length}</span>}
          </h2>
          <p className="hint" style={{ margin: "0 0 12px" }}>
            숙제를 누르면 <b>하는 법</b>이 나와요.
          </p>
          <HomeworkCards items={todo} />
        </div>

        {latest && (latest.word_total || latest.sent_total || latest.own_progress) && (
          <div className="card">
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>지난 수업</h2>
            <div className="stack" style={{ gap: 6 }}>
              {latest.word_total ? (
                <div className="row" style={{ gap: 8 }}>
                  <span className="plabel" style={{ width: 46 }}>단어</span>
                  <b>{latest.word_correct ?? 0} / {latest.word_total}</b>
                </div>
              ) : null}
              {latest.sent_total ? (
                <div className="row" style={{ gap: 8 }}>
                  <span className="plabel" style={{ width: 46 }}>문장</span>
                  <b>{latest.sent_correct ?? 0} / {latest.sent_total}</b>
                </div>
              ) : null}
              {latest.own_progress ? (
                <div className="row" style={{ gap: 8 }}>
                  <span className="plabel" style={{ width: 46 }}>진도</span>
                  <span style={{ fontSize: 13.5 }}>{latest.own_progress}</span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {checked.length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>지난 숙제 검사</h2>
            <HomeworkCards items={checked} />
          </div>
        )}

        {notices.length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>공지</h2>
            <div className="stack" style={{ gap: 6 }}>
              {notices.map((n) => (
                <div key={n.date}>
                  <span className="hint">{dayLabel(n.date)}</span>
                  <div style={{ fontSize: 13.5 }}>{n.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <form action="/logout" method="post">
          <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
