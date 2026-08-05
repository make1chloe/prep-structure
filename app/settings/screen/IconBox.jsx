"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { iconStatus, saveIcons, clearIcons } from "./iconActions";

/**
 * 홈 화면 아이콘 — **로고 파일을 올리면 끝.**
 *
 * 학생이 「홈 화면에 추가」 를 하면 폰 바탕에 생기는 그림이다. 예전에는 이걸
 * 바꾸려면 파일을 코드에 넣고 다시 배포해야 했다.
 *
 * 크기 맞추기는 **여기 브라우저에서** 한다. 서버에 그림 다루는 도구를
 * 들이지 않으려는 것이다. 만드는 판은 다섯 가지 —
 *
 *   192 · 512   안드로이드 · 크롬
 *   잘리는 판    안드로이드는 아이콘을 **동그랗게 잘라낸다.** 가장자리가
 *               잘려도 로고가 온전하도록 여백을 더 준 판
 *   아이폰 판    투명을 검게 칠하므로 **흰 바탕**으로 굽는다
 *   탭 아이콘    브라우저 탭에 뜨는 작은 것
 */
const SIZES = [
  ["icon-192", 192, 0.86],
  ["icon-512", 512, 0.86],
  ["icon-192m", 192, 0.62],
  ["icon-512m", 512, 0.62],
  ["icon-apple", 180, 0.84],
  ["icon-favicon", 64, 0.9],
  // 화면 안(왼쪽 위 로고)에서 쓰는 판 — **바탕을 안 칠한다.**
  // 흰 바탕으로 구우면 어두운 화면에서 흰 타일이 하나 떠 있게 된다.
  ["icon-mark", 128, 1.0],
];
const TRANSPARENT = new Set(["icon-mark"]);

/** 그림에서 **실제로 그려진 부분**만 잘라낸다 (파일에 투명 여백이 있을 수 있다) */
function trim(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  try {
    const { data } = g.getImageData(0, 0, c.width, c.height);
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        if (data[(y * c.width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (y < y0) y0 = y;
          if (x > x1) x1 = x;
          if (y > y1) y1 = y;
        }
      }
    }
  } catch {
    return { c, x0: 0, y0: 0, w: c.width, h: c.height };   // 못 읽으면 통째로 쓴다
  }
  if (x1 < 0) return { c, x0: 0, y0: 0, w: c.width, h: c.height };
  return { c, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export default function IconBox() {
  const [st, setSt] = useState(null);
  const [preview, setPreview] = useState(null);   // { [key]: dataURL }
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef(null);
  // 주소 뒤에 붙이는 시각. 이게 없으면 **브라우저가 옛 그림을 계속 들고 있어서**
  // 올렸는데도 안 바뀐 것처럼 보인다. 실제로 그랬다.
  const bust = st?.updatedAt || "";

  useEffect(() => { iconStatus().then(setSt); }, []);

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setName(file.name);
    const img = new Image();
    img.src = URL.createObjectURL(file);
    try {
      await img.decode();
    } catch {
      alert("이 그림 파일을 읽지 못했어요. PNG 로 저장해서 다시 올려주세요.");
      return;
    }
    // SVG 는 크기가 안 적혀 있으면 브라우저가 0 이나 300x150 으로 준다.
    // 그대로 그리면 **빈 아이콘**이 만들어진다.
    if (!img.naturalWidth || !img.naturalHeight) {
      alert("그림 크기를 알 수 없어요. PNG 로 저장해서 다시 올려주세요.");
      return;
    }

    const { c, x0, y0, w, h } = trim(img);
    if (w < 8 || h < 8) {
      alert("그림에서 로고를 못 찾았어요 (거의 비어 있습니다). 다른 파일로 해주세요.");
      return;
    }
    const made = {};
    for (const [key, size, inner] of SIZES) {
      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const g = out.getContext("2d");
      // 아이폰은 투명을 검게 칠한다 — 홈 화면에 쓰는 판은 흰 바탕으로 굽는다.
      // 화면 안에서 쓰는 판만 그대로 둔다.
      if (!TRANSPARENT.has(key)) {
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, size, size);
      }
      const box = size * inner;
      const scale = Math.min(box / w, box / h);
      const dw = w * scale;
      const dh = h * scale;
      g.imageSmoothingQuality = "high";
      g.drawImage(c, x0, y0, w, h, (size - dw) / 2, (size - dh) / 2, dw, dh);
      made[key] = out.toDataURL("image/png");
    }
    setPreview(made);
    URL.revokeObjectURL(img.src);
  }

  function save() {
    if (!preview) return;
    startTransition(async () => {
      const r = await saveIcons(preview);
      if (r?.error) { alert(r.error); return; }
      setPreview(null);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      setSt(await iconStatus());
      alert("바꿨습니다.\n\n이미 홈 화면에 추가해둔 아이콘은 안 바뀝니다 —\n지우고 다시 추가해야 새 그림이 뜹니다.");
    });
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>홈 화면 아이콘</h2>
        {st?.uploaded && <span className="tag tag-mint">올려둔 로고를 씁니다</span>}
        {st && !st.uploaded && !st.error && <span className="tag tag-muted">기본 그림</span>}
      </div>
      <p className="muted" style={{ margin: "6px 0 10px", fontSize: 12.5, lineHeight: 1.7 }}>
        학생이 <b>홈 화면에 추가</b>하면 폰 바탕에 생기는 그림입니다. 로고 파일을
        올리면 필요한 크기로 <b>알아서 만들어</b> 둡니다 — 배경 여백은 잘라내고,
        안드로이드가 동그랗게 잘라내는 판은 여백을 더 줍니다.
      </p>

      {st?.error && <div className="err" style={{ marginBottom: 10 }}>{st.error}</div>}

      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={fileRef}
          className="input input-sm"
          style={{ flex: 1, minWidth: 200 }}
          type="file"
          accept="image/png,image/webp,image/jpeg,image/svg+xml"
          onChange={pick}
        />
        {preview && (
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={save}>
            {pending ? "올리는 중…" : "이걸로 하기"}
          </button>
        )}
        {st?.uploaded && !preview && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("올린 로고를 지우고 기본 그림으로 돌아갈까요?")) return;
              startTransition(async () => {
                await clearIcons();
                setSt(await iconStatus());
              });
            }}
          >
            기본으로 되돌리기
          </button>
        )}
      </div>
      {name && <p className="hint" style={{ margin: "6px 0 0" }}>고른 파일: {name}</p>}

      {/* 올리기 전에 **잘리는 모습까지** 보여준다 — 올리고 나서 폰에서 확인하면 늦다 */}
      {!preview && st && !st.uploaded && !st.error && (
        <p className="hint" style={{ margin: "12px 0 0", lineHeight: 1.7 }}>
          아직 로고를 안 올리셨습니다. <b>기본 그림은 없습니다</b> — 올리기 전까지
          폰은 화면을 찍은 그림이나 빈 네모를 씁니다.
        </p>
      )}

      <div className="row" style={{ gap: 14, marginTop: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        {[
          ["icon-512", "512", "안드로이드 · 크롬", "12px"],
          ["icon-512m", "512m", "동그랗게 잘릴 때", "50%"],
          ["icon-apple", "apple", "아이폰", "22%"],
        ].filter(() => preview || st?.uploaded).map(([key, api, label, radius]) => (
          <div key={key} style={{ textAlign: "center" }}>
            <img
              alt={label}
              src={preview ? preview[key] : st?.uploaded ? `/api/icon/${api}?v=${bust}` : ""}
              width={72}
              height={72}
              style={{
                borderRadius: radius,
                border: "1px solid var(--border)",
                background: "#fff",
                display: "block",
              }}
            />
            <span className="hint" style={{ fontSize: 11 }}>{label}</span>
          </div>
        ))}
      </div>

      <p className="hint" style={{ margin: "10px 0 0", lineHeight: 1.7 }}>
        <b>이미 홈 화면에 추가해둔 아이콘은 안 바뀝니다.</b> 지우고 다시 추가해야
        새 그림이 뜹니다 — 학생들에게 한 번 안내해주세요.
      </p>
    </div>
  );
}
