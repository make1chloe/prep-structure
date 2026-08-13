"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { settleWarnings } from "./today/stayActions";

/**
 * 반성문 문턱에 닿은 아이들 — **여기서 바로 정리한다.**
 *
 * 원장님 (2026-08-07) — 「반성문 대상 유예/초기화 버튼 필요해」
 *
 * 지금까지는 「오늘 수업 화면에서 정합니다」 라고만 적혀 있었다. 그런데
 * 그 아이가 오늘 수업이 없으면 그 화면에 뜨지도 않아서, **넘어가기로
 * 마음먹은 아이가 대시보드에 계속 빨갛게 남았다.** 빨간 것이 치워지지
 * 않으면 다음에 진짜 빨간 것이 와도 눈에 안 들어온다.
 *
 * 셋 다 경고를 **0으로 되돌리는 것은 같다.** 다른 것은 기록에 뭐라고
 * 남는가뿐이다 (lib/warnings.js).
 *   · 반성문 씀 — 썼으니 털어낸다
 *   · 유예     — 이번엔 넘어간다. 봐준 이력이 남아 다음 판단에 쓰인다
 *   · 초기화   — 지난 것을 이번 달로 끌고 오지 않는다
 */
export default function WarningInbox({ rows = [] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function settle(w, kind, word) {
    if (!confirm(`${w.name} 학생의 경고 ${w.count}회를 ${word}할까요?`)) return;
    startTransition(async () => {
      const res = await settleWarnings(w.id, kind);
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="card sect sect-bad">
      <h2 className="secthead">
        반성문 대상 <span className="tag tag-red">{rows.length}</span>
      </h2>
      <div className="stack" style={{ gap: 4 }}>
        {rows.map((w) => (
          <div className="unitrow" key={w.id}>
            <Link href="/today" style={{ textDecoration: "none" }}>
              <b style={{ fontSize: 14 }}>{w.name}</b>
            </Link>
            <span className="tag tag-red">경고 {w.count}회</span>
            <span className="hint">
              {w.list.slice(-2).map((x) => x.reasons.join(" · ")).join(" / ")}
            </span>
            <span className="spacer" />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => settle(w, "reflection", "반성문 씀으로 정리")}
              disabled={pending}
            >
              반성문 씀
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => settle(w, "defer", "유예")}
              disabled={pending}
              title="이번엔 넘어갑니다 (봐준 이력은 남습니다)"
            >
              유예
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => settle(w, "reset", "초기화")}
              disabled={pending}
              title="쌓인 경고를 0으로 되돌립니다"
            >
              초기화
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
