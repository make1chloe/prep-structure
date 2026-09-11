/** 🎬 영상 배정 19 — 원장 쪽: 영상(폴더) · 배정(영상 × 아이 + 마감) · 배정 대비 다 봄/보다 맒/안 봄 · 📨 안 본 아이 재촉 · 마감 미루기. 판단은 lib/video-plan(순수) · 손은 lib/video.
 *  층: 로그인 확인 → 오늘 → 영상 판 한 벌(video_board) = 3단. 학원 사람만. 영상은 루틴 밖 — 못하는 아이에게만 따로(목업 notes 「정리된 것」) */
import { guard } from "@/lib/session";
import { Oops } from "../../_shell/oops.js";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { videoBoard } from "@/lib/video";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 960, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Videos() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🎬</span>영상 배정은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다 — 내 영상은 「나」 화면에서 봅니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { const date = await today(sb); const board = await videoBoard(sb, date); d = { date, board }; }
  catch (e) { { console.error("[화면] 영상 못 엶:", e); return frame(<Oops what="영상" e={e} />); } }
  return frame(<Board d={d} />);
}
