/** 📚 교재 · 단원 15 — 목록(영역 · 단원 수 · 쓰는 아이) → 고른 교재(교재ID · 영역 · 배정 겹 · 차례 기준 · 다른 이름 · 활동 차례 · 단원 대›중›소 · 문법 분류) · ⬆ 엑셀 올리기(15b 모달 — 저장 전에 보여준다) · ⬇ 엑셀.
 *  판단은 lib/book-plan(순수) · 손은 lib/book. 층: 로그인 확인 → 주소 인자 → 오늘 → 교재 판 한 벌(book_board) = 4단. 학원 사람만 */
import { guard } from "@/lib/session";
import { Oops } from "../_shell/oops.js";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { bookBoard } from "@/lib/book";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1100, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Books({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📚</span>교재는 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다 — 내 교재는 「나」 화면에서 봅니다.` : "로그인이 필요합니다."}</p></div>);
  const sp = await searchParams;
  let d;
  try { const date = await today(sb); const board = await bookBoard(sb, date, /^[0-9a-f-]{36}$/.test(String(sp?.b ?? "")) ? String(sp.b) : null); d = { date, board, area: String(sp?.a ?? "") || null }; }
  catch (e) { { console.error("[화면] 교재 못 엶:", e); return frame(<Oops what="교재" e={e} />); } }
  return frame(<Board d={d} />);
}
