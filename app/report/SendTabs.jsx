"use client";

import { useRouter } from "next/navigation";

export default function SendTabs({ tab = "report", date }) {
  const router = useRouter();
  const go = (t) =>
    router.push(t === "notice" ? `/report?t=notice` : `/report?d=${date}`);

  return (
    <div className="row" style={{ gap: 4, marginTop: 12 }}>
      {[
        ["report", "데일리리포트"],
        ["notice", "안내 문자"],
      ].map(([k, label]) => (
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
