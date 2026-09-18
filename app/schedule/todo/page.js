/** 🗂️ 내 업무 05 · 종류가 바깥 축(자료 만들기 · 인쇄 · 배부 · 단원평가 출제 · 재시험지 · 성적 받기 · 반복 · 메모). 표 하나에 보기 둘(⊞표 · ▦보드) · 보기를 바꿔도 서버 조회 0(속도-1 예외, 원장님 9/5 ㉖).
 *  판단은 lib/todo-plan(순수) · 손은 lib/todo. 층: 로그인 확인 → 오늘 → 업무 판 한 벌(todo_board · 오늘 반복이 안 돌았으면 한 번 돌리고 다시) = 3단. 학원 사람만 */
import { guard } from "@/lib/session";
import { Oops } from "../../_shell/oops.js";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { todoBoard, listKinds } from "@/lib/todo";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1400, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Todo({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🗂️</span>업무는 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { const [sp, date] = await Promise.all([searchParams, today(sb)]); const [board, kinds] = await Promise.all([todoBoard(sb, date), listKinds(sb)]);   // (어80) 분류 표(0179)는 **같은 파도**에서(속도-1) · 표가 아직 없으면 null 이 오고 화면은 씨앗으로 그린다(대전제-27)
    d = { date, only: String(sp?.m ?? "").split(",").map((x) => x.trim()).filter(Boolean), board, kinds }; }   // 04 「단계 👉」가 넘긴 자료 id(?m=) — 그 자료만 걸러 연다((가)-④) · 주소 인자는 오늘과 같은 파도(층을 안 늘린다 — check-fast 3단)
  catch (e) { { console.error("[화면] 업무 못 엶:", e); return frame(<Oops what="업무" e={e} />); } }
  return frame(<Board d={d} />);
}
