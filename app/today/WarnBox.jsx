"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { waiveWarning, settleWarnings } from "./stayActions";

/**
 * 경고 상태 한 학생 분.
 *
 * 경고는 저장돼 있지 않고 지난 리포트에서 계산된 것이다.
 * 여기서 하는 일은 **판단을 남기는 것**뿐이다.
 *   · 이 날은 빼주기   → 그날 경고를 없던 것으로
 *   · 반성문 씀        → 정산하고 새로 센다
 *   · 이번엔 넘어가기  → 정산은 하되 '유예' 로 기록에 남는다
 */
export default function WarnBox({ studentId, warn, date }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn, msg) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (msg) alert(msg);
      router.refresh();
    });
  }

  if (!warn || warn.count === 0) {
    return <span className="hint">쌓인 경고가 없습니다.</span>;
  }

  const at = warn.rule?.reflectionAt || 3;
  const today = date; // 화면에 열어둔 날짜 (서버가 한국 기준으로 준 값)

  return (
    <div style={{ flex: 1 }}>
      <div className="row" style={{ gap: 6, alignItems: "center", marginBottom: 6 }}>
        <span className={`tag ${warn.need ? "tag-red" : "tag-amber"}`}>
          경고 {warn.count} / {at}
        </span>
        {warn.need && <b style={{ fontSize: 14.5 }}>반성문 대상입니다</b>}
        {warn.deferred && (
          <span className="tag tag-muted" title="지난번에 한 번 봐줬습니다">
            지난번 유예함
          </span>
        )}
      </div>

      <div className="stack" style={{ gap: 3, marginBottom: 8 }}>
        {warn.list.map((w) => (
          <div className="unitrow" key={w.date}>
            <span className="hint" style={{ minWidth: 52 }}>
              {w.date.slice(5).replace("-", "/")}
            </span>
            <span style={{ fontSize: 14, flex: 1 }}>{w.reasons.join(", ")}</span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              title="사정이 있었으면 이 날 경고를 빼줍니다"
              onClick={() => {
                const note = prompt(`${w.date} 경고를 빼는 이유 (선택)`);
                if (note === null) return;
                run(() => waiveWarning(studentId, w.date, note), "이 날 경고를 뺐어요.");
              }}
            >
              빼주기
            </button>
          </div>
        ))}
      </div>

      {warn.need && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("반성문을 쓴 것으로 기록할까요?\n경고가 0으로 돌아갑니다.")) return;
              run(
                () => settleWarnings(studentId, "reflection", today, null),
                "반성문 씀으로 기록했어요."
              );
            }}
          >
            반성문 씀
          </button>
          <button
            className="btn btn-sm"
            disabled={pending}
            title="이번엔 봐주고 넘어갑니다. 봐준 이력이 남습니다"
            onClick={() => {
              const note = prompt("이번엔 넘어가는 이유 (선택)");
              if (note === null) return;
              run(
                () => settleWarnings(studentId, "defer", today, note),
                "유예했어요. 경고는 0으로 돌아가고 기록에 남습니다."
              );
            }}
          >
            이번엔 넘어가기 (유예)
          </button>
        </div>
      )}
    </div>
  );
}
