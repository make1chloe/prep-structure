"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markNoticesRead } from "@/app/me/noticeReadActions";

/**
 * **더 안 보기** (0129, 원장님 2026-08-16 — 「공지는 확인 누르면 더
 * 보이지 않게」 + 「기억이 안 날 때 다시 봐야 하니 이름은 더 안 보기로」).
 *
 * 길목의 「확인했어요」 는 통과일 뿐이라 공지가 목록에 남는다 — 다시
 * 볼 수 있어야 하니까. 이 단추를 눌러야 그 공지가 이 학생(집)에게서
 * 영영 사라진다. 원장님이 공지를 고치면(재공지) 다시 보인다.
 */
export default function NoticeDismiss({ studentId, noticeId, stamp }) {
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (gone) return null;
  return (
    <button
      className="btn btn-ghost btn-sm"
      style={{ padding: "1px 7px", fontSize: 12 }}
      disabled={pending}
      title="이 공지를 다시 보지 않습니다 (공지가 고쳐지면 다시 보여요)"
      onClick={() =>
        startTransition(async () => {
          await markNoticesRead(studentId, [{ id: noticeId, stamp }]).catch(() => {});
          setGone(true);
          router.refresh();
        })
      }
    >
      더 안 보기
    </button>
  );
}
