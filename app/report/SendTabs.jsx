"use client";

import { useRouter } from "next/navigation";

// 보내는 일은 전부 이 화면 하나다. 재발송도 '다시 보내기' 탭으로 들어와 있다.
//   (전에는 재발송만 설정 메뉴에 따로 있어서, 보내다 말고 메뉴를 옮겨야 했다)
const TABS = [
  ["report", "데일리리포트"],
  ["late", "하원 안내"],
  ["notice", "안내 문자"],
  ["resend", "다시 보내기"],
  ["test", "테스트 발송"],
];

export default function SendTabs({ tab = "report", date }) {
  const router = useRouter();
  const go = (t) =>
    router.push(t === "notice" ? "/report?t=notice" : `/report?t=${t}&d=${date}`);
  // 테스트는 날짜를 같이 넘긴다 — 그날 진짜 기록이 있으면 그것으로 보여준다

  return (
    <div className="row" style={{ gap: 4, marginTop: 12 }}>
      {TABS.map(([k, label]) => (
        <button
          key={k}
          className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-ghost"}`}
          onClick={() => go(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
