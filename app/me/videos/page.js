/** 🎬 영상 19 — 아이 쪽: 배정된 영상(마감 · 아직/N% 봄/다 봄 · 이어 볼 자리) · ▶ 보기는 앱 안 재생(유튜브 IFrame — 지나간 구간만 센다 · 임베드가 막힌 영상은 「유튜브에서 보기」).
 *  층: 로그인 확인 → 주소 인자 → 오늘∥제 학생 줄 → 배정∥구간∥규칙 = 4단. 판단은 lib/video-plan(순수) */
import { guard } from "@/lib/session";
import { ROLES, isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { myStudent } from "@/lib/arrival";
import { myAssigns, myProgress } from "@/lib/video";
import { ruleMap } from "@/lib/rule";
import { myRows, mmss } from "@/lib/video-plan";
import Player from "./player.js";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 560, margin: "16px auto", padding: "0 12px" }}><div className="mine">{children}</div></main>;
const rows = (r, what) => { if (r?.error) throw new Error(`${what}을 못 읽음: ${r.error.message}`); return r?.data ?? []; };
export default async function MyVideos({ searchParams }) {
  const { sb, me, user } = await guard();
  if (!me) redirect("/");
  if (isStaff(me.role)) return frame(<div className="task"><div className="h"><b>🎬 아이 화면입니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>학원 사람은 교재 › 영상에서 배정합니다.</p></div>);
  if (me.role !== ROLES.STUDENT) redirect("/");
  const sp = await searchParams;
  let d;
  try {
    const [date, st] = await Promise.all([today(sb), myStudent(sb, user.id)]);
    const [aR, pR, rules] = await Promise.all([myAssigns(sb, st.id), myProgress(sb, st.id), ruleMap(sb, ["video."])]);
    const list = myRows(rows(aR, "영상 배정"), rows(pR, "영상 구간"), Number(rules["video.done_pct"] ?? 95), date);
    d = { date, list, open: list.find((r) => r.video_id === String(sp?.v ?? "")) ?? null };
  } catch (e) { return frame(<div className="task"><div className="h"><b>⚠️ 영상을 못 열었습니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>{String(e?.message ?? e)}</p></div>); }
  const left = d.list.filter((r) => r.status.key !== "done").length;
  return frame(<>
    <div className="wv" style={{ margin: "0 0 4px" }}><a className="btn sm gho" href="/me">← 나</a><b style={{ fontSize: "var(--fs-6)" }}>🎬 영상</b><span className="spacer" /><span className={"pill" + (left ? " warn" : "")} data-g="left">{left ? `${left}개 남음` : d.list.length ? "다 봤어요" : "없음"}</span></div>
    {d.open && <Player row={d.open} />}
    {!d.list.length && <div className="task"><div className="h"><b>배정된 영상이 없어요</b></div><p className="note" style={{ margin: "8px 0 0" }}>선생님이 영상을 배정하면 여기 떠요.</p></div>}
    {d.list.map((r) => <div className="task" key={r.id} data-g="video-row" data-video={r.video_id} data-status={r.status.key} style={{ borderStyle: r.status.key === "none" ? "dashed" : undefined }}>
      <div className="h"><b>{r.video?.title}</b><span className="spacer" /><span className={"pill " + r.status.cls} data-g="status">{r.status.text}</span></div>
      <p className="note k" style={{ margin: "4px 0 0" }}>{[r.video?.folder, r.video?.seconds ? mmss(r.video.seconds) : null, r.due || null].filter(Boolean).join(" · ")}{r.late ? " — 지났어요" : ""}</p>
      {r.status.key !== "done" && r.lastPos > 0 && <p className="note k" style={{ margin: "4px 0 0" }}>이어 볼 자리 {mmss(r.lastPos)} · 건너뛴 구간은 <b>안 센 구간</b>이에요</p>}
      <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}><a className={"btn sm" + (r.status.key === "done" ? "" : " pri")} href={`/me/videos?v=${r.video_id}`} data-act="open">▶ {r.status.key === "done" ? "다시 보기" : r.lastPos > 0 ? "이어 보기" : "보기"}</a></div>
    </div>)}
    <p className="note k" style={{ margin: "8px 0 0" }}>앱 안에서 봐요 — 유튜브로 나가지 않아요 · 지나간 구간만 세고, 끌어다 놓은 자리는 안 세요 · 「몇 %」는 대략이에요</p>
  </>);
}
