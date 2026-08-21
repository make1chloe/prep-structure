"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useBulk, BulkBar } from "@/components/Bulk";
import { skipSend, dismissSendFails } from "@/app/report/actions";
import { dayLabel } from "@/lib/day";

/**
 * 안 나간 문자 — 골라서 한 번에 치운다.
 *
 * 왜 필요한가
 *   써두고 안 보낸 것이 114건까지 쌓여 있었다. 대부분은 지금 와서 보낼 것이
 *   아니다 (그날이 지났다). 그런데 목록에 남아 있으니 **오늘 진짜 보내야 할
 *   한 건**이 그 안에 묻힌다.
 *
 * 「지우기」가 아니라 「안 보내기」다
 *   리포트를 지우면 그날 수업 기록 — 숙제 검사 결과, 낸 것 — 이 통째로 사라진다.
 *   여기서 하는 것은 **안 보내기로 정했다고 적어두는 것**이다. 기록은 남고
 *   목록에서만 빠진다. 나중에 "왜 안 갔지" 할 때 답이 남아 있어야 한다.
 */
export default function UnsentBox({ fails = [], past = [] }) {
  // 누르는 순간 고른 줄이 빠진다 (원장님 2026-08-21 「버튼이 작동이 너무 늦어」)
  // — 서버 답 + router.refresh 를 기다리면 한 박자 늦다. 실패한 몫만 되살리고 alert.
  const [gone, setGone] = useState(() => new Set());
  const rows = [
    ...fails.map((s) => ({ ...s, _t: "fail", _id: `f:${s.id}` })),
    ...past.map((r) => ({ ...r, _t: "past", _id: `p:${r.id}` })),
  ].filter((r) => !gone.has(r._id));
  const bulk = useBulk(rows, "_id");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (rows.length === 0) return null;

  function clear() {
    const picked = bulk.ids;
    const failIds = picked.filter((k) => k.startsWith("f:")).map((k) => k.slice(2));
    const repIds = picked.filter((k) => k.startsWith("p:")).map((k) => k.slice(2));
    const parts = [
      repIds.length ? `써두고 안 보낸 것 ${repIds.length}건 — 안 보내기로 적어둡니다` : null,
      failIds.length ? `실패 기록 ${failIds.length}건 — 목록에서 치웁니다` : null,
    ].filter(Boolean);
    if (!confirm(`${parts.join("\n")}\n\n수업 기록은 그대로 남습니다. 정리할까요?`)) return;

    // 먼저 치운다 — 저장은 뒤에서. 마지막 것까지 치우면 박스째 사라진다
    setGone((prev) => new Set([...prev, ...picked]));
    bulk.clear();
    startTransition(async () => {
      const revive = (keys) =>
        setGone((prev) => { const n = new Set(prev); keys.forEach((k) => n.delete(k)); return n; });
      if (repIds.length) {
        const r = await skipSend(repIds, "report", true);
        if (r?.error) {
          revive(repIds.map((id) => `p:${id}`));   // 실패한 몫만 되살린다
          alert(r.error);
        }
      }
      if (failIds.length) {
        const r = await dismissSendFails(failIds);
        if (r?.error) {
          revive(failIds.map((id) => `f:${id}`));
          alert(r.error);
        }
      }
      router.refresh();
    });
  }

  return (
    <div className="card sect sect-bad">
      <h2 className="secthead">
        안 나간 문자 <span className="tag tag-red">{rows.length}</span>
      </h2>

      <BulkBar bulk={bulk} label="문자" style={{ padding: "2px 0 6px" }}>
        <button className="btn btn-sm" onClick={clear} disabled={pending}>
          {pending ? "정리 중…" : "안 보내기로 정리"}
        </button>
      </BulkBar>

      <div className="stack" style={{ gap: 3 }}>
        {rows.map((r) => (
          <div className="unitrow" key={r._id}>
            <input
              type="checkbox"
              checked={bulk.has(r._id)}
              onChange={() => bulk.toggle(r._id)}
            />
            {r._t === "fail" ? (
              <>
                <span className="tag tag-red">실패</span>
                <b style={{ fontSize: 14 }}>{r.name}</b>
                <span className="hint">{r.detail || r.kind}</span>
                <span className="spacer" />
                <Link
                  className="hint"
                  style={{ fontSize: 12.5, textDecoration: "none" }}
                  href={`/report?t=resend${r.date ? `&d=${r.date}` : ""}`}
                >
                  다시 보내기 ›
                </Link>
              </>
            ) : (
              <>
                <span className="tag tag-amber">미발송</span>
                <span className="hint" style={{ minWidth: 62 }}>{dayLabel(r.date)}</span>
                <b style={{ fontSize: 14 }}>{r.name}</b>
                <span className="hint">써두고 안 보냄</span>
                <span className="spacer" />
                <Link
                  className="hint"
                  style={{ fontSize: 12.5, textDecoration: "none" }}
                  href={`/report?d=${r.date}`}
                >
                  보내기 ›
                </Link>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
