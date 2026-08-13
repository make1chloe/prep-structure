"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearTryout } from "./tryoutActions";

/**
 * 체험 모드 띠.
 *
 * 여기서 누른 것은 **진짜로 기록된다.** 가짜로 기록하면 시험이 되지 않는다 —
 * 오늘 수업 화면에 대기줄이 뜨는지, 타이머가 도는지를 봐야 하니까.
 *
 * 그래서 두 가지를 분명히 한다.
 *   1) 지금 누르는 것이 진짜라는 걸 눈에 띄게 알린다
 *   2) 그 자리에서 지울 수 있게 한다 (안 그러면 그 학생 기록에 섞인다)
 */
export default function TryoutBar({ studentId, name }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div
      className="card card-tight"
      style={{ borderLeft: "3px solid var(--amber, #e0a33e)", background: "var(--surface-2)" }}
    >
      <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>체험 모드 · {name}</b>
        <span className="spacer" />
        <a className="btn btn-ghost btn-sm" href={`/me?s=${studentId}`}>
          보기만 하기
        </a>
        <button
          className="btn btn-ghost btn-sm"
          disabled={pending}
          title="오늘 이 학생의 타이머·등원 체크·학습완료를 지웁니다"
          onClick={() => {
            if (!confirm(`${name} 학생의 오늘 타이머·등원 체크·학습완료 기록을 지울까요?`)) return;
            startTransition(async () => {
              const res = await clearTryout(studentId);
              if (res?.error) alert(res.error);
              router.refresh();
            });
          }}
        >
          체험 기록 지우기
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        선생님 계정 그대로 <b>{name}</b> 학생인 척 누르고 있습니다. 누른 것은{" "}
        <b>진짜로 기록됩니다</b> — 오늘 수업 화면에 그대로 뜹니다. 다 해보셨으면{" "}
        <b>체험 기록 지우기</b>를 눌러주세요.
      </p>
    </div>
  );
}
