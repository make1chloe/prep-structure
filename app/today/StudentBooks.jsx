"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStudentTextbooks } from "@/app/progress/actions";

// 학생 한 명의 교재를 바꾼다 (반과 다른 교재를 쓰는 학생용)
export default function StudentBooks({ studentId, myBooks = [], textbooks = [] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set(myBooks.map((b) => b.id)));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const kw = q.trim().toLowerCase();
  const shown = kw
    ? textbooks
        .filter((b) => [b.name, b.area].filter(Boolean).some((v) => v.toLowerCase().includes(kw)))
        .slice(0, 40)
    : [
        ...textbooks.filter((b) => picked.has(b.id)),
        ...textbooks.filter((b) => !picked.has(b.id)).slice(0, 12),
      ];

  const dirty =
    picked.size !== myBooks.length || myBooks.some((b) => !picked.has(b.id));

  function save() {
    startTransition(async () => {
      const res = await setStudentTextbooks(studentId, [...picked]);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        교재 바꾸기
      </button>
    );
  }

  return (
    <div className="card card-tight" style={{ width: "100%", marginTop: 6 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 13 }}>이 학생의 교재 {picked.size}권</b>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !dirty}>
            {dirty ? "저장" : "저장됨"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </div>
      <p className="hint" style={{ margin: "6px 0 8px" }}>
        반에 배정한 교재는 이미 들어와 있어요. 이 학생만 다르게 쓸 때 여기서 더하거나 뺍니다.
      </p>
      <input
        className="input input-sm"
        style={{ width: 180, marginBottom: 8 }}
        placeholder="교재 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="row" style={{ gap: 4, maxHeight: 200, overflowY: "auto" }}>
        {shown.map((b) => (
          <button
            key={b.id}
            className={`hwchip ${picked.has(b.id) ? "hw-next" : ""}`}
            onClick={() => {
              const n = new Set(picked);
              n.has(b.id) ? n.delete(b.id) : n.add(b.id);
              setPicked(n);
            }}
          >
            {picked.has(b.id) && <b>＋</b>} {b.area ? `[${b.area}] ` : ""}
            {b.name}
          </button>
        ))}
        {shown.length === 0 && <span className="hint">맞는 교재가 없어요.</span>}
      </div>
      {!kw && textbooks.length > shown.length && (
        <p className="hint" style={{ marginTop: 6 }}>
          일부만 보여요. 검색창에 교재 이름을 치면 찾을 수 있어요.
        </p>
      )}
    </div>
  );
}
