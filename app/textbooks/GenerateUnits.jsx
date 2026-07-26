"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateUnits } from "./actions";

const PREFIXES = ["Unit", "Chapter", "Lesson", "Day", "강", "과"];

// 규칙적인 교재는 손으로 치지 않고 한 번에 만든다
export default function GenerateUnits({ textbookId, parents = [], totalPages }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    prefix: "Unit",
    from: "1",
    to: "20",
    pageStart: "",
    pageEnd: totalPages ? String(totalPages) : "",
    parentId: "",
    activity: "",
  });
  const [result, setResult] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const count = Math.max(0, (parseInt(form.to, 10) || 0) - (parseInt(form.from, 10) || 0) + 1);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await generateUnits({ textbookId, ...form });
      setResult(res);
      if (res.created > 0) router.refresh();
    });
  }

  if (!textbookId) return null;

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        ⚡ 단원 한 번에 만들기
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>단원 한 번에 만들기</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <p className="muted" style={{ margin: "8px 0 12px", fontSize: 13 }}>
        <b>Unit 1 ~ Unit 20</b> 처럼 번호만 늘어나는 교재는 여기서 한 번에 만드세요.
        페이지 범위를 넣으면 균등하게 나눠 넣고, 나중에 개별 수정할 수 있어요.
      </p>

      <div className="editgrid">
        <div className="field">
          <label className="label">이름</label>
          <select className="input input-sm" value={form.prefix} onChange={(e) => set("prefix", e.target.value)}>
            {PREFIXES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label">시작 번호</label>
          <input className="input input-sm" inputMode="numeric" value={form.from} onChange={(e) => set("from", e.target.value)} />
        </div>
        <div className="field">
          <label className="label">끝 번호</label>
          <input className="input input-sm" inputMode="numeric" value={form.to} onChange={(e) => set("to", e.target.value)} />
        </div>
        <div className="field">
          <label className="label">시작 페이지 (선택)</label>
          <input className="input input-sm" inputMode="numeric" value={form.pageStart} onChange={(e) => set("pageStart", e.target.value)} placeholder="예: 8" />
        </div>
        <div className="field">
          <label className="label">끝 페이지 (선택)</label>
          <input className="input input-sm" inputMode="numeric" value={form.pageEnd} onChange={(e) => set("pageEnd", e.target.value)} placeholder="예: 160" />
        </div>
        <div className="field">
          <label className="label">활동 (선택)</label>
          <input className="input input-sm" value={form.activity} onChange={(e) => set("activity", e.target.value)} placeholder="본문 / 워크북" />
        </div>
        <div className="field">
          <label className="label">상위 단원 (선택)</label>
          <select className="input input-sm" value={form.parentId} onChange={(e) => set("parentId", e.target.value)}>
            <option value="">최상위</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {"　".repeat(p.depth)}{p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12, alignItems: "center" }}>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={pending || count < 1}>
          {pending ? "만드는 중…" : `${count}개 만들기`}
        </button>
        <span className="hint">
          {form.prefix} {form.from} … {form.prefix} {form.to}
          {form.pageStart && form.pageEnd ? ` · ${form.pageStart}~${form.pageEnd}p 균등 분할` : ""}
        </span>
      </div>

      {result && (
        <div style={{ marginTop: 10 }}>
          {result.error ? (
            <div className="err">{result.error}</div>
          ) : (
            <div className="notice">✅ {result.created}개 만들었어요.</div>
          )}
        </div>
      )}
    </div>
  );
}
