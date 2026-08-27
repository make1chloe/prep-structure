"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/env";
import { CHECKS } from "@/lib/sqlChecks";
import { primeSqlBadge } from "@/lib/sqlBadge";

/**
 * DB 에 어디까지 들어갔는지 실제로 찔러본다.
 *
 * "SQL 을 돌렸는데 화면이 그대로다" 를 혼자 확인할 수 있어야 한다.
 * 표/칸이 있는지만 보면 되므로 한 줄도 안 읽고 limit 0 으로 물어본다.
 *
 * 확인하는 방법이 세 가지다.
 *   table + col   그 칸이 있나 (대부분)
 *   rpc           그 함수가 있나 (저장소 권한처럼 표가 아닌 것)
 *   anonTable     **로그인 없이도 읽히나** (GRANT 만 주는 SQL)
 *
 * **rpc 는 「불렸나」 가 아니라 「무엇이라 답했나」 까지 본다** (2026-08-27).
 * 처음에는 오류만 봤다 — 함수가 있으면 초록이었다. 그런데 표식 함수 중에는
 * 진짜로 물어보는 것들이 있다 (holidays_visible · parent_reads_reports ·
 * role_locked_on). 그것들이 **거짓**을 돌려주는 것은 「그 SQL 이 아직 안
 * 들어갔다」 는 뜻인데, 오류가 아니니 초록으로 보였다. 역할 자물쇠에서는
 * 이게 치명적이다 — 트리거를 지워도 화면은 「걸려 있습니다」 라고 한다.
 * 그래서 `false` 는 「안 됨」 으로 센다. 상수 `select true` 표식들은
 * 그대로 초록이라 달라지는 것이 없다.
 *
 * 세 번째가 없어서 0081(아이콘 읽기 권한)이 「넣을 것이 없음」 으로 보였다.
 * 표도 칸도 이미 있으니 검사를 통과해버렸고, 그래서 실행되지 않았다.
 * **확인할 방법이 없는 SQL 은 없는 것과 같다.**
 *
 * 목록(CHECKS)은 lib/sqlChecks 한 곳에 있다 — 메뉴 배지(lib/sqlBadge)도
 * 같은 목록을 본다. 새 SQL 을 만들면 거기에 적는다.
 */

export async function checkSchema() {
  const supabase = await createClient();
  // 로그인 없이 읽히는지 보려면 **로그인 안 한 손님**으로 물어봐야 한다
  const anon = createAnonClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const out = [];
  for (const c of CHECKS) {
    const { data, error } = c.rpc
      ? await supabase.rpc(c.rpc)
      : c.anonTable
      ? await anon.from(c.anonTable).select(c.col).limit(1)
      : await supabase.from(c.table).select(c.col).limit(1);
    out.push({
      ...c,
      ok: !error && data !== false,
      why: error
        ? `${error.message}${error.code ? ` (${error.code})` : ""}`
        : data === false
        ? "함수는 있는데 「아직 아니다」 라고 답합니다 — 이 SQL 을 한 번 더 돌려주세요"
        : null,
    });
  }
  // 방금 다 세었다 — 메뉴 배지도 이 숫자로 바로 맞춘다 (두 번 안 찌르게).
  // SQL 을 돌리고 이 화면에서 확인하는 순간 배지가 꺼지는 것이 이 줄이다.
  primeSqlBadge(out.filter((c) => !c.ok).length);
  return out;
}
