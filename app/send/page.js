/** 📨 발송 — 목업 10. 고르고 · 한 번에 · 예약(확정-㉕). 판단은 lib/send-plan(순수) · lib/send(파도 6 · 2단), 여기는 가져다 그린다.
 *  층: 로그인 확인 → 오늘 → 발송 파도 = 3단(check-fast). 백스톱(속도-3): 렌더가 끝난 뒤에 큐를 한 바퀴 — 화면을 안 막는다.
 *  늦귀가 안내를 보내는 자리는 오늘 카드(01) 하나(확정-㊿) — 여기는 「보냄」 표시만 */
import { after } from "next/server";
import { Oops } from "../_shell/oops.js";
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { sendBoard, backstop } from "@/lib/send";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 960, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Send() {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📨</span>발송은 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다.` : "로그인이 필요합니다."}</p></div>);
  let d;
  try { d = await sendBoard(sb, await today(sb)); }
  catch (e) { { console.error("[화면] 발송 못 엶:", e); return frame(<Oops what="발송" e={e} />); } }
  after(backstop);
  return frame(<Board d={d} />);
}
