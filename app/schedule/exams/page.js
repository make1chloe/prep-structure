/** 🏫 시험 회차 06b — 범위와 시험일(보드 B가 하던 일). 학교 × 학년 회차마다: 보는 아이 · 영어 시험일 · 범위(교재 단원) · 교재 멈춤(N주 전부터 · 끝나는 날 저절로) · 안 봄 · 숨김. 전국은 학교를 안 붙인다.
 *  판단은 lib/exam-plan(순수) · 손은 lib/exam, 여기는 가져다 그린다. 층: 로그인 확인 → 오늘 → 시험 회차 판 한 벌(exam_board) = 3단 */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { examBoard } from "@/lib/exam";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1040, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Exams() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🏫</span>시험 회차는 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { const date = await today(sb); d = { date, board: await examBoard(sb, date) }; }
  catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>시험 회차를 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 아직 없는 DB 면 0122 까지의 마이그레이션을 먼저 돌립니다(docs/원장님-정하실-것 ㉖).</p></div>); }
  return frame(<Board d={d} />);
}
