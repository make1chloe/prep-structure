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
  return <main className="frame" style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}><div className="card"><div className="ctitle"><span className="cemo">🎨</span>배색</div><p className="note">이 폰(브라우저)에만 저장됩니다.</p><Skins /></div><div className="card"><div className="ctitle"><span className="cemo">🔐</span>누가 무엇을 보나</div><p className="note">강사·조교·학생·학부모에게 어느 자리를 여는지 — 원장님만 고칩니다.</p><Link prefetch={false} className="btn sm" href="/settings/access">정하러 가기 →</Link></div>
    {cfg && <div className="card" data-card="arrival-ip"><div className="ctitle"><span className="cemo">🏫</span>학원 회선 — 아이가 등원을 찍을 수 있는 자리</div>
      {cfg.error ? <p className="note">{cfg.error}</p> : <>
        <p className="note">아이는 이 주소들에서만 등원·하원을 찍습니다(집에서·오는 길에 못 찍게). 비어 있으면 아무도 못 찍습니다 — 학원 와이파이에 붙은 채로 한 번 누르세요. 유예 {cfg.graceMin}분(지각으로 안 보는 분).</p>
        <div className="tags" data-g="ips">{cfg.ips.length ? cfg.ips.map((ip) => <span key={ip} className="tag on">{ip}</span>) : <span className="tag">아직 없음</span>}</div>
        <IpCard /></>}
    </div>}
    {keys?.error ? <div className="card warn"><div className="ctitle"><span className="cemo">🔌</span>연동 열쇠를 못 읽었습니다</div><p className="note">{keys.error}</p></div> : keys ? <Keys rows={keys} /> : null}
    <Link prefetch={false} className="card" href="/settings/progress" data-card="progress" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="ctitle"><span className="cemo">✎</span>진도 체크 열기 — 아이가 제 교재 진도를 찍는다(학원 전체 · 아이마다) · 확인 · ❗</div><p className="note">확정-㊶ — 켠 날부터 「N일째」로 셉니다. 아이가 찍은 줄은 확인 기다리는 중, 원장님 줄은 아이가 못 덮습니다.</p></Link>
    <Link prefetch={false} className="card" href="/settings/routine" data-card="routine" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="ctitle"><span className="cemo">🔁</span>루틴 — 학원 기본 루틴 · 아이마다 고른 것 · 교재 잇기</div><p className="note">영역마다 한 벌(교재가 늘어도 안 늡니다). 항목 더하기·고치기·차례·내리기(지우지 않습니다) · 아이별로 고른 줄 · 교재의 기준·회차·「이대로면」</p></Link>
  </main>;
}
