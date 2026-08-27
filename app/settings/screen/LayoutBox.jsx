"use client";

import { useEffect, useState, useTransition } from "react";
import { PAGES, NAV_GROUPS, DEFAULT_HIDDEN } from "@/lib/screenLayout";
import { listLayouts, resetLayout, saveLayout } from "../layoutActions";

/**
 * **학생 화면은 탭별 묶음으로 보인다** (탭 개편 C3). 학생 화면(/me)은 네
 * 탭이 됐고 블록은 제 탭 안에서만 서므로, 여기서도 탭 머리글 아래 묶어
 * 보여주고 ▲▼ 도 그 탭 안에서만 움직인다 — 탭을 넘는 차례는 화면에
 * 없는 차례다. 묶음 정의는 NAV_GROUPS 한 곳 (원칙 1).
 * 학부모 화면은 탭이 아니므로 현행 그대로 (묶음 없음).
 */
function tabIndexOf(pageKey) {
  if (pageKey !== "me") return null;
  const idx = new Map();
  (NAV_GROUPS.me || []).forEach((g, i) => g.blocks.forEach((b) => idx.set(b, i)));
  return idx;
}

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
    // 저장분이 없으면 숨김 초기값 = 코드 기본 (성장 비공개 기본, §4-3) —
    // 그래야 첫 저장이 기본 숨김을 그대로 실어 화면과 안 어긋난다.
    const raw = all?.[key];
    const mine = raw
      ? { order: raw.order || [], hidden: raw.hidden || [] }
      : { order: [], hidden: DEFAULT_HIDDEN[key] || [] };
    const p = PAGES.find((x) => x.key === key) || PAGES[0];
    let rows2 = order(p, mine);
    // 학생 화면은 탭 차례로 묶어 보인다 — 같은 탭 안에서는 저장된 차례 유지
    const tIdx = tabIndexOf(key);
    if (tIdx) rows2 = [...rows2].sort((a, b) => (tIdx.get(a.key) ?? 99) - (tIdx.get(b.key) ?? 99));
    setRows(rows2);
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
    // 학생 화면: 탭을 넘는 이동은 안 된다 — 블록은 제 탭 안에서만 선다
    const tIdx = tabIndexOf(pageKey);
    if (tIdx && tIdx.get(rows[i].key) !== tIdx.get(rows[j].key)) return;
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
        <b style={{ fontSize: 15 }}>화면 구성 순서</b>
        <p className="hint" style={{ margin: "6px 0 0" }}>불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>화면 구성 순서</b>
        <span className="hint">무엇을 먼저 보여줄지 정합니다 · 계정과 상관없이 모두에게</span>
      </div>

      {err && <div className="notice" style={{ margin: "8px 0 0", fontSize: 14 }}>{err}</div>}

      <div className="row" style={{ gap: 6, margin: "10px 0", flexWrap: "wrap" }}>
        {PAGES.map((p) => (
          <button
            key={p.key}
            className={`btn btn-sm ${pageKey === p.key ? "btn-on" : "btn-ghost"}`}
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
        {(() => {
          const tIdx = tabIndexOf(pageKey);
          return rows.map((b, i) => {
            const off = hidden.has(b.key);
            // 학생 화면: 탭이 바뀌는 자리에 탭 머리글 — 위·아래는 탭 안에서만
            const g = tIdx ? tIdx.get(b.key) : null;
            const gPrev = tIdx && i > 0 ? tIdx.get(rows[i - 1].key) : null;
            const gNext = tIdx && i < rows.length - 1 ? tIdx.get(rows[i + 1].key) : null;
            const head =
              tIdx && g !== gPrev ? (
                <div className="tag tag-lav" style={{ marginTop: i === 0 ? 0 : 8 }}>
                  {(NAV_GROUPS.me || [])[g]?.nav || ""} 탭
                </div>
              ) : null;
            return (
              <div key={b.key}>
                {head}
                <div className="unitrow" style={{ opacity: off ? 0.5 : 1 }}>
                  <span className="hint" style={{ minWidth: 22, textAlign: "right" }}>{i + 1}</span>
                  <span style={{ fontSize: 15, flex: 1 }}>
                    <b>{b.label}</b>
                    {b.desc && <span className="hint"> · {b.desc}</span>}
                  </span>
                  {off && <span className="tag tag-muted">안 보임</span>}
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={i === 0 || (tIdx && g !== gPrev)}
                    onClick={() => move(i, -1)}
                  >
                    ▲
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={i === rows.length - 1 || (tIdx && g !== gNext)}
                    onClick={() => move(i, 1)}
                  >
                    ▼
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(b.key)}>
                    {off ? "보이기" : "숨기기"}
                  </button>
                </div>
              </div>
            );
          });
        })()}
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
