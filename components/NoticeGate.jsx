"use client";

import { useEffect, useState } from "react";
import NoticePhotos from "@/components/NoticePhotos";

/**
 * **안 본 공지가 있으면 화면보다 먼저** (원장님, 2026-08-14).
 *
 * > 「공지나 알림사항은 원래 눈에 잘 띄게 해달라고 했었잖아. 접속할 때
 * >  1번 확인을 눌러야 전체 페이지 접속 가능한 구조로. 정확히 똑같이.」
 *
 * 소개 화면과 **정확히 같은 구조**다 — 열면 먼저 뜨고, 「확인했어요」 를
 * 눌러야 화면이 나오고, 한 번 확인한 공지는 이 기기에서 다시 안 뜬다.
 * 새 공지가 오면 그것만 다시 뜬다.
 *
 * 공지를 눈에 잘 띄게 하라는 말씀은 전부터 있었다 (조정필요의 노란 상자,
 * 2026-08-11). 알림 덩어리를 위로 올려도 **굴리기 전에 눌러 나가는 아이**는
 * 못 잡는다 — 길목에 세우는 것만 잡는다.
 *
 * 다시 보는 길은 이미 있다 — 화면의 「알림」 덩어리 (2주치가 그대로 있다).
 */
export default function NoticeGate({ page, notices = [] }) {
  const KEY = `chloe.noticeSeen.${page}`;
  const [unseen, setUnseen] = useState([]);

  useEffect(() => {
    try {
      const seen = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
      setUnseen(notices.filter((n) => !seen.has(n.id)));
    } catch {
      /* 사파리 비공개 — 막지 않는다. 공지는 화면의 알림 덩어리에도 있다 */
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  function confirm() {
    try {
      const seen = new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
      unseen.forEach((n) => seen.add(n.id));
      // 오래된 것은 흘려보낸다 — 무한히 쌓이면 언젠가 저장이 막힌다
      localStorage.setItem(KEY, JSON.stringify([...seen].slice(-200)));
    } catch { /* 무시 */ }
    setUnseen([]);
  }

  if (unseen.length === 0) return null;

  return (
    <div className="introwrap" role="dialog" aria-label="새 공지" style={{ zIndex: 55 }}>
      <div className="introcard">
        <h2 style={{ margin: "0 0 10px", fontSize: 19, fontWeight: 800 }}>
          📢 확인할 공지 {unseen.length}건
        </h2>
        <div className="stack" style={{ gap: 12 }}>
          {unseen.map((n) => (
            <div key={n.id} className="card card-tight" style={{ background: "var(--amber-soft)" }}>
              <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
                {n.title && <b style={{ fontSize: 15.5 }}>{n.title}</b>}
                <span className="hint">{(n.date || "").slice(5).replace("-", "/")}</span>
              </div>
              {n.body && (
                <div style={{ fontSize: 15, whiteSpace: "pre-wrap", marginTop: 4 }}>{n.body}</div>
              )}
              {(n.photos || []).length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <NoticePhotos noticeId={n.id} photos={n.photos || []} readOnly />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={confirm}>
            확인했어요 — 화면으로
          </button>
        </div>
      </div>
    </div>
  );
}
