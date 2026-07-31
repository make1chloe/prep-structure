"use client";

import { useRouter } from "next/navigation";

// 보내는 일은 전부 이 화면 하나다. 재발송도 '다시 보내기' 탭으로 들어와 있다.
//   (전에는 재발송만 설정 메뉴에 따로 있어서, 보내다 말고 메뉴를 옮겨야 했다)
const TABS = [
  ["report", "데일리리포트"],
  ["late", "하원 안내"],
  ["notice", "안내 문자"],
  ["resend", "다시 보내기"],
];

export default function SendTabs({ tab = "report", date }) {
  const router = useRouter();
  const go = (t) =>
    router.push(t === "notice" ? "/report?t=notice" : `/report?t=${t}&d=${date}`);

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
