"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { consultText, studentText } from "@/lib/consultText";
import { setScoreShare } from "./shareActions";

/**
 * **성적 공개 대상 + 상담 문구** (원장님, 2026-08-06).
 *
 * 다른 학원 화면에서 취한 두 가지다 — 「성장 공개 대상」 과 「상담 문구 복사」.
 * 나머지(그래프 모양·색)는 우리 화면에 이미 있는 것으로 충분해서 안 가져왔다.
 *
 * **공개 대상을 리포트 맨 위에 둔 까닭.** 설정 화면 안에 숨겨두면 「이 아이
 * 것은 어머니께 보이나」 를 확인하러 갔다 와야 한다. 리포트를 보면서
 * 그 자리에서 정하시는 것이라 여기 있어야 한다.
 *
 * **글은 두 가지다.** 어머니께 드리는 글과 아이에게 주는 글은 말투도 담는
 * 내용도 다르다. 하나로 만들면 둘 다 어정쩡해진다.
 */

const SHARE = [
  { key: "none", label: "비공개", hint: "선생님만" },
  { key: "student", label: "학생만", hint: "아이 화면에만" },
  { key: "parent", label: "학부모만", hint: "어머니 화면에만" },
  { key: "both", label: "둘 다", hint: "아이·어머니 모두" },
];

export default function ShareBar({ studentId, name, share = "both", st, notes = [], kindLabel, blocked = false }) {
  const [cur, setCur] = useState(share || "both");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function pick(key) {
    if (key === cur) return;
    const before = cur;
    setCur(key);
    setMsg("");
    start(async () => {
      const r = await setScoreShare(studentId, key);
      if (r?.error) { setCur(before); setMsg(`❌ ${r.error}`); return; }
      router.refresh();
    });
  }

  async function copy(kind) {
    const text = kind === "student"
      ? studentText(st, name, notes)
      : consultText(st, name, notes, { kindLabel });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      // 클립보드가 막힌 브라우저 — 글을 띄워서 손으로 고르시게 한다.
      // 「복사 실패」 만 뜨면 할 수 있는 것이 없다
      window.prompt("복사해서 쓰세요 (Ctrl+C)", text);
    }
  }

  const meta = SHARE.find((s) => s.key === cur) || SHARE[3];

  return (
    <div className="stack" style={{ gap: 8, marginTop: 12 }}>
      <div
        className="card card-tight"
        style={{ background: cur === "none" ? "var(--surface-2)" : "var(--mint-soft)" }}
      >
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 14.5 }}>성적 공개 대상</b>
          <span className="hint" style={{ fontSize: 12.5 }}>
            {cur === "none"
              ? "지금은 아무에게도 안 보입니다 — 선생님만 봅니다."
              : `지금은 ${meta.hint} 보입니다.`}
          </span>
          <span className="spacer" />
          <div className="row" style={{ gap: 3 }}>
            {SHARE.map((s) => (
              <button
                key={s.key}
                className={`btn btn-sm ${cur === s.key ? "btn-primary" : "btn-ghost"}`}
                disabled={pending || blocked}
                onClick={() => pick(s.key)}
                title={s.hint}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {blocked && (
          <p className="hint" style={{ margin: "6px 0 0" }}>
            0101 SQL 을 먼저 실행해주세요 — 그때까지는 지금처럼 <b>학생·학부모 모두</b>에게 보입니다.
          </p>
        )}
        {msg && <p className="hint" style={{ margin: "6px 0 0" }}>{msg}</p>}
        {!blocked && cur !== "both" && (
          <p className="hint" style={{ margin: "6px 0 0" }}>
            감춘 것은 화면에서만이 아니라 <b>자료째로 막힙니다.</b>{" "}
            다만 <b>아이가 스스로 낸 것은 늘 자기에게 보입니다</b> — 안 그러면
            방금 적어 낸 것이 사라져서 또 적게 됩니다.
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => copy("parent")}>
          {copied === "parent" ? "✓ 복사했어요" : "상담 문구 복사"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => copy("student")}>
          {copied === "student" ? "✓ 복사했어요" : "아이에게 줄 글 복사"}
        </button>
        <span className="hint" style={{ fontSize: 12.5 }}>
          숫자는 그대로 옮겨 적습니다 — 아이 얘기는 붙여서 쓰세요.
        </span>
      </div>
    </div>
  );
}
