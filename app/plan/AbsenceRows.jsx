"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelAbsence } from "./actions";
import { dayLabel } from "@/lib/day";
import { cleanNote } from "@/lib/note";

/**
 * **앞으로의 결석 예정 — 여기서 무른다.**
 *
 * 원장님 (2026-08-07)
 *   「보강, 결석사전연락, 출석을 출결페이지에서 관리하는게 나을거 같기도 해.
 *    보강이나 결석예정 취소가 어렵네」
 *
 * 무르는 길이 없던 것은 아니다 — 「이 기간 취소」 가 있었다. 그런데 그건
 * **학생을 다시 고르고 날짜를 다시 맞춰야** 눌리는 단추다. 이미 들어가 있는
 * 결석이 언제 누구 것인지는 화면 어디에도 없었으니, 무르려면 먼저 기억을
 * 더듬어야 했다.
 *
 * 들어가 있는 것을 그대로 늘어놓고, 그 줄에서 바로 무른다.
 *
 * **보강이 잡혀 있으면 알려준다.** 결석만 무르고 보강을 두면, 안 빠지는 날의
 * 보강이 남아 그날 「오늘 수업」 에 오지도 않을 아이가 뜬다.
 */
export default function AbsenceRows({ rows = [], nameOf = {}, makeupOn = {} }) {
  // 누르는 순간 줄이 빠진다 (원장님 2026-08-21 「버튼이 작동이 너무 늦어」) —
  // 서버 답 + router.refresh 를 기다리면 한 박자 늦다. 실패하면 되살리고 alert.
  const [gone, setGone] = useState(() => new Set());
  const [, startTransition] = useTransition();
  const router = useRouter();

  // 방금 무른 줄은 바로 뺀다
  const live = rows.filter((r) => !gone.has(`${r.student_id}|${r.date}`));

  function drop(r) {
    const who = nameOf[r.student_id] || "학생";
    const key = `${r.student_id}|${r.date}`;
    const mk = makeupOn[key];
    if (!confirm(
      `${who} ${dayLabel(r.date)} 결석 예정을 지울까요?\n\n` +
      (mk
        ? `이 결석의 보강이 ${dayLabel(mk)} 로 잡혀 있습니다. 보강은 그대로 남으니, 필요하면 「보강」 에서 따로 취소해주세요.\n\n`
        : "") +
      `어머니께 알림은 가지 않습니다.`
    )) return;
    setGone((prev) => new Set(prev).add(key));   // 먼저 뺀다 — 저장은 뒤에서
    startTransition(async () => {
      const res = await cancelAbsence(r.student_id, r.date);
      if (res?.error) {
        setGone((prev) => { const n = new Set(prev); n.delete(key); return n; });   // 실패 — 되살린다
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (live.length === 0) {
    return <p className="hint" style={{ margin: "8px 0 0" }}>앞으로 잡힌 결석 예정이 없습니다.</p>;
  }

  return (
    <div className="stack" style={{ gap: 3, marginTop: 8 }}>
      {live.map((r) => {
        const key = `${r.student_id}|${r.date}`;
        const mk = makeupOn[key];
        return (
          <div className="unitrow" key={key}>
            <b style={{ fontSize: 14, minWidth: 72 }}>{nameOf[r.student_id] || "학생"}</b>
            <span className="hint">{dayLabel(r.date)}</span>
            {r.reason && <span className="hint">· {r.reason}</span>}
            {cleanNote(r.note) && <span className="hint">· {cleanNote(r.note)}</span>}
            {mk ? (
              <span className="tag tag-mint">보강 {dayLabel(mk).replace(/\(.\)$/, "")}</span>
            ) : (
              <span className="tag tag-muted">보강 미정</span>
            )}
            <span className="spacer" />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => drop(r)}
              title="이 날 결석 예정을 지웁니다 (그날 평소대로 옵니다)"
            >
              결석 취소
            </button>
          </div>
        );
      })}
    </div>
  );
}
