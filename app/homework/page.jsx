import { redirect } from "next/navigation";

/**
 * 학습 항목은 「교재」 화면의 탭으로 이사했다 (원장님 확정, 2026-08-27).
 * 화면은 그대로다 (이 폴더의 ItemsScreen) — 사는 주소만 옮겼다.
 * 옛 주소·즐겨찾기·홈 화면 바로가기가 안 깨지게 여기서 넘긴다 (app/todo 관례).
 */
export default function HomeworkPage() {
  redirect("/textbooks?view=items");
}
