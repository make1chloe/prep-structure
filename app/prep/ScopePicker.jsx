"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { saveScope, listBooks } from "./actions";
import { listUnitOptions } from "@/app/today/actions";
import { unitOptionText } from "@/lib/unitTree";
import BookPicker from "@/components/BookPicker";

/**
 * 시험범위를 **교재DB에서 골라** 담는다.
 *
 * 텍스트로 적으면 자료 관리가 안 된다. 정규 교재와 같은 구조를 쓰고, 가장 작은
 * 단위로 문제번호를 둔다. 모의고사는 단원이 없어서 중단원 자리에 문제번호가 온다.
 *
 * 담은 것은 unit_ids 로 저장한다. 범위가 바뀌면 범위를 지우고 다시 만든다
 * (자료와 학생 배정이 달라지기 때문이다).
 */
export default function ScopePicker({ scope, onClose, onSaved }) {
  const [name, setName] = useState(scope?.name || "");
  const [note, setNote] = useState(scope?.note || "");
  const [picked, setPicked] = useState(() => new Set(scope?.unit_ids || []));
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState("");
  const [options, setOptions] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await listBooks();
      if (!alive) return;
      if (res?.error) setErr(res.error);
      setBooks(res?.rows || []);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!bookId) { setOptions([]); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await listUnitOptions(bookId);
      if (!alive) return;
      setLoading(false);
      if (res?.error) { setErr(res.error); setOptions([]); return; }
      setErr("");
      setOptions(res?.options || []);
    })();
    return () => { alive = false; };
  }, [bookId]);

  const kw = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!kw) return options;
    return options.filter((o) =>
      [o.big, o.mid, o.small, o.name, o.question, o.activity, o.pages]
        .some((v) => (v || "").toString().toLowerCase().includes(kw))
    );
  }, [options, kw]);

  function toggle(id) {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  }

  /** 눈에 보이는 것 전부 담기 / 빼기 — 문제번호가 많을 때 하나씩 누르면 못 쓴다 */
  function toggleShown() {
    const ids = shown.map((o) => o.id);
    const allOn = ids.length > 0 && ids.every((id) => picked.has(id));
    const next = new Set(picked);
    ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
    setPicked(next);
  }

  function save() {
    setErr("");
    startTransition(async () => {
      const res = await saveScope({
        id: scope?.id,
        exam_id: scope?.exam_id,
        name,
        note,
        unit_ids: [...picked],
        sort: scope?.sort ?? 0,
      });
      if (res?.error) { setErr(res.error); return; }
      onSaved?.();
    });
  }

  const allShownOn = shown.length > 0 && shown.every((o) => picked.has(o.id));

  return (
    <div className="card card-tight" style={{ background: "var(--surface-2)" }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{scope?.id ? "범위 고치기" : "범위 추가"}</b>
        <span className="hint" style={{ fontSize: 12.5 }}>
          교재를 고르고 단원 · 문제번호를 눌러 담습니다
        </span>
        <span className="spacer" />
        <span className="tag tag-sky">{picked.size}개 담김</span>
      </div>

      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <input
          className="input input-sm"
          style={{ width: 180 }}
          placeholder="범위 이름 (비워도 됩니다)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <BookPicker books={books} value={bookId} onChange={setBookId} width={200} />
        <input
          className="input input-sm"
          style={{ width: 150 }}
          placeholder="단원 · 문제 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {shown.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={toggleShown}>
            {allShownOn ? "보이는 것 빼기" : `보이는 것 ${shown.length}개 담기`}
          </button>
        )}
      </div>

      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

      <div
        className="stack"
        style={{ gap: 2, marginTop: 8, maxHeight: 300, overflowY: "auto" }}
      >
        {loading && <p className="hint" style={{ margin: 0 }}>단원을 불러오는 중…</p>}
        {!loading && !bookId && (
          <p className="hint" style={{ margin: 0 }}>교재를 먼저 골라주세요.</p>
        )}
        {!loading && bookId && shown.length === 0 && (
          <p className="hint" style={{ margin: 0 }}>
            {options.length === 0
              ? "이 교재에 아직 단원이 없습니다. 교재 → 단원에서 올려주세요."
              : "검색에 맞는 단원이 없어요."}
          </p>
        )}
        {shown.map((o) => {
          const on = picked.has(o.id);
          return (
            <button
              key={o.id}
              className={`btn btn-sm ${on ? "btn-primary" : "btn-ghost"}`}
              style={{
                justifyContent: "flex-start",
                textAlign: "left",
                marginLeft: (kw ? 0 : o.depth) * 14,
                fontSize: 14,
                padding: "3px 8px",
              }}
              onClick={() => toggle(o.id)}
            >
              {on ? "✓ " : ""}
              {o.question ? `${o.question}번` : o.name}
              <span className="hint" style={{ fontSize: 12, marginLeft: 6 }}>
                {unitOptionText(o)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 다른 교재에서 담은 것도 남는다 — 지금 보고 있는 교재 밖의 것을 알려준다 */}
      {picked.size > 0 && bookId && (
        <p className="hint" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
          담은 것 중 {[...picked].filter((id) => !options.some((o) => o.id === id)).length}개는
          다른 교재에서 담은 것입니다 (교재를 바꿔도 그대로 남습니다).
        </p>
      )}

      <div className="row" style={{ gap: 6, marginTop: 10 }}>
        <input
          className="input input-sm"
          style={{ flex: 1, minWidth: 160 }}
          placeholder="메모 (선택)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={save}>
          저장
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>취소</button>
      </div>
    </div>
  );
}
