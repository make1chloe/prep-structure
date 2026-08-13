import { redirect } from "next/navigation";

/**
 * **옛 주소는 넘긴다** (원칙 C18 — 즐겨찾기·홈 화면 바로가기가 깨진다).
 *
 * 「관리자」 화면은 없앴다 (원장님, 2026-08-13 — 「관리자 페이지는 각각 설정,
 * 화면으로 나눠서 페이지를 아예없애」). 묶음 이름이 「관리자」가 되면서 그 안에
 * 또 「관리자」가 있으면 어느 쪽이 어느 쪽인지 헷갈렸다.
 *
 * 알맹이는 성격대로 갈라 넣었다 —
 *   표 만들기 · 노션 이관 · 홈 화면에 담기 → 설정 (`/settings`)
 *   아이콘 · 로고                          → 화면 (`/settings/screen`)
 */
export default function AdminMoved() {
  redirect("/settings");
}
