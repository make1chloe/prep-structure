"use client";

import { useRouter } from "next/navigation";

// 보내는 일은 전부 이 화면 하나다. 재발송도 '다시 보내기' 탭으로 들어와 있다.
//   (전에는 재발송만 설정 메뉴에 따로 있어서, 보내다 말고 메뉴를 옮겨야 했다)
const TABS = [
  // 첫 화면 — 아직 안 보낸 것 모아보기 (2026-08-16)
  ["todo", "보낼 것"],
  ["report", "데일리리포트"],
  /**
   * **일일 바로 옆이 월간** (원장님, 2026-08-28 — 「일일과 월간을 합쳐서
   * 리포트로 만들고 아래에서 나누기」). 옛 `/monthly` 화면이 통째로 이
   * 탭으로 이사했다 (app/monthly/MonthlyScreen). 둘은 같은 일의 주기만
   * 다른 것이라, 맨 뒤에 붙이면 그 짝이 안 보인다.
   */
  ["monthly", "월간리포트"],
  // 숙제 문자는 「다시 보내기」 안에만 있었다. 처음 보낼 때도 여기로 들어와야
  // 하는데 탭이 없으니 찾을 수가 없었다 — 밖으로 꺼낸다.
  ["hw", "숙제 문자"],
  ["late", "하원 안내"],
  ["notice", "안내 문자"],
  ["resend", "다시 보내기"],
  ["test", "테스트 발송"],
];

export default function SendTabs({ tab = "todo", date }) {
  const router = useRouter();
  const go = (t) =>
    router.push(
      t === "todo" ? "/report"
      : t === "notice" ? "/report?t=notice"
      // 월간은 날짜가 아니라 **달**로 움직인다 (?m=) — 이번 달로 연다
      : t === "monthly" ? "/report?t=monthly"
      : `/report?t=${t}&d=${date}`
    );
  // 테스트는 날짜를 같이 넘긴다 — 그날 진짜 기록이 있으면 그것으로 보여준다

  return (
    <div className="row" style={{ gap: 4, marginTop: 12 }}>
      {TABS.map(([k, label]) => (
        <button
          key={k}
          className={`btn btn-sm ${tab === k ? "btn-on" : "btn-ghost"}`}
          onClick={() => go(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
