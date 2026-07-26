"use client";

import { useState } from "react";

// 누구에게나 보낼 수 있는 공통 신청 양식 링크
export default function ApplyLink() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/apply`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("이 링크를 복사해서 보내주세요", url);
    }
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={copy} title="학부모가 직접 작성하는 신청 양식">
      {copied ? "링크 복사됨 ✓" : "🔗 신청 양식 링크 복사"}
    </button>
  );
}
