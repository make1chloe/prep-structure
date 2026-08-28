"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLearned } from "./learnedActions";
import { learnedEnough, LEARNED_ASK } from "@/lib/learned";

/**
 * **오늘 배운 것** (0181, 원장님 2026-08-28).
 *
 * 등원 절차의 **숙제 냈어요(homework_at) 뒤 · 하원(leave_at) 앞**이 자리다
 * (lib/arrivalSteps STEPS). 그래서 하원 카드 바로 위에 선다.
 *
 * 아이에게 **시험 문제처럼 보이면 안 된다.** 무엇을 적으라는 것인지
 * 한 줄로 말해주고, 예를 하나 보여준다. 길이를 요구하지 않는다 —
 * 잣대는 lib/learned 한 벌(다섯 글자)이고, 하원 단추가 같은 것을 본다.
 *
 * 저장은 **누를 때** 한다. 자동 저장으로 하면 아이가 지우다 만 글이
 * 그대로 원본이 된다.
 */
export default function LearnedBox({ saved = "", readOnly = false }) {
  const [text, setText] = useState(saved);
  const [pending, startTransition] = useTransition();
  const [ok, setOk] = useState(false);
  const router = useRouter();

  // 선생님이 대신 적어주시면(오늘 수업 화면) 이 화면도 따라 바뀐다
  useEffect(() => { setText(saved); }, [saved]);

  const enough = learnedEnough(text);
  const dirty = text.trim() !== (saved || "").trim();

  function save() {
    if (!enough) return;
    setOk(false);
    startTransition(async () => {
      const res = await saveLearned(text);
      if (res?.error) { alert(res.error); return; }
      setOk(true);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ borderLeft: "3px solid var(--amber, #e0a33e)" }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <b style={{ fontSize: 16 }}>오늘 배운 것</b>
        <span className="spacer" />
        {learnedEnough(saved) && <span className="tag tag-mint">적었어요 ✓</span>}
      </div>

      <p className="nowsub" style={{ margin: "8px 0 0" }}>
        오늘 학원에서 배운 것을 <b>한 줄</b>만 적고 가요.
      </p>
      <p className="hint" style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.7 }}>
        길게 안 써도 돼요. 「관계대명사 which 배웠다」 처럼 한 줄이면 충분해요.
        <br />
        선생님만 봐요 — 어머니께는 안 가요.
      </p>

      <textarea
        className="input"
        rows={3}
        value={text}
        disabled={readOnly || pending}
        placeholder="예) 관계대명사 which 를 배웠고, 앞말이 사람이 아닐 때 쓴다는 걸 알았다"
        onChange={(e) => { setText(e.target.value); setOk(false); }}
        style={{ marginTop: 8, width: "100%" }}
      />

      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
        <button
          className="btn btn-primary"
          disabled={readOnly || pending || !enough || (!dirty && learnedEnough(saved))}
          onClick={save}
        >
          {pending ? "저장 중…" : learnedEnough(saved) && !dirty ? "저장됨 ✓" : "적었어요"}
        </button>
        {ok && !dirty ? (
          <span className="hint" style={{ fontSize: 13 }}>저장했어요. 이제 하원할 수 있어요 👋</span>
        ) : (
          !learnedEnough(saved) && (
            <span className="hint" style={{ fontSize: 13 }}>{LEARNED_ASK}</span>
          )
        )}
      </div>
    </div>
  );
}
