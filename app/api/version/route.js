/**
 * 지금 돌고 있는 앱이 **몇 번째 것인가.**
 *
 * 원장님 (2026-08-06) — 「홈화면 저장하고 나서 새로고침 방법이 없어」
 *
 * 홈 화면에 담은 앱에는 주소창이 없다. 주소창이 없으면 새로고침 단추도 없다.
 * 그래서 새로 배포해도 원장님 폰은 어제 것을 붙들고 있고, 「고쳤습니다」 라고
 * 말씀드려도 화면은 그대로다. 실제로 그것 때문에 SQL 0089 가 목록에 안 떴다.
 *
 * 그래서 앱이 **스스로 알아채게** 한다. 앱이 열릴 때·다시 앞으로 나올 때
 * 여기에 물어보고, 처음 받은 값과 다르면 「새 버전이 있어요」 를 띄운다.
 *
 * 값이 무엇인지는 중요하지 않다 — **바뀌었는지만** 보면 된다.
 * 그래서 커밋 해시를 앞 열두 자만 잘라 쓴다 (전부 흘릴 이유가 없다).
 */
export const dynamic = "force-dynamic";

export function GET() {
  const raw =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    // 내 컴퓨터에서 돌릴 때는 배포 번호가 없다. 그때는 늘 같은 값이라
    // 「새 버전」 이 안 뜬다 — 그게 맞다
    "dev";

  return Response.json(
    { version: `${raw}`.slice(0, 12) },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
