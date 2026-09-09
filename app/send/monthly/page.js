/** 📊 월간 리포트 — 목업 09·10 의 「월간 리포트」. 재원생마다 그 달 숫자(마감한 판만 — 학부모와 같은 숫자) · 덧붙일 한마디 · 보내기(숫자를 굳힌다).
 *  층: 로그인 확인 → 주소 인자 → 오늘 → 월간 판 한 벌(monthly_board) = 4단. 판단은 lib/report-plan(순수) · 손은 lib/report */
import { guard } from "@/lib/session";
import { isStaff, ROLE_NAME } from "@/lib/roles";
import { today } from "@/lib/day";
import { monthlyBoard } from "@/lib/report";
import { ruleMap } from "@/lib/rule";
import { isYm } from "@/lib/report-plan";
import Board from "./board.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 960, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
export default async function Monthly({ searchParams }) {
  const { sb, me } = await guard();
  if (!isStaff(me?.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">📊</span>월간 리포트는 학원 사람의 화면입니다</div><p className="note">{me ? `${ROLE_NAME[me.role] ?? me.role} 계정입니다` : "로그인하세요"}</p></div>);
  const sp = await searchParams;
  let d;
  try { const date = await today(sb); const ym = isYm(sp?.m) ? String(sp.m) : String(date).slice(0, 7); const [board, rules] = await Promise.all([monthlyBoard(sb, ym), ruleMap(sb, ["send."])]); d = { ...board, today: date, rules }; }   // 예약 때 규칙(send.*)은 같은 파도((어))
  catch (e) { return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>월간 리포트를 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p></div>); }
  return frame(<Board d={d} />);
}
