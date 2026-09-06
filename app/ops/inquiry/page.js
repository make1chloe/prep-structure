/** ☎️ 신규 상담 18 — 전화 끊고 바로. 칸 다섯(🔥 오늘 답할 것 · 상담 잡힘 · 레벨 봄 · 등록 · 안 옴) · + 전화 문의 받기 · 📨 안내 보내기 · 등록 전환 — 한 번 누르면 일곱이 저절로. 판단은 lib/inquiry-plan(순수) · 손은 lib/inquiry.
 *  층: 로그인 확인 → 오늘 → 문의 판 한 벌(inquiry_board) = 3단. 학원 사람만 · 강사·조교는 ops.inquiry 로 */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { decide, OPS } from "@/lib/perm";
import { today } from "@/lib/day";
import { inquiryBoard } from "@/lib/inquiry";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1180, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Inquiry() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">☎️</span>신규 상담은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { const date = await today(sb); const board = await inquiryBoard(sb, date); if (decide(me.role, board.access ?? [], OPS.inquiry) !== true) return frame(<div className="card" data-card="inquiry-closed"><div className="ctitle"><span className="cemo">☎️</span>신규 상담</div><p className="note">이 계정에는 신규 상담이 안 열려 있습니다 — 원장님이 「누가 무엇을 보나」의 신규 문의 칸을 켜면 보입니다.</p></div>); d = { date, board }; }
  catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>신규 상담을 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 아직 없는 DB 면 0127 까지의 마이그레이션을 먼저 돌립니다(docs/원장님-정하실-것 ㉖).</p></div>); }
  return frame(<Board d={d} />);
}
