"use client";

import { useMemo, useState } from "react";

/**
 * 목록에서 **골라서 한 번에** 처리하기.
 *
 * 화면마다 따로 만들면 어떤 데는 전체 선택이 있고 어떤 데는 없다. 실제로
 * 그렇게 되어 있었다. 고르는 방식이 화면마다 다르면 매번 눈으로 찾아야 한다.
 * **한 군데서 만들고 모든 목록이 같이 쓴다.**
 *
 * 규칙 두 가지
 *   · 「전체」는 **지금 화면에 보이는 것**만이다. 검색으로 걸러놓고 전체를
 *     눌렀는데 안 보이던 것까지 지워지면 큰일이다
 *   · 걸러내기를 바꾸면 안 보이게 된 것은 **선택에서도 빠진다.** 안 보이는
 *     것이 선택된 채로 남아 있으면, 무엇을 지우는지 모르고 누르게 된다
 *
 * 쓰는 법
 *   const bulk = useBulk(shownRows);        // 지금 보이는 줄들 (id 를 가진 것)
 *   <BulkBar bulk={bulk} label="영상">
 *     <button onClick={() => run(() => hideMany(bulk.ids))}>숨기기</button>
 *   </BulkBar>
 *   <input type="checkbox" checked={bulk.has(r.id)} onChange={() => bulk.toggle(r.id)} />
 */
export function useBulk(rows = [], key = "id") {
  const [sel, setSel] = useState(() => new Set());

  const visible = useMemo(() => (rows || []).map((r) => r?.[key]).filter(Boolean), [rows, key]);
  const visibleSet = useMemo(() => new Set(visible), [visible]);

  // 안 보이게 된 것은 선택에서도 뺀다 — 무엇을 처리하는지 눈에 보여야 한다
  const ids = useMemo(() => [...sel].filter((id) => visibleSet.has(id)), [sel, visibleSet]);

  const all = visible.length > 0 && ids.length === visible.length;
  const some = ids.length > 0 && !all;

  return {
    ids,
    count: ids.length,
    total: visible.length,
    all,
    some,
    has: (id) => sel.has(id),
    toggle(id) {
      setSel((old) => {
        const n = new Set(old);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      });
    },
    toggleAll() {
      setSel((old) => {
        const n = new Set(old);
        if (ids.length === visible.length) visible.forEach((id) => n.delete(id));
        else visible.forEach((id) => n.add(id));
        return n;
      });
    },
    clear: () => setSel(new Set()),
    /** 처리하고 나면 선택을 비운다 — 지운 것이 선택된 채로 남으면 안 된다 */
    async run(fn, onDone) {
      const picked = ids;
      if (picked.length === 0) return { error: null };
      const res = await fn(picked);
      if (!res?.error) setSel(new Set());
      onDone?.(res);
      return res;
    },
  };
}

/**
 * 목록 위에 붙는 줄 — 전체 선택 체크박스와 일괄 버튼들.
 * 아무것도 안 골랐으면 버튼은 흐리게 두고 숫자만 보여준다.
 */
export function BulkBar({ bulk, label = "항목", children, style = {} }) {
  return (
    <div
      className="row"
      style={{
        gap: 8, alignItems: "center", flexWrap: "wrap",
        padding: "8px 0", ...style,
      }}
    >
      <label className="row" style={{ gap: 6, alignItems: "center", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={bulk.all}
          ref={(el) => { if (el) el.indeterminate = bulk.some; }}
          onChange={bulk.toggleAll}
          disabled={bulk.total === 0}
        />
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          보이는 {bulk.total}개 전체
        </span>
      </label>

      {bulk.count > 0 ? (
        <>
          <span className="tag tag-sky">{bulk.count}개 고름</span>
          {children}
          <button className="btn btn-ghost btn-sm" onClick={bulk.clear}>선택 해제</button>
        </>
      ) : (
        <span className="hint" style={{ fontSize: 12.5 }}>
          왼쪽 칸을 눌러 고르면 {label}을(를) 한 번에 처리할 수 있어요.
        </span>
      )}
    </div>
  );
}
