"use client";

import { useMemo, useState } from "react";
import { volumeLabel } from "@/lib/unitTree";

/**
 * **단원 여러 개를 한 번에 담는 팝오버** (원장님 2026-08-27, iPad 실물 판정 —
 * 셀렉트로 하나씩 고르는 건 비효율).
 *
 * 여태 항목마다 「단원 추가…」 셀렉트에서 **한 개 고를 때마다 목록을 다시
 * 열어야** 했다 — Day 3·4·5 를 내려면 같은 목록을 세 번 굴린다. 여기서는
 * 교재 단원이 체크박스로 펼쳐져 여러 개를 찍고 「담기」 한 번으로 끝낸다.
 *
 * 오늘 수업 ③다음(StudentPanel)과 미리 내기(check/AheadBoard)가 **같은 한
 * 벌**을 쓴다 — 담기(합치기·빼기) 판단도 여기 한 곳에만 있다 (원칙 2).
 *
 * - 이미 담긴 단원은 체크된 채로 열린다 — 체크를 빼고 담으면 빠진다.
 * - **다른 교재의 단원은 안 건드린다** — 이 팝오버는 지금 교재 목록만
 *   보여주므로, 목록에 없는 담긴 단원은 그대로 보존한다.
 * - 대단원은 진도 판과 같은 막대(.unit-bigbar) — 자기 목록 안에서만
 *   위계가 보이면 되고, 새 표현을 만들지 않는다.
 * - 자리는 순서 밖 사건과 같은 .sheetpop (z 59, 폰 풀폭/PC 우측 고정) —
 *   화면 위에 **덧그리는** 것이라 판의 입력 중 상태(범위 메모 등)는
 *   그대로 산다. 새 오버레이 체계 금지.
 */
export default function UnitPickModal({
  title = "단원 고르기",
  options = [],        // listUnitOptions 가 준 [{id, depth, big, mid, small, name, …}]
  loading = false,
  chosen = [],         // 이미 담긴 unitId 들 (다른 교재 것이 섞여 있어도 됨)
  onApply,             // (unitIds) => void — 최종 목록을 한 번에 반영
  onClose,
}) {
  const [checked, setChecked] = useState(() => new Set(chosen));
  const [q, setQ] = useState("");

  const kw = q.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!kw) return options;
    return options.filter((o) =>
      [o.big, o.mid, o.small, o.name, o.activity, o.summary]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    );
  }, [options, kw]);

  function toggle(id) {
    setChecked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function apply() {
    const here = new Set(options.map((o) => o.id));
    // 담겨 있던 순서는 지키고, 새로 찍은 것은 교재 순서대로 뒤에 붙인다
    const kept = chosen.filter((id) => !here.has(id) || checked.has(id));
    const added = options
      .map((o) => o.id)
      .filter((id) => checked.has(id) && !kept.includes(id));
    onApply([...kept, ...added]);
    onClose();
  }

  const nPicked = options.filter((o) => checked.has(o.id)).length;

  return (
    <div className="sheetpop card" role="dialog" aria-label="단원 고르기">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <b style={{ fontSize: 15 }}>{title}</b>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
      </div>
      {/* 글자 필터 — 단원 수십 개짜리 교재에서만 의미가 있어 그때만 보인다 */}
      {options.length > 15 && (
        <input
          className="input input-sm"
          style={{ width: "100%", marginBottom: 6 }}
          placeholder="단원 이름으로 거르기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      {loading ? (
        <p className="hint" style={{ margin: 0 }}>단원 불러오는 중…</p>
      ) : options.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>
          이 교재에 단원이 없어요 — 교재 › 교재·단원 에서 올려주세요.
        </p>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {rows.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>「{q.trim()}」 에 맞는 단원이 없어요.</p>
          )}
          {rows.map((o, i) => {
            const hasKids = o.depth === 0 && rows[i + 1]?.depth > 0;
            const tail = [o.activity, volumeLabel(o), o.summary].filter(Boolean).join(" · ");
            return (
              <label
                key={o.id}
                className={hasKids ? "unit-bigbar" : "row"}
                style={
                  hasKids
                    ? { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }
                    : { gap: 8, alignItems: "center", padding: "4px 0", paddingLeft: o.depth * 14, cursor: "pointer" }
                }
              >
                <input
                  type="checkbox"
                  checked={checked.has(o.id)}
                  onChange={() => toggle(o.id)}
                />
                <span style={{ fontSize: 13.5, fontWeight: hasKids ? 800 : 500 }}>
                  {o.name}
                  {tail && <span className="muted" style={{ fontWeight: 500 }}> — {tail}</span>}
                </span>
              </label>
            );
          })}
        </div>
      )}
      <div className="row" style={{ gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-primary btn-sm" disabled={loading} onClick={apply}>
          담기{nPicked > 0 ? ` ${nPicked}개` : ""}
        </button>
      </div>
    </div>
  );
}
