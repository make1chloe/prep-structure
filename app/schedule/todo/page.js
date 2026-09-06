/** 🗂️ 내 할 일 05 — 종류가 바깥 축(자료 만들기 · 인쇄 · 배부 · 단원평가 출제 · 재시험지 · 성적 받기 · 되풀이 · 메모). 표 하나에 보기 둘(⊞표 · ▦보드) — 보기를 바꿔도 서버 조회 0(속도-1 예외, 원장님 9/5 ㉖).
 *  판단은 lib/todo-plan(순수) · 손은 lib/todo. 층: 로그인 확인 → 오늘 → 할 일 판 한 벌(todo_board — 오늘 되풀이가 안 돌았으면 한 번 돌리고 다시) = 3단. 학원 사람만 */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { todoBoard } from "@/lib/todo";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1180, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Todo() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🗂️</span>할 일은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { const date = await today(sb); d = { date, board: await todoBoard(sb, date) }; }
  catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>할 일을 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 아직 없는 DB 면 0125 까지의 마이그레이션을 먼저 돌립니다(docs/원장님-정하실-것 ㉖).</p></div>); }
  return frame(<Board d={d} />);
}
