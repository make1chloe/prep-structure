"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveType, removeType, saveTypesBulk, setTypesFlags, removeTypes } from "./actions";

/**
 * 자료 종류를 미리 등록해 둔다.
 *
 * 종류가 너무 많아서 매번 이름을 적으면 오타가 나고 모아 보기가 안 된다.
 * 두 칸으로 나눈다 — 큰 갈래(이그잼) 아래 실제 자료(변형문제 · 분석지 · 워크북).
 *
 * 단계도 여기서 한 번만 정해 둔다. 그러면 자료를 넣을 때 종류만 고르면
 * 만들기·인쇄·클래스카드·배부·풀이·채점이 알아서 따라온다.
 */

const NEEDS = [
  { key: "need_make", label: "만들기" },
  { key: "need_print", label: "인쇄" },
  { key: "need_card", label: "클래스카드" },
  { key: "need_hand", label: "배부" },
  { key: "need_solve", label: "풀이" },
  { key: "need_grade", label: "채점" },
];

const BLANK = {
  name: "",
  parent_id: "",
  sort: "",
  active: true,
  need_make: true,
  need_print: true,
  need_card: false,
  need_hand: true,
  need_solve: true,
  need_grade: true,
  // 종이냐 파일이냐 (0178) — 엄한 쪽이 기본이라야 「집에서 잘못 눌렀다」가 안 생긴다
  give_kind: "paper",
};

export default function TypeBox({ types = [] }) {
  const [draft, setDraft] = useState(null);   // 고치는 중이거나 새로 넣는 중
  // **여러 개 한 번에** (원장님 2026-08-23 — 「한 개씩 하는 게 너무 번거로워」)
  const [bulk, setBulk] = useState(null);
  // 목록에서 골라 한 번에 바꾸기 (원장님 2026-08-23 — 「너무 번거로워」)
  const [sel, setSel] = useState(() => new Set());
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const tops = types.filter((t) => !t.parent_id);
  const kidsOf = (id) => types.filter((t) => t.parent_id === id);
  const orphans = types.filter((t) => t.parent_id && !types.some((x) => x.id === t.parent_id));

  function run(fn, after) {
    setErr("");
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { setErr(res.error); return; }
      after?.(res);
      router.refresh();
    });
  }

  function stagesOf(t) {
    const on = NEEDS.filter((n) => t[n.key]).map((n) => n.label);
    return on.length ? on.join(" · ") : "단계 없음";
  }

  /**
   * 줄 하나 — **단원 목록과 같은 표 문법** (원장님 2026-08-23 — 「목록 구성이
   * 다른 페이지랑 다른데 너무 허접하다」). 대·소 구분 태그, 줄 바탕색,
   * 오른쪽 끝 도구까지 app/textbooks/UnitList 와 같은 자리에 둔다.
   */
  function row(t, depth) {
    /**
     * **그 줄에서 바로 고친다** (원장님 2026-08-23 — 「수정 방식도 완전
     * 번거로움 자체」). 전에는 「고치기」 를 누르면 판 맨 위 폼으로 값이
     * 올라가서, 목록에서 눈을 떼고 위로 올라갔다 다시 내려와야 했다.
     * 단원 목록(UnitList)과 같이 그 자리에서 고치고 그 자리에서 저장한다.
     */
    if (draft && draft.id === t.id) {
      return (
        <tr key={t.id} className={depth === 0 ? "unitrow-big" : ""}>
          <td />
          <td>
            <span className={`tag ${depth === 0 ? "tag-lav" : "tag-muted"}`}>
              {depth === 0 ? "갈래" : "자료"}
            </span>
          </td>
          <td style={{ paddingLeft: depth * 14 }}>
            <input
              className="input input-sm"
              style={{ width: "100%" }}
              autoFocus
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") run(() => saveType(draft), () => setDraft(null));
                if (e.key === "Escape") setDraft(null);
              }}
            />
          </td>
          <td>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {NEEDS.map((n) => (
                <label key={n.key} className="row" style={{ gap: 2, fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={!!draft[n.key]}
                    onChange={(e) => setDraft({ ...draft, [n.key]: e.target.checked })}
                  />
                  {n.label}
                </label>
              ))}
              <label className="row" style={{ gap: 2, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={draft.active !== false}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                지금 씀
              </label>
              {/* 아이가 어디서 「받았어요」를 누를 수 있나 (0178) */}
              <select
                className="input input-sm"
                style={{ width: 84, fontSize: 12.5 }}
                value={draft.give_kind === "file" ? "file" : "paper"}
                onChange={(e) => setDraft({ ...draft, give_kind: e.target.value })}
              >
                <option value="paper">종이</option>
                <option value="file">파일</option>
              </select>
            </div>
          </td>
          <td style={{ whiteSpace: "nowrap" }}>
            <button
              className="btn btn-primary btn-sm"
              style={{ padding: "2px 8px", fontSize: 12.5 }}
              disabled={pending}
              onClick={() => run(() => saveType(draft), () => setDraft(null))}
            >
              저장
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: "2px 8px", fontSize: 12.5 }}
              onClick={() => { setDraft(null); setErr(""); }}
            >
              취소
            </button>
          </td>
        </tr>
      );
    }
    return (
      <tr key={t.id} className={depth === 0 ? "unitrow-big" : ""}>
        <td>
          <input
            type="checkbox"
            checked={sel.has(t.id)}
            onChange={() => {
              const n = new Set(sel);
              n.has(t.id) ? n.delete(t.id) : n.add(t.id);
              setSel(n);
            }}
          />
        </td>
        <td>
          <span className={`tag ${depth === 0 ? "tag-lav" : "tag-muted"}`}>
            {depth === 0 ? "갈래" : "자료"}
          </span>
        </td>
        <td style={{ paddingLeft: depth * 14 }}>
          <b style={{ fontSize: 14.5 }}>{t.name}</b>
          {t.active === false && <span className="tag tag-muted" style={{ marginLeft: 6 }}>안 씀</span>}
        </td>
        <td className="hint" style={{ fontSize: 12.5 }}>{stagesOf(t)}</td>
        <td style={{ whiteSpace: "nowrap" }}>
          {depth === 0 && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: "2px 8px", fontSize: 12.5 }}
              onClick={() => setDraft({ ...BLANK, parent_id: t.id })}
            >
              ＋ 하위
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: "2px 8px", fontSize: 12.5 }}
            onClick={() => setDraft({ ...t, sort: t.sort ?? "" })}
          >
            고치기
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ padding: "2px 8px", fontSize: 12.5 }}
            disabled={pending}
            onClick={() => {
              const kids = kidsOf(t.id).length;
              const msg = kids
                ? `${t.name} 을 지울까요?\n하위 ${kids}개도 같이 사라집니다.`
                : `${t.name} 을 지울까요?`;
              if (!confirm(msg)) return;
              run(() => removeType(t.id));
            }}
          >
            ✕
          </button>
        </td>
      </tr>
    );
  }


  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>자료 종류</b>
        <span className="hint" style={{ fontSize: 12.5 }}>
          큰 갈래(이그잼) 아래에 실제 자료(변형문제 · 분석지 · 워크북)를 둡니다
        </span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => { setBulk(bulk === null ? "" : null); setDraft(null); }}>
          한 번에 여러 개
        </button>
        <button className="btn btn-sm" onClick={() => { setDraft({ ...BLANK }); setBulk(null); }}>
          ＋ 종류 추가
        </button>
      </div>

      {/* 한 번에 여러 개 — 큰 갈래를 쓰고 그 아래를 들여쓰거나 `>` 로 잇는다 */}
      {bulk !== null && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          <textarea
            className="input"
            rows={8}
            autoFocus
            style={{ width: "100%", fontFamily: "inherit" }}
            placeholder={"이그잼\n  변형문제\n  분석지\n  워크북\n자이스토리 > 변형문제"}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <p className="hint" style={{ margin: 0, fontSize: 12.5 }}>
            큰 갈래를 한 줄에 쓰고, 그 아래 자료는 <b>한 칸 들여쓰기</b> 하거나
            <b> 이그잼 &gt; 변형문제</b> 처럼 적어주세요. 이미 있는 이름은 그대로 둡니다
            (여러 번 눌러도 늘어나지 않아요). 단계는 기본값으로 들어가고 줄마다 고칠 수 있어요.
          </p>
          <div className="row" style={{ gap: 6 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || !bulk.trim()}
              onClick={() =>
                run(() => saveTypesBulk(bulk), (res) => {
                  setBulk(null);
                  const n = (res?.addedTop || 0) + (res?.addedKid || 0);
                  if (n === 0) setErr("새로 넣을 것이 없었어요 (이미 다 있어요).");
                })
              }
            >
              {pending ? "넣는 중…" : "한 번에 넣기"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setBulk(null)}>닫기</button>
          </div>
        </div>
      )}

      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

      {/* **고른 것 한 번에** — 단계를 켜고 끄는 일이 제일 잦다 */}
      {sel.size > 0 && (
        <div className="card card-tight" style={{ marginTop: 8, background: "var(--surface-2)" }}>
          <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>고른 {sel.size}개</b>
            <span className="hint" style={{ fontSize: 12.5 }}>단계 켜기 / 끄기 —</span>
            {NEEDS.map((n) => (
              <span key={n.key} className="row" style={{ gap: 2, alignItems: "center" }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 6px", fontSize: 12.5 }}
                  disabled={pending}
                  onClick={() => run(() => setTypesFlags([...sel], { [n.key]: true }))}
                >
                  {n.label} 켜기
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 6px", fontSize: 12.5, opacity: 0.75 }}
                  disabled={pending}
                  onClick={() => run(() => setTypesFlags([...sel], { [n.key]: false }))}
                >
                  끄기
                </button>
              </span>
            ))}
            {/* 종이·파일도 여기서 한 번에 (0178) */}
            <span className="row" style={{ gap: 2, alignItems: "center" }}>
              <span className="hint" style={{ fontSize: 12.5 }}>받는 곳 —</span>
              <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", fontSize: 12.5 }}
                disabled={pending}
                onClick={() => run(() => setTypesFlags([...sel], { give_kind: "paper" }))}>
                종이
              </button>
              <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px", fontSize: 12.5, opacity: 0.75 }}
                disabled={pending}
                onClick={() => run(() => setTypesFlags([...sel], { give_kind: "file" }))}>
                파일
              </button>
            </span>
          </div>
          <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" disabled={pending}
              onClick={() => run(() => setTypesFlags([...sel], { active: true }))}>
              쓰는 종류로
            </button>
            <button className="btn btn-ghost btn-sm" disabled={pending}
              onClick={() => run(() => setTypesFlags([...sel], { active: false }))}>
              안 쓰는 종류로
            </button>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>선택 해제</button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`고른 ${sel.size}개를 지울까요?\n하위가 있으면 같이 사라집니다.`)) return;
                run(() => removeTypes([...sel]), () => setSel(new Set()));
              }}
            >
              ✕ 지우기
            </button>
          </div>
        </div>
      )}

      {draft && !draft.id && (
        <div className="card card-tight" style={{ marginTop: 8, background: "var(--surface-2)" }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
            <select
              className="input input-sm"
              style={{ width: 150 }}
              value={draft.parent_id || ""}
              onChange={(e) => setDraft({ ...draft, parent_id: e.target.value })}
              title="어느 갈래 아래에 둘지"
            >
              <option value="">큰 갈래로</option>
              {tops
                .filter((t) => t.id !== draft.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name} 아래</option>
                ))}
            </select>
            <input
              className="input input-sm"
              style={{ width: 160 }}
              placeholder="변형문제"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            {/* 빈칸이면 무슨 숫자인지 알 수 없어서 이름을 붙였다 (원장님
                2026-08-23 — 「저 숫자랑 쓰는 종류가 뭐야」) */}
            <label className="row" style={{ gap: 4, fontSize: 14, alignItems: "center" }}>
              <span className="hint" style={{ fontSize: 12.5 }}>목록 차례</span>
              <input
                className="input input-sm"
                style={{ width: 64 }}
                placeholder="0"
                title="작은 숫자가 위로 옵니다. 다 0이면 넣은 차례대로"
                value={draft.sort}
                onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
              />
            </label>
            <label
              className="row"
              style={{ gap: 4, fontSize: 14 }}
              title="끄면 자료를 만들 때 고르는 목록에 안 뜹니다 (지난 기록은 그대로)"
            >
              <input
                type="checkbox"
                checked={draft.active !== false}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              지금 쓰는 종류
            </label>
          </div>

          <p className="hint" style={{ margin: "8px 0 4px", fontSize: 13 }}>
            이 종류에 필요한 단계 — 여기서 켜 둔 것만 나중에 체크할 것으로 뜹니다
          </p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <label className="row" style={{ gap: 4, fontSize: 14 }}>
              받는 곳
              <select
                className="input input-sm"
                style={{ width: 92 }}
                value={draft.give_kind === "file" ? "file" : "paper"}
                onChange={(e) => setDraft({ ...draft, give_kind: e.target.value })}
              >
                <option value="paper">종이</option>
                <option value="file">파일</option>
              </select>
            </label>
            {NEEDS.map((n) => (
              <label key={n.key} className="row" style={{ gap: 4, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={!!draft[n.key]}
                  onChange={(e) => setDraft({ ...draft, [n.key]: e.target.checked })}
                />
                {n.label}
              </label>
            ))}
          </div>
          <p className="hint" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
            만들기 · 인쇄 · 클래스카드는 자료 하나에 한 번, 배부 · 풀이 · 채점은 학생마다 따로 찍습니다.
          </p>

          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() => run(() => saveType(draft), () => setDraft(null))}
            >
              저장
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(null); setErr(""); }}>
              취소
            </button>
          </div>
        </div>
      )}

      <div className="tblwrap" style={{ marginTop: 10 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={types.length > 0 && sel.size === types.length}
                  ref={(el) => el && (el.indeterminate = sel.size > 0 && sel.size < types.length)}
                  onChange={() =>
                    setSel(sel.size === types.length ? new Set() : new Set(types.map((t) => t.id)))
                  }
                />
              </th>
              <th style={{ width: 52 }}>구분</th>
              <th>이름</th>
              <th style={{ width: 220 }}>단계</th>
              <th style={{ width: 150 }}></th>
            </tr>
          </thead>
          <tbody>
            {tops.map((t) => (
              <Fragment key={t.id}>
                {row(t, 0)}
                {kidsOf(t.id).map((k) => row(k, 1))}
              </Fragment>
            ))}
            {orphans.map((t) => row(t, 0))}
            {types.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <p className="hint" style={{ margin: 0, padding: 8 }}>
                    아직 등록한 종류가 없습니다. 「＋ 종류 추가」로 이그잼 · 족보 같은 갈래를
                    먼저 만들고, 그 아래에 변형문제 · 분석지 · 워크북을 넣어주세요.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
