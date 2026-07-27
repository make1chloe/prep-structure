"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markCheck } from "./checkActions";
import { waitingChecks, waitingFor } from "@/lib/checkQueue";

/**
 * 검사 대기줄 — 반 전체를 한 자리에서.
 *
 * 열 명이 비슷한 때 끝내면 검사가 한꺼번에 몰린다.
 * 학생 칸을 하나씩 열어 찍으면 스무 번을 열어야 한다.
 * 그래서 **오래 기다린 순으로 한 줄씩** 늘어놓고 그 자리에서 찍는다.
 */
export default function CheckQueue({ date, rows = [], items = [] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const queue = rows
    .flatMap((r) =>
      waitingChecks(r.doneRows || [], items, r.items || {}).map((w) => ({
        student: r.student,
        ...w,
      }))
    )
    .sort((a, b) => a.since.localeCompare(b.since));

  if (queue.length === 0) return null;

  function mark(studentId, itemId, status) {
    startTransition(async () => {
      const res = await markCheck(studentId, date, itemId, status);
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: "3px solid var(--amber, #e0a33e)" }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>검사 기다리는 중</b>
        <span className="tag tag-amber">{queue.length}건</span>
        <span className="hint" style={{ flex: 1 }}>
          오래 기다린 순입니다. 여기서 바로 찍으시면 됩니다.
        </span>
      </div>

      <div className="stack" style={{ gap: 4 }}>
        {queue.map((q) => (
          <div className="unitrow" key={`${q.student.id}-${q.id}`}>
            <b style={{ fontSize: 13.5, minWidth: 62 }}>{q.student.name}</b>
            <span style={{ fontSize: 12.5, flex: 1 }}>{q.name}</span>
            <span className="hint" style={{ fontSize: 11.5 }}>{waitingFor(q.since)}</span>
            <span className="markset">
              {[["done", "○"], ["weak", "△"], ["missing", "✕"]].map(([k, sym]) => (
                <button
                  key={k}
                  className="markbtn"
                  disabled={pending}
                  title={k === "done" ? "완료" : k === "weak" ? "미흡" : "미제출"}
                  onClick={() => mark(q.student.id, q.id, k)}
                >
                  {sym}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
