"use client";

import { useState } from "react";

/**
 * **사진 한 장 — 돌리고, 키우고, 받는다** (원장님, 2026-08-07 —
 * 「사진방향을 돌리거나 확대가능할까」 · 「내가 다운받을 수 있냐는거」).
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 *
 * 아이들은 공책을 **아무 방향으로나** 찍는다. 옆으로 누운 사진을 보려고
 * 고개를 돌리거나, 새 창에 열어 브라우저 기능을 찾아야 했다. 새 창으로
 * 나가면 검사하던 자리를 잃는다 — 돌아오면 어디까지 봤는지 다시 찾아야 한다.
 *
 * 글씨가 작으면 읽을 수가 없다. 단어 시험지를 찍어 올린 것은 특히 그렇다.
 *
 * 그리고 사진은 **30일이 지나면 지워진다.** 남겨야 할 것이 있으면 그 전에
 * 받아두실 수 있어야 하는데, 받는 길이 아예 없었다.
 *
 * ── 어떻게 ───────────────────────────────────────────────
 *
 * 돌리기는 **화면에서만** 돌린다 (CSS). 원본을 고쳐 저장하면 아이가 낸 것을
 * 선생님이 바꾼 것이 되고, 되돌릴 수도 없다. 그리고 다시 열면 처음 각도로
 * 돌아온다 — 매번 같은 각도로 시작하는 편이 「내가 아까 돌렸던가」 보다 낫다.
 *
 * 키우기는 **누르면 커진다.** 손가락으로 벌리는 것은 폰에서만 되고, 원장님은
 * 컴퓨터로도 검사하신다.
 */
export default function PhotoView({ url, save = null, alt = "", max = 420 }) {
  const [deg, setDeg] = useState(0);
  const [big, setBig] = useState(false);

  if (!url) return null;

  const turned = deg % 180 !== 0;

  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: "2px 8px" }}
          onClick={() => setDeg((d) => (d + 270) % 360)}
          title="왼쪽으로 돌리기"
        >
          ↺
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: "2px 8px" }}
          onClick={() => setDeg((d) => (d + 90) % 360)}
          title="오른쪽으로 돌리기"
        >
          ↻
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ padding: "2px 8px" }}
          onClick={() => setBig(!big)}
          title={big ? "원래 크기로" : "크게 보기"}
        >
          {big ? "축소" : "확대"}
        </button>
        <span className="spacer" />
        {/* 새 창은 그대로 둔다 — 두 장을 나란히 놓고 견주실 때가 있다 */}
        <a className="btn btn-ghost btn-sm" style={{ padding: "2px 8px" }}
           href={url} target="_blank" rel="noreferrer">
          새 창
        </a>
        {save && (
          <a className="btn btn-ghost btn-sm" style={{ padding: "2px 8px" }} href={save} download>
            받기
          </a>
        )}
      </div>

      {/**
        * 돌리면 가로세로가 바뀐다. 그대로 두면 옆으로 누운 사진이 칸을
        * 삐져나가거나, 반대로 위아래에 빈 자리가 크게 남는다.
        * 담는 칸의 높이를 돌린 각도에 맞춰 잡아준다.
        */}
      <div
        style={{
          overflow: big ? "auto" : "hidden",
          maxHeight: big ? "80vh" : max,
          display: "flex",
          justifyContent: "center",
          borderRadius: 8,
          background: "var(--surface-2)",
        }}
      >
        <img
          src={url}
          alt={alt}
          style={{
            transform: `rotate(${deg}deg)`,
            transformOrigin: "center",
            maxWidth: big ? "none" : turned ? max : "100%",
            maxHeight: big ? "none" : turned ? "100%" : max,
            width: big ? "auto" : undefined,
            display: "block",
            transition: "transform .15s",
          }}
        />
      </div>
    </div>
  );
}
