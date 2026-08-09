/**
 * **「SQL 을 아직 안 돌리셨다」 를 알아보는 자리** — 한 곳에서만 답한다.
 *
 * 원장님 (2026-08-09) — 「하나의 속성으로 작성할 수 있는 걸 여러 군데서
 * 중복으로 작성하거나 불러오거나 하는 경우가 또 있는지 코드 전수검사하고」
 *
 * ── 무엇이 어긋나 있었나 ──────────────────────────────
 *
 * 같은 판단이 **서른한 파일에 다섯 가지 모양으로** 적혀 있었다.
 * 이름도 needSql · isMissingColumn · unavailable · missingColumn 로 제각각.
 *
 * 그중 둘은 **아무것도 못 잡고 있었다** — 42P01 하나만 보고 있었는데,
 * 우리는 PostgREST 를 거치므로 표가 없으면 42P01 이 아니라 **PGRST205** 가
 * 온다. 그래서 그 화면에서는 「설정에서 SQL 을 실행해주세요」 대신
 * `relation "stay_tasks" does not exist` 같은 **날 오류**가 그대로 떴다.
 * 원장님은 그걸 보고 무엇을 해야 하는지 알 수가 없다.
 *
 * ── 네 가지 코드, 두 가지 뜻 ──────────────────────────
 *
 *              표가 없다        칸이 없다
 *   Postgres   42P01           42703
 *   PostgREST  PGRST205        PGRST204
 *
 * **둘을 갈라 두는 까닭**: 부르는 쪽이 하는 일이 다르다.
 *   · 표가 없다  → 「SQL 을 실행해주세요」 하고 멈춘다
 *   · 칸이 없다  → 그 칸을 빼고 **한 번 더 물어본다** (옛 SQL 에서도 돌게)
 * 한 덩어리로 묶으면 뒤로 물러설 자리를 잃는다.
 */

const NO_TABLE = new Set(["42P01", "PGRST205"]);
const NO_COLUMN = new Set(["42703", "PGRST204"]);

/** 표가 통째로 없다 — 그 SQL 을 아직 안 돌리셨다 */
export function noTable(error) {
  return !!error && NO_TABLE.has(error.code);
}

/** 칸이 없다 — 옛 SQL 까지만 돌아 있다. 그 칸을 빼고 다시 물어볼 수 있다 */
export function noColumn(error) {
  return !!error && NO_COLUMN.has(error.code);
}

/** 둘 중 하나 — 어느 쪽이든 「SQL 을 실행해주세요」 로 안내하면 되는 자리 */
export function needSql(error) {
  return noTable(error) || noColumn(error);
}
