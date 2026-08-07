import { redirect } from "next/navigation";

/**
 * 「안내 문구」 는 「문구」 안으로 들어갔다 (2026-08-07).
 *
 * 주소는 살려둔다 — 즐겨찾기나 예전 화면의 링크로 들어오시면 빈 화면이
 * 아니라 옮겨간 자리로 데려다드려야 한다.
 */
export default function MovedNotesPage() {
  redirect("/settings/messages?t=screen");
}
