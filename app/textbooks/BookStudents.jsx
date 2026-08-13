"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTextbookStudents } from "@/app/progress/actions";

/**
 * 이 교재를 쓰는 학생 — **교재 쪽에서** 넣고 뺀다.
 *
 * 학생 화면에도 같은 일을 하는 자리가 있다(오늘 수업 · 재원생의 「교재 배정」).
 * 그쪽은 **아이 하나를 볼 때** 쓰는 자리고, 여기는 **책 하나를 볼 때** 쓴다.
 * 새 교재를 들이면 「이 책 쓸 아이들」이 먼저 떠오르는데, 그때 아이를 하나씩
 * 열어 붙이면 열다섯 명이면 열다섯 번을 오간다.
 *
 * 넣고 빼는 규칙은 양쪽이 같다 (lib/bookAssign) — 뺀 학생은 지워지지 않고
 * 중단으로 남아서 지금까지 나간 진도가 보존된다.
 */
export default function BookStudents({ textbookId, bookName, students = [], picked: initial = [] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set(initial));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const kw = q.trim().toLowerCase();
  const shown = kw
    ? students.filter((s) =>
        [s.name, s.school, s.grade].filter(Boolean).some((v) => String(v).toLowerCase().includes(kw))
      )
    : students;

  const dirty =
    picked.size !== initial.length || initial.some((id) => !picked.has(id));

  function save() {
    startTransition(async () => {
      const res = await setTextbookStudents(textbookId, [...picked]);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  // **접혀 있다가 누르면 펴진다.** 교재 화면은 단원을 정리하러 여는 자리라,
  // 늘 펴 두면 단원 목록이 그만큼 아래로 밀린다.
  if (!open) {
    return (
      <div className="row" style={{ marginBottom: 10, gap: 6, alignItems: "center" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          {initial.length > 0 ? `이 교재 쓰는 학생 ${initial.length}명 바꾸기` : "이 교재 쓸 학생 정하기"}
        </button>
        {/* **누가 쓰는지는 펴지 않아도 보여야 한다** — 이름이 안 보이면
            숫자만 보고 「누구지」 하며 한 번 더 누르게 된다 */}
        {initial.length > 0 && (
          <span className="muted" style={{ fontSize: 14 }}>
            {students
              .filter((s) => initial.includes(s.id))
              .map((s) => s.name)
              .join(" · ")}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="card card-tight" style={{ width: "100%", marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 14.5 }}>
          「{bookName}」 를 쓰는 학생 {picked.size}명
        </b>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !dirty}>
            {dirty ? "저장" : "저장됨"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
            닫기
          </button>
        </div>
      </div>
      <p className="hint" style={{ margin: "6px 0 8px" }}>
        뺀 학생은 지워지지 않고 <b>중단</b>으로 남아, 지금까지 나간 진도가 그대로
        보존돼요. 다시 넣으면 이어서 갑니다. 재원생만 나옵니다.
      </p>
      <div className="row" style={{ gap: 4, alignItems: "center", marginBottom: 8 }}>
        <input
          className="input input-sm"
          style={{ width: 160 }}
          placeholder="학생 이름 · 학교"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {/* 한 반을 통째로 넣는 일이 잦다 — 하나씩 열다섯 번 누르지 않게 */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setPicked(new Set([...picked, ...shown.map((s) => s.id)]))}
          disabled={shown.length === 0}
        >
          보이는 {shown.length}명 다 넣기
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const n = new Set(picked);
            shown.forEach((s) => n.delete(s.id));
            setPicked(n);
          }}
          disabled={shown.length === 0}
        >
          다 빼기
        </button>
      </div>
      <div className="row" style={{ gap: 4, maxHeight: 220, overflowY: "auto" }}>
        {shown.map((s) => (
          <button
            key={s.id}
            className={`hwchip ${picked.has(s.id) ? "hw-next" : ""}`}
            onClick={() => {
              const n = new Set(picked);
              n.has(s.id) ? n.delete(s.id) : n.add(s.id);
              setPicked(n);
            }}
            title={[s.school, s.grade].filter(Boolean).join(" ")}
          >
            {picked.has(s.id) && <b>＋</b>} {s.grade ? `${s.grade} ` : ""}
            {s.name}
          </button>
        ))}
        {shown.length === 0 && <span className="hint">맞는 학생이 없어요.</span>}
      </div>
    </div>
  );
}
