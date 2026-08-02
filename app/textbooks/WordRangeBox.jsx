"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTextbook } from "./actions";

/**
 * 단어 교재의 **소단원당 단어 개수**.
 *
 * 단어시험을 내려면 몇 개 중에 몇 개인지를 알아야 한다. 대부분의 교재는
 * day 하나에 30개씩처럼 규칙적이라, 한 번만 적어두면 단원마다 안 적어도 된다.
 *
 * 그런데 교재에 따라 단원마다 다르다. 그럴 때 억지로 하나로 정하면 시험 개수가
 * 틀리고, 그 숫자로 통과·미통과를 가르므로 **틀리면 안 되는 숫자**다.
 * 그래서 「불규칙」을 켜고 단원마다 따로 적게 한다.
 */
export default function WordRangeBox({ book }) {
  const [n, setN] = useState(book?.word_range ?? "");
  const [irregular, setIrregular] = useState(!!book?.words_irregular);
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(nextIrregular = irregular) {
    startTransition(async () => {
      const r = await updateTextbook(book.id, {
        word_range: n === "" ? null : Number(n),
        words_irregular: nextIrregular,
      });
      setMsg(r?.error ? { err: r.error } : { ok: "저장했어요." });
      router.refresh();
    });
  }

  return (
    <div className="card card-tight" style={{ marginBottom: 10, background: "var(--surface-2)" }}>
      <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ width: 150 }}>
          <label className="label">소단원 하나당 단어</label>
          <input
            className="input input-sm"
            inputMode="numeric"
            value={n}
            onChange={(e) => setN(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="예: 30"
            disabled={irregular}
          />
        </div>

        <button
          className={`btn btn-sm ${irregular ? "btn-primary" : "btn-ghost"}`}
          disabled={pending}
          onClick={() => {
            const next = !irregular;
            setIrregular(next);
            save(next);
          }}
        >
          {irregular ? "✓ 불규칙" : "불규칙"}
        </button>

        {!irregular && (
          <button className="btn btn-primary btn-sm" onClick={() => save()} disabled={pending}>
            {pending ? "저장 중…" : "저장"}
          </button>
        )}

        <span className="hint" style={{ flex: 1, minWidth: 220, fontSize: 11.5 }}>
          {irregular ? (
            <>
              <b>단원마다 개수가 다른 교재예요.</b> 아래 표의 <b>단어</b> 칸에 단원마다 적어주세요.
            </>
          ) : (
            <>
              대부분 이 개수로 봅니다. 몇 단원만 다르면 아래 표에서 그 단원만 고쳐도 돼요 —
              적어둔 단원은 그 숫자를 씁니다.
            </>
          )}
        </span>

        {msg?.err && <span className="err">{msg.err}</span>}
        {msg?.ok && <span className="hint">{msg.ok}</span>}
      </div>
    </div>
  );
}
