"use client";

import { useEffect, useState, useTransition } from "react";
import { PAGES } from "@/lib/screenLayout";
import { listLayouts, resetLayout, saveLayout } from "../layoutActions";

/**
 * 화면 구성 순서 (0095).
 *
 * 원장님 (2026-08-06)
 *   「화면에서 모든 페이지 — 학생 학부모 포함 — 구성 내용 순서를 수정할 수 있게 해줘」
 *
 * **위·아래 단추로 옮긴다.** 끌어다 놓는 방식이 보기에는 좋지만, 폰에서는
 * 스크롤과 싸운다 — 목록을 내리려다 덩어리가 끌려가고, 옮기려다 화면이 내려간다.
 * 원장님은 이걸 폰으로 여신다.
 *
 * **저장은 눌러야 된다.** 누를 때마다 저장하면 세 번 옮기는 동안 세 번 저장되고,
 * 그중 한 번이 실패하면 화면과 저장된 것이 어긋난 채로 남는다.
 */
function order(page, saved) {
  const rank = new Map((saved?.order || []).map((k, i) => [k, i]));
  return page.blocks
    .map((b, i) => ({ ...b, at: i }))
    .sort((a, b) => {
      const ra = rank.has(a.key) ? rank.get(a.key) : Infinity;
      const rb = rank.has(b.key) ? rank.get(b.key) : Infinity;
      return ra - rb || a.at - b.at;
    });
}

export default function LayoutBox() {
  const [saved, setSaved] = useState(null);
  const [err, setErr] = useState(null);
  const [pageKey, setPageKey] = useState(PAGES[0].key);
  const [rows, setRows] = useState([]);
  const [hidden, setHidden] = useState(() => new Set());
  const [dirty, setDirty] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const page = PAGES.find((p) => p.key === pageKey) || PAGES[0];

  function load(all, key) {
    const mine = all?.[key] || { order: [], hidden: [] };
    const p = PAGES.find((x) => x.key === key) || PAGES[0];
    setRows(order(p, mine));
    setHidden(new Set(mine.hidden || []));
    setDirty(false);
    setDone(false);
  }

  useEffect(() => {
    let alive = true;
    listLayouts().then((r) => {
      if (!alive) return;
      setErr(r.error || null);
      setSaved(r.layouts || {});
      load(r.layouts || {}, PAGES[0].key);
    });
    return () => { alive = false; };
  }, []);

  function pick(key) {
    setPageKey(key);
    load(saved || {}, key);
  }

  function move(i, by) {
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    setDirty(true);
    setDone(false);
  }

  function toggle(key) {
    const n = new Set(hidden);
    n.has(key) ? n.delete(key) : n.add(key);
    setHidden(n);
    setDirty(true);
    setDone(false);
  }

  if (saved === null) {
    return (
      <div className="card">
        <b style={{ fontSize: 14 }}>화면 구성 순서</b>
        <p className="hint" style={{ margin: "6px 0 0" }}>불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>화면 구성 순서</b>
        <span className="hint">무엇을 먼저 보여줄지 정합니다 · 계정과 상관없이 모두에게</span>
      </div>

      {err && <div className="notice" style={{ margin: "8px 0 0", fontSize: 12.5 }}>{err}</div>}

      <div className="row" style={{ gap: 6, margin: "10px 0", flexWrap: "wrap" }}>
        {PAGES.map((p) => (
          <button
            key={p.key}
            className={`btn btn-sm ${pageKey === p.key ? "btn-primary" : "btn-ghost"}`}
            onClick={() => pick(p.key)}
          >
            {p.label}
          </button>
        ))}
        <span className="spacer" />
        <a className="btn btn-ghost btn-sm" href={page.href}>{page.label} 보기 ›</a>
      </div>

      <p className="hint" style={{ margin: "0 0 10px", lineHeight: 1.8 }}>
        {page.hint}
        <br />
        <b>비어 있는 덩어리는 원래도 안 나옵니다</b> — 이번 달 수업이 없으면 「이번 달 현황」 은
        순서를 올려도 안 뜹니다. 순서를 정한다고 없던 것이 생기지는 않아요.
      </p>

      <div className="stack" style={{ gap: 3 }}>
        {rows.map((b, i) => {
          const off = hidden.has(b.key);
          return (
            <div className="unitrow" key={b.key} style={{ opacity: off ? 0.5 : 1 }}>
              <span className="hint" style={{ minWidth: 22, textAlign: "right" }}>{i + 1}</span>
              <span style={{ fontSize: 13.5, flex: 1 }}>
                <b>{b.label}</b>
                {b.desc && <span className="hint"> · {b.desc}</span>}
              </span>
              {off && <span className="tag tag-muted">안 보임</span>}
              <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button className="btn btn-ghost btn-sm" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>▼</button>
              <button className="btn btn-ghost btn-sm" onClick={() => toggle(b.key)}>
                {off ? "보이기" : "숨기기"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="row" style={{ gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              const res = await saveLayout(pageKey, rows.map((b) => b.key), [...hidden]);
              if (res?.error) { alert(res.error); return; }
              const next = {
                ...(saved || {}),
                [pageKey]: { order: rows.map((b) => b.key), hidden: [...hidden] },
              };
              setSaved(next);
              setDirty(false);
              setDone(true);
            })
          }
        >
          {pending ? "저장 중…" : done ? "저장됨 ✓" : "이 화면 순서 저장"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={() => {
            if (!confirm(`${page.label} 순서를 원래대로 되돌릴까요?`)) return;
            startTransition(async () => {
              const res = await resetLayout(pageKey);
              if (res?.error) { alert(res.error); return; }
              const next = { ...(saved || {}) };
              delete next[pageKey];
              setSaved(next);
              load(next, pageKey);
            });
          }}
        >
          원래대로
        </button>
        {dirty && <span className="hint">아직 저장 안 했어요</span>}
      </div>
    </div>
  );
}
