"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStudentTextbooks } from "@/app/progress/actions";

// 학생 한 명의 교재.
//
// 교재는 **학생마다 다르다** — 같은 반이어도 다르다. 반에 붙이는 것은 여러 명에게
// 한 번에 넣어주는 지름길일 뿐이고, 진짜 배정은 여기다.
export default function StudentBooks({ studentId, myBooks = [], textbooks = [] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");     // 영역으로 걸러보기
  const [picked, setPicked] = useState(() => new Set(myBooks.map((b) => b.id)));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 교재는 이름을 다 외우고 있지 않다. **영역부터 좁히면** 몇 권 안 남는다.
  // 실제로 있는 영역만 버튼으로 만든다 — 없는 영역을 눌러보게 하면 안 된다.
  const areas = [...new Set(textbooks.map((b) => b.area).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko")
  );

  const kw = q.trim().toLowerCase();
  const pool = area ? textbooks.filter((b) => b.area === area) : textbooks;
  const shown =
    kw || area
      ? pool
          .filter(
            (b) => !kw || [b.name, b.area].filter(Boolean).some((v) => v.toLowerCase().includes(kw))
          )
          .slice(0, 60)
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
        {myBooks.length > 0 ? `교재 ${myBooks.length}권 바꾸기` : "교재 배정"}
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
        교재는 학생마다 따로 정합니다. 뺀 교재는 지워지지 않고 <b>중단</b>으로 남아,
        지금까지 나간 진도가 그대로 보존돼요. 다시 넣으면 이어서 갑니다.
      </p>
      <div className="row" style={{ gap: 4, alignItems: "center", marginBottom: 8 }}>
        <input
          className="input input-sm"
          style={{ width: 160 }}
          placeholder="교재 이름"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {/* 영역부터 좁히기 — 이름을 다 외우고 있지 않아도 찾을 수 있다 */}
        {areas.length > 0 && (
          <>
            <button
              className={`hwchip ${area === "" ? "hw-next" : ""}`}
              onClick={() => setArea("")}
            >
              전체
            </button>
            {areas.map((a) => {
              const n = textbooks.filter((b) => b.area === a).length;
              return (
                <button
                  key={a}
                  className={`hwchip ${area === a ? "hw-next" : ""}`}
                  onClick={() => setArea(area === a ? "" : a)}
                >
                  {a} {n}
                </button>
              );
            })}
          </>
        )}
      </div>
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
      {!kw && !area && textbooks.length > shown.length && (
        <p className="hint" style={{ marginTop: 6 }}>
          일부만 보여요. 검색창에 교재 이름을 치면 찾을 수 있어요.
        </p>
      )}
    </div>
  );
}
