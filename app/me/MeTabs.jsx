"use client";

import { useEffect, useState } from "react";
import { findPage, NAV_GROUPS } from "@/lib/screenLayout";
import { unseenOf } from "@/lib/noticeStamp";

/**
 * **학생 화면 네 탭** — 등원 · 숙제 · 일정 · 성장 (원장 확정 2026-08-27).
 *
 * 열아홉 덩어리가 한 줄로 쌓여 있으면 지금 볼 것이 아래로 밀린다. 탭
 * 네 개는 **항상 보이고**, 내용을 보일지 말지는 블록(설정→화면의 숨기기
 * 토글)이 정한다 — 탭 자체의 on/off 는 없다.
 *
 * **display:none, 언마운트 금지** (오늘 수업 판 관례 — StudentPanel).
 * 패널을 조건부 렌더로 갈아끼우면 탭을 오갈 때 SubmitBox 업로드 진행·
 * 펼침, BreakCard 진행 표시가 소리 없이 초기화된다. 열아홉 블록 전량이
 * 현행과 똑같이 서버에서 렌더되어 내려온다 — 탭은 성능 개선이 아니라
 * **보이는 양**의 정리다 (서버 조회 증감 0).
 *
 * 탭 = NAV_GROUPS.me 그 자체 — 별개 상수 금지 (원칙 1).
 *
 * 신설 채널 둘 (코드베이스에 CustomEvent 전례 없음 — 이 개편이 처음):
 *   me:go {tab, blk}  — PendingGate·교차 안내가 「그 탭 그 블록으로」
 *   me:noticeSeen     — NoticeGate 확인 → 일정 탭 배지 재계산
 */
export default function MeTabs({
  defaultTab = "in",   // 수업일이면 등원, 아니면 숙제 — 판정(isClassDay)은 서버 한 벌
  tab = "",            // ?tab= 딥링크 — 모르는 값(오타·옛 링크)은 기본 탭으로
  counts = {},         // { in, hw, grow } — 서버가 센 배지 숫자
  notices = [],        // 일정 배지 재료 — 판정은 이 기기(localStorage)라 여기서 센다
  panels = {},         // { in, hw, cal, grow } — 서버가 그린 패널 조각
}) {
  const groups = NAV_GROUPS.me;
  const keys = groups.map((g) => g.key);
  const [active, setActive] = useState(
    keys.includes(tab) ? tab : keys.includes(defaultTab) ? defaultTab : keys[0]
  );
  // 안 본 공지 수 — 붙은 뒤에 이 기기 기준으로 센다 (서버는 기기를 모른다)
  const [calBadge, setCalBadge] = useState(0);

  // 처음 소개 — SectionNav 의 것을 키(chloe.intro.me)째 계승
  const [intro, setIntro] = useState(false);
  const [firstTime, setFirstTime] = useState(false);
  const INTRO_KEY = "chloe.intro.me";

  useEffect(() => {
    const count = () => {
      try { setCalBadge(unseenOf("me", notices).length); } catch { setCalBadge(0); }
    };
    count();
    const onSeen = () => count();
    const onGo = (e) => {
      const t = e?.detail?.tab;
      const blk = e?.detail?.blk;
      if (keys.includes(t)) setActive(t);
      if (blk) {
        // 오버레이가 닫힌 뒤에 — 닫히기 전엔 스크롤이 안 먹는다 (PendingGate 전례)
        setTimeout(() => {
          document.getElementById(blk)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
    };
    window.addEventListener("me:noticeSeen", onSeen);
    window.addEventListener("me:go", onGo);
    return () => {
      window.removeEventListener("me:noticeSeen", onSeen);
      window.removeEventListener("me:go", onGo);
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

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

  const badgeOf = {
    in: counts.in || 0,
    hw: counts.hw || 0,
    cal: calBadge,
    grow: counts.grow || 0,
  };

  const blockOf = new Map((findPage("me")?.blocks || []).map((b) => [b.key, b]));

  // 소개 — 탭별로 묶어서 (묶음이 곧 쓰는 법이다). SectionNav 전례 그대로
  const overlay = intro && (
    <div className="introwrap" role="dialog" aria-label="화면 소개">
      <div className="introcard">
        <h2 style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 800 }}>
          이 앱, 이렇게 쓰면 돼요
        </h2>
        <p className="hint" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
          위의 탭 <b>{groups.map((g) => g.nav).join(" · ")}</b> 을 누르면
          그 갈래가 열려요.
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

  return (
    <>
      <div className="sectnav">
        <div className="sectnav-main">
          <button
            className="sectnav-chip sectnav-help"
            onClick={() => setIntro(true)}
            title="화면 소개 다시 보기"
            aria-label="화면 소개"
          >
            📖
          </button>
          {groups.map((g) => (
            <button
              key={g.key}
              className={`sectnav-chip ${active === g.key ? "on" : ""}`}
              onClick={() => setActive(g.key)}
            >
              {g.nav}
              {badgeOf[g.key] > 0 && (
                <span className="navbadge todo">{badgeOf[g.key]}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {keys.map((k) => (
        <div
          key={k}
          className="stack"
          style={active === k ? undefined : { display: "none" }}
        >
          {panels[k]}
        </div>
      ))}
      {overlay}
    </>
  );
}
