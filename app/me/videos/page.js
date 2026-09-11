/** 🎬 영상 19 — 아이 쪽: 배정된 영상(마감 · 아직/N% 봄/다 봄 · 이어 볼 자리) · ▶ 보기는 앱 안 재생(유튜브 IFrame — 지나간 구간만 센다 · 임베드가 막힌 영상은 「유튜브에서 보기」).
 *  층: 로그인 확인 → 주소 인자 → 오늘∥제 학생 줄 → 배정∥구간∥규칙 = 4단. 판단은 lib/video-plan(순수) */
import Link from "next/link";
import { Oops } from "../../_shell/oops.js";
import { guard } from "@/lib/session";
import { ROLES, isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { myStudent } from "@/lib/arrival";
import { asView, screenStudent } from "@/lib/asview";
import AsBand from "../../_shell/asband.js";
import { accessQuery } from "@/lib/access";
import { decide, ME } from "@/lib/perm";
import { mineBoard } from "@/lib/files";
import { ruleMap } from "@/lib/rule";
import { myRows, mmss, nextOf, opensText } from "@/lib/video-plan";
import Player from "./player.js";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 560, margin: "16px auto", padding: "0 12px" }}><div className="mine">{children}</div></main>;
const rows = (r, what) => { if (r?.error) throw new Error(`${what}을 못 읽음: ${r.error.message}`); return r?.data ?? []; };
export default async function MyVideos({ searchParams }) {
  const { sb, me, user } = await guard();
  if (!me) redirect("/");
  if (isStaff(me.role)) return frame(<div className="task"><div className="h"><b>🎬 아이 화면입니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>학원 사람은 교재 › 영상에서 배정합니다.</p></div>);
  const sp = await searchParams;
  const seeing = asView(me, sp);   // 👁 (lib/asview)
  if (!seeing && me.role !== ROLES.STUDENT) redirect("/");
  let d;
  try {
    const [date, st] = await Promise.all([today(sb), screenStudent(sb, me, user, sp)]);
    const [mine, rules, acc] = await Promise.all([mineBoard(sb, st.id, date), ruleMap(sb, ["video."]), accessQuery(sb, ROLES.STUDENT)]);   // 📎·🎬 한 판 + 권한(같은 파도 — 층이 안 는다)
    const list = myRows(mine.assigns, mine.progress, Number(rules["video.done_pct"] ?? 95), date);
    const open = list.find((r) => r.video_id === String(sp?.v ?? "")) ?? null;
    d = { date, list, open, next: open ? nextOf(list, open.video_id) : null, access: acc?.data ?? [] };   // ⑥ 다음 영상(안 본 것 차례)
  } catch (e) { { console.error("[화면] 영상 못 엶:", e); return frame(<Oops what="영상" e={e} kind="task" />); } }
  // 주소로 바로 들어와도 원장님이 끈 카드는 안 열린다 — 07 의 영상 카드와 **같은 열쇠**다
  if (decide(ROLES.STUDENT, d.access, ME.books) !== true) return frame(<div className="task"><div className="h"><b>🔐 아직 열리지 않았어요</b></div><p className="note" style={{ margin: "8px 0 0" }}>원장님이 「누가 무엇을 보나」에서 「내 교재」를 켜면 보입니다.</p></div>);
  const left = d.list.filter((r) => r.status.key !== "done").length;
  return frame(<>
    <div className="wv" style={{ margin: "0 0 4px" }}><Link prefetch={false} className="btn sm gho" href="/me">← 나</Link><b style={{ fontSize: "var(--fs-6)" }}>🎬 영상</b><span className="spacer" /><span className={"pill" + (left ? " warn" : "")} data-g="left">{left ? `${left}개 남음` : d.list.length ? "다 봤어요" : "없음"}</span></div>
    {d.open && <Player row={d.open} next={d.next} />}
    {!d.list.length && <div className="task"><div className="h"><b>배정된 영상이 없어요</b></div><p className="note" style={{ margin: "8px 0 0" }}>선생님이 영상을 배정하면 여기 떠요.</p></div>}
    {d.list.map((r) => <div className="task" key={r.id} data-g="video-row" data-video={r.video_id} data-status={r.status.key} style={{ borderStyle: r.status.key === "none" ? "dashed" : undefined }}>
      <div className="h"><b>{r.video?.title}</b><span className="spacer" /><span className={"pill " + r.status.cls} data-g="status">{r.status.text}</span></div>
      <p className="note k" style={{ margin: "4px 0 0" }}>{[r.video?.folder, r.video?.seconds ? mmss(r.video.seconds) : null, r.due || null, opensText(r.opens) || null].filter(Boolean).join(" · ")}{r.late ? " — 지났어요" : ""}</p>
      {r.bar.parts.length > 0 && <div className="vbar" data-g="vbar" style={{ marginTop: 8 }}>{r.bar.parts.map((x, i) => <div className="vseen" key={i} style={{ left: `${x.left}%`, width: `${x.width}%` }} />)}{r.bar.head != null && r.status.key !== "done" && <div className="vhead" style={{ left: `${r.bar.head}%` }} />}</div>}
      {r.status.key !== "done" && r.lastPos > 0 && <p className="note k" style={{ margin: "4px 0 0" }}>이어 볼 자리 {mmss(r.lastPos)} · 건너뛴 구간은 <b>안 센 구간</b>이에요</p>}
      <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}><Link prefetch={false} className={"btn sm" + (r.status.key === "done" ? "" : " pri")} href={`/me/videos?v=${r.video_id}`} data-act="open">▶ {r.status.key === "done" ? "다시 보기" : r.lastPos > 0 ? "이어 보기" : "보기"}</Link></div>
    </div>)}
    <p className="note k" style={{ margin: "8px 0 0" }}>앱 안에서 봐요 — 유튜브로 나가지 않아요 · 지나간 구간만 세고, 끌어다 놓은 자리는 안 세요 · 「몇 %」는 대략이에요</p>
  </>);
}
