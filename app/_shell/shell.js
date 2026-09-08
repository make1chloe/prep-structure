/** 어느 화면에서든 같은 껍질(0-10) — 상단바에 이름·역할·메뉴·로그아웃. 이동은 <Link>(통째로 다시 안 열고 바뀐 부분만 갈아끼움 — 「클릭과 동시」 · 원장님 9/8). 스크롤로 접히지 않는다(sticky). 배색 고르기는 설정에 있다(폰에서 상단바가 세 줄이 되지 않게).
 *  누른 즉시 표시(다): 탭은 tabs.js(지금 탭 파랗게 · 누르면 먼저 파랗게) · 상단바 아래 띠는 going.js(누르자마자 켜지고 새 화면이 붙으면 꺼진다 — 어느 링크든).
 *  메뉴는 lib/menu.js 한 벌, 켜고 끄는 값은 v3.role_access(원장님이 정하신 것). 역할 줄이 없으면 메뉴 대신 그 사실을 말한다 */
import Link from "next/link";
import { Suspense } from "react";
import { menuFor } from "@/lib/menu";
import { ROLE_NAME } from "@/lib/roles";
import Tabs from "./tabs.js";
import Going from "./going.js";
export default function Shell({ me, rows, children }) {
  const items = me ? menuFor(me.role, rows) : [];
  return (
    <>
      <header className="appbar" style={{ position: "sticky", top: 0, zIndex: 5 }}>
        <Link prefetch={false} className="brand" href="/">클로이영어</Link>
        {me && <span className="pill">{me.name} · {ROLE_NAME[me.role] ?? "역할 없음"}</span>}
        {items.length > 0 && <Tabs items={items} />}
        <span style={{ flex: 1 }} />
        {me && <form action="/logout" method="post"><button className="btn sm" type="submit">로그아웃</button></form>}
        <Suspense fallback={null}><Going /></Suspense>
      </header>
      {children}
    </>
  );
}
