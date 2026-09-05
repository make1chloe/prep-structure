/** 첫 화면 — 2단계에서 대시보드(목업 17)가 된다. 지금은 누가 들어왔고 어디까지 열렸나만 말한다 */
import { guard } from "@/lib/session";
import { db } from "@/lib/supabase";
import { ROLE_NAME, ROLES } from "@/lib/roles";
import { undecided, CELLS } from "@/lib/perm";
import { homeFor } from "@/lib/menu";
export const dynamic = "force-dynamic";
export default async function Home() {
  const { sb, me, user } = await guard();
  if (!me) return <main className="frame" style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}><div className="card"><div className="ctitle"><span className="cemo">⚠️</span>사람 줄이 없습니다</div><p className="note">로그인은 됐는데 <b>{user.email}</b> 의 역할 줄이 없습니다. 원장님이 학생·학부모 화면에서 넣어 주셔야 들어옵니다.</p></div></main>;
  if (me.role === ROLES.STUDENT || me.role === ROLES.PARENT) return <main className="frame" style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}><div className="card"><div className="ctitle"><span className="cemo">🎒</span>{me.name} 님, {ROLE_NAME[me.role]} 화면은 곧 열립니다</div><p className="note">새 앱을 짓는 중입니다 — {homeFor(me.role)} 화면은 2단계에서 옵니다. 지금은 로그인만 됩니다.</p></div></main>;
  const rows = me.role === ROLES.PRINCIPAL ? (await db(sb).from("role_access").select("role,key,allowed")).data ?? [] : null;
  const left = rows ? undecided(rows) : [];
  return (
    <main className="frame" style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}>
      <div className="card">
        <div className="ctitle"><span className="cemo">🏠</span>{me.name} · {ROLE_NAME[me.role]}</div>
        <p className="note">1단계 뼈대까지 섰습니다 — 로그인 · 권한 · 메뉴 · 배색 · 큐. 다음은 오늘 수업(목업 01)입니다.</p>
      </div>
      {rows && (
        <div className={"card" + (left.length ? " warn" : "")}>
          <div className="ctitle"><span className="cemo">🔐</span>누가 무엇을 보나 — {CELLS}칸 중 아직 안 정한 것 <b>{left.length}</b></div>
          <p className="note">{left.length ? "안 정한 칸은 막혀 있습니다(막는 쪽이 안전). 정하러 가세요." : "다 정하셨습니다. 강사·조교·학생·학부모는 켠 만큼만 봅니다."}</p>
          <a className="btn sm" href="/settings/access">정하러 가기 →</a>
        </div>
      )}
    </main>
  );
}
