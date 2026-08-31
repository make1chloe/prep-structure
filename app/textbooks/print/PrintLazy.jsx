"use client";

import dynamic from "next/dynamic";

/**
 * 단추만 나중에 받는다 (app/textbooks/BookPanels.jsx 와 같은 관례).
 *
 * 이 화면은 **읽고 뽑는 것이 전부**라, 종이에 나갈 글자는 서버가 다 그려
 * 보낸다. 자바스크립트가 필요한 것은 `window.print()` 를 부르는 단추 하나뿐이라
 * 그 하나만 갈라둔다 — 첫 그림에 딸려오는 꾸러미가 늘지 않게.
 *
 * `ssr: false` 는 안 붙인다 (BookPanels 와 같은 판단) — 갈라지는 양은 같은데,
 * 안 붙이면 단추가 첫 HTML 에 이미 들어 있어 깜빡이지 않는다.
 */
export const PrintBarLazy = dynamic(() => import("./PrintBar"), {
  loading: () => <div className="noprint" style={{ height: 32 }} />,
});
