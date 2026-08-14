/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    /**
     * **한 번 갔던 화면은 30초 안에는 즉시 뜬다** (원장님, 2026-08-14 —
     * 「메뉴 바뀔때 로딩 길어」. 속도 대원칙 — 원칙 6).
     *
     * 이 앱 화면은 전부 dynamic 이라, 기본값으로는 메뉴를 오갈 때마다
     * — 방금 봤던 화면으로 돌아갈 때조차 — 서버 렌더를 통째로 다시
     * 기다린다. 오늘 ↔ 재원생 ↔ 달력을 오가는 것이 수업 중 동선인데
     * 그때마다 처음 여는 값이었다.
     *
     * 30초는 배지 메모(20초)와 같은 급의 신선도다. 저장(서버 액션)은
     * revalidatePath 가 이 캐시를 바로 깨므로, 내가 방금 고친 것이
     * 안 보이는 일은 없다 — 낡을 수 있는 건 남이 그 사이 고친 것뿐이다.
     */
    staleTimes: { dynamic: 30 },
  },
  // /settings/sql 에서 SQL 파일을 그대로 읽어 보여준다.
  // 기본 추적에는 .sql 이 안 잡히므로 명시해 둔다.
  outputFileTracingIncludes: {
    "/settings/sql": ["./supabase/SETUP_ALL.sql", "./supabase/migrations/*.sql"],
  },
};
export default nextConfig;
