/** @type {import('next').NextConfig} */
const nextConfig = {
  // /settings/sql 에서 SQL 파일을 그대로 읽어 보여준다.
  // 기본 추적에는 .sql 이 안 잡히므로 명시해 둔다.
  outputFileTracingIncludes: {
    "/settings/sql": ["./supabase/SETUP_ALL.sql", "./supabase/migrations/*.sql"],
  },
};
export default nextConfig;
