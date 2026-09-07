/** 🏫 반 — 반 만들기 · 요일·시각(이 날부터) · 명단 · 반 단가 줄 · 닫기(남긴 것 23·17 — 「지금은 씨앗·이관 반만 고른다」). 12 일정·13 수강료·14 학생이 같은 표를 본다.
 *  층: 로그인 확인 → 오늘 → 반 판 한 벌(class_board) = 3단. 판단은 lib/class-plan(순수) · 손은 lib/classes */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { classBoard } from "@/lib/classes";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 960, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Classes() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🏫</span>반은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다` : "로그인하세요"}</p></div>);
  let d;
  try { d = await classBoard(sb, await today(sb)); }
  catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>반을 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p></div>); }
  return frame(<Board d={d} />);
}
