/** SQL 결과 판별 한 곳(검사-⑪ · (바) 2026-09-08 원장님 「해」) — 저장·삭제·덮어쓰기 뒤에 이 문을 지난다: 오류면 던지고, **바뀐 줄이 0이면 던진다**.
 *  까닭: 권한(RLS)이 조용히 거르면 오류 없이 0줄이 바뀌는데, 전엔 화면이 「저장했습니다」라고 말했다(원장님 9/8 표 「0줄이면 실패」 — 「해」).
 *  줄 수는 { count: "exact" } 의 count 로, 없으면 .select() 가 돌려준 줄 수로(.single() 은 한 줄 · .maybeSingle() 은 있으면 1).
 *  zero: "ok" 는 **훑는 손**(조건으로 여러 줄을 건드려 0줄이 정상일 수 있는 것 — .in · .is · 상태 필터 · ignoreDuplicates)에만 준다 · **콕 집은 손**(.eq("id") · …_id 꼴)은 늘 strict.
 *  check-rows 가 lib 의 쓰기 자리 전부가 이 문(또는 제 손의 줄 수 검사 · 「0줄 허용」 표시)을 지나는지 잰다 */
export const ZERO = "바뀐 줄이 없습니다. 다시 열어 보세요";
/** DB 가 영어로 하는 말 중 **원장님이 고칠 수 있는 것**만 우리 말로 바꾼다(원칙-1: 옮기는 자리는 여기 하나).
 *  2026-09-10 밤 — 0154 를 돌리신 뒤 문자 시험에서 「Could not find the 'channel' column of 'notify_log' in the schema cache」.
 *  표에는 칸이 있는데 Supabase 의 API(PostgREST)가 옛 표 모양을 기억한 것이라, 사람이 업무는 한 줄뿐인데 글이 영어라 막막했다. */
/** (어49) 칸이 없다는 DB 말 → **어느 붙여넣기 SQL 을 아직 안 넣으셨나**. 단추를 눌러도 아무 일이 안 나던 자취가 늘 이것이었다(원장님 2026-09-16 「버튼이 제대로 작동하지않음」).
 *  칸을 더한 마이그레이션 중 붙여넣기 파일이 있는 것만 적는다(docs/sql-paste/) · 모르는 칸이면 목록을 가리킨다 */
export const COL_PASTE = Object.freeze({
  attend_reason: "0166", started_at: "0167", ended_at: "0167", stamped_by: "0169",
  share: "0148-0159", changed_at: "0148-0159", changed_seen_at: "0148-0159", prev_term_from: "0148-0159", prev_term_to: "0148-0159",
  channel: "0148-0159", to_phone: "0148-0159", skip_by: "0148-0159", skipped_at: "0148-0159", site_seen_at: "0148-0159",
});
const missingCol = (m) => /Could not find the '([a-z_]+)' column/i.exec(m)?.[1] ?? /column (?:"?[a-z_]+"?\.)?"?([a-z_]+)"? does not exist/i.exec(m)?.[1] ?? null;
export function saidBy(msg) {
  const m = String(msg ?? "");
  const col = missingCol(m);
  if (col && /schema cache|does not exist/i.test(m)) { const f = COL_PASTE[col];
    return `${m} \u2192 \uD45C\uC5D0 \u300C${col}\u300D \uCE78\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. ${f ? `\uBD99\uC5EC\uB123\uAE30 SQL docs/sql-paste/${f}.sql \uC744 \uC544\uC9C1 \uC548 \uB123\uC73C\uC168\uC2B5\uB2C8\uB2E4` : "\uBD99\uC5EC\uB123\uAE30 SQL \uC744 \uC544\uC9C1 \uC548 \uB123\uC73C\uC168\uC2B5\uB2C8\uB2E4(docs/sql-paste/README.md \uBC88\uD638 \uCC28\uB840\uB300\uB85C)"} \u00B7 \uB123\uC740 \uB4A4\uC5D0\uB3C4 \uAC19\uC73C\uBA74 SQL \uD3B8\uC9D1\uAE30\uC5D0\uC11C \`notify pgrst, 'reload schema';\``; }
  if (/schema cache/i.test(m)) return `${m} → Supabase 가 **옛 표 모양을 기억**하고 있습니다. SQL 편집기에서 \`notify pgrst, 'reload schema';\` 한 줄을 돌리세요(그래도 같으면 그 마이그레이션이 중간에서 끊긴 것 · 파일을 처음부터 다시 돌리면 됩니다)`;
  if (/could not find the table|PGRST205|relation ".*" does not exist|function .* does not exist|schema "v2" does not exist/i.test(m)) return `${m} → **표·함수가 없습니다.** 새 앱 마이그레이션(0100~)을 이 DB 에 아직 안 돌린 것입니다. \`docs/미리보기-켜기.md\``;
  if (/permission denied|violates row-level security/i.test(m)) return `${m} → 그 곳을 쓸 **권한이 없습니다**(설정 「누가 무엇을 보나」 · 접근 규칙)`;
  return m;
}
export function changed(r, what, { zero = "fail" } = {}) {
  if (r?.error) { console.error(`[changed] ${what} · ${r.error.message}`); throw new Error(`${what}: ${saidBy(r.error.message)}`); }
  const n = typeof r?.count === "number" ? r.count : Array.isArray(r?.data) ? r.data.length : r?.data ? 1 : 0;
  if (n === 0 && zero !== "ok") { console.error(`[changed] ${what} · 바뀐 줄 0 (권한이 걸렀거나 이미 그 상태)`); throw new Error(`${what}: ${ZERO}`); }   /* 서버 로그에도 남긴다 — 화면 오류는 지나가지만 로그는 남는다 */
  return r?.data ?? null;
}
/** 읽기 도우미 — (사) 파일마다 22벌이던 것을 여기 하나로(원칙-1). 오류면 던지고 data 를 돌려준다(row: 없으면 null · rows: 없으면 []). 쓰기는 changed 로 */
export const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${saidBy(r.error.message)}`); return r?.data ?? null; };
export const rows = (r, what) => { if (r?.error) throw new Error(`${what}을 못 읽음: ${saidBy(r.error.message)}`); return r?.data ?? []; };
