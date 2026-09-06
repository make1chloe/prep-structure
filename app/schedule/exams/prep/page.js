/** 📄 내신 자료 04(보드 A) — 회차를 고르면: 자료 나무(출처 › 갈래 › 항목) · 학생별(학교 진도 · 오늘 낼 것 · 남은 것) · ♻️ 같은 범위로 지난번에 만든 것(있다는 표시만 · 체크된 채로 선다, 확정-㊵) · 여기서 생긴 할 일. 판단은 lib/todo-plan(순수) · 손은 lib/todo.
 *  층: 로그인 확인 → 주소 인자 → 오늘 → 내신 자료 판 한 벌(prep_board) = 4단. 학원 사람만 */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { prepBoard } from "@/lib/todo";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1040, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Prep({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📄</span>내신 자료는 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다 — 받을 학습지는 「나」 화면에서 봅니다.` : "로그인이 필요합니다."}</p></div>);
  const sp = await searchParams;
  let d;
  try { const date = await today(sb); const board = await prepBoard(sb, /^[0-9a-f-]{36}$/.test(String(sp?.e ?? "")) ? String(sp.e) : null, date); d = { date, board }; }
  catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>내신 자료를 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 아직 없는 DB 면 0125 까지의 마이그레이션을 먼저 돌립니다(docs/원장님-정하실-것 ㉖).</p></div>); }
  return frame(<Board d={d} />);
}
