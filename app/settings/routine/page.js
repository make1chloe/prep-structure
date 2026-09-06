/** 🔁 루틴 — 목업 11(설정 › 루틴). 학원 기본 루틴(영역마다 한 벌 · 교재가 늘어도 안 는다) · 아이마다 고른 것(확정-㉒) · 교재는 잇기만(기준·회차·이대로면).
 *  판단은 lib/routine-plan(순수) · 손은 lib/routine, 여기는 가져다 그린다. 층: 로그인 확인 → 주소 인자 → 오늘 → 루틴 판 한 벌(routine_board) = 4단 */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { routineBoard } from "@/lib/routine";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1100, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Routine({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🔁</span>루틴은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  const sp = await searchParams;
  let d;
  try { const date = await today(sb); d = { date, board: await routineBoard(sb, sp?.s ? String(sp.s) : null, date) }; }
  catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>루틴을 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 아직 없는 DB 면 0119 까지의 마이그레이션을 먼저 돌립니다(docs/원장님-정하실-것 ㉖).</p></div>); }
  return frame(<Board d={d} />);
}
