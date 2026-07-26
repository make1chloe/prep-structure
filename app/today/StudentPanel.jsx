"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStudentDay } from "./actions";

const ATT = [
  { key: "present", label: "정시" },
  { key: "late", label: "지각" },
  { key: "absent", label: "결석" },
  { key: "makeup", label: "보강" },
  { key: "early_leave", label: "조퇴" },
  { key: "online", label: "온라인" },
];

const ATTITUDE = [
  { key: "Excellent", label: "⭐⭐⭐⭐⭐" },
  { key: "Good", label: "⭐⭐⭐⭐" },
  { key: "Satisfactory", label: "⭐⭐⭐" },
  { key: "Needs improvement", label: "⭐⭐" },
  { key: "Area of Concern", label: "🚩" },
];

// 클릭할 때마다 순환: 없음 → 완료 → 미흡 → 미제출 → 없음
const CYCLE = { "": "done", done: "weak", weak: "missing", missing: "" };
const MARK = { done: "○", weak: "△", missing: "✕" };
const MARK_CLS = { done: "hw-done", weak: "hw-weak", missing: "hw-missing" };

export default function StudentPanel({ row, date, items = [], onSaved }) {
  const r = row.report || {};
  const [form, setForm] = useState({
    attendance: row.status || "present",
    attitude: r.attitude || "",
    word_correct: r.word_correct ?? "",
    word_total: r.word_total ?? "",
    sent_correct: r.sent_correct ?? "",
    sent_total: r.sent_total ?? "",
    own_progress: r.own_progress || "",
    notice: r.notice || "",
  });
  const [marks, setMarks] = useState(() => ({ ...(row.items || {}) }));
  const [next, setNext] = useState(() => new Set(row.nextHomework || []));
  const [cat, setCat] = useState("자주");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const toCheck = row.toCheck || [];          // 지난 수업에 배정한 숙제 = 오늘 검사 대상
  const toCheckSet = new Set(toCheck);
  const unchecked = toCheck.filter((id) => !marks[id]);
  const nameOf = (id) => items.find((i) => i.id === id)?.name || "";

  const cats = ["자주", ...new Set(items.map((i) => i.category).filter(Boolean)), "전체"];
  const COMMON = ["단어(교재)", "단어(온라인)", "독해", "워크북", "문법", "영작", "듣기", "오답노트"];
  const shown =
    cat === "전체"
      ? items
      : cat === "자주"
      ? items.filter((i) => COMMON.includes(i.name) || marks[i.id] || toCheckSet.has(i.id) || next.has(i.id))
      : items.filter((i) => i.category === cat);

  function cycle(id) {
    setMarks((m) => ({ ...m, [id]: CYCLE[m[id] || ""] }));
  }
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function save() {
    startTransition(async () => {
      const res = await saveStudentDay(row.student.id, date, {
        ...form,
        items: marks,
        toCheck,
        nextHomework: [...next],
      });
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (res && res.complete === false) {
        alert(`저장했지만 아직 완료가 아니에요.\n지난 수업 숙제 ${res.unchecked}개가 검사되지 않았습니다.`);
      }
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <div className="stuPanel">
      {/* 출결 */}
      <div className="prow">
        <span className="plabel">출결</span>
        <div className="row" style={{ gap: 4 }}>
          {ATT.map((a) => (
            <button
              key={a.key}
              className={`btn btn-sm ${form.attendance === a.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => set("attendance", a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* 테스트 점수 */}
      <div className="prow">
        <span className="plabel">테스트</span>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <span className="hint">단어</span>
          <input
            className="input input-sm" style={{ width: 44, textAlign: "center" }}
            inputMode="numeric" value={form.word_correct}
            onChange={(e) => set("word_correct", e.target.value)}
          />
          <span className="muted">/</span>
          <input
            className="input input-sm" style={{ width: 44, textAlign: "center" }}
            inputMode="numeric" value={form.word_total}
            onChange={(e) => set("word_total", e.target.value)}
          />
          <span className="hint" style={{ marginLeft: 8 }}>문장</span>
          <input
            className="input input-sm" style={{ width: 44, textAlign: "center" }}
            inputMode="numeric" value={form.sent_correct}
            onChange={(e) => set("sent_correct", e.target.value)}
          />
          <span className="muted">/</span>
          <input
            className="input input-sm" style={{ width: 44, textAlign: "center" }}
            inputMode="numeric" value={form.sent_total}
            onChange={(e) => set("sent_total", e.target.value)}
          />
        </div>
      </div>

      {/* 숙제 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>숙제</span>
        <div style={{ flex: 1 }}>
          {toCheck.length > 0 && (
            <p className="hint" style={{ margin: "0 0 6px" }}>
              지난 수업 숙제 {toCheck.length}개
              {unchecked.length > 0 ? (
                <b style={{ color: "var(--amber)" }}>
                  {" "}· 미검사 {unchecked.length}개 ({unchecked.map(nameOf).filter(Boolean).join(", ")})
                </b>
              ) : (
                <b style={{ color: "var(--mint)" }}> · 모두 검사함</b>
              )}
            </p>
          )}
          <div className="row" style={{ gap: 3, marginBottom: 6 }}>
            {cats.map((c) => (
              <button
                key={c}
                className={`btn btn-sm ${cat === c ? "btn-primary" : "btn-ghost"}`}
                style={{ padding: "3px 8px" }}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 4 }}>
            {shown.map((i) => {
              const st = marks[i.id] || "";
              return (
                <button
                  key={i.id}
                  className={`hwchip ${st ? MARK_CLS[st] : ""}`}
                  onClick={() => cycle(i.id)}
                  title={toCheckSet.has(i.id) ? "지난 수업 숙제 — 검사 필요" : "클릭: 완료 → 미흡 → 미제출 → 없음"}
                  style={toCheckSet.has(i.id) && !st ? { borderColor: "var(--amber)", borderWidth: 2 } : undefined}
                >
                  {st && <b>{MARK[st]}</b>} {i.name}
                </button>
              );
            })}
            {shown.length === 0 && <span className="hint">항목이 없어요.</span>}
          </div>
        </div>
      </div>

      {/* 다음 숙제 배정 */}
      <div className="prow" style={{ alignItems: "flex-start" }}>
        <span className="plabel" style={{ paddingTop: 5 }}>다음</span>
        <div style={{ flex: 1 }}>
          <p className="hint" style={{ margin: "0 0 6px" }}>
            다음 수업에 검사할 숙제를 골라두면, 그때 이 항목들이 검사 대상이 돼요.
            {next.size > 0 && <b> · {next.size}개 배정</b>}
          </p>
          <div className="row" style={{ gap: 4 }}>
            {shown.map((i) => (
              <button
                key={i.id}
                className={`hwchip ${next.has(i.id) ? "hw-next" : ""}`}
                onClick={() => {
                  const n = new Set(next);
                  n.has(i.id) ? n.delete(i.id) : n.add(i.id);
                  setNext(n);
                }}
              >
                {next.has(i.id) && <b>＋</b>} {i.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 진도 · 태도 */}
      <div className="prow">
        <span className="plabel">진도</span>
        <input
          className="input input-sm" style={{ flex: 1, minWidth: 160 }}
          placeholder={row.lastProgress ? `지난 수업: ${row.lastProgress}` : "예: Unit 3 (12~19p)"}
          value={form.own_progress}
          onChange={(e) => set("own_progress", e.target.value)}
        />
        {row.lastProgress && !form.own_progress && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => set("own_progress", row.lastProgress)}
          >
            지난 진도 가져오기
          </button>
        )}
      </div>

      <div className="prow">
        <span className="plabel">태도</span>
        <div className="row" style={{ gap: 4 }}>
          {ATTITUDE.map((a) => (
            <button
              key={a.key}
              className={`btn btn-sm ${form.attitude === a.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => set("attitude", form.attitude === a.key ? "" : a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="prow">
        <span className="plabel">공지</span>
        <input
          className="input input-sm" style={{ flex: 1, minWidth: 160 }}
          placeholder="학부모에게 전할 말 (선택)"
          value={form.notice}
          onChange={(e) => set("notice", e.target.value)}
        />
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
          {pending ? "저장 중…" : unchecked.length > 0 ? `저장 (숙제 ${unchecked.length}개 미검사)` : "저장하고 완료"}
        </button>
      </div>
    </div>
  );
}
