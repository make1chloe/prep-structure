"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setInquiryStatus } from "./consult/actions";
import { dayLabel } from "@/lib/day";

/**
 * 아직 진행 중인 상담 — **여기서 끝맺을 수 있게.**
 *
 * 원장님 (2026-08-07) — 「새 상담 → 신규상담 으로 고치고, 상담취소·완료가 필요해」
 *
 * 「새」 는 오늘 들어온 것처럼 들리는데 실제로는 아직 안 끝난 것이 다 뜬다.
 * 그리고 끝내는 길이 상담일지 화면에만 있어서, **한 번 통화하고 끝난 건이
 * 대시보드에 몇 주씩 남았다.** 남아 있는 것이 많으면 진짜 새 문의가 묻힌다.
 */
export default function InquiryInbox({ rows = [] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function mark(q, status, word) {
    if (!confirm(`${q.name} 상담을 ${word}로 옮길까요?`)) return;
    startTransition(async () => {
      const res = await setInquiryStatus([q.id], status);
      if (res?.error) { alert(res.error); return; }
      router.refresh();
    });
  }

  /**
   * **없으면 아예 안 그린다** (원장님, 2026-08-07 — 「대시보드는 미확인
   * 요청이 모두 보여야돼, 일종의 알림센터 기능을 포함해 화면 효율적으로」).
   *
   * 「새로 들어온 상담이 없습니다」 는 한 줄이지만 제목·테두리까지 하면
   * 카드 하나다. 그런 카드가 대여섯이면, 정작 온 것 하나를 보려고 화면을
   * 한참 내려야 한다. 없는 것은 없는 것이다.
   */
  if (rows.length === 0) return null;

  return (
    <div className="card sect sect-warn">
      <h2 className="secthead">
        신규 상담 <span className="tag tag-amber">{rows.length}</span>
      </h2>
      <div className="stack" style={{ gap: 4 }}>
          {rows.map((q) => (
            <div className="unitrow" key={q.id}>
              <Link href="/consult" style={{ textDecoration: "none" }}>
                <b style={{ fontSize: 12.5 }}>{q.name}</b>
              </Link>
              <span className="hint">{[q.school, q.grade].filter(Boolean).join(" ")}</span>
              <span className={`tag ${q.form_submitted_at ? "tag-mint" : "tag-muted"}`}>
                {q.form_submitted_at ? "양식 제출" : "양식 미제출"}
              </span>
              {q.test_want_on && <span className="hint">테스트 {dayLabel(q.test_want_on)}</span>}
              {q.visit_on && <span className="hint">· 방문 {dayLabel(q.visit_on)}</span>}
              <span className="spacer" />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => mark(q, "consulted", "상담 완료")}
                disabled={pending}
              >
                상담 완료
              </button>
              {/* **지우지 않는다** — 안 오신 분도 기록이 남아야 나중에
                  같은 분이 다시 문의하셨을 때 이어서 이야기할 수 있다 */}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => mark(q, "declined", "미등록")}
                disabled={pending}
                title="기록은 상담일지에 그대로 남습니다"
              >
                상담 취소
              </button>
            </div>
        ))}
      </div>
    </div>
  );
}
