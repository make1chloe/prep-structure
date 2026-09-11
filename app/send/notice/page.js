/** 📢 공지 — 남긴 것 14 · 목업 20 「공지에 붙이기」(4단계-6). 만들고(제목·본문·받는 쪽·반/학교) · 📎 자료함에서 붙이고(보내기 전만) · 보낸다(받는 쪽대로 기기 · 자취 notify_log) · 보낸 것은 읽음 a/b.
 *  층: 로그인 확인 → 오늘 → 공지 판 한 벌(notice_board) = 3단. 판단은 lib/notice-plan(순수) · 손은 lib/notice */
import { guard } from "@/lib/session";
import { Oops } from "../../_shell/oops.js";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { noticeBoard } from "@/lib/notice";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 960, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Notice() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📢</span>공지는 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { const date = await today(sb); d = { date, board: await noticeBoard(sb, date) }; }
  catch (e) { { console.error("[화면] 공지 못 엶:", e); return frame(<Oops what="공지" e={e} />); } }
  return frame(<Board d={d} />);
}
