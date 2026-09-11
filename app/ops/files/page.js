/** 📎 자료함 20 — 주고받기. 받은 것(방금 온 것은 갈래만 고른다 · 갈래별로 쌓인다) · 보낸 것(오늘 숙제에 붙인 것 · 아이가 처리했나) · 📤 보내기. 판단은 lib/files-plan(순수) · 손은 lib/files, 여기는 가져다 그린다.
 *  층: 로그인 확인 → 오늘 → 자료함 판 한 벌(file_board) = 3단. 학원 사람만 — 받은 것은 원장님만 본다(목업 20 「누가 보나」) */
import { guard } from "@/lib/session";
import { Oops } from "../../_shell/oops.js";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { fileBoard } from "@/lib/files";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1100, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Files() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📎</span>자료함은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다 — 아이·학부모는 제 화면의 📎 자료 카드에서 보냅니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { const date = await today(sb); const board = await fileBoard(sb, date); d = { date, board }; }
  catch (e) { { console.error("[화면] 자료함 못 엶:", e); return frame(<Oops what="자료함" e={e} />); } }
  return frame(<Board d={d} />);
}
