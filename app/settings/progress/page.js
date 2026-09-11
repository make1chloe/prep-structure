/** ✎ 진도 체크 열기(목업 08 아래 「원장님 쪽」 · 확정-㊶) — 학원 전체 켬/끔(켠 날 · N일째) · 아이마다(끔·켬·학원 따라감) · 아이가 찍은 것 확인·되돌리기(한 번에) · 아이가 단 ❗(진도는 안 바뀐다 — 처분만).
 *  판단은 lib/road-plan(순수) · 손은 lib/progress. 층: 로그인 확인 → 오늘 → 판 한 벌(progress_board) = 3단. 학원 사람만 */
import { guard } from "@/lib/session";
import { Oops } from "../../_shell/oops.js";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { progressBoard } from "@/lib/progress";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 880, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function ProgressEdit() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">✎</span>진도 체크 열기는 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다 — 내 진도는 「나 › 내 교재」에서 찍습니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { const date = await today(sb); d = { date, board: await progressBoard(sb, date) }; }
  catch (e) { { console.error("[화면] 진도 체크 판 못 엶:", e); return frame(<Oops what="진도 체크 판" e={e} />); } }
  return frame(<Board d={d} />);
}
