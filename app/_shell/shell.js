/** 어느 화면에서든 같은 껍질(0-10) — 상단바에 이름·역할·메뉴·로그아웃. 스크롤로 접히지 않는다(sticky). 배색 고르기는 설정에 있다(폰에서 상단바가 세 줄이 되지 않게).
 *  메뉴는 lib/menu.js 한 벌, 켜고 끄는 값은 v3.role_access(원장님이 정하신 것). 역할 줄이 없으면 메뉴 대신 그 사실을 말한다 */
import { menuFor } from "@/lib/menu";
import { ROLE_NAME } from "@/lib/roles";
export default function Shell({ me, rows, children }) {
  const items = me ? menuFor(me.role, rows) : [];
  return (
    <>
      <header className="appbar" style={{ position: "sticky", top: 0, zIndex: 5 }}>
        <a className="brand" href="/">클로이영어</a>
        {me && <span className="pill">{me.name} · {ROLE_NAME[me.role] ?? "역할 없음"}</span>}
        {items.length > 0 && <nav className="tabs" aria-label="메뉴">{items.map((m) => <a key={m.key} className="tab" href={m.href}>{m.name}</a>)}</nav>}
        <span style={{ flex: 1 }} />
        {me && <form action="/logout" method="post"><button className="btn sm" type="submit">로그아웃</button></form>}
      </header>
      {children}
    </>
  );
}
