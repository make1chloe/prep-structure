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

  async function copy(s) {
    try {
      await navigator.clipboard.writeText(s.body);
      setCopied(s.id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      alert("복사가 안 되면 아래 상자에서 전체 선택(Ctrl+A) 후 복사하세요.");
    }
  }

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
              <button className="btn btn-primary btn-sm" onClick={() => copy(s)}>
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
