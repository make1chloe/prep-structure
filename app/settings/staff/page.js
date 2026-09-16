/** (어64) 설정 › 👤 직원 계정 — 원장님이 선생님·조교 계정을 낸다(원장님 2026-09-16 「원장말고 다른 테스트 계정도 추가해줘 역할 선생님 권한」).
 *  볼 것은 여기서 안 정한다 — 설정 › 🔐 누가 무엇을 보나(역할 × 칸 34개)가 이미 그 자리다(원칙-1) */
import Link from "next/link";
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { listStaff } from "@/lib/staff";
import { Oops } from "@/app/_shell/oops";
import Board from "./board";
export const dynamic = "force-dynamic";

export default async function Page() {
  const { sb, me } = await guard();
  if (me?.role !== ROLES.PRINCIPAL) return <main className="frame" style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}><div className="card"><div className="ctitle"><span className="cemo">🔐</span>원장님만 여는 화면</div></div></main>;
  let list = [];
  try { list = await listStaff(sb); } catch (e) { return <main className="frame" style={{ maxWidth: 860, margin: "16px auto", padding: "0 16px" }}><Oops what="직원 계정" e={e} /></main>; }
  return <main className="frame" style={{ maxWidth: 860, margin: "16px auto", padding: "0 16px" }}>
    <div className="wv"><Link prefetch={false} className="btn sm gho" href="/settings">← 설정</Link><span className="spacer" />
      <Link prefetch={false} className="btn sm" href="/settings/access">🔐 누가 무엇을 보나</Link></div>
    <Board rows={list} meId={me?.id ?? null} />
  </main>;
}
