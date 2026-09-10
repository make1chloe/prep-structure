/** 🧑‍🎓 학생 14 — 목록(재원생 · 퇴원생 — 퇴원해도 줄은 남는다, 원장님 9/3)에서 한 아이를 열면: 머리(학년·학교 · 반 · 재원 기간 · 형제 · ✎ 고치기) · KPI 여섯 · 교재 진도 · 성적(약한 영역) · 이 달 출결(등원·하원 시각, 답 ⑩) · 단원평가 · 지나온 것 · 상담. 판단은 lib/student-plan(순수) · 손은 lib/student.
 *  층: 로그인 확인 → 주소 인자 → 오늘 → 학생 판 한 벌(student_board) = 4단. 학원 사람만(상담 카드는 ops.consult 로 가린다) */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { decide, OPS } from "@/lib/perm";
import { today } from "@/lib/day";
import { studentBoard } from "@/lib/student";
import { ccOf } from "@/lib/cc";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1100, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Students({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🧑‍🎓</span>학생은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다 — 내 것은 「나」 화면에서 봅니다.` : "로그인이 필요합니다."}</p></div>);
  const sp = await searchParams;
  let d;
  try { const date = await today(sb); const sel = /^[0-9a-f-]{36}$/.test(String(sp?.s ?? "")) ? String(sp.s) : null;
    const ym = /^\d{4}-\d{2}$/.test(String(sp?.m ?? "")) ? String(sp.m) : null;   /* (뎌) 달 넘기기 — 안 주면 오늘의 달 */
    const [board, cc] = await Promise.all([studentBoard(sb, sel, date, ym ? `${ym}-01` : null), ccOf(sb, sel)]);   /* (녀) 🃏 아이디는 같은 파도에 태운다 — 층이 안 는다(속도 대원칙 1) */
    d = { date, sel, ym, board, cc, consult: decide(me.role, board.access ?? [], OPS.consult) === true, principal: me.role === "principal" }; }
  catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>학생을 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 아직 없는 DB 면 0127 까지의 마이그레이션을 먼저 돌립니다(docs/원장님-정하실-것 ㉖).</p></div>); }
  return frame(<Board d={d} />);
}
