import { redirect } from "next/navigation";

// 할일은 일정과 같은 테이블(tasks)이다. 화면도 하나로 합쳤다.
// 옛 주소·즐겨찾기·홈 화면 바로가기가 안 깨지게 여기서 넘긴다.
export default function TodoPage() {
  redirect("/tasks?view=todo");
}
