/**
 * **안 돌린 SQL 개수 — 설정(관리자) 메뉴 배지** (원장님, 2026-08-14).
 *
 * > 「확인할 게 있으면 메뉴에 개수가 배지 모양으로 알림이 뜨는데,
 * >  SQL 이 추가됐을 때도 그걸 표시하게 해줘. 설정 메뉴 말이야.」
 *
 * 지금은 새 마이그레이션이 나가도 설정 → SQL 을 **열어봐야** 보인다 —
 * 그래서 「SQL 돌리셨어요?」 를 매번 대화로 물어야 했다.
 *
 * 무엇이 안 돌았는지 아는 법은 설정 → SQL 화면과 **같은 탐침 한 벌**
 * (lib/sqlChecks 의 CHECKS)이다. 배지 숫자와 화면 숫자가 다르면 안 된다.
 *
 * 탐침이 백 개가 넘는다 — 화면마다 돌릴 수 있는 셈이 아니다. 그래서
 *   · 스무 개씩 묶어 병렬로 찌르고 (한 번에 다 쏘면 DB 에 예의가 아니다)
 *   · **5분 메모** (배포에서만) — SQL 은 하루에도 안 나오는 날이 대부분이라
 *     20초 메모(원칙 6-4)보다 훨씬 길게 잡아도 늦는 사람이 없다
 *   · 설정 → SQL 화면이 전체 확인(checkSchema)을 돌리면 그 결과로 메모를
 *     바로 덮는다(primeSqlBadge) — SQL 을 돌리고 확인한 순간 배지도 꺼진다
 */
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase/env.js";
import { CHECKS } from "./sqlChecks.js";

const _memo = { at: 0, value: null };
const MEMO_MS = 5 * 60 * 1000;

/**
 * **한 번 「돌았다」 로 판명된 탐침은 다시 안 찌른다** (성능수리 v3 —
 * 배지 트랙). 마이그레이션은 앞으로만 간다 — 돌아간 SQL 이 도로 안 돌아간
 * 상태가 되는 일은 이 작업 흐름에 없다 (`add column if not exists` 들).
 * 그래서 통과한 탐침을 서버 메모리에 적어 두면, 5분 메모가 식을 때마다
 * ~150개 8배치를 전부 다시 찌르던 것이 **아직 안 돈 것(+새로 생긴 것)만**
 * 찌르는 일이 된다 — 보통 0개, 곧 0배치.
 *
 * 이것은 5분 메모의 **연장이 아니다** (§6-2 금지 준수) — 개수 셈 자체는
 * 지금처럼 5분마다 다시 하고, 「이미 통과」 라는 단조 사실만 건너뛴다.
 * 정확성 계약(배지 = 안 돌린 SQL 수) 유지: 새 CHECKS 는 통과 기록이 없어
 * 그대로 찔리고, 실패(미실행)는 절대 기록하지 않아 다음에 또 찔린다.
 */
const _passed = new Set();
const keyOf = (c) => (c.rpc ? `rpc:${c.rpc}` : `${c.anonTable || c.table}|${c.col}`);

// 동시 호출 합치기 (§2-3-1 과 같은 규칙) — 콜드 순간 원장 화면 둘이 같이
// 열리면 150탐침이 두 벌 나간다. production 게이트 · 실패 promise 비캐시
let _inflight = null;

/** 설정 → SQL 화면이 방금 센 것을 그대로 받아 적는다 — 두 번 안 찌르게 */
export function primeSqlBadge(count) {
  _memo.at = Date.now();
  _memo.value = Math.max(0, count | 0);
}

/** 안 돌린 SQL 개수. 못 세면 0 — 없는 배지가 틀린 배지보다 낫다 */
export async function pendingSqlCount(supabase) {
  if (!supabase) return 0;
  const memoOn = process.env.NODE_ENV === "production";
  if (memoOn && _memo.value !== null && Date.now() - _memo.at < MEMO_MS) {
    return _memo.value;
  }
  if (memoOn && _inflight) return _inflight;
  const p = _pendingSqlCount(supabase);
  if (memoOn) {
    _inflight = p;
    p.then(
      () => { if (_inflight === p) _inflight = null; },
      () => { if (_inflight === p) _inflight = null; }
    );
  }
  return p;
}

async function _pendingSqlCount(supabase) {
  let count = 0;
  try {
    const todo = CHECKS.filter((c) => !_passed.has(keyOf(c)));
    const anon = todo.some((c) => c.anonTable)
      ? createAnonClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false },
        })
      : null;
    for (let i = 0; i < todo.length; i += 20) {
      const part = await Promise.all(
        todo.slice(i, i + 20).map(async (c) => {
          try {
            // 화면(app/settings/sql/status.js)과 **같은 셈이어야 한다** —
            // rpc 가 `false` 를 돌려주면 「아직 안 들어갔다」 다 (역할
            // 자물쇠처럼 진짜로 물어보는 표식이 있다). 오류만 보면
            // 자물쇠가 풀려 있어도 배지가 0 이 된다.
            const { data, error } = c.rpc
              ? await supabase.rpc(c.rpc)
              : c.anonTable
              ? await anon.from(c.anonTable).select(c.col).limit(1)
              : await supabase.from(c.table).select(c.col).limit(1);
            const ok = !error && data !== false;
            if (ok) _passed.add(keyOf(c));   // 단조 사실만 기록
            return ok ? 0 : 1;
          } catch {
            // 못 물어본 것은 「안 됐다」 가 아니라 「모른다」 — 안 센다
            return 0;
          }
        })
      );
      count += part.reduce((a, b) => a + b, 0);
    }
  } catch {
    return 0;
  }
  _memo.at = Date.now();
  _memo.value = count;
  return count;
}
