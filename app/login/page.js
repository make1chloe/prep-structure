/** 목업 00 로그인 — 역할마다 아이디가 다르다. 학생 chloe+폰 뒤 4자리 · 학부모 전화번호 · 원장·강사·조교 이메일. 꼬리 도메인은 화면에 없다 */
import { redirect } from "next/navigation";
import { whoami } from "@/lib/session";
import { signIn } from "./actions.js";
export const dynamic = "force-dynamic";
const CARDS = [
  { kind: "student", emo: "🧑‍🎓", title: "학생", label: "아이디", placeholder: "chloe0515", mode: "text", note: <><b>chloe + 내 폰 뒤 4자리</b>입니다. 이메일이 아닙니다.</> },
  { kind: "parent", emo: "👨‍👩‍👧", title: "학부모", label: "전화번호", placeholder: "01012345678", mode: "numeric", note: <><b>전화번호가 곧 아이디</b>입니다. 처음 비밀번호는 <b>0000</b>이고, 들어오시면 바로 바꾸는 화면이 뜹니다.</> },
  { kind: "staff", emo: "🧑‍🏫", title: "원장 · 강사 · 조교", label: "이메일", placeholder: "name@example.com", mode: "email", note: <>강사·조교는 <b>설정 → 「누가 무엇을 보나」</b>에서 원장님이 켠 만큼만 보입니다 — 안 정했으면 메뉴가 0칸입니다</> },
];
export default async function Login({ searchParams }) {
  const w = await whoami(); if (w.user) redirect("/");
  const sp = await searchParams; const err = sp?.e ? String(sp.e) : ""; const errKind = sp?.k ? String(sp.k) : "";
  return (
    <main className="frame" style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}><b style={{ fontSize: "var(--fs-7)" }}>클로이영어</b></div>
      {CARDS.map((c) => (
        <form key={c.kind} className="card" action={signIn}>
          <input type="hidden" name="kind" value={c.kind} />
          <div className="ctitle"><span className="cemo">{c.emo}</span>{c.title}</div>
          <div><label className="fl" htmlFor={`id-${c.kind}`}>{c.label}</label><input id={`id-${c.kind}`} name="id" type="text" inputMode={c.mode} autoComplete="username" placeholder={c.placeholder} /></div>
          <div style={{ marginTop: 8 }}><label className="fl" htmlFor={`pw-${c.kind}`}>비밀번호</label><input id={`pw-${c.kind}`} name="password" type="password" autoComplete="current-password" /></div>
          {err && errKind === c.kind && <div className="lf warn" style={{ marginTop: 8 }} role="alert"><span className="ln">!</span><div><b>{err}</b></div></div>}
          <button className={"btn" + (c.kind === "staff" ? "" : " pri")} style={{ width: "100%", marginTop: 8 }} type="submit">들어가기</button>
          <div className="note k">{c.note}</div>
        </form>
      ))}
    </main>
  );
}
