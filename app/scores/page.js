/** 📈 성적 16 — 아이가 넣고 원장님이 확인. 회차를 고르면: 등급컷(한 번 적으면 등급은 세어 나온다) · 문항표(틀린 번호에 영역이 붙는다) · 보는 아이마다 원점수·등급·틀린 문항·낸 때·공개·확인. 판단은 lib/score-plan(순수) · 손은 lib/score.
 *  층: 로그인 확인 → 주소 인자 → 오늘 → 성적 판 한 벌(score_board) = 4단. 학원 사람만 */
import { guard } from "@/lib/session";
import { Oops } from "../_shell/oops.js";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { scoreBoard } from "@/lib/score";
import { rowsOf } from "@/lib/score-plan";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1040, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Scores({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📈</span>성적 넣기·확인은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다 — 내 성적은 「나」 화면에서 봅니다.` : "로그인이 필요합니다."}</p></div>);
  const sp = await searchParams;
  let d;
  try { const date = await today(sb); const board = await scoreBoard(sb, /^[0-9a-f-]{36}$/.test(String(sp?.e ?? "")) ? String(sp.e) : null, date); d = { date, board, rows: rowsOf(board) }; }
  catch (e) { { console.error("[화면] 성적 못 엶:", e); return frame(<Oops what="성적" e={e} />); } }
  return frame(<Board d={d} />);
}
