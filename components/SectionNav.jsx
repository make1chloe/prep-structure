"use client";

import { useEffect, useState } from "react";
import { findPage, NAV_GROUPS } from "@/lib/screenLayout";

/**
 * 학생·학부모 화면의 **위 메뉴** (원장님, 2026-08-14).
 *
 * 세 가지 요구를 그대로 따른다:
 *   1. **가로 스크롤 없음** — 대메뉴는 한 줄에 칸을 나눠 다 보인다
 *   2. **대메뉴만 두고, 소메뉴는 그 갈래에 들어갔을 때만 위에 뜬다**
 *      > 「학생들은 별생각 없이 아무거나 누르기 때문」 — 고를 것이 적어야
 *      > 아무거나 눌러도 크게 안 틀린다
 *   3. 처음 열면 소개부터 — 「볼 필요 없음」 을 눌러야 화면, 「？」 로 재열람
 *
 * 묶음과 이름은 lib/screenLayout 의 NAV_GROUPS 한 곳 — 소개도 같은 것을
 * 읽는다 (따로 적으면 화면이 바뀔 때 소개만 낡는다, 원칙 1).
 * **화면을 탭으로 쪼개지 않는다** — 덩어리 차례는 원장님이 정하시고(0095),
 * 이건 그 한 장의 차례표다. 비어서 안 그려진 덩어리는 메뉴에도 없다 (A8).
 */
export default function SectionNav({ page, order = [] }) {
  const [present, setPresent] = useState(() => new Set());
  const [active, setActive] = useState(null);       // 지금 보고 있는 덩어리 key
  const [intro, setIntro] = useState(false);
  const [firstTime, setFirstTime] = useState(false);
  const INTRO_KEY = `chloe.intro.${page}`;

  const blocks = findPage(page)?.blocks || [];
  const blockOf = new Map(blocks.map((b) => [b.key, b]));
  const groups = (NAV_GROUPS[page] || []).map((g) => ({
    ...g,
    // 이 갈래에서 실제 화면 차례(order)에 있는 덩어리
    mine: order.filter((k) => g.blocks.includes(k)),
  }));
  const groupOfBlock = new Map();
  groups.forEach((g) => g.blocks.forEach((b) => groupOfBlock.set(b, g.key)));

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
    setPresent(new Set(found.map(({ key }) => key)));

    // 지금 어디를 보고 있나 — 화면 위쪽 근처에 걸린 덩어리
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting);
        if (hit.length > 0) setActive(hit[0].target.id.replace("blk-", ""));
      },
      { rootMargin: "-15% 0px -70% 0px" }
    );
    found.forEach(({ el }) => io.observe(el));
    return () => io.disconnect();
  }, [order.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps

  const go = (k) =>
    document.getElementById(`blk-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const shownGroups = groups.filter((g) => g.mine.some((k) => present.has(k)));
  const activeGroup = groupOfBlock.get(active) || null;
  // **소메뉴는 그 갈래를 보고 있을 때만** — 그리고 안이 둘 이상일 때만
  const sub = shownGroups.find((g) => g.key === activeGroup);
  const subItems = sub ? sub.mine.filter((k) => present.has(k)) : [];

  // 소개 — 대메뉴별로 묶어서 (묶음이 곧 쓰는 법이다)
  const overlay = intro && (
    <div className="introwrap" role="dialog" aria-label="화면 소개">
      <div className="introcard">
        <h2 style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 800 }}>
          {page === "parent" ? "학부모 화면, 이렇게 쓰세요" : "이 앱, 이렇게 쓰면 돼요"}
        </h2>
        <p className="hint" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
          위의 메뉴 <b>{groups.map((g) => g.nav).join(" · ")}</b> 를 누르면
          그 자리로 바로 가요.
        </p>
        <div className="stack" style={{ gap: 12 }}>
          {groups.map((g) => (
            <div key={g.key}>
              <div className="tag tag-lav" style={{ marginBottom: 4 }}>{g.nav}</div>
              <div className="stack" style={{ gap: 4 }}>
                {g.blocks.map((k) => blockOf.get(k)).filter(Boolean).map((b) => (
                  <div key={b.key} className="introrow">
                    <b style={{ fontSize: 14.5, flex: "none" }}>{b.label}</b>
                    {b.desc && <span className="hint">{b.desc}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
          {!firstTime && (
            <button className="btn btn-ghost" onClick={() => setIntro(false)}>닫기</button>
          )}
          <button className="btn btn-primary" onClick={dismissForever}>
            볼 필요 없음 — 화면으로
          </button>
        </div>
      </div>
    </div>
  );

  if (shownGroups.length < 2) return overlay || null;

  return (
    <>
      <div className="sectnav">
        {/* 대메뉴 — 칸을 나눠 가져서 **가로 스크롤이 없다** */}
        <div className="sectnav-main">
          <button
            className="sectnav-chip sectnav-help"
            onClick={() => setIntro(true)}
            title="화면 소개 다시 보기"
            aria-label="화면 소개"
          >
            ？
          </button>
          {shownGroups.map((g) => (
            <button
              key={g.key}
              className={`sectnav-chip ${activeGroup === g.key ? "on" : ""}`}
              onClick={() => go(g.mine.find((k) => present.has(k)))}
            >
              {g.nav}
            </button>
          ))}
        </div>
        {/* 소메뉴 — 그 갈래를 보고 있을 때만, 안이 둘 이상일 때만 */}
        {subItems.length > 1 && (
          <div className="sectnav-sub">
            {subItems.map((k) => (
              <button
                key={k}
                className={`sectnav-subchip ${active === k ? "on" : ""}`}
                onClick={() => go(k)}
              >
                {blockOf.get(k)?.nav || blockOf.get(k)?.label || k}
              </button>
            ))}
          </div>
        )}
      </div>
      {overlay}
    </>
  );
}
