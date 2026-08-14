"use client";

import { useEffect, useRef, useState } from "react";
import { findPage } from "@/lib/screenLayout";

/**
 * 학생·학부모 화면의 **위 메뉴** (원장님, 2026-08-14).
 *
 * > 「생각보다 사람들이 이거 뭐 뭐냐고 어디서 뭘 어떻게 해야 되냐고
 * >  모른다고 할 가능성이 높아 보임. 이유는 세로로 모든 메뉴가 너무 길게
 * >  늘어져 있어 애초에 기능 파악 자체가 안 될 가능성이 있음.」
 *
 * 화면은 덩어리들이 세로로 이어진 한 장이라, 아래에 무엇이 있는지
 * **굴려 내려가 본 사람만** 알았다. 위에 갈래를 한 줄로 붙여서 —
 *   · 무엇이 있는지 열자마자 보이고
 *   · 누르면 그리로 가고
 *   · 지금 어디를 보고 있는지 색으로 표시된다
 *
 * **화면을 탭으로 쪼개지 않는다** — 덩어리 차례는 원장님이 정하시고(0095),
 * 한 장에서 다 본다는 설계는 그대로다. 이건 그 한 장의 차례표다.
 *
 * 이름은 lib/screenLayout 의 `nav` (한 곳) — 아이·학부모가 아는 말로 짧게.
 * **비어서 안 그려진 덩어리는 메뉴에도 없다** — 눌렀는데 아무것도 없으면
 * 그다음부터 이 메뉴를 안 믿는다 (원장 화면의 배지 규칙 A8 과 같은 이야기).
 */
/**
 * **처음 열면 소개부터** (원장님, 2026-08-14 — 「이 어플 자체를 소개할
 * 페이지도 하나 있어야겠어. 볼 필요 없음을 눌러야 지금 같은 화면이 나오고,
 * 필요한 경우에는 메뉴 소개를 눌러서 다시 기능을 확인할 수 있게」).
 *
 * 소개 내용은 lib/screenLayout 의 블록 이름·설명 **그대로**다 — 기능 목록을
 * 여기 또 적으면 화면이 바뀔 때 소개만 낡는다 (원칙 1).
 * 「볼 필요 없음」 은 이 브라우저에 기억된다 (기기마다 한 번).
 */
export default function SectionNav({ page, order = [] }) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [intro, setIntro] = useState(false);       // 소개가 열려 있나
  const [firstTime, setFirstTime] = useState(false); // 처음이라 자동으로 열렸나
  const barRef = useRef(null);
  const INTRO_KEY = `chloe.intro.${page}`;

  const pageDef = findPage(page);
  const blocks = pageDef?.blocks || [];
  const navOf = new Map(blocks.map((b) => [b.key, b.nav || b.label]));
  const blockOf = new Map(blocks.map((b) => [b.key, b]));

  // 처음 온 기기면 소개부터
  useEffect(() => {
    try {
      if (localStorage.getItem(INTRO_KEY) !== "done") {
        setIntro(true);
        setFirstTime(true);
      }
    } catch { /* 사파리 비공개 — 그냥 화면으로 */ }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  function dismissForever() {
    try { localStorage.setItem(INTRO_KEY, "done"); } catch { /* 무시 */ }
    setIntro(false);
    setFirstTime(false);
  }

  useEffect(() => {
    // 실제로 그려진(내용이 있는) 덩어리만 — 조건이 안 맞은 덩어리는 빈 칸이다
    const found = order
      .map((k) => ({ key: k, el: document.getElementById(`blk-${k}`) }))
      .filter(({ el }) => el && el.offsetHeight > 8);
    setItems(found.map(({ key }) => key));

    // 지금 어디를 보고 있나 — 화면 위쪽 근처에 걸린 덩어리
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting);
        if (hit.length > 0) {
          setActive(hit[0].target.id.replace("blk-", ""));
        }
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    found.forEach(({ el }) => io.observe(el));
    return () => io.disconnect();
  }, [order.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 지금 보는 갈래가 메뉴 줄 안에서도 보이게 따라간다
  useEffect(() => {
    if (!active || !barRef.current) return;
    const chip = barRef.current.querySelector(`[data-k="${active}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  // 소개 목록 — 실제 화면 차례(order) 그대로
  const introRows = order.map((k) => blockOf.get(k)).filter(Boolean);

  const overlay = intro && (
    <div className="introwrap" role="dialog" aria-label="화면 소개">
      <div className="introcard">
        <h2 style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 800 }}>
          {page === "parent" ? "학부모 화면, 이렇게 쓰세요" : "이 앱, 이렇게 쓰면 돼요"}
        </h2>
        <p className="hint" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
          아래 것들이 화면에 <b>위에서부터 이 순서로</b> 있어요.
          위의 메뉴 줄을 누르면 바로 그 자리로 가요.
        </p>
        <div className="stack" style={{ gap: 8 }}>
          {introRows.map((b) => (
            <div key={b.key} className="introrow">
              <span className="tag tag-lav" style={{ flex: "none", minWidth: 52, textAlign: "center" }}>
                {b.nav || b.label}
              </span>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 14.5 }}>{b.label}</b>
                {b.desc && (
                  <span className="hint" style={{ marginLeft: 6 }}>{b.desc}</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          {!firstTime && (
            <button className="btn btn-ghost" onClick={() => setIntro(false)}>
              닫기
            </button>
          )}
          <button className="btn btn-primary" onClick={dismissForever}>
            볼 필요 없음 — 화면으로
          </button>
        </div>
      </div>
    </div>
  );

  if (items.length < 2) return overlay || null;

  return (
    <>
      <nav className="sectnav" ref={barRef} aria-label="화면 차례">
        {/* 다시 보고 싶을 때 — 「이게 다 뭐예요」 는 한 번으로 안 끝난다 */}
        <button className="sectnav-chip sectnav-help" onClick={() => setIntro(true)} title="화면 소개 다시 보기">
          ？소개
        </button>
        {items.map((k) => (
          <button
            key={k}
            data-k={k}
            className={`sectnav-chip ${active === k ? "on" : ""}`}
            onClick={() =>
              document
                .getElementById(`blk-${k}`)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            {navOf.get(k) || k}
          </button>
        ))}
      </nav>
      {overlay}
    </>
  );
}
