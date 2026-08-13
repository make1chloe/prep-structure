"use client";

import { useEffect, useState, useTransition } from "react";
import { listRoutine, saveStep, deleteStep, seedRoutine } from "./routineActions";

/**
 * 학습 루틴 — 진도를 따라 순서대로.
 *
 * 한 줄이 **한 수업 회차**다.
 *   1  등원: 단원 설명 정독 · 문답노트    숙제: 구두테스트(녹음) · 본교재 문제풀기
 *   2  등원: 숙제채점 · 구두테스트(직접)  숙제: 워크북 풀기
 *
 * 오늘 수업에서 [루틴 다음] 을 누르면 이 줄이 그대로 채워지고,
 * 그 학생의 단계가 하나 넘어간다. 매번 고를 필요가 없다.
 */
export default function RoutineEditor({ textbookId, items = [] }) {
  const [steps, setSteps] = useState(null);
  const [ready, setReady] = useState(true);
  const [editing, setEditing] = useState(null);
  const [pending, startTransition] = useTransition();

  async function load() {
    const res = await listRoutine(textbookId);
    setSteps(res.steps);
    setReady(res.ready);
  }
  useEffect(() => {
    if (textbookId) load();
  }, [textbookId]);

  if (!textbookId) return null;
  if (steps === null) return <p className="hint">불러오는 중…</p>;

  const nameOf = (id) => items.find((i) => i.id === id)?.name || "";

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      setEditing(null);
      await load();
    });
  }

  function Picker({ label, value, onChange }) {
    return (
      <div className="field" style={{ marginTop: 8 }}>
        <label className="label">{label}</label>
        <div className="chips">
          {items.map((i) => {
            const on = value.includes(i.id);
            return (
              <button
                key={i.id}
                className={`chip ${on ? "on" : ""}`}
                onClick={() =>
                  onChange(on ? value.filter((x) => x !== i.id) : [...value, i.id])
                }
              >
                {i.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /**
    * **본보기 넣고 고치기** (원장님, 2026-08-11 — 「엄두가 안나」).
    * 빈 화면에서 마흔여섯 개를 골라 순서를 짜는 것이 어려운 일이다.
    * 이미 루틴이 있으면 안 넣는다 — 손으로 짜두신 것을 덮으면 안 된다.
    */
  function seed() {
    startTransition(async () => {
      const res = await seedRoutine(textbookId);
      if (res?.error) { alert(res.error); return; }
      const lines = [`${res.added}단계를 넣었어요 (${res.area}).`, "", "그대로 쓰셔도 되고, 고치셔도 됩니다."];
      if (res.missing?.length) {
        lines.push("", `학습 항목에 없어서 빠진 것 ${res.missing.length}개 —`);
        res.missing.forEach((m) => lines.push(`  · ${m}`));
        lines.push("", "숙제 → 학습 항목 → 「노션 기본숙제 가져오기」 를 먼저 누르시면 다 들어옵니다.");
      }
      alert(lines.join("\n"));
      await load();
    });
  }

  const addStep = () =>
    setEditing({
      sort: (steps[steps.length - 1]?.sort ?? 0) + 10,
      label: "",
      inclass_items: [],
      home_items: [],
      note: "",
    });

  // **판 안에 카드를 또 그리지 않는다.** 이 자리는 이미 「루틴」 탭이라
  // 제목도 테두리도 한 겹 더 두르면 그만큼 안이 좁아지고 겹쳐 보인다.
  return (
    <>
      {!ready && (
        <div className="notice" style={{ marginBottom: 10, fontSize: 12.5 }}>
          <b>0035 SQL</b> 을 먼저 실행해주세요.
        </div>
      )}

      {/* 아직 하나도 없을 때 — **할 일 하나만 크게.** 「엄두가 안 난다」는
          자리에 단추 둘을 나란히 놓으면 그것부터가 고르는 일이 된다 */}
      {steps.length === 0 ? (
        <div className="emptybox">
          <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700 }}>아직 루틴이 없어요</p>
          <p className="hint" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
            한 줄이 한 수업 회차입니다. 진도를 따라 순서대로 돌아가요.
            <br />
            본보기를 넣고 고치는 편이 빠릅니다.
          </p>
          <div className="row" style={{ gap: 6, justifyContent: "center" }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              title="이 교재 영역에 맞는 순서를 넣어드립니다. 넣고 나서 고치시면 됩니다"
              onClick={seed}
            >
              ✨ 본보기 넣기
            </button>
            <button className="btn btn-ghost btn-sm" onClick={addStep}>
              직접 만들기
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span className="hint" style={{ flex: 1 }}>
              한 줄이 한 수업 회차입니다. 진도를 따라 순서대로 돌아갑니다.
            </span>
            <button className="btn btn-sm" onClick={addStep}>＋ 단계 추가</button>
          </div>

          <div className="stack" style={{ gap: 6 }}>
            {steps.map((s, i) => (
              <div className="steprow" key={s.id}>
                <span className="stepno">{i + 1}</span>
                <div className="stepbody">
                  {s.label && <b style={{ fontSize: 12.5 }}>{s.label}</b>}
                  {/* **어느 쪽 일인지 딱지로.** 「등원:」 「숙제:」 를 글자로 적으면
                      항목 이름과 같은 굵기라 눈이 한 번 더 읽어야 한다 */}
                  <div className="prow">
                    <span className="tag tag-lav plabel">등원</span>
                    <span style={{ fontSize: 12.5 }}>
                      {(s.inclass_items || []).map(nameOf).filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  <div className="prow">
                    <span className="tag tag-mint plabel">숙제</span>
                    <span style={{ fontSize: 12.5 }}>
                      {(s.home_items || []).map(nameOf).filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                </div>
                <div className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...s })}>
                    수정
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("이 단계를 지울까요?")) return;
                      run(() => deleteStep(s.id));
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 고치는 판 — 목록과 **테두리로 갈라둔다.** 그냥 이어 붙이면 어디까지가
          목록이고 어디부터가 지금 고치는 것인지 눈으로 갈리지 않는다 */}
      {editing && (
        <div className="editpane">
          <div className="field">
            <label className="label">이름 (알아보기 쉽게)</label>
            <input
              className="input input-sm"
              placeholder="예) 설명 정독 · 문답노트"
              value={editing.label || ""}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
            />
          </div>
          <Picker
            label="등원해서 할 것"
            value={editing.inclass_items || []}
            onChange={(v) => setEditing({ ...editing, inclass_items: v })}
          />
          <Picker
            label="숙제로 낼 것"
            value={editing.home_items || []}
            onChange={(v) => setEditing({ ...editing, home_items: v })}
          />
          <div className="row" style={{ gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
              취소
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() => run(() => saveStep(textbookId, editing))}
            >
              저장
            </button>
          </div>
        </div>
      )}
    </>
  );
}
