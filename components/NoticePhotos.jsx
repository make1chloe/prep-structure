"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNoticePhoto, removeNoticePhoto, noticePhotoUrls } from "@/app/today/noticePhotos";

/**
 * 공지에 붙은 사진.
 *
 * 보는 쪽(학생·학부모)은 `readOnly` 로 쓴다 — 누르면 원본이 새 창에 열린다.
 * 원장님 화면에서는 여기서 바로 찍어 붙이고 뗄 수 있다.
 *
 * 비공개 버킷이라 주소가 그때그때 새로 만들어진다. 그래서 화면이 열릴 때
 * 한 번 받아온다.
 */
export default function NoticePhotos({ noticeId, photos = [], readOnly = false }) {
  const [urls, setUrls] = useState({});
  const [pending, startTransition] = useTransition();
  const fileRef = useRef(null);
  const router = useRouter();

  const key = photos.join("|");
  useEffect(() => {
    let alive = true;
    if (photos.length === 0) {
      setUrls({});
      return () => {};
    }
    noticePhotoUrls(photos).then((r) => {
      if (alive) setUrls(r?.urls || {});
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const form = new FormData();
    form.set("noticeId", noticeId);
    form.set("file", f);
    startTransition(async () => {
      const r = await addNoticePhoto(form);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  function drop(path) {
    if (!confirm("이 사진을 뗄까요?")) return;
    startTransition(async () => {
      const r = await removeNoticePhoto(noticeId, path);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  if (readOnly && photos.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 6 }}>
      {photos.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {photos.map((p) => {
            const url = urls[p];
            const isPdf = p.toLowerCase().endsWith(".pdf");
            return (
              <div key={p} style={{ position: "relative" }}>
                <a href={url || "#"} target="_blank" rel="noreferrer" onClick={(e) => !url && e.preventDefault()}>
                  {isPdf || !url ? (
                    <span className="tag tag-sky" style={{ display: "inline-block", padding: "10px 12px" }}>
                      {isPdf ? "PDF 열기" : "불러오는 중…"}
                    </span>
                  ) : (
                    <img
                      src={url}
                      alt="공지 사진"
                      style={{
                        width: 96, height: 96, objectFit: "cover",
                        borderRadius: 8, border: "1px solid var(--border)",
                      }}
                    />
                  )}
                </a>
                {!readOnly && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ position: "absolute", top: 2, right: 2, padding: "0 6px", background: "var(--surface)" }}
                    onClick={() => drop(p)}
                    disabled={pending}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            style={{ display: "none" }}
            onChange={pick}
          />
          <button
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: "flex-start" }}
            onClick={() => fileRef.current?.click()}
            disabled={pending}
          >
            {pending ? "올리는 중…" : "📷 사진 붙이기"}
          </button>
        </>
      )}
    </div>
  );
}
