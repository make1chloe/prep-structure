/** 설정 — 배색(이 브라우저만) · (터) 🔌 연동 열쇠(원장 — 솔라피·나이스·AI 를 여기서 넣고 고친다 · 가린 것만 내려간다) · 누가 무엇을 보나(원장) · 학원 회선(등원 관문, 원장 — 답 ⑨ 「로그인한 아이피를 자동 인식해 추가·저장」). 판단은 lib/arrival.js */
import Link from "next/link";
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { arrivalCfg } from "@/lib/arrival";
import Skins from "../_shell/skins.js";
import IpCard from "./ipcard.js";
import Keys from "./keys.js";   // 🔌 연동 열쇠((터))
import { keyBoard } from "@/lib/integration";
export const dynamic = "force-dynamic";
export default async function Settings() {
  const { sb, me } = await guard();
  const principal = me?.role === ROLES.PRINCIPAL;
  const [cfg, keys] = await Promise.all([   // 한 파도(속도-1) — 원장이 아니면 둘 다 안 읽는다
    principal ? arrivalCfg(sb).catch((e) => ({ error: String(e?.message ?? e) })) : Promise.resolve(null),
    principal ? keyBoard().catch((e) => ({ error: String(e?.message ?? e) })) : Promise.resolve(null),   // (터) 🔌 연동 열쇠 — 가린 것만 온다
  ]);
  return <main className="frame cols" style={{ maxWidth: 1400, margin: "16px auto", padding: "0 16px" }}><div className="card"><div className="ctitle"><span className="cemo">🎨</span>배색</div><Skins /></div><div className="card"><div className="ctitle"><span className="cemo">🔐</span>누가 무엇을 보나</div><Link prefetch={false} className="btn sm" href="/settings/access">정하러 가기 →</Link></div>
    {cfg && <div className="card" data-card="arrival-ip"><div className="ctitle"><span className="cemo">🏫</span>학원 회선</div>
      {cfg.error ? <p className="note">{cfg.error}</p> : <>
        <p className="note">유예 {cfg.graceMin}분</p>
        <div className="tags" data-g="ips">{cfg.ips.length ? cfg.ips.map((ip) => <span key={ip} className="tag on">{ip}</span>) : <span className="tag">주소 없음 · 아무도 못 찍음</span>}</div>
        <IpCard /></>}
    </div>}
    {keys?.error ? <div className="card warn"><div className="ctitle"><span className="cemo">🔌</span>연동 열쇠를 못 읽었습니다</div><p className="note">{keys.error}</p></div> : keys ? <Keys rows={keys} /> : null}
    <Link prefetch={false} className="card" href="/settings/progress" data-card="progress" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="ctitle"><span className="cemo">✎</span>진도 체크</div></Link>
    <Link prefetch={false} className="card" href="/settings/routine" data-card="routine" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="ctitle"><span className="cemo">🔁</span>루틴</div></Link>
  </main>;
}
