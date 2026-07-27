"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStay, setStayStatus, deleteStay } from "./stayActions";
import { STAY_LABEL } from "@/lib/reportText";

const NEXT = {
  done: { label: "다 함", cls: "tag-mint" },
  moved: { label: "숙제로 넘김", cls: "tag-amber" },
  skipped: { label: "오늘은 넘어감", cls: "tag-muted" },
};

/**
 * 늦귀가 과제 한 학생 분.
 *
 * 숙제를 △·✕ 로 찍으면 **자동으로 여기 올라온다.**
 * 남아서 하다가 다 못 하면 `숙제로 넘기기`, 오늘은 됐다 싶으면 `넘어가기`.
 *   · 다 함        → 리포트에 "마치고 하원" 으로 나감
 *   · 숙제로 넘김  → 숙제 문자에 함께 나감
 *   · 넘어감       → 아무 문자에도 안 나감 (기록만)
 */
export default function StayBox({ studentId, date, rows = [], suggestions = [] }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  // 이미 올라온 것과 겹치지 않는 제안만
  const have = new Set(rows.map((r) => r.body));
  const fresh = suggestions.filter((s) => !have.has(s.body));

  return (
    <div style={{ flex: 1 }}>
      {rows.length === 0 && fresh.length === 0 && (
        <p className="hint" style={{ margin: "0 0 6px" }}>
          남아서 채우고 갈 것이 있으면 적어주세요. 숙제를 △·✕ 로 찍으면 여기 자동으로 올라옵니다.
        </p>
      )}

      {/* 미흡·미제출에서 온 제안 */}
      {fresh.length > 0 && (
        <div className="stack" style={{ gap: 4, marginBottom: 8 }}>
          {fresh.map((s) => (
            <div className="unitrow" key={s.body}>
              <span className="tag tag-amber">{s.why}</span>
              <span style={{ fontSize: 12.5, flex: 1 }}>{s.body}</span>
              <button
                className="btn btn-primary btn-sm"
                disabled={pending}
                onClick={() => run(() => addStay(studentId, date, s.body, s.itemId, true))}
              >
                ＋ {STAY_LABEL}로
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 올라온 것 */}
      {rows.length > 0 && (
        <div className="stack" style={{ gap: 4, marginBottom: 8 }}>
          {rows.map((t) => {
            const settled = t.status !== "todo";
            return (
              <div
                className="unitrow"
                key={t.id}
                style={settled ? { opacity: 0.55 } : undefined}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: settled ? 500 : 700,
                    flex: 1,
                    textDecoration: t.status === "done" ? "line-through" : "none",
                  }}
                >
                  {t.body}
                </span>
                {settled ? (
                  <>
                    <span className={`tag ${NEXT[t.status].cls}`}>{NEXT[t.status].label}</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() => run(() => setStayStatus(t.id, "todo"))}
                    >
                      되돌리기
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={pending}
                      onClick={() => run(() => setStayStatus(t.id, "done"))}
                    >
                      다 함
                    </button>
                    <button
                      className="btn btn-sm"
                      disabled={pending}
                      title="다 못 끝냈어요. 숙제 문자에 함께 나갑니다"
                      onClick={() => run(() => setStayStatus(t.id, "moved"))}
                    >
                      숙제로
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      title="오늘은 그냥 보냅니다. 문자에는 안 나갑니다"
                      onClick={() => run(() => setStayStatus(t.id, "skipped"))}
                    >
                      넘어가기
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() => run(() => deleteStay(t.id))}
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 직접 추가 */}
      <div className="row" style={{ gap: 6 }}>
        <input
          className="input input-sm"
          style={{ flex: 1, minWidth: 150 }}
          placeholder={`남아서 할 것 (예: 오늘 단어 30개 다시 외우기)`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          className="btn btn-sm"
          disabled={pending || !body.trim()}
          onClick={() =>
            run(async () => {
              const r = await addStay(studentId, date, body, null, false);
              if (!r?.error) setBody("");
              return r;
            })
          }
        >
          추가
        </button>
      </div>
    </div>
  );
}
