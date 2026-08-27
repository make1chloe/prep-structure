import { redirect } from "next/navigation";

/**
 * 월간리포트는 「리포트」 화면의 탭으로 이사했다 (원장님 확정, 2026-08-28 —
 * 「일일과 월간을 합쳐서 리포트로 만들고 아래에서 나누기」).
 * 화면은 그대로다 (이 폴더의 MonthlyScreen) — 사는 주소만 옮겼다.
 * 옛 주소·즐겨찾기·홈 화면 바로가기가 안 깨지게 여기서 넘긴다
 * (보던 달도 그대로 들고 간다 — app/resend 관례).
 */
export default async function MonthlyPage(props) {
  const searchParams = await props.searchParams;
  const m = searchParams?.m;
  redirect(m ? `/report?t=monthly&m=${m}` : "/report?t=monthly");
}
