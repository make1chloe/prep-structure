"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStudent } from "./actions";

/**
 * 이 학생의 단어시험 — **몇 개씩 · 몇 %면 통과 · 언제**.
 *
 * 방식(객관식/주관식 배분)은 교재마다 다르니 진도 화면에 따로 있다 (0025).
 * 여기 있는 셋은 **학생마다 한 번 정하면 잘 안 바뀌는 것**이라 재원생에 둔다.
 *
 * 통과선은 맞은 %로 적는다. "10% 틀림까지" 와 "90% 이상" 은 같은 말인데,
 * 어떤 줄은 높아야 좋고 어떤 줄은 낮아야 좋으면 볼 때마다 뒤집어 생각해야 한다.
 */
export default function WordTestBox({ student, defaultPass = 90 }) {
  const [count, setCount] = useState(student?.word_test_count ?? "");
  const [cut, setCut] = useState(student?.word_cut_pct ?? "");
  const [when, setWhen] = useState(student?.word_when || "start");
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const n = Number(count) || 0;
  const pass = Number(cut) || defaultPass;
  // 몇 개까지 틀려도 되는지 — %로만 적어두면 수업 중에 매번 암산해야 한다
  const allowed = n > 0 ? Math.floor((n * (100 - pass)) / 100) : null;

  function save() {
    startTransition(async () => {
      const r = await updateStudent(student.id, {
        word_test_count: count === "" ? null : Number(count),
        word_cut_pct: cut === "" ? null : Number(cut),
        word_when: when,
      });
      setMsg(r?.error ? { err: r.error } : { ok: "저장했어요." });
      router.refresh();
    });
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14.5 }}>{student.name} 단어시험</b>
        <span className="hint" style={{ fontSize: 12.5 }}>
          객관식·주관식 배분은 교재마다 다르므로 <b>진도 화면</b>에서 정합니다.
        </span>
      </div>

      <div className="row" style={{ gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ width: 150 }}>
          <label className="label">한 번에 몇 개</label>
          <input
            className="input input-sm"
            type="number"
            min="0"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="비우면 범위대로"
          />
        </div>

        <div className="field" style={{ width: 150 }}>
          <label className="label">통과선 (맞은 %)</label>
          <input
            className="input input-sm"
            type="number"
            min="0"
            max="100"
            value={cut}
            onChange={(e) => setCut(e.target.value)}
            placeholder={`비우면 ${defaultPass}`}
          />
        </div>

        <div className="field" style={{ width: 170 }}>
          <label className="label">언제 보나</label>
          <div className="row" style={{ gap: 4 }}>
            {[["start", "수업 시작"], ["end", "다 끝내고"]].map(([k, label]) => (
              <button
                key={k}
                className={`btn btn-sm ${when === k ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setWhen(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary btn-sm" onClick={save} disabled={pending}>
          {pending ? "저장 중…" : "저장"}
        </button>
        {msg?.err && <span className="err">{msg.err}</span>}
        {msg?.ok && <span className="hint">{msg.ok}</span>}
      </div>

      <p className="hint" style={{ margin: 0 }}>
        {n > 0
          ? `${n}개 중 ${allowed}개까지 틀려도 통과입니다 (${pass}%).`
          : `개수를 비워두면 그날 나간 범위의 단어 수로 봅니다. 통과선은 ${pass}% 예요.`}
      </p>
    </div>
  );
}
