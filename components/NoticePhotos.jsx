"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNoticePhoto, removeNoticePhoto, noticePhotoUrls } from "@/app/today/noticePhotos";
import { shownName, isImage, fileKind } from "@/lib/noticeFile";

/**
 * 공지에 붙은 **사진과 파일**.
 *
 * 보는 쪽(학생·학부모)은 `readOnly` 로 쓴다 — 누르면 원본이 새 창에 열린다.
 * 원장님 화면에서는 여기서 바로 찍어 붙이고 뗄 수 있다.
 *
 * ── 여는 링크는 「누를 때」 만든다 ─────────────────────
 *
 * 전에는 화면이 열릴 때 10분짜리 링크를 미리 만들어 걸어놨다. 화면을
 * 열어두고 십 분 뒤에 누르면 InvalidJWT 라는 영어 오류가 통째로 떴다
 * (원장님, 2026-08-11 에 겪으심). 이제 `/api/notice/file` 로 건다 —
 * 누르는 순간 새 링크를 만들어 그리로 보내니 **안 늙는다.**
 * 미리 만드는 링크는 **그림 미리보기에만** 쓴다 (못 늙기 전에 그려진다).
 *
 * ── 단추를 둘로 나눈 까닭 ──────────────────────────────
 *
 * 원장님, 2026-08-11 — 「pdf나 그냥 파일도 가능하게 해주고」.
 * `capture` 가 붙은 단추 하나뿐이면 폰에서 카메라가 바로 열려서 파일
 * 앱·드라이브를 고를 길이 없다. 그래서 **찍기와 고르기를 갈라 둔다.**
 */
export default function NoticePhotos({ noticeId, photos = [], readOnly = false }) {
  const [urls, setUrls] = useState({});
  const [pending, startTransition] = useTransition();
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const router = useRouter();

  // 그림 미리보기용 — 여는 것은 /api/notice/file 이 맡는다
  const previews = photos.filter(isImage);
  const key = previews.join("|");
  useEffect(() => {
    let alive = true;
    if (previews.length === 0) {
      setUrls({});
      return () => {};
    }
    noticePhotoUrls(previews).then((r) => {
      if (alive) setUrls(r?.urls || {});
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 여러 개를 한 번에 고르셔도 된다 — 하나씩 차례로 올린다 */
  function pick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    startTransition(async () => {
      const bad = [];
      for (const f of files) {
        const form = new FormData();
        form.set("noticeId", noticeId);
        form.set("file", f);
        const r = await addNoticePhoto(form);
        // **하나가 안 됐다고 나머지를 버리지 않는다** — 무엇이 안 됐는지 말해준다
        if (r?.error) bad.push(`${f.name} — ${r.error}`);
      }
      if (bad.length) alert(`못 붙인 것이 있어요\n\n${bad.join("\n")}`);
      router.refresh();
    });
  }

  function drop(path) {
    if (!confirm(`「${shownName(path)}」 을(를) 뗄까요?`)) return;
    startTransition(async () => {
      const r = await removeNoticePhoto(noticeId, path);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  if (readOnly && photos.length === 0) return null;

  const open = (p) => `/api/notice/file?p=${encodeURIComponent(p)}`;

  return (
    <div className="stack" style={{ gap: 6 }}>
      {photos.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-start" }}>
          {photos.map((p) => {
            const name = shownName(p);
            const img = isImage(p) && urls[p];
            return (
              <div key={p} style={{ position: "relative" }}>
                <a href={open(p)} target="_blank" rel="noreferrer" title={name} style={{ textDecoration: "none" }}>
                  {img ? (
                    <img
                      src={urls[p]}
                      alt={name}
                      style={{
                        width: 96, height: 96, objectFit: "cover",
                        borderRadius: 8, border: "1px solid var(--border)",
                      }}
                    />
                  ) : (
                    /* 그림이 아닌 것은 **이름표로** — 전에는 이것도 <img> 로
                       그려서 깨진 그림만 남았다 */
                    <span
                      className="tag tag-sky"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "10px 12px", maxWidth: 220,
                      }}
                    >
                      <b style={{ fontSize: 12 }}>{fileKind(p)}</b>
                      <span style={{
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        fontSize: 13,
                      }}>
                        {name}
                      </span>
                    </span>
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

      {/* **한 번에 받기** (원장님, 2026-08-11) — 두 개부터 뜬다. 하나면 그냥 누르면 된다 */}
      {photos.length > 1 && (
        <a
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start" }}
          href={`/api/notice/zip?n=${encodeURIComponent(noticeId)}`}
        >
          ⬇ 모두 받기 ({photos.length}개 zip)
        </a>
      )}

      {!readOnly && (
        <>
          {/* **고르기** — 갈래를 안 걸어둔다. PDF · 한글 · 엑셀 · 사진 다 된다 */}
          <input
            ref={fileRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={pick}
          />
          {/* **찍기** — capture 는 여기에만. 이게 붙어 있으면 파일을 못 고른다 */}
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={pick}
          />
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
            >
              {pending ? "올리는 중…" : "📎 파일 붙이기"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => camRef.current?.click()}
              disabled={pending}
            >
              📷 찍어서 붙이기
            </button>
          </div>
          <p className="hint" style={{ margin: 0, fontSize: 12.5 }}>
            PDF · 한글 · 엑셀 · 사진 다 됩니다 (하나에 25MB까지, 여러 개 한 번에).
          </p>
        </>
      )}
    </div>
  );
}
