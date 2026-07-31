"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { openVideo, finishVideo, undoFinishVideo } from "@/app/videos/actions";
import { embedUrl, thumbUrl } from "@/lib/video";

/**
 * 볼 영상.
 *
 * 아이가 「보기」를 누르면 그 자리에서 열리고, **연 것이 저절로 적힌다.**
 * 물어보면 다들 봤다고 하니까, 물어보지 않는다.
 *
 * 다 보고 나서 「다 봤어요」를 누른다. 연 것과 다 본 것은 다른 이야기다.
 */
export default function VideoList({ videos = [], asId = null, readOnly = false }) {
  const [openId, setOpenId] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (videos.length === 0) return null;

  const left = videos.filter((v) => !v.doneAt);
  const done = videos.filter((v) => v.doneAt);

  function open(v) {
    setOpenId(openId === v.id ? null : v.id);
    if (openId !== v.id && !readOnly) {
      // 기록은 조용히 남긴다 — 화면이 새로 그려지면 영상이 끊긴다
      openVideo(v.id, asId);
    }
  }

  function run(fn) {
    startTransition(async () => {
      const r = await fn();
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  function card(v) {
    const isOpen = openId === v.id;
    const thumb = thumbUrl(v.provider, v.vid);
    return (
      <div className="card card-tight" key={v.id}>
        <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          {thumb && !isOpen && (
            <img
              src={thumb}
              alt=""
              onClick={() => open(v)}
              style={{ width: 96, borderRadius: 8, cursor: "pointer", border: "1px solid var(--border)" }}
            />
          )}
          <div className="stack" style={{ gap: 4, flex: 1, minWidth: 160 }}>
            <b style={{ fontSize: 13.5 }}>{v.title}</b>
            {v.dueOn && <span className="hint">{v.dueOn.slice(5).replace("-", "/")}까지</span>}
            {v.doneAt && <span className="tag tag-mint" style={{ alignSelf: "flex-start" }}>다 봤어요</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => open(v)}>
            {isOpen ? "닫기" : "보기"}
          </button>
        </div>

        {isOpen && (
          <div style={{ marginTop: 8 }}>
            <div style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe
                src={embedUrl(v.provider, v.vid, v.url)}
                title={v.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  border: 0, borderRadius: 8,
                }}
              />
            </div>
            {v.note && <p className="hint" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{v.note}</p>}
            {v.doneAt ? (
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: "100%", marginTop: 8 }}
                disabled={pending || readOnly}
                onClick={() => run(() => undoFinishVideo(v.id, asId))}
              >
                다시 보기로 되돌리기
              </button>
            ) : (
              <button
                className="bigbtn"
                style={{ marginTop: 8 }}
                disabled={pending || readOnly}
                onClick={() => run(() => finishVideo(v.id, asId))}
              >
                다 봤어요
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>
        볼 영상 <span className="hint" style={{ fontWeight: 500 }}>{done.length} / {videos.length} 봄</span>
      </h2>
      <div className="stack" style={{ gap: 8 }}>
        {left.map(card)}
        {done.map(card)}
      </div>
    </div>
  );
}
