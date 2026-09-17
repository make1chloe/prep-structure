import { redirect } from "next/navigation";
import { guard } from "@/lib/session";
import { homeFor } from "@/lib/menu";
import { changePassword } from "./actions.js";
import { FIRST_PW } from "@/lib/student-plan";   // 첫 비밀번호는 한 곳((어65))
export const dynamic = "force-dynamic";
export default async function Password({ searchParams }) {
  const { me } = await guard({ allowMustChange: true });
  if (me && !me.must_change_pw) redirect(homeFor(me.role));   // (어71) 표시가 이미 내려갔는데 여기 서 있으면 갇힌다 — 제 화면으로 보낸다(이 화면은 문지기만 열어 준다 · 링크가 없다)
  const sp = await searchParams; const err = sp?.e ? String(sp.e) : "";
  return (
    <main className="frame" style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px" }}>
      <form className="card" action={changePassword}>
        <div className="ctitle"><span className="cemo">🔐</span>처음 들어오면 · 비밀번호 바꾸기</div>
        <div className="lf warn"><span className="ln">!</span><div><b>비밀번호를 바꿔 주세요</b><small>처음 받으신 <b>{FIRST_PW}</b>은 다른 분도 압니다</small></div></div>
        {err && <div className="lf warn" style={{ marginTop: 8 }} role="alert"><span className="ln">!</span><div><b>{err}</b></div></div>}
        <div style={{ marginTop: 8 }}><label className="fl" htmlFor="pw">새 비밀번호</label><input id="pw" name="pw" type="password" autoComplete="new-password" /></div>
        <div style={{ marginTop: 8 }}><label className="fl" htmlFor="pw2">한 번 더</label><input id="pw2" name="pw2" type="password" autoComplete="new-password" /></div>
        <button className="btn pri" style={{ width: "100%", marginTop: 8 }} type="submit">바꾸고 시작하기</button>
        <div className="note k">⚠️ <b>안 바꾸면 다음 화면으로 못 갑니다.</b> 임시 비밀번호가 하나뿐이라 안 바꾸면 <b>남이 그 집 기록을 볼 수 있습니다.</b></div>
      </form>
    </main>
  );
}
