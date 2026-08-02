import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { addDays, longLabel, todaySeoul } from "@/lib/day";
import { summarize } from "@/lib/monthly";
import { threeLines, TONE_CLS, monthRange } from "@/lib/parentView";
import { byKind, summary as scoreSummary, KIND_LABEL, findExam } from "@/lib/scores";
import { cutOf, passCount } from "@/lib/wordTest";
import Comments from "@/app/comments/Comments";
import RequestForm from "@/app/me/RequestForm";
import NoticePhotos from "@/components/NoticePhotos";
import DashCalendar from "@/app/DashCalendar";
import ChildPicker from "./ChildPicker";

export const dynamic = "force-dynamic";

const STAFF = ["principal", "instructor", "assistant"];

/**
 * 학부모 화면.
 *
 * 학생 화면(/me)과 나누는 이유 — **보는 것이 다르다.**
 *   학생   오늘 할 것. 하나씩 눌러 끝낸다
 *   학부모 지금까지 어떻게 하고 있나. 누르는 것은 거의 없다
 *
 * 한 화면에 둘 다 넣으면 학부모에게 "시작하기" 버튼이 보이고, 아이에게는
 * 출결 통계가 보인다. 둘 다 자기 것이 아니다.
 *
 * 선생님은 ?s=학생id 로 **그대로 미리 볼 수 있다.** 학부모가 무엇을 보는지
 * 모르면 "거기 보시면 나와요" 라고 말해줄 수가 없다.
 */
export default async function ParentPage({ searchParams }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("id, name, role").eq("id", user.id).maybeSingle();
  const isStaff = STAFF.includes(profile?.role);

  // 내 아이들 (형제자매가 있으면 여럿)
  let children = [];
  if (isStaff && searchParams?.s) {
    const { data } = await supabase
      .from("students").select("id, name, school, grade").eq("id", searchParams.s).maybeSingle();
    if (data) children = [data];
  } else {
    const { data: links } = await supabase
      .from("parent_student").select("student_id").eq("parent_profile_id", user.id);
    const ids = (links || []).map((l) => l.student_id);
    if (ids.length) {
      const { data } = await supabase
        .from("students").select("id, name, school, grade").in("id", ids).order("name");
      children = data || [];
    }
  }
  const preview = isStaff && !!searchParams?.s;

  if (children.length === 0) {
    return (
      <main className="wrap" style={{ maxWidth: 560 }}>
        <div className="page-head">
          <h1 className="h1">클로이영어</h1>
        </div>
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            {isStaff
              ? "학생을 골라 열어주세요. 재원생 목록에서 「학부모 화면」을 누르시면 됩니다."
              : "아직 연결된 학생이 없어요. 원장님께 연결 코드를 받아주세요."}
          </p>
        </div>
        <form action="/logout" method="post" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
        </form>
      </main>
    );
  }

  const pickId = children.find((c) => c.id === searchParams?.c)?.id || children[0].id;
  const child = children.find((c) => c.id === pickId);

  const today = todaySeoul();
  const { ym, from } = monthRange(today);

  // ── 이번 달 (달이 끝나기 전에도 지금까지를 그대로 센다) ──
  const { data: reps } = await supabase
    .from("daily_reports")
    .select("id, date, attendance_kind, word_correct, word_total, sent_correct, sent_total, notice, report_text")
    .eq("student_id", pickId)
    .gte("date", from)
    .lte("date", today)
    .order("date", { ascending: false });

  const repIds = (reps || []).map((r) => r.id);
  const { data: items } = repIds.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", repIds)
    : { data: [] };
  const itemsOf = new Map();
  (items || []).forEach((i) => {
    if (!itemsOf.has(i.daily_report_id)) itemsOf.set(i.daily_report_id, []);
    itemsOf.get(i.daily_report_id).push(i);
  });
  const withItems = (reps || []).map((r) => ({ ...r, items: itemsOf.get(r.id) || [] }));
  const sum = summarize(withItems, []);
  // 통과선은 이 학생 것 → 없으면 설정의 기본값.
  // 0070 전이면 학생별 통과선 칸이 없다 — 그때는 기본값만 쓴다.
  const { data: warnRow } = await supabase
    .from("settings").select("config").eq("key", "warning").maybeSingle();
  const { data: cutRow } = await supabase
    .from("students").select("word_cut_pct").eq("id", pickId).maybeSingle();
  const cut = cutOf(cutRow, Number(warnRow?.config?.wordPassPct) || 90);
  const lines = threeLines(sum, passCount(reps || [], cut));

  // ── 월간리포트 (지난달까지 나간 것) ──
  const { data: monthly } = await supabase
    .from("monthly_reports")
    .select("ym, text, sent_at")
    .eq("student_id", pickId)
    .order("ym", { ascending: false })
    .limit(3);

  // ── 성적 ──
  const { data: scores } = await supabase
    .from("scores")
    .select("id, kind, taken_on, term, raw_score, full_score, grade, percentile, rank_in, rank_of, school, cuts")
    .eq("student_id", pickId)
    .order("taken_on", { ascending: false })
    .limit(30);
  const scoreGroups = byKind(scores || []);
  // 등급컷은 **회차** 것이다 (0073). 선생님 화면과 같은 컷을 봐야
  // "앱에서는 2등급이라던데요" 가 안 생긴다.
  let { data: exams } = await supabase
    .from("exam_periods")
    .select("id, school, grade, name, from_date, to_date, cuts");
  if (!exams) {
    ({ data: exams } = await supabase
      .from("exam_periods").select("id, school, grade, name, from_date, to_date"));
  }

  // ── 공지 ──
  const { data: rec } = await supabase
    .from("notice_receipts").select("notice_id").eq("student_id", pickId);
  const nIds = [...new Set((rec || []).map((r) => r.notice_id))];
  let notices = [];
  if (nIds.length) {
    let { data } = await supabase
      .from("notices")
      .select("id, date, kind, title, photos, body")
      .in("id", nIds)
      .gte("date", addDays(today, -21))
      .order("date", { ascending: false });
    if (!data) {
      ({ data } = await supabase
        .from("notices").select("id, date, kind, body").in("id", nIds)
        .gte("date", addDays(today, -21)).order("date", { ascending: false }));
    }
    notices = data || [];
  }

  // ── 달력 ──
  const { data: cal } = await supabase
    .from("tasks")
    .select("id, title, kind, due_on, end_on, source")
    .neq("kind", "todo")
    .gte("due_on", addDays(today, -20))
    .lte("due_on", addDays(today, 100))
    .order("due_on", { ascending: true });
  const calendar = (cal || []).map((t) => ({
    date: t.due_on,
    endDate: t.end_on || null,
    title: t.title,
    tone: t.source === "neis" ? "school" : "event",
  }));

  // 내가 보낸 것
  const REQ = "id, kind, from_date, to_date, body, status, reply";
  let { data: myReqs } = await supabase
    .from("requests").select(`${REQ}, photos`).eq("student_id", pickId)
    .order("created_at", { ascending: false }).limit(5);
  if (!myReqs) {
    ({ data: myReqs } = await supabase
      .from("requests").select(REQ).eq("student_id", pickId)
      .order("created_at", { ascending: false }).limit(5));
  }

  const latest = withItems[0] || null;

  return (
    <main className="wrap" style={{ maxWidth: 560, paddingBottom: 40 }}>
      {preview && (
        <div className="card card-tight" style={{ marginBottom: 10, borderLeft: "3px solid var(--amber)" }}>
          <b style={{ fontSize: 13 }}>미리보기</b>
          <p className="hint" style={{ margin: "2px 0 0" }}>
            {child.name} 학부모님이 보는 화면 그대로입니다. 여기서 누르는 것은 기록되지 않아요.
          </p>
        </div>
      )}

      <div className="page-head">
        <p className="eyebrow">클로이영어</p>
        <h1 className="h1">{child.name} 학생</h1>
        <p className="sub">
          {[child.school, child.grade].filter(Boolean).join(" ")}
          {latest ? ` · 최근 수업 ${longLabel(latest.date)}` : ""}
        </p>
      </div>

      {children.length > 1 && <ChildPicker children={children} pick={pickId} />}

      <div className="stack" style={{ marginTop: 10 }}>
        {/* ── 이번 달 — 달이 끝나기 전에도 지금까지를 보여준다 ── */}
        <div className="card">
          <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              이번 달 ({Number(ym.slice(5, 7))}월)
            </h2>
            <span className="hint">수업 {withItems.length}회</span>
          </div>
          <p className="hint" style={{ margin: "2px 0 10px", fontSize: 11.5 }}>
            달이 끝나기 전에도 <b>지금까지</b>를 그대로 세어 보여드립니다.
          </p>

          {withItems.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              이번 달은 아직 수업 기록이 없어요.
            </p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {lines.map((l) => (
                <div className="row" key={l.key} style={{ gap: 8, alignItems: "baseline" }}>
                  <b style={{ fontSize: 13, minWidth: 62 }}>{l.label}</b>
                  <span className={`tag ${TONE_CLS[l.tone]}`}>{l.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 성적 ── */}
        {(scores || []).length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>성적</h2>
            <div className="stack" style={{ gap: 10 }}>
              {["school", "mock", "unit"].map((k) => {
                const list = scoreGroups[k] || [];
                if (list.length === 0) return null;
                return (
                  <div key={k}>
                    <b style={{ fontSize: 13 }}>{KIND_LABEL[k]}</b>
                    <div className="stack" style={{ gap: 3, marginTop: 4 }}>
                      {list.slice(0, 4).map((s) => (
                        <div className="unitrow" key={s.id}>
                          <span className="hint" style={{ minWidth: 68 }}>
                            {s.taken_on ? s.taken_on.slice(2).replaceAll("-", ".") : ""}
                          </span>
                          <b style={{ fontSize: 12.5, minWidth: 110 }}>{s.term || ""}</b>
                          <span style={{ fontSize: 12.5, flex: 1 }}>
                            {scoreSummary(s, findExam(s, exams || [], child))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 최근 데일리리포트 ── */}
        {withItems.some((r) => r.report_text || r.notice) && (
          <div className="card">
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>최근 수업</h2>
            <div className="stack" style={{ gap: 10 }}>
              {withItems
                .filter((r) => r.report_text || r.notice)
                .slice(0, 3)
                .map((r) => (
                  <div key={r.id}>
                    <span className="hint">{longLabel(r.date)}</span>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 2 }}>
                      {r.report_text || r.notice}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── 월간리포트 ── */}
        {(monthly || []).filter((m) => m.text).length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>월간리포트</h2>
            <div className="stack" style={{ gap: 12 }}>
              {(monthly || [])
                .filter((m) => m.text)
                .map((m) => (
                  <div key={m.ym}>
                    <span className="hint">{m.ym.replace("-", "년 ")}월</span>
                    <div style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 2 }}>{m.text}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── 공지 ── */}
        {notices.length > 0 && (
          <div className="card">
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>공지사항</h2>
            <div className="stack" style={{ gap: 12 }}>
              {notices.map((n) => (
                <div key={n.id} className="stack" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                    <span className="hint">{longLabel(n.date)}</span>
                    {n.title && <b style={{ fontSize: 14 }}>{n.title}</b>}
                  </div>
                  {n.body && n.body !== n.title && (
                    <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{n.body}</div>
                  )}
                  <NoticePhotos noticeId={n.id} photos={n.photos || []} readOnly />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 달력 ── */}
        {calendar.length > 0 && (
          <DashCalendar ym={ym} items={calendar} today={today} links={false} />
        )}

        {/* ── 보내기 ── */}
        {!preview && <RequestForm studentId={pickId} mine={myReqs || []} />}

        {/* ── 한마디 ── */}
        {latest && (
          <div className="card">
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>남기실 말씀</h2>
            <Comments reportId={latest.id} studentId={pickId} me={preview ? "staff" : "parent"} />
          </div>
        )}

        {preview ? (
          <Link className="btn btn-ghost btn-block" href="/students">재원생으로 돌아가기</Link>
        ) : (
          <form action="/logout" method="post">
            <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
          </form>
        )}
      </div>
    </main>
  );
}
