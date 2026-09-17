/** 🧑‍🎓 학생 14 — 목록(재원생 · 퇴원생 — 퇴원해도 줄은 남는다, 원장님 9/3)에서 한 아이를 열면: 머리(학년·학교 · 반 · 재원 기간 · 형제 · ✎ 수정) · KPI 여섯 · 교재 진도 · 성적(약한 영역) · 이 달 출결(등원·하원 시각, 답 ⑩) · 단원평가 · 지나온 것 · 상담. 판단은 lib/student-plan(순수) · 손은 lib/student.
 *  층: 로그인 확인 → 주소 인자 → 오늘 → 판 한 벌(학생 student_board 또는 💰 수납 fee_board · 유형이 달라도 파도는 하나) = 4단. 학원 사람만(상담 카드는 ops.consult 로 가린다) */
import Link from "next/link";
import { guard } from "@/lib/session";
import { Oops } from "../../_shell/oops.js";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { decide, OPS } from "@/lib/perm";
import { today } from "@/lib/day";
import { studentBoard } from "@/lib/student";
import { feeBoard } from "@/lib/fee";
import { ruleMap } from "@/lib/rule";
import { rowsOf } from "@/lib/fee-plan";
import { ymOf } from "@/lib/cal-plan";
import Fee from "../fee.js";   // (어28) 수강료 13 = 학생 안 유형(?v=fee) · 판·손은 그대로(lib/fee)
import { ccOf } from "@/lib/cc";
import { prefOf } from "@/lib/pref";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1400, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
/** 머리 세그 · 학생 · 💰 수납((어28) 운영 탭을 학생에 합침). 수강료는 키(ops.fee)가 있는 사람에게만 보인다(답 ⑮ 「강사는 수강료 못 보게」(원장님 원문 · 화면 이름만 선생님으로 바뀌었다)) */
const ViewSeg = ({ view, fee, ym }) => <div className="seg sm" data-g="view" style={{ marginBottom: 8 }}>
  <Link prefetch={false} href="/ops/students" aria-pressed={view !== "fee"}>학생</Link>{fee && <Link prefetch={false} href={`/ops/students?v=fee${ym ? `&m=${ym}` : ""}`} aria-pressed={view === "fee"}>💰 수납</Link>}</div>;
export default async function Students({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🧑‍🎓</span>학생은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다. 내 것은 「나」 화면에서 봅니다.` : "로그인이 필요합니다."}</p></div>);
  const sp = await searchParams;
  const fee = String(sp?.v ?? "") === "fee";   /* (어28) 💰 수납 유형 = 옛 /ops 화면 그대로 · 유형이 달라도 층은 넷(파도 하나에 태운다 · 속도-1 · check-fast) */
  let d;
  try { const date = await today(sb); const sel = /^[0-9a-f-]{36}$/.test(String(sp?.s ?? "")) ? String(sp.s) : null;
    const ym = /^\d{4}-\d{2}$/.test(String(sp?.m ?? "")) ? String(sp.m) : null;   /* (뎌) 달 넘기기 — 안 주면 오늘의 달 */
    const fym = ym ?? ymOf(date);
    const [board, b2, b3] = await Promise.all([...(fee ? [feeBoard(sb, fym), ruleMap(sb, ["send."])] : [studentBoard(sb, sel, date, ym ? `${ym}-01` : null), ccOf(sb, sel), prefOf(sb, me.id, "student")])]);   /* (녀) 🃏 아이디 · 카드 차례도 같은 파도(층이 안 는다 · 속도 대원칙 1) */
    d = fee ? { fee: true, date, ym: fym, board, rows: rowsOf(board, fym), open: decide(me.role, board.access ?? [], OPS.fee) === true, sendRules: b2 }
      : { fee: false, date, sel, ym, board, cc: b2, pref: b3, consult: decide(me.role, board.access ?? [], OPS.consult) === true, principal: me.role === "principal", open: decide(me.role, board.access ?? [], OPS.fee) === true }; }
  catch (e) { { console.error(`[화면] ${fee ? "수강료" : "학생"} 못 엶:`, e); return frame(<Oops what={fee ? "수강료" : "학생"} e={e} />); } }
  if (d.fee) return frame(<><ViewSeg view="fee" fee={d.open} ym={d.ym} />
    {d.open ? <Fee d={{ date: d.date, ym: d.ym, rows: d.rows, by_grade: d.board.by_grade ?? {}, prev_unpaid: d.board.prev_unpaid ?? null, sendRules: d.sendRules }} /> : <div className="card" data-card="fee-closed"><div className="ctitle"><span className="cemo">💳</span>수강료</div><p className="note" style={{ margin: 0 }}>이 계정에는 수강료가 안 열려 있습니다</p></div>}</>);
  return frame(<><ViewSeg view="students" fee={d.open} ym={null} /><Board d={d} /></>);
}
