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

  /**
   * **접힌 대단원** (원장님 2026-08-28 — 「대단원 안 접혀 있음」).
   * 진도 쪽(BookProgress·ProgressPickModal)에만 붙였던 규칙을 여기까지
   * 넓힌다. 기본 무조건 접힘, **이름을 누르면 펴진다.** 체크 칸은 종전대로
   * 담기 — 펴려다 대단원이 통째로 담기면 안 된다.
   */
  const [open, setOpen] = useState(() => new Set());

  const kw = q.trim().toLowerCase();

  /**
   * **한두 글자는 앞머리로 찾는다** (원장님 2026-08-28 — 「E단원 검색하면
   * 안 나옴」).
   *
   * 전에는 어디든 그 글자가 들어가면 걸렸다. 「E」 를 치면 `정관사 the`·
   * `be동사` 처럼 **e 가 든 단원이 죄다** 나와서, 정작 찾던 대단원 「E …」
   * 는 그 속에 묻혔다. 한글은 두 글자만 돼도 뜻이 좁혀지지만 알파벳 한
   * 글자는 안 좁혀진다.
   *
   * 그래서 **두 글자 이하면 「그 말로 시작하는가」** 로 본다 — 대단원
   * 이름이 `E 동사의 활용` 이면 「E」 로 걸리고, `be동사` 는 안 걸린다.
   * 세 글자부터는 종전대로 어디든 들어가면 걸린다.
   */
  const rows = useMemo(() => {
    if (!kw) return options;
    const short = kw.length <= 2;
    const hit = (v) => {
      const s = String(v).toLowerCase();
      return short ? s.startsWith(kw) : s.includes(kw);
    };
    const keep = options.filter((o) =>
      [o.big, o.mid, o.small, o.name, o.activity, o.summary].filter(Boolean).some(hit)
    );
    /**
     * 대단원이 걸렸으면 **그 안의 것도 같이** 보여준다 — 대단원만 덩그러니
     * 나오면 무엇이 들었는지 몰라 고를 수가 없다.
     */
    const bigHit = new Set(keep.filter((o) => o.depth === 0).map((o) => o.name));
    if (bigHit.size === 0) return keep;
    const seen = new Set(keep.map((o) => o.id));
    const out = [];
    let under = null;
    for (const o of options) {
      if (o.depth === 0) under = bigHit.has(o.name) ? o.name : null;
      if (seen.has(o.id) || (under && o.depth > 0)) out.push(o);
    }
    return out;
  }, [options, kw]);

  // 검색 중에는 접힘을 풀어둔다 — 접힌 채로 걸러지면 결과가 안 보인다
  const folding = !kw;
  const shown = useMemo(() => {
    if (!folding) return rows;
    const out = [];
    let under = null;
    for (const o of rows) {
      if (o.depth === 0) {
        under = o;
        out.push(o);
      } else if (!under || open.has(under.id)) {
        out.push(o);
      }
    }
    return out;
  }, [rows, folding, open]);

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
      {/**
        * **제목·검색은 위에, 담기는 아래에 붙어 있는다** (원장님 2026-08-28 —
        * 「스크롤하면 검색창이 사라져」·「담기가 너무 밑에 가 있음」).
        * 단원이 수십 개인 교재에서는 목록이 길어, 굴려 내려가면 검색창도
        * 담기 단추도 화면 밖으로 나갔다. 찾으려면 맨 위로, 담으려면 맨
        * 아래로 다시 굴려야 했다.
        */}
      <div className="pickhead">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <b style={{ fontSize: 15 }}>{title}</b>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
        </div>
        {/* 글자 필터 — 단원 수십 개짜리 교재에서만 의미가 있어 그때만 보인다 */}
        {options.length > 15 && (
          <input
            className="input input-sm"
            style={{ width: "100%", marginTop: 6 }}
            placeholder="단원 이름으로 거르기 (한두 글자는 앞머리로)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        )}
      </div>
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
          {shown.map((o, i) => {
            const hasKids = o.depth === 0 && rows[rows.indexOf(o) + 1]?.depth > 0;
            const tail = [o.activity, volumeLabel(o), o.summary].filter(Boolean).join(" · ");
            const isOpen = open.has(o.id);
            const kids = hasKids
              ? rows.filter((x, k) => k > rows.indexOf(o) && x.depth > 0
                  && !rows.slice(rows.indexOf(o) + 1, k).some((y) => y.depth === 0)).length
              : 0;
            return (
              <div
                key={o.id}
                className={hasKids ? "unit-bigbar" : "row"}
                style={
                  hasKids
                    ? { display: "flex", alignItems: "center", gap: 8 }
                    : { gap: 8, alignItems: "center", padding: "4px 0", paddingLeft: o.depth * 14 }
                }
              >
                {/* 담기는 체크 칸 — 대단원 이름을 눌러도 안 담긴다 */}
                <input
                  type="checkbox"
                  checked={checked.has(o.id)}
                  onChange={() => toggle(o.id)}
                  style={{ cursor: "pointer" }}
                />
                {hasKids && folding ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ flex: 1, justifyContent: "flex-start", textAlign: "left", padding: "2px 4px" }}
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((s) => {
                        const n = new Set(s);
                        n.has(o.id) ? n.delete(o.id) : n.add(o.id);
                        return n;
                      })
                    }
                  >
                    <span style={{ fontSize: 13.5, fontWeight: 800 }}>
                      {isOpen ? "▾" : "▸"} {o.name}
                      {tail && <span className="muted" style={{ fontWeight: 500 }}> — {tail}</span>}
                    </span>
                    {!isOpen && kids > 0 && (
                      <span className="tag tag-muted" style={{ marginLeft: 6 }}>{kids}</span>
                    )}
                  </button>
                ) : (
                  <label style={{ cursor: "pointer", flex: 1 }} onClick={() => toggle(o.id)}>
                    <span style={{ fontSize: 13.5, fontWeight: hasKids ? 800 : 500 }}>
                      {o.name}
                      {tail && <span className="muted" style={{ fontWeight: 500 }}> — {tail}</span>}
                    </span>
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="pickfoot row" style={{ gap: 6, justifyContent: "flex-end" }}>
        <button className="btn btn-primary btn-sm" disabled={loading} onClick={apply}>
          담기{nPicked > 0 ? ` ${nPicked}개` : ""}
        </button>
      </div>
    </div>
  );
}
