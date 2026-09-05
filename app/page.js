/** 0단계 자리표시 — 겉 한 벌이 앱에 들어왔는지 눈으로 보는 한 장. 1단계(뼈대)에서 대시보드가 이 자리를 차지한다. */
export default function Home() {
  return (
    <main className="frame" style={{ maxWidth: 720, margin: "24px auto", padding: "0 16px" }}>
      <div className="card">
        <div className="ctitle"><span className="ln">🏗️</span><b>새로 짓는 중</b><span className="tag act">0단계 · 겉 한 벌</span></div>
        <p className="note">목업의 배색 다섯 벌 · 치수 · 글꼴이 이 앱의 겉이 됐습니다. 다음은 뼈대 — 로그인 · 권한 · 메뉴.</p>
      </div>
    </main>
  );
}
