"use client";

import { useState } from "react";

/**
 * 마이그레이션 하나씩 복사.
 *
 * 전체를 붙였는데 안 들어갔을 때, **막힌 것 하나만** 돌려보면
 * Supabase 가 그 구문의 진짜 에러를 알려준다.
 */
export default function StepBox({ steps = [], missing = [] }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(null);

  const need = new Set(missing);
  const show = open ? steps : steps.filter((s) => need.has(s.id));

  if (steps.length === 0) return null;

  // 안 들어간 것만 이어붙인다 — 전체(1,900줄)보다 훨씬 짧아서 붙여넣다 사고 날 일이 적다
  const onlyMissing = steps.filter((s) => need.has(s.id));
  const missingSql = onlyMissing
    .map((s) => `-- ===== ${s.name} =====\n${s.body}`)
    .join("\n\n");
  const missingLines = missingSql ? missingSql.split("\n").length : 0;

  async function put(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      alert("복사가 안 되면 아래 상자에서 전체 선택(Ctrl+A) 후 복사하세요.");
    }
  }
  const copyStep = (s) => put(s.body, s.id);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: 14 }}>하나씩 실행하기</b>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
          {open ? "안 들어간 것만" : `전체 ${steps.length}개 보기`}
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 12px", lineHeight: 1.8 }}>
        전체를 붙였는데도 위 상태가 그대로면, <b>안 들어간 것 중 맨 위 하나만</b> 복사해서
        따로 Run 해보세요. Supabase 가 <b>그 구문의 진짜 에러</b>를 알려줍니다.
        그 문구를 알려주시면 바로 고쳐드릴 수 있습니다.
        <br />
        <b>꼭 [이것만 복사] 단추를 쓰세요.</b> 화면 글자를 마우스로 긁으면 파일 이름까지 딸려가서
        에러가 납니다.
      </p>

      {onlyMissing.length > 0 && (
        <div className="card card-tight" style={{ marginBottom: 12, background: "transparent" }}>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>안 들어간 것만 한 번에</b>
            <span className="tag tag-amber">{onlyMissing.length}개 · {missingLines}줄</span>
            <span className="spacer" />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => put(missingSql, "__all")}
            >
              {copied === "__all" ? "복사됐어요 ✓" : "이것만 복사"}
            </button>
          </div>
          <p className="hint" style={{ margin: "6px 0 0", lineHeight: 1.8 }}>
            전체 SQL 대신 <b>모자란 것만</b> 담았습니다. 훨씬 짧아서 붙여넣다 딴 게 섞일 일이
            적습니다. SQL Editor 를 <b>Ctrl+A 로 비우고</b> 이것만 붙여 Run 해보세요.
          </p>
        </div>
      )}

      <div className="stack" style={{ gap: 8 }}>
        {show.map((s) => (
          <details key={s.name} className="card card-tight" style={{ background: "transparent" }}>
            <summary style={{ cursor: "pointer", fontSize: 13 }}>
              <span className={`tag ${need.has(s.id) ? "tag-amber" : "tag-mint"}`}>
                {need.has(s.id) ? "없음" : "OK"}
              </span>{" "}
              <b>{s.name}</b>{" "}
              <span className="hint">{s.lines}줄</span>
            </summary>
            <div className="row" style={{ gap: 6, margin: "8px 0" }}>
              <button className="btn btn-primary btn-sm" onClick={() => copyStep(s)}>
                {copied === s.id ? "복사됐어요 ✓" : "이것만 복사"}
              </button>
            </div>
            <textarea
              className="input"
              readOnly
              value={s.body}
              onFocus={(e) => e.target.select()}
              style={{
                width: "100%",
                height: 200,
                fontFamily: "ui-monospace, monospace",
                fontSize: 11.5,
              }}
            />
          </details>
        ))}
        {show.length === 0 && <p className="hint">안 들어간 것이 없습니다.</p>}
      </div>
    </div>
  );
}
