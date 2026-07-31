"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { uploadRequestPhoto, dropRequestPhoto, requestPhotoUrls } from "@/app/requests/photoActions";

/**
 * 알림에 붙는 사진 (0068).
 *
 * 보내는 쪽(학생·학부모)은 여기서 바로 찍어 붙인다. 보내기 전이므로 뗄 수 있다.
 * 보는 쪽(선생님)은 `readOnly` — 누르면 원본이 새 창에 열린다.
 *
 * 비공개라 주소가 그때그때 새로 만들어진다. 그래서 열릴 때 한 번 받아온다.
 */
export default function RequestPhotos({
  paths = [],
  onChange = null,
  asId = null,
  readOnly = false,
  small = false,
}) {
  const [urls, setUrls] = useState({});
  const [pending, startTransition] = useTransition();
  const fileRef = useRef(null);

  const key = paths.join("|");
  useEffect(() => {
    let alive = true;
    if (paths.length === 0) {
      setUrls({});
      return () => {};
    }
    requestPhotoUrls(paths).then((r) => {
      if (alive) setUrls(r?.urls || {});
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (files.length === 0) return;
    startTransition(async () => {
      const added = [];
      for (const f of files) {
        const form = new FormData();
        form.set("file", f);
        if (asId) form.set("asId", asId);
        const r = await uploadRequestPhoto(form);
        if (r?.error) {
          alert(r.error);
          break;
        }
        added.push(r.path);
      }
      if (added.length) onChange?.([...paths, ...added]);
    });
  }

  function drop(p) {
    startTransition(async () => {
      await dropRequestPhoto(p);
      onChange?.(paths.filter((x) => x !== p));
    });
  }

  const size = small ? 56 : 84;

  if (readOnly && paths.length === 0) return null;

  return (
    <div className="stack" style={{ gap: 6 }}>
      {paths.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {paths.map((p) => {
            const url = urls[p];
            const isPdf = p.toLowerCase().endsWith(".pdf");
            return (
              <div key={p} style={{ position: "relative" }}>
                <a
                  href={url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => !url && e.preventDefault()}
                >
                  {isPdf || !url ? (
                    <span className="tag tag-sky" style={{ display: "inline-block", padding: "8px 10px" }}>
                      {isPdf ? "PDF" : "…"}
                    </span>
                  ) : (
                    <img
                      src={url}
                      alt="붙인 사진"
                      style={{
                        width: size, height: size, objectFit: "cover",
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
            multiple
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
