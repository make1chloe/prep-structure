"use client";

import { useState } from "react";

/**
 * **안 한 것이 있으면 들어올 때마다 묻는다** (원장님, 2026-08-14 —
 * 「성적 미입력 시, 숙제 미제출 시 학생에게 팝업 계속」).
 *
 * 공지 길목(NoticeGate)과 같은 자리인데 성격이 다르다 — 공지는 한 번
 * 확인하면 끝이지만, 이건 **해결될 때까지 매번** 뜬다. 그래서 기기에
 * 기억하지 않는다. 숙제를 내면(완료를 누르면), 점수를 적으면 저절로 안 뜬다.
 */
export default function PendingGate({ homework = [], scores = [] }) {
  const [open, setOpen] = useState(homework.length > 0 || scores.length > 0);
  if (!open) return null;

  const go = (tab, blk) => {
    setOpen(false);
    // 탭 전환·스크롤은 MeTabs 가 한다 (신설 채널 me:go — 탭 개편 C2).
    // 닫힘 대기 50ms 도 MeTabs 쪽에 있다 — 오버레이가 사라져야 스크롤이 먹는다
    window.dispatchEvent(new CustomEvent("me:go", { detail: { tab, blk } }));
  };

  return (
    <div className="introwrap" role="dialog" aria-label="할 일 알림" style={{ zIndex: 54 }}>
      <div className="introcard">
        <h2 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 800 }}>
          ✋ 아직 안 한 것이 있어요
        </h2>
        <div className="stack" style={{ gap: 12 }}>
          {homework.length > 0 && (
            <div className="card card-tight" style={{ background: "var(--amber-soft)" }}>
              <b style={{ fontSize: 15 }}>안 낸 숙제 {homework.length}개</b>
              <div className="hint" style={{ marginTop: 4, lineHeight: 1.7 }}>
                {homework.join(" · ")}
              </div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => go("hw", "blk-homework")}>
                숙제 하러 가기
              </button>
            </div>
          )}
          {scores.length > 0 && (
            <div className="card card-tight" style={{ background: "var(--amber-soft)" }}>
              <b style={{ fontSize: 15 }}>적어야 할 시험 결과 {scores.length}건</b>
              <div className="hint" style={{ marginTop: 4, lineHeight: 1.7 }}>
                {scores.join(" · ")}
              </div>
              {/* write(시험 적기) 블록이 숨어 있으면 scores 자체가 안 온다
                  (page.jsx — 막다른 문 방지, §4-3) — 이 단추는 늘 도착한다 */}
              <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => go("grow", "blk-write")}>
                시험 결과 적으러 가기
              </button>
            </div>
          )}
        </div>
        <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>
            이따 할게요 — 화면으로
          </button>
        </div>
        <p className="hint" style={{ margin: "8px 0 0", textAlign: "right" }}>
          다 하기 전까지는 들어올 때마다 다시 떠요.
        </p>
      </div>
    </div>
  );
}
