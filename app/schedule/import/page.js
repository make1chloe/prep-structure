/** 📡 학사일정 받아오기 — 목업 12b(전국과 학교를 가른다, 확정-㊲). 판단은 lib/neis-plan(순수) · 손은 lib/neis · lib/schedule. 층: 로그인 확인 → 오늘 → 받아오기 판 한 벌(import_board) = 3단 */
import { guard } from "@/lib/session";
import { Oops } from "../../_shell/oops.js";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { importBoard } from "@/lib/schedule";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1100, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Import() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📡</span>학사일정 받아오기는 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { const date = await today(sb); d = { date, board: await importBoard(sb, date), principal: me.role === "principal" }; }
  catch (e) { { console.error("[화면] 받아오기 못 엶:", e); return frame(<Oops what="받아오기" e={e} />); } }
  return frame(<Board d={d} />);
}
