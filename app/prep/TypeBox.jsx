"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveType, removeType, saveTypesBulk } from "./actions";

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
};

export default function TypeBox({ types = [] }) {
  const [draft, setDraft] = useState(null);   // 고치는 중이거나 새로 넣는 중
  // **여러 개 한 번에** (원장님 2026-08-23 — 「한 개씩 하는 게 너무 번거로워」)
  const [bulk, setBulk] = useState(null);
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

  function row(t, depth) {
    return (
      <div className="unitrow" key={t.id} style={{ paddingLeft: depth * 16 }}>
        <b style={{ fontSize: 14.5, minWidth: 120 }}>{t.name}</b>
        <span className="hint" style={{ fontSize: 12.5, flex: 1 }}>{stagesOf(t)}</span>
        {t.active === false && <span className="tag tag-muted">안 씀</span>}
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
      </div>
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

      {draft && (
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
            <input
              className="input input-sm"
              style={{ width: 84 }}
              placeholder="순서"
              title="학생이 순서대로 풀 때의 기본 순서 (작은 것부터)"
              value={draft.sort}
              onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
            />
            <label className="row" style={{ gap: 4, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={draft.active !== false}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              쓰는 종류
            </label>
          </div>

          <p className="hint" style={{ margin: "8px 0 4px", fontSize: 13 }}>
            이 종류에 필요한 단계 — 여기서 켜 둔 것만 나중에 체크할 것으로 뜹니다
          </p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
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

      <div className="stack" style={{ gap: 3, marginTop: 10 }}>
        {tops.map((t) => (
          <div className="stack" style={{ gap: 3 }} key={t.id}>
            {row(t, 0)}
            {kidsOf(t.id).map((k) => row(k, 1))}
          </div>
        ))}
        {orphans.map((t) => row(t, 0))}
        {types.length === 0 && (
          <p className="hint" style={{ margin: 0 }}>
            아직 등록한 종류가 없습니다. 「＋ 종류 추가」로 이그잼 · 족보 같은 갈래를 먼저 만들고,
            그 아래에 변형문제 · 분석지 · 워크북을 넣어주세요.
          </p>
        )}
      </div>
    </div>
  );
}
