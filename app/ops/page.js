/** 🧾 운영 — 목업 13 수강료(넣고 체크만 가볍게). 상담일지·신규 문의(18)는 다음. 판단은 lib/fee-plan(순수) · 손은 lib/fee, 여기는 가져다 그린다.
 *  층: 로그인 확인 → 주소 인자 → 오늘 → 수강료 판 한 벌(fee_board) = 4단. 강사는 「수강료 못 보게」(원장님 답 ⑮) — ops.fee 열쇠로 가린다 */
import Link from "next/link";
import { Oops } from "../_shell/oops.js";
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { decide, OPS } from "@/lib/perm";
import { today } from "@/lib/day";
import { feeBoard } from "@/lib/fee";
import { ruleMap } from "@/lib/rule";
import { rowsOf } from "@/lib/fee-plan";
import { ymOf } from "@/lib/cal-plan";
import Fee from "./fee.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 960, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Ops({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🧾</span>운영은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  const sp = await searchParams;
  let d;
  try { const date = await today(sb); const ym = /^\d{4}-\d{2}$/.test(String(sp?.m ?? "")) ? String(sp.m) : ymOf(date); const [board, sendRules] = await Promise.all([feeBoard(sb, ym), ruleMap(sb, ["send."])]); d = { date, ym, board, rows: rowsOf(board, ym), fee: decide(me.role, board.access ?? [], OPS.fee) === true, sendRules }; }   // 예약 때 규칙(send.*)은 같은 파도((어))
  catch (e) { { console.error("[화면] 운영 못 엶:", e); return frame(<Oops what="운영" e={e} />); } }
  return frame(<>
    {d.fee ? <Fee d={{ date: d.date, ym: d.ym, rows: d.rows, by_grade: d.board.by_grade ?? {}, prev_unpaid: d.board.prev_unpaid ?? null }} /> : <div className="card" data-card="fee-closed"><div className="ctitle"><span className="cemo">💳</span>수강료</div><p className="note">이 계정에는 수강료가 안 열려 있습니다 — 원장님이 「누가 무엇을 보나」에서 켜십니다(답 ⑮ 「강사는 수강료 못 보게」).</p></div>}
    <Link prefetch={false} title="전화 끊고 바로 적고, 등록 전환은 한 번에. 오늘 답할 것 · 상담 잡힘 · 레벨 봄 · 등록 · 안 옴" className="card" href="/ops/inquiry" data-card="inquiry" style={{ display: "block", marginTop: 12, textDecoration: "none", color: "inherit" }}><div className="ctitle"><span className="cemo">☎️</span>신규 상담</div></Link>
  </>);
}
