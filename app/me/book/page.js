/** 🛤️ 내 교재 로드맵 08(보드 C) — 끝냄 · 하는 중 · 아직 세 칸(진도 나무는 표 하나 · 보기 넷, 확정-51) · 진도 체크가 열리면 소단원마다 내가 찍는다(확인 기다리는 중 · 원장님 줄은 못 덮는다, 확정-㊶) · ❗ 이의(진도는 안 바뀐다).
 *  전부 아이 자격(RLS 가 제 것만 준다). 층: 로그인 확인 → 주소 인자 → 오늘 ∥ 제 학생 줄 → 로드맵 판 한 벌(road_board — 교재를 안 고르면 첫 교재로 한 번 더) = 4단 */
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { decide, ME } from "@/lib/perm";
import { today } from "@/lib/day";
import { myStudent } from "@/lib/arrival";
import { roadBoard } from "@/lib/road";
import Board from "./board.js";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 720, margin: "16px auto", padding: "0 12px" }}>{children}</main>;
export default async function Road({ searchParams }) {
  const { sb, me, user } = await guard();
  if (me?.role !== ROLES.STUDENT) redirect("/");
  const q = await searchParams;
  let d;
  try {
    const [date, st] = await Promise.all([today(sb), myStudent(sb, user.id)]);
    const b = /^[0-9a-f-]{36}$/.test(String(q?.b ?? "")) ? String(q.b) : null;
    d = { date, board: await roadBoard(sb, st.id, b, date), studentId: st.id };
  } catch (e) { return frame(<div className="task"><div className="h"><b>⚠️ 로드맵을 못 열었습니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>{String(e?.message ?? e)}</p></div>); }
  return frame(<Board d={d} />);
}
