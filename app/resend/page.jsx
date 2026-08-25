import { redirect } from "next/navigation";

// 재발송은 발송 화면의 '다시 보내기' 탭으로 합쳤다.
// 옛 주소·즐겨찾기가 안 깨지게 여기서 넘긴다 (보던 날짜도 그대로 들고 간다).
export default async function ResendPage(props) {
  const searchParams = await props.searchParams;
  const d = searchParams?.d;
  redirect(d ? `/report?t=resend&d=${d}` : "/report?t=resend");
}
