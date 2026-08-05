"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRoutine, deleteRoutine } from "./routineActions";
import { KINDS, describe } from "@/lib/todoRoutine";

/**
 * **되풀이되는 할일** — 학습 항목(기본 학습 목록)과 같은 자리다.
 *
 * 매달 수강료 안내, 매주 월요일 교재 점검처럼 **때가 되면 늘 하는 일**을
 * 여기 한 번 적어두면, 날짜가 올 때 할일 목록에 저절로 뜬다.
 * 「이번 달에 했나」 를 기억하고 있을 필요가 없어야 한다.
 *
 * 뜬 다음은 여느 할일과 똑같다 — 체크하고, 미루고, 메모한다.
 * 여기에는 「했다/안 했다」 를 적지 않는다. 두 군데가 되면 어긋난다.
 */

const DOW = ["월", "화", "수", "목", "금", "토", "일"];
const BLANK = {
  title: "", repeat_kind: "monthly", dows: [], day_of_month: "",
  month: "", lead_days: 0, todo_category_id: "", priority: 0, note: "", active: true,
};

export default function RoutineBox({ rows = [], categories = [], error = null }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(BLANK);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function startNew() {
    setEditId("new");
    setDraft(BLANK);
    setOpen(true);
  }
  function startEdit(r) {
    setEditId(r.id);
    setDraft({
      title: r.title || "",
      repeat_kind: r.repeat_kind || "monthly",
      dows: r.dows || [],
      day_of_month: r.day_of_month ?? "",
      month: r.month ?? "",
      lead_days: r.lead_days ?? 0,
      todo_category_id: r.todo_category_id || "",
      priority: r.priority ?? 0,
      note: r.note || "",
      active: r.active !== false,
    });
    setOpen(true);
  }
  function save() {
    startTransition(async () => {
      const res = await saveRoutine(editId === "new" ? null : editId, draft);
      if (res?.error) { alert(res.error); return; }
      setEditId(null);
      router.refresh();
    });
  }

  const weekly = draft.repeat_kind === "weekly";
  const yearly = draft.repeat_kind === "yearly";

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
          {open ? "▾" : "▸"} 되풀이 할일 {rows.length > 0 && `(${rows.length})`}
        </button>
        <span className="hint">때가 되면 늘 하는 일을 적어두면 그날 할일에 저절로 뜹니다</span>
        <span className="spacer" />
        {open && (
          <button className="btn btn-ghost btn-sm" onClick={startNew} disabled={pending}>
            ＋ 추가
          </button>
        )}
      </div>

      {open && (
        <>
          {error && <div className="notice" style={{ marginTop: 8 }}>{error}</div>}

          {rows.length === 0 && !error && editId === null && (
            <p className="hint" style={{ margin: "8px 0 0" }}>
              아직 없습니다. 예를 들면 — <b>매달 25일 수강료 안내</b>,{" "}
              <b>매주 월요일 교재 재고 확인</b>, <b>매년 3월 학사일정 받아오기</b>.
            </p>
          )}

          <div className="stack" style={{ gap: 4, marginTop: 8 }}>
            {rows.map((r) => (
              <div className="unitrow" key={r.id}>
                <span className={`tag ${r.active === false ? "tag-muted" : "tag-lav"}`}>
                  {KINDS.find((k) => k.key === r.repeat_kind)?.label || "매달"}
                </span>
                <span style={{ fontSize: 13, flex: 1 }}>
                  <b>{r.title}</b>{" "}
                  <span className="muted">{describe(r)}</span>
                  {r.active === false && <span className="tag tag-muted" style={{ marginLeft: 4 }}>멈춤</span>}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => startEdit(r)} disabled={pending}>
                  고치기
                </button>
              </div>
            ))}
          </div>

          {editId !== null && (
            <div className="card card-tight" style={{ marginTop: 10, background: "var(--surface-2)" }}>
              <div className="stack" style={{ gap: 8 }}>
                <div className="field">
                  <label className="label">할일 이름</label>
                  <input
                    className="input input-sm"
                    placeholder="수강료 안내 보내기"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </div>

                <div className="row" style={{ gap: 4 }}>
                  {KINDS.map((k) => (
                    <button
                      key={k.key}
                      className={`btn btn-sm ${draft.repeat_kind === k.key ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setDraft({ ...draft, repeat_kind: k.key })}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>

                {weekly ? (
                  <div className="row" style={{ gap: 3 }}>
                    {DOW.map((d) => (
                      <button
                        key={d}
                        className={`btn btn-sm ${(draft.dows || []).includes(d) ? "btn-primary" : "btn-ghost"}`}
                        style={{ padding: "4px 8px" }}
                        onClick={() => {
                          const has = (draft.dows || []).includes(d);
                          setDraft({
                            ...draft,
                            dows: has
                              ? draft.dows.filter((x) => x !== d)
                              : [...(draft.dows || []), d],
                          });
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {yearly && (
                      <>
                        <input
                          className="input input-sm"
                          style={{ width: 60, textAlign: "center" }}
                          inputMode="numeric"
                          placeholder="3"
                          value={draft.month}
                          onChange={(e) => setDraft({ ...draft, month: e.target.value.replace(/[^\d]/g, "") })}
                        />
                        <span className="hint">월</span>
                      </>
                    )}
                    <input
                      className="input input-sm"
                      style={{ width: 60, textAlign: "center" }}
                      inputMode="numeric"
                      placeholder="25"
                      value={draft.day_of_month}
                      onChange={(e) => setDraft({ ...draft, day_of_month: e.target.value.replace(/[^\d]/g, "") })}
                    />
                    <span className="hint">일</span>
                    {/* 31 로 적어두면 2월에는 28일이 된다 — 「말일」 을 적는 자연스러운 방법이다 */}
                    <span className="hint" style={{ fontSize: 11.5 }}>
                      말일이면 <b>31</b> 로 적으세요 (짧은 달은 그 달 말일로 갑니다)
                    </span>
                  </div>
                )}

                <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="hint">며칠 전부터 띄울까</span>
                  <input
                    className="input input-sm"
                    style={{ width: 60, textAlign: "center" }}
                    inputMode="numeric"
                    value={draft.lead_days}
                    onChange={(e) => setDraft({ ...draft, lead_days: e.target.value.replace(/[^\d]/g, "") })}
                  />
                  <span className="hint">일 전 (0이면 그날)</span>
                  {categories.length > 0 && (
                    <select
                      className="input input-sm"
                      style={{ width: 140 }}
                      value={draft.todo_category_id}
                      onChange={(e) => setDraft({ ...draft, todo_category_id: e.target.value })}
                    >
                      <option value="">분류 없음</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                  <label className="row" style={{ gap: 4, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={draft.active !== false}
                      onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                    />
                    <span style={{ fontSize: 12.5 }}>쓰는 중</span>
                  </label>
                </div>

                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
                    저장
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                    취소
                  </button>
                  {editId !== "new" && (
                    <>
                      <span className="spacer" />
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm("이 되풀이 규칙을 지울까요?\n이미 만들어진 할일은 그대로 남습니다.")) return;
                          startTransition(async () => {
                            const res = await deleteRoutine(editId);
                            if (res?.error) alert(res.error);
                            setEditId(null);
                            router.refresh();
                          });
                        }}
                      >
                        규칙 지우기
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
