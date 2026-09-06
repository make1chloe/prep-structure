/** 🧾 운영 — 목업 13 수강료(넣고 체크만 가볍게). 상담일지·신규 문의(18)는 다음. 판단은 lib/fee-plan(순수) · 손은 lib/fee, 여기는 가져다 그린다.
 *  층: 로그인 확인 → 주소 인자 → 오늘 → 수강료 판 한 벌(fee_board) = 4단. 강사는 「수강료 못 보게」(원장님 답 ⑮) — ops.fee 열쇠로 가린다 */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { decide, OPS } from "@/lib/perm";
import { today } from "@/lib/day";
import { feeBoard } from "@/lib/fee";
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
  try { const date = await today(sb); const ym = /^\d{4}-\d{2}$/.test(String(sp?.m ?? "")) ? String(sp.m) : ymOf(date); const board = await feeBoard(sb, ym); d = { date, ym, board, rows: rowsOf(board, ym), fee: decide(me.role, board.access ?? [], OPS.fee) === true }; }
  catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>운영을 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 아직 없는 DB 면 0121 까지의 마이그레이션을 먼저 돌립니다(docs/원장님-정하실-것 ㉖).</p></div>); }
  return frame(<>
    {d.fee ? <Fee d={{ date: d.date, ym: d.ym, rows: d.rows }} /> : <div className="card" data-card="fee-closed"><div className="ctitle"><span className="cemo">💳</span>수강료</div><p className="note">이 계정에는 수강료가 안 열려 있습니다 — 원장님이 「누가 무엇을 보나」에서 켜십니다(답 ⑮ 「강사는 수강료 못 보게」).</p></div>}
    <div className="card" style={{ marginTop: 12 }} data-card="ops-later"><div className="ctitle"><span className="cemo">🗂</span>상담일지 · 신규 문의</div><p className="note">신규 상담 18 을 지을 때 여기 섭니다(표 `consult` · `inquiry` 는 있다). 대시보드 「답할 것」에 신규 문의 수가 이미 뜹니다.</p></div>
  </>);
}
