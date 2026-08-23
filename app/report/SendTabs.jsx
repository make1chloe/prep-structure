"use client";

import { useRouter } from "next/navigation";

// 보내는 일은 전부 이 화면 하나다. 재발송도 '다시 보내기' 탭으로 들어와 있다.
//   (전에는 재발송만 설정 메뉴에 따로 있어서, 보내다 말고 메뉴를 옮겨야 했다)
const TABS = [
  // 첫 화면 — 아직 안 보낸 것 모아보기 (2026-08-16)
  ["todo", "보낼 것"],
  ["report", "데일리리포트"],
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
