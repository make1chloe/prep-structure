import { guard } from "@/lib/session";
import { changePassword } from "./actions.js";
export const dynamic = "force-dynamic";
export default async function Password({ searchParams }) {
  await guard({ allowMustChange: true });
  const sp = await searchParams; const err = sp?.e ? String(sp.e) : "";
  return (
    <main className="frame" style={{ maxWidth: 420, margin: "0 auto", padding: "24px 16px" }}>
      <form className="card" action={changePassword}>
        <div className="ctitle"><span className="cemo">🔐</span>처음 들어오면 — 비밀번호 바꾸기</div>
        <div className="lf warn"><span className="ln">!</span><div><b>비밀번호를 바꿔 주세요</b><small>처음 받으신 <b>0000</b>은 다른 분도 압니다</small></div></div>
        {err && <div className="lf warn" style={{ marginTop: 8 }} role="alert"><span className="ln">!</span><div><b>{err}</b></div></div>}
        <div style={{ marginTop: 8 }}><label className="fl" htmlFor="pw">새 비밀번호</label><input id="pw" name="pw" type="password" autoComplete="new-password" /></div>
        <div style={{ marginTop: 8 }}><label className="fl" htmlFor="pw2">한 번 더</label><input id="pw2" name="pw2" type="password" autoComplete="new-password" /></div>
        <button className="btn pri" style={{ width: "100%", marginTop: 8 }} type="submit">바꾸고 시작하기</button>
        <div className="note k">⚠️ <b>안 바꾸면 다음 화면으로 못 갑니다.</b> 임시 비밀번호가 하나뿐이라 안 바꾸면 <b>남이 그 집 기록을 볼 수 있습니다.</b></div>
      </form>
    </main>
  );
}
