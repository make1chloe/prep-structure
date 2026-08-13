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

// 줄 생김새를 한 곳에서 맞춘다 — 제안이든 올라온 것이든 같은 자리에 같은 것이 온다
//   [태그]  내용 ..............  [단추들]
function Row({ tag, cls, body, dim, strike, children }) {
  return (
    <div className="unitrow" style={dim ? { opacity: 0.55 } : undefined}>
      <span className={`tag ${cls}`} style={{ minWidth: 58, textAlign: "center" }}>
        {tag}
      </span>
      <span
        style={{
          fontSize: 14.5,
          flex: 1,
          textDecoration: strike ? "line-through" : "none",
        }}
      >
        {body}
      </span>
      {children}
    </div>
  );
}

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

  // 이미 올라온 것과 겹치지 않는 제안만.
  // '삭제' 한 것도 자국이 남아 있으므로 여기서 다시 제안되면 안 된다.
  const have = new Set(rows.map((r) => r.body));
  const fresh = suggestions.filter((s) => !have.has(s.body));
  // 뺀 것은 목록에도 안 보인다 (문자에도 안 나간다)
  const live = rows.filter((t) => t.status !== "dropped");

  return (
    <div style={{ flex: 1 }}>
      {live.length === 0 && fresh.length === 0 && (
        <p className="hint" style={{ margin: "0 0 6px" }}>
          남아서 채우고 갈 것이 있으면 적어주세요. 숙제를 △·✕ 로 찍으면 여기 자동으로 올라옵니다.
        </p>
      )}

      {/* 미흡·미제출에서 온 제안 */}
      {fresh.length > 0 && (
        <div className="stack" style={{ gap: 4, marginBottom: 8 }}>
          {/* 제안은 대부분 '올렸다가 다시 누르는' 두 번이 필요 없다.
              여기서 바로 정한다 — 남길지 · 숙제로 넘길지 · 넘어갈지 · 아예 뺄지 */}
          {fresh.map((s) => (
            <Row key={s.body} tag={s.why} cls="tag-amber" body={s.body}>
              <button
                className="btn btn-primary btn-sm"
                disabled={pending}
                title="남아서 하고 갑니다"
                onClick={() => run(() => addStay(studentId, date, s.body, s.itemId, true))}
              >
                남김
              </button>
              <button
                className="btn btn-sm"
                disabled={pending}
                title="집에서 해옵니다. 숙제 문자에 함께 나갑니다"
                onClick={() => run(() => addStay(studentId, date, s.body, s.itemId, true, "moved"))}
              >
                숙제로
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                title="오늘은 그냥 보냅니다. 문자에는 안 나갑니다 (기록은 남습니다)"
                onClick={() => run(() => addStay(studentId, date, s.body, s.itemId, true, "skipped"))}
              >
                넘어가기
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                title="이건 남길 것이 아닙니다. 목록에서 뺍니다"
                onClick={() => run(() => addStay(studentId, date, s.body, s.itemId, true, "dropped"))}
              >
                삭제
              </button>
            </Row>
          ))}
        </div>
      )}

      {/* 올라온 것 */}
      {live.length > 0 && (
        <div className="stack" style={{ gap: 4, marginBottom: 8 }}>
          {live.map((t) => {
            const settled = t.status !== "todo";
            return (
              <Row
                key={t.id}
                tag={settled ? NEXT[t.status].label : "남을 것"}
                cls={settled ? NEXT[t.status].cls : "tag-sky"}
                body={t.body}
                dim={settled}
                strike={t.status === "done"}
              >
                {settled ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() => run(() => setStayStatus(t.id, "todo"))}
                  >
                    되돌리기
                  </button>
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
                      title={t.auto ? "목록에서 뺍니다 (다시 제안되지 않습니다)" : undefined}
                      onClick={() =>
                        // 자동으로 올라온 것은 지우면 △·✕ 자국에서 **다시 제안된다.**
                        // 그래서 지우지 않고 '뺀 것' 으로 둔다.
                        run(() => (t.auto ? setStayStatus(t.id, "dropped") : deleteStay(t.id)))
                      }
                    >
                      삭제
                    </button>
                  </>
                )}
              </Row>
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
