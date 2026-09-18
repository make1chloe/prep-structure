/** 설정 · 배색(이 브라우저만) · (터) 🔌 연동 설정(원장 · 솔라피·나이스·AI 를 여기서 넣고 고친다 · 가린 것만 내려간다) · 권한 설정(원장) · 👤 직원 계정(원장 · (어64) 선생님·조교 계정 발급) · 학원 회선(등원 관문, 원장 · 답 ⑨ 「로그인한 아이피를 자동 인식해 추가·저장」). 판단은 lib/arrival.js */
import Link from "next/link";
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { arrivalCfg } from "@/lib/arrival";
import Skins from "../_shell/skins.js";
import IpCard from "./ipcard.js";
import Keys from "./keys.js";   // 🔌 연동 설정((터))
import { keyBoard } from "@/lib/integration";
import { ruleMap } from "@/lib/rule";
import { undecided, CELLS } from "@/lib/perm";
import { accessAllQuery } from "@/lib/access";   // 읽는 자리는 lib/access.js 한 곳(원칙-1)   // (어86) 남은 칸을 여기서 센다 — 대시보드에서 옮겨 왔다(원장님 9/18 「이건 왜 대시보드로 왔지」)
import Fill from "./fill.js";   // (어72) 아이가 채울 칸
export const dynamic = "force-dynamic";
export default async function Settings() {
  const { sb, me } = await guard();
  const principal = me?.role === ROLES.PRINCIPAL;
  const [cfg, keys, fillRules, access] = await Promise.all([   // 한 파도(속도-1) — 원장이 아니면 둘 다 안 읽는다
    principal ? arrivalCfg(sb).catch((e) => ({ error: String(e?.message ?? e) })) : Promise.resolve(null),
    principal ? keyBoard().catch((e) => ({ error: String(e?.message ?? e) })) : Promise.resolve(null),   // (터) 🔌 연동 설정 · 가린 것만 온다
    principal ? ruleMap(sb, ["me.fill."]) : Promise.resolve(null),   // (어72) 아이가 채울 칸 — 같은 파도에(속도-1)
    principal ? accessAllQuery(sb) : Promise.resolve({ data: null }),   // (어86) 안 정한 칸 — 같은 파도에(속도-1)
  ]);
  const left = access?.data ? undecided(access.data).length : 0;   // (어86) 0 이면 말하지 않는다 — 끝난 일은 자리를 차지하지 않는다
  return <main className="frame cols" style={{ maxWidth: 1400, margin: "16px auto", padding: "0 16px" }}><div className="card"><div className="ctitle"><span className="cemo">🎨</span>배색</div><Skins /></div><div className="card"><div className="ctitle"><span className="cemo">🔐</span>권한 설정{left ? <> · 안 정한 칸 <b>{left}</b></> : null}</div>{left ? <p className="note">안 정한 칸은 막힘 · {CELLS}칸 중</p> : null}<Link prefetch={false} className="btn sm" href="/settings/access">정하러 가기 →</Link></div>
    {principal && <Link prefetch={false} className="card" href="/settings/staff" data-card="staff" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="ctitle"><span className="cemo">👤</span>직원 계정</div></Link>}
    {cfg && <div className="card" data-card="arrival-ip"><div className="ctitle"><span className="cemo">🏢</span>학원 회선</div>
      {cfg.error ? <p className="note">{cfg.error}</p> : <>
        <p className="note">유예 {cfg.graceMin}분</p>
        <div className="tags" data-g="ips">{cfg.ips.length ? cfg.ips.map((ip) => <span key={ip} className="tag on">{ip}</span>) : <span className="tag">주소 없음 · 아무도 못 찍음</span>}</div>
        <IpCard /></>}
    </div>}
    {keys?.error ? <div className="card warn"><div className="ctitle"><span className="cemo">🔌</span>연동 설정을 못 읽었습니다</div><p className="note">{keys.error}</p></div> : keys ? <Keys rows={keys} /> : null}
    {fillRules && <Fill rules={fillRules} />}
    <Link prefetch={false} className="card" href="/settings/progress" data-card="progress" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="ctitle"><span className="cemo">✎</span>진도 체크</div></Link>
    <Link prefetch={false} className="card" href="/settings/routine" data-card="routine" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="ctitle"><span className="cemo">🔁</span>루틴</div></Link>
  </main>;
}
