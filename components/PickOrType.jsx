"use client";

import { useState } from "react";

/**
 * **골라 넣되, 없으면 적는다** (전수검사 C6 — SchoolField 2판과 같은 꼴).
 *
 * datalist 는 아이폰에서 목록이 거의 안 보여서 그냥 글자 치는 칸이 된다
 * (학교 칸에서 실제로 겪었다). 목록은 select 로 또렷이 고르고, 목록에
 * 없는 값만 「직접 적기」 로 적는다. 지금 값이 목록에 없으면 자동으로
 * 직접 적기 모드로 열린다 — 값을 잃지 않게.
 *
 * @param options  고를 수 있는 값들 (글자 배열)
 * @param value    지금 값 (controlled)
 * @param onChange (e) — e.target.value 로 새 값
 * @param name     폼으로 낼 때의 이름 (숨은 input 에 실린다)
 */
export default function PickOrType({
  options = [],
  value,
  onChange,
  defaultValue = "",
  name,
  placeholder = "",
  className = "input input-sm",
  ...rest
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue || "");
  const cur = controlled ? (value ?? "") : inner;
  const [custom, setCustom] = useState(() => !!(cur && options.length && !options.includes(cur)));
  const set = (v) => {
    if (!controlled) setInner(v);
    onChange?.({ target: { value: v } });
  };

  if (options.length === 0 || custom) {
    return (
      <>
        <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
          <input
            className={className}
            placeholder={placeholder}
            value={cur}
            onChange={(e) => set(e.target.value)}
            {...rest}
          />
          {options.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title="목록에서 고르기로 돌아갑니다"
              onClick={() => { setCustom(false); set(""); }}
            >
              목록
            </button>
          )}
        </span>
        {name && <input type="hidden" name={name} value={cur} />}
      </>
    );
  }

  return (
    <>
      <select
        className={className}
        value={options.includes(cur) ? cur : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__custom") { setCustom(true); set(""); return; }
          set(v);
        }}
        {...rest}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__custom">직접 적기…</option>
      </select>
      {name && <input type="hidden" name={name} value={cur} />}
    </>
  );
}
