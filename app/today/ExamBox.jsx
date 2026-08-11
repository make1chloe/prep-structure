"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addUnitExam, deleteUnitExam } from "./examActions";
import { scoreRaw } from "@/lib/wordTest";

/**
 * 단원평가 결과 한 학생 분.
 *
 * 본 날 그 자리에서 적는다. 월간리포트에 그대로 들어간다.
 * 점수는 **틀린 개수**로 받는다 — 채점할 때 세는 것이 그쪽이다.
 */
/**
 * @param readOnly 적는 칸을 감춘다 — 이제 적는 자리는 **테스트 줄의 단원평가**
 *   하나다 (2026-08-11, 「중복입력이 있어」). 여기는 지난 기록을 보여주고
 *   지우는 것만 남는다. 두 군데에 적게 두면 같은 시험이 두 번 들어간다.
 */
export default function ExamBox({ studentId, date, rows = [], readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", wrong: "", total: "" });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function add() {
    startTransition(async () => {
      const res = await addUnitExam(studentId, date, form);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setForm({ name: "", wrong: "", total: "" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div style={{ flex: 1 }}>
      {rows.length > 0 && (
        <div className="stack" style={{ gap: 3, marginBottom: 6 }}>
          {rows.map((e) => (
            <div className="unitrow" key={e.id}>
              <span className="tag tag-lav">단원평가</span>
              <span style={{ fontSize: 12.5, flex: 1 }}>{e.name}</span>
              {e.total ? <span className="hint">{scoreRaw(e.score, e.total)}</span> : null}
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`'${e.name}' 결과를 지울까요?`)) return;
                  startTransition(async () => {
                    await deleteUnitExam(e.id);
                    router.refresh();
                  });
                }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      {readOnly ? null : !open ? (
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          ＋ 단원평가 결과
        </button>
      ) : (
        <div className="row" style={{ gap: 5, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input input-sm"
            style={{ flex: 1, minWidth: 140 }}
            placeholder="무슨 단원평가인지 (예: Chapter 3 관계대명사)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input input-sm"
            style={{ width: 46, textAlign: "center" }}
            inputMode="numeric"
            placeholder="틀린"
            value={form.wrong}
            onChange={(e) => setForm({ ...form, wrong: e.target.value.replace(/[^\d]/g, "") })}
          />
          <span className="hint">틀림 / 전체</span>
          <input
            className="input input-sm"
            style={{ width: 46, textAlign: "center" }}
            inputMode="numeric"
            value={form.total}
            onChange={(e) => setForm({ ...form, total: e.target.value.replace(/[^\d]/g, "") })}
          />
          <button className="btn btn-primary btn-sm" disabled={pending || !form.name} onClick={add}>
            저장
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
            취소
          </button>
        </div>
      )}
    </div>
  );
}
