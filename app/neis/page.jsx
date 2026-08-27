import { redirect } from "next/navigation";

/**
 * 나이스 원본은 「학교 · 시험」 화면 안 접힘 상자로 이사했다
 * (원장님 확정, 2026-08-27). 화면이 없어진 게 아니다 — 8/9 확정
 * (「장기적으로도 이 페이지는 필요해 보여」)은 기능 존치로 지켜진다.
 * 옛 주소·즐겨찾기·홈 화면 바로가기가 안 깨지게 여기서 넘긴다.
 * (NeisPeek · PeekCalendar 는 이 폴더에 그대로 산다 — app/todo 와 같은 관례)
 */
export default function NeisPage() {
  redirect("/schools");
}
