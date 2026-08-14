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
 * 세 번째가 없어서 0081(아이콘 읽기 권한)이 「넣을 것이 없음」 으로 보였다.
 * 표도 칸도 이미 있으니 검사를 통과해버렸고, 그래서 실행되지 않았다.
 * **확인할 방법이 없는 SQL 은 없는 것과 같다.**
 *
 * 목록(CHECKS)은 lib/sqlChecks 한 곳에 있다 — 메뉴 배지(lib/sqlBadge)도
 * 같은 목록을 본다. 새 SQL 을 만들면 거기에 적는다.
 */

export async function checkSchema() {
  const supabase = createClient();
  // 로그인 없이 읽히는지 보려면 **로그인 안 한 손님**으로 물어봐야 한다
  const anon = createAnonClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const out = [];
  for (const c of CHECKS) {
    const { error } = c.rpc
      ? await supabase.rpc(c.rpc)
      : c.anonTable
      ? await anon.from(c.anonTable).select(c.col).limit(1)
      : await supabase.from(c.table).select(c.col).limit(1);
    out.push({
      ...c,
      ok: !error,
      why: error ? `${error.message}${error.code ? ` (${error.code})` : ""}` : null,
    });
  }
  // 방금 다 세었다 — 메뉴 배지도 이 숫자로 바로 맞춘다 (두 번 안 찌르게).
  // SQL 을 돌리고 이 화면에서 확인하는 순간 배지가 꺼지는 것이 이 줄이다.
  primeSqlBadge(out.filter((c) => !c.ok).length);
  return out;
}
