"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetMonthlyWarnings, skipMonthlyReset } from "./stayActions";

/**
 * 경고 월간 정리.
 *
 * 경고는 한 달 단위로 본다. 지난달 것을 계속 끌고 가면
 * 학기가 갈수록 누구나 반성문 대상이 되어 버리기 때문이다.
 *
 * 달이 바뀌고 처음 여는 날, **경고가 쌓여 있는 학생이 있을 때만** 뜬다.
 * 정리해도 기록은 지워지지 않는다 — 학생 기록에 '월간 정리' 로 남고,
 * 몇 회까지 쌓였었는지도 그대로 보인다. 다음 달 카운트만 0에서 시작한다.
 */
export default function MonthlyReset({ ym, targets = [] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (targets.length === 0) return null;

  const month = Number(ym.slice(5, 7));
  const names = targets.map((t) => t.name).join(", ");

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

  return (
    <div className="card" style={{ borderLeft: "3px solid var(--amber, #e0a33e)", marginBottom: 14 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{month}월이 시작됐습니다 — 지난달 경고를 정리할까요?</b>
        <span className="tag tag-amber">{targets.length}명</span>
      </div>
      <p className="hint" style={{ margin: "6px 0 2px" }}>
        지금 경고가 남아 있는 학생: {names}
      </p>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        정리해도 기록은 그대로 남습니다. 다음 달 경고만 0에서 다시 셉니다.
      </p>

      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                `${targets.length}명의 쌓인 경고를 0으로 되돌릴까요?\n` +
                  "학생 기록에는 '월간 정리' 로 남습니다."
              )
            )
              return;
            run(
              () => resetMonthlyWarnings(targets.map((t) => t.id), null, `${ym} 월간 정리`),
              "지난달 경고를 정리했어요."
            );
          }}
        >
          전원 정리하기
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={pending}
          title="이번 달은 그냥 두고, 다음 달에 다시 물어봅니다"
          onClick={() => run(() => skipMonthlyReset(ym), null)}
        >
          이번 달은 그냥 두기
        </button>
      </div>
    </div>
  );
}
