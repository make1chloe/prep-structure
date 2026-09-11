/** 🗂️ 학교별 표 06c — 표 하나에 보기 둘(표 · 보드). 줄 = 학교·학생·자유, 칸은 원장님이 만든다(종류 여섯 — 확정-56 「앱에서 고르기」) · 보드는 「선택」 칸 하나로 묶어 본 것(카드 = 줄 · 옮기면 그 칸 값이 바뀐다) · 따로 챙길 아이들 띠.
 *  누가 보나: 메뉴 32칸 그대로 — 일정 권한을 따른다(원장님 답 기다림). 판단은 lib/grid-plan(순수) · 손은 lib/grid. 층: 로그인 확인 → 주소 인자 → 오늘 → 표 판 한 벌(grid_board) = 4단. 학원 사람만 */
import { guard } from "@/lib/session";
import { Oops } from "../../_shell/oops.js";
import { isStaff, ROLE_NAME, ROLES } from "@/lib/roles";
import { today } from "@/lib/day";
import { gridBoard } from "@/lib/grid";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1180, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Grid({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🗂️</span>학교별 표는 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  const sp = await searchParams;
  let d;
  try { const date = await today(sb); d = { date, principal: me.role === ROLES.PRINCIPAL, sel: /^[0-9a-f-]{36}$/.test(String(sp?.t ?? "")) ? String(sp.t) : null, board: await gridBoard(sb, date) }; }
  catch (e) { { console.error("[화면] 학교별 표 못 엶:", e); return frame(<Oops what="학교별 표" e={e} />); } }
  return frame(<Board d={d} />);
}
