/**
 * ⚠️⚠️ **진도가 올라가는 자리는 여기 하나뿐이다.**
 *  (계획 절 ⑳ · ㊳ · ㊶ · 783줄 · 1080줄 · 1100줄 · 자동 검사 ⑭)
 *
 * 입구가 다섯인데 **규칙은 한 벌**이어야 한다. 다섯 다 `checkProgress()` 를 지난다:
 *
 *   ① 숙제 검사 ○△✕              `fromCheck()`
 *   ② 원장이 진도판에서 직접 찍기    `fromStaff()`    ← 커서가 잠겼을 때 푸는 **기본 손잡이**(1100줄)
 *   ③ 조각이 원본을 다 덮을 때       `rollup()`
 *   ④ 메모로 대신한 날 마감(절 ㊳)   `fromMemo()`     ← 방아쇠는 **마감**이다. 메모를 적는 순간이 아니다
 *   ⑤ 아이가 찍기(절 ㊶)            `fromStudent()`
 *
 * ⚠️ **옆문을 하나라도 내면 그 문으로 사고가 그대로 들어온다.** 화면에서 `v2.progress` 에
 *    직접 쓰지 마라 — 예습 예외 · 덮음 판정 · 회독 잠금 · 승자 규칙이 전부 여기에만 있다.
 *
 * ── 반드시 막는 것 넷 ──────────────────────────────────────────────
 * ⚠️ ① **예습(slot='next')에 ○ 을 줘도 완료로 안 올린다.** 안 막으면 수업을 한 번도 안 한 단원이
 *      완료로 찍히고, 예습이 든 회차마다 단원이 하나씩 탄다. **진도율은 오히려 앞서 보인다.**
 *      ⚠️ 이 규칙은 **상태만이 아니라 범위에도** 걸린다 — 예습 항목의 range_note 는
 *      `winner()` 가 아예 안 모으고 조각으로도 안 남긴다. 안 그러면 ⑴ 예습 ○(범위 없음) 하나가
 *      「통째로 냈다」로 접혀 완료가 되고 ⑵ 예습 ○ 의 범위가 조각으로 남아 ③ rollup 이 완료로
 *      올린다. 둘 다 ① 이 **다른 모양으로** 새는 것이다(검증 2026-09-02 2차).
 *      ⚠️ 그리고 **입구마다 slot 을 실제로 볼 수 있어야** 규칙이 산다 — 아이 찍기(⑤)는 slot 을
 *      안 보내므로 `Q.daySlots` 로 그날 판에서 직접 찾아 붙인다.
 * ⚠️ ② **덜 덮은 배정은 ◐ 까지만.** 판정은 `lib/chunk.js` 의 `statusFor()` 가 한다 — 여기서 다시 짜지 않는다(원칙 1).
 * ⚠️ ③ **○ > △ > ✕.** 옛 앱은 항목을 1건씩 넘겨서(main:app/check/actions.js:73) /check 에서
 *      ○ 찍은 뒤 「한 번에 ✕」를 누르면 그 ○ 이 지워졌다. → **항목 전체를 모아 한 번에 판정한다.**
 *      한 건씩 불러도 안 깨지게, 같은 판의 형제 항목을 DB 에서 **다시 긁어 와** 합친다(`gather`).
 * ⚠️ ④ **회독.** 진도 열쇠는 (학생, 단원, **회독**)이고 회독은 배정 줄(`v2.student_book.round`)에서 온다.
 *      회독을 지어내지 않는다 — 배정 줄이 없으면 **거절하고 알린다.** 조용히 1회독으로 치면
 *      2회독 아이의 진도가 1회독 줄을 덮는다.
 *
 * ⚠️ **✕ 는 delete 하지 않는다.** v2 는 delete 권한이 회수돼 있고(0017) 대전제 6 이 있다.
 *    **상태로 내린다** — status='none' · done_on=null. 줄과 메모(note)는 남는다.
 *
 * ⚠️ **❗이의(progress_flag)는 진도를 안 바꾼다.** 원장님이 누르는 순간에만 바뀐다(`resolveFlag`).
 *
 * ── 2026-09-02 검증에서 드러난 것 다섯 (다 같은 병이다 — **판정을 건너뛰는 옆길**) ──────
 * ⚠️ ⑴ ③ `rollup()` 이 조각을 한 번도 안 세고 ◐ 을 전부 ○ 로 올렸다 → **조각이 있는 (단원,회독)만**
 *      보고, `viaParts` 로 「범위 메모가 없으면 통째」 지름길을 막는다.
 * ⚠️ ⑵ `measure()` 가 축을 마음대로 되돌려 「8번」 한 문제가 p.8 짜리 단원을 끝냈다 →
 *      **밝힌 축은 안 되돌린다.** 자가 없으면 ◐ + 물음(대전제 0).
 * ⚠️ ⑶ `winner()` 가 진 항목의 범위 메모를 버려서 나눠 낸 18쪽이 영영 ◐ 이었다 →
 *      **범위는 다 모으고**(`notes`), 순위가 같으면 slot 으로 가른다(class·home 이 next 를 이긴다).
 * ⚠️ ⑷ ⑤ 아이 찍기가 판정을 한 번도 안 지나고 자취에 「원장님이 직접 찍었다」를 남겼다 →
 *      **판정 없이 올리는 손잡이는 원장(staff)·이관만** 쥔다.
 * ⚠️ ⑸ 지난 완료 자물쇠가 원장 직접 찍기와 ❗이의 되돌림까지 막아 **앱 안에서 내릴 길이 없었다** →
 *      자물쇠는 **검사·이관에만**. 그리고 이의는 진도가 안 바뀌면 **안 닫는다**(한 판으로 묶었다).
 */
import { statusFor as chunkStatus } from "./chunk.js";

/* ── 낱말 ─────────────────────────────────────────────────────── */

/** ⚠️ **○ > △ > ✕.** 건너뜀은 ✕ 보다 세고 △ 보다 약하다 — △ 는 아이가 실제로 한 것이다 */
const RANK = { done: 3, weak: 2, skip: 1.5, missing: 1 };
export const rankOf = (m) => (m in RANK ? RANK[m] : -1);

/** 진도로 안 가는 것 — 미검사 · 검사취소 · 수업중. **안 건드린다**(계획 「미검사는 손댄 적 없는 것」) */
const IGNORE = new Set([null, undefined, "", "none", "inclass"]);

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * ⚠️ **날짜를 「YYYY-MM-DD」 한 모양으로 만든다.**
 *    pg 는 `date` 칸을 **Date 객체**로 돌려준다 — `String(d).slice(0,10)` 은 「Tue Sep 01」이 된다.
 *    그러면 「오늘 찍은 완료인가」가 **늘 거짓**이 되어 ✕ 가 오늘 찍은 ○ 도 못 내린다.
 *    (가짜 DB 로는 안 잡힌다. 진짜 DB 검사가 잡았다.)
 */
export const day = (v) => {
  if (v == null) return null;
  if (v instanceof Date)
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
};

/* ── SQL ───────────────────────────────────────────────────────
 * ⚠️ 치환자리(달러+중괄호)를 끼우지 않는다 — 끼우면 scripts/check-sql.mjs 가
 *    진짜 스키마에 물어볼 수가 없어 **죽은 칸을 원리적으로 못 잡는다.** 값은 $1·$2 로 넘긴다.
 * 각 SQL 맨 앞의 「q:이름」 토막주석은 검사가 가짜 DB 를 갈아 끼울 때 쓰는 이름표다
 * (check-sql 이 토막주석을 지운 뒤 PREPARE 하므로 진짜 스키마 검사에는 안 걸린다).
 */
const Q = {
  units: `/* q:units */
    select u.id, u.book_id, u.chapter, u.sub, u.activity, u.is_workbook, u.sort,
           u.page_start, u.page_end, u.q_count, u.q_range, u.state
      from v2.units u
     where u.id = any($1::uuid[])`,

  round: `/* q:round */
    select sb.book_id, sb.round, sb.from_date,
           (sb.from_date <= $3::date and (sb.to_date is null or sb.to_date >= $3::date)) as in_window
      from v2.student_book sb
     where sb.student_id = $1 and sb.book_id = any($2::uuid[])
     order by sb.book_id, in_window desc, sb.from_date desc`,

  // ⚠️ marked_on 은 0065 에서 생겼다 — **◐ 이 언제 찍혔나.** 이게 없어서 ✕ 가 오늘 찍은 ◐ 도 못 내렸다
  progress: `/* q:progress */
    select p.unit_id, p.round, p.status, p.done_on, p.marked_on, p.last_by, p.confirmed, p.note
      from v2.progress p
     where p.student_id = $1 and p.unit_id = any($2::uuid[])`,

  parts: `/* q:parts */
    select pp.unit_id, pp.round, pp.q_from, pp.q_to, pp.page_from, pp.page_to
      from v2.progress_part pp
     where pp.student_id = $1 and pp.unit_id = any($2::uuid[])`,

  // ⚠️ `order by` 가 없으면 같은 입력에 **그날그날 다른 답**이 나온다 — 예습 ○ 과 등원 ○ 이
  //    같이 있을 때 어느 쪽이 이기느냐로 done 과 doing 이 갈렸다 (검증 2026-09-02)
  siblings: `/* q:siblings */
    select i.id, i.sheet_id, i.slot, i.unit_id, i.range_note, i.status
      from v2.day_item i
     where i.sheet_id = any($1::uuid[]) and i.unit_id is not null
     order by i.id`,

  // ⚠️ **그 교재만.** units 로 조인하는 이 한 줄이 「한 줄이 새면 그날 모든 교재가 ○」를 막는다(절 ㊳)
  // ⚠️ `i.status` 를 **반드시 같이 뽑는다** — 안 보면 그날 ✕ 로 찍어 둔 줄까지 마감이 ○ 로 뒤집는다
  memoItems: `/* q:memoItems */
    select i.id, i.sheet_id, i.slot, i.unit_id, i.range_note, i.status
      from v2.day_item i
      join v2.day_sheet s on s.id = i.sheet_id
      join v2.units u on u.id = i.unit_id
     where s.student_id = $1 and s.date = $2::date and u.book_id = $3
     order by i.id`,

  // ⚠️ **아이 찍기는 slot 을 안 들고 온다.** 그날 판에서 직접 찾아 붙이지 않으면
  //    「그날 예습으로만 깔린 단원」을 아이가 눌러 통째로 완료가 된다(검증 2026-09-02).
  //    검사(check)는 `siblings`(gather)가 같은 일을 한다 — 이건 아이 입구 전용이다
  daySlots: `/* q:daySlots */
    select i.unit_id, i.slot
      from v2.day_item i
      join v2.day_sheet s on s.id = i.sheet_id
     where s.student_id = $1 and s.date = $2::date and i.unit_id = any($3::uuid[])
     order by i.id`,

  canEdit: `/* q:canEdit */ select v2.can_edit_progress($1) as ok`,

  // ⚠️ note 를 건드리지 않는다 — 단원 메모(「17번만 다시」)는 회독이 넘어가도 따라다니는 별개 자산이다
  write: `/* q:write */
    insert into v2.progress (student_id, unit_id, round, status, done_on, last_by, confirmed, marked_on)
    values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict (student_id, unit_id, round) do update
       set status = excluded.status, done_on = excluded.done_on,
           last_by = excluded.last_by, confirmed = excluded.confirmed,
           marked_on = excluded.marked_on`,

  partSeen: `/* q:partSeen */
    select 1 from v2.progress_part
     where student_id = $1 and unit_id = $2 and round = $3
       and q_from is not distinct from $4 and q_to is not distinct from $5
       and page_from is not distinct from $6 and page_to is not distinct from $7
     limit 1`,

  partAdd: `/* q:partAdd */
    insert into v2.progress_part (student_id, unit_id, round, q_from, q_to, page_from, page_to, note, done_on)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,

  pending: `/* q:pending */
    select p.student_id, p.unit_id, p.round, p.status, p.done_on, p.updated_at,
           s.name as student_name, v2.unit_label(p.unit_id, true) as label
      from v2.progress p
      join v2.students s on s.id = p.student_id
     where p.last_by = 'student' and p.confirmed = false
     order by p.updated_at desc
     limit $1`,

  confirm: `/* q:confirm */
    update v2.progress set confirmed = true
     where student_id = $1 and unit_id = $2 and round = $3
       and last_by = 'student' and confirmed = false`,

  // ⚠️ 되돌림도 **지우지 않는다.** 상태로 내린다 (대전제 6)
  revert: `/* q:revert */
    update v2.progress
       set status = 'none', done_on = null, confirmed = true, last_by = 'staff'
     where student_id = $1 and unit_id = $2 and round = $3
       and last_by = 'student' and confirmed = false`,

  // ⚠️ seen_at·outcome 은 안 넣는다 — 아이가 스스로 닫으면 원장님이 보기 전에 사라진다
  flagAdd: `/* q:flagAdd */
    insert into v2.progress_flag (student_id, unit_id, round, kind, said)
    values ($1, $2, $3, $4, $5) returning id`,

  flagOpen: `/* q:flagOpen */
    select f.id, f.student_id, f.unit_id, f.round, f.kind, f.said, f.raised_at,
           s.name as student_name, v2.unit_label(f.unit_id, true) as label
      from v2.progress_flag f
      join v2.students s on s.id = f.student_id
     where f.outcome is null
     order by f.raised_at
     limit $1`,

  flagClose: `/* q:flagClose */
    update v2.progress_flag
       set seen_at = now(), seen_by = $2, outcome = $3
     where id = $1 and outcome is null
     returning student_id, unit_id, round, kind`,
};

/* ── 범위 메모 읽기 ────────────────────────────────────────────── */

/**
 * 「p.31-34」 · 「1-30」 · 「1-10, 21-30」 을 숫자 토막으로 읽는다.
 * ⚠️ **못 읽으면 지어내지 않는다.** 「짝수만」 같은 글은 `unknown` 이고,
 *    그러면 ○ 을 줘도 ◐ 에서 멈추고 원장님께 「이걸로 이 소단원 끝」을 묻는다(계획 1085).
 */
export function parseRange(text) {
  const t = String(text ?? "").trim();
  if (!t) return { kind: "none", spans: [] };
  const isPage = /(^|[^가-힣])pp?\.?\s*\d|쪽|page/i.test(t);
  const isQ = /번|문항|문제/.test(t);
  const spans = [];
  for (const piece of t.split(/[,·、/]+/)) {
    const clean = piece.replace(/[^\d\-~–—]/g, "");           // 「1번-30번」 → 「1-30」
    const m = clean.match(/^(\d+)(?:[-~–—](\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]), b = m[2] == null ? Number(m[1]) : Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) continue;
    spans.push([a, b]);
  }
  // 숫자를 하나도 못 읽었거나, 숫자 말고 다른 말이 붙어 있으면 **모른다고 답한다**
  const onlyNums = /^[\s\d\-~–—,·、/pP.쪽번문항문제]+$/.test(t);
  if (!spans.length || !onlyNums) return { kind: "unknown", spans: [] };
  return { kind: isPage ? "page" : isQ ? "q" : "num", spans };
}

/** 읽힌 것들을 한 축으로 접는다. 축이 엇갈리면 null (「어느 자로 재야 할지 모른다」) */
const fold = (rs) => {
  if (!rs.length) return null;
  const kinds = new Set(rs.map((r) => r.kind));
  // 「p.35-40」과 「1-30번」이 같은 단원에 같이 왔다 — 어느 자로 재야 할지 모른다
  if (kinds.has("page") && kinds.has("q")) return null;
  return { kind: kinds.has("page") ? "page" : kinds.has("q") ? "q" : "num",
           spans: rs.flatMap((r) => r.spans) };
};

/**
 * 한 단원에 걸린 **여러 항목의 범위 메모를 하나로** 접는다.
 * ⚠️ 이게 없으면 `winner()` 가 대표 하나만 남기고 나머지 메모를 통째로 버려서,
 *    「등원 p.35-40 · 숙제 p.41-52」로 18쪽을 다 낸 단원이 **영영 ◐** 에 머문다(검증 2026-09-02).
 * ⚠️ 축이 엇갈리거나 못 읽는 것이 하나라도 섞이면 **모른다고 답한다**(대전제 0).
 *    다만 그때도 읽힌 것만 접어 `known` 으로 같이 돌려준다 — **재는 데는 안 쓰고 남기는 데만** 쓴다.
 */
export function mergeRanges(notes = []) {
  if (!notes.length) return { kind: "none", spans: [] };
  const rs = notes.map(parseRange);
  // 범위를 안 적은 ○ 이 하나라도 있으면 그 항목이 **통째로** 낸 것이다 (계획 1082)
  if (rs.some((r) => r.kind === "none")) return { kind: "none", spans: [] };
  const read = rs.filter((r) => r.kind !== "unknown");
  const all = fold(read);
  // ⚠️ 못 읽는 것이 하나라도 섞이면 **모른다고 답한다**(대전제 0). 다만 **읽힌 형제의 범위는 버리지 않는다** —
  //    버리면 「짝수만」한 줄 때문에 p.35~52 를 다 냈다는 기록이 progress_part 에 한 줄도 안 남아,
  //    이튿날 rollup 을 돌려도 조각이 없어 영영 ◐ 이었다(검증 2026-09-02). `known` 은 **재는 데는 안 쓰고
  //    남기는 데만** 쓴다.
  if (read.length !== rs.length || !all) return { kind: "unknown", spans: [], known: all };
  return all;
}

/** 토막들이 그 자 안에 들어오나 — 안 들어오면 그 축이 아니다 */
const fits = (spans, ruler) => spans.length > 0 && spans.every(([a, b]) => a >= ruler[0] && b <= ruler[1]);

/**
 * 단원 한 줄을 **재는 자**로 바꾼다 — 쪽 축이냐 문항 축이냐.
 * chunk.js 는 쪽으로만 재므로, 문항 축은 1..문항수 를 쪽인 척 넘겨 **같은 판단을 다시 짜지 않는다**(원칙 1).
 *
 * ⚠️ **축을 되돌리지 않는다.** 「1-30번」(문항)인데 그 단원에 문항 자가 없다고 쪽으로 갈아타면
 *    p.8~8 짜리 단원에 「8번」 하나를 낸 것이 **「다 덮었다」로 완료**가 된다(검증 2026-09-02).
 *    자가 없으면 axis=null 로 두어 ◐ + 「이걸로 끝」 물음이 되게 한다(대전제 0).
 * ⚠️ 축을 안 밝힌 「1-3」은 **문항을 먼저 본다.** 쪽·문항이 둘 다 찬 활성 단원이 447줄인데
 *    그중 쪽 폭은 거의 1~4쪽이다(실측). 쪽으로 읽으면 「1-3」이 p.1~2 를 통째로 덮어 ○ 이 된다 —
 *    문항으로 읽으면 덜 덮은 쪽(◐)으로 틀린다. **틀릴 거면 안전한 쪽으로 틀린다.**
 */
function measure(unit, kind, spans = [], parts = []) {
  const hasPage = unit.page_start != null;
  const pSpan = hasPage ? [Number(unit.page_start), Number(unit.page_end ?? unit.page_start)] : null;
  const qr = parseRange(unit.q_range);
  const qSpan = qr.spans.length ? [qr.spans[0][0], qr.spans[qr.spans.length - 1][1]]
              : unit.q_count != null ? [1, Number(unit.q_count)] : null;

  let axis = null;
  if (kind === "page") axis = pSpan ? "page" : null;        // 밝힌 축은 **되돌리지 않는다**
  else if (kind === "q") axis = qSpan ? "q" : null;
  else if (qSpan && pSpan) {                                // 둘 다 있다 — 토막이 들어가는 자로 고른다
    if (spans.length) axis = fits(spans, qSpan) ? "q" : fits(spans, pSpan) ? "page" : null;
    // 잰 토막이 없으면 **이미 남아 있는 조각이 쓰는 축**을 따른다 (안 그러면 그 조각이 통째로 안 보인다)
    else if (parts.some((p) => p.q_from != null)) axis = "q";
    else axis = "page";
  } else axis = qSpan ? "q" : pSpan ? "page" : null;

  if (axis === "page") return { axis, unit: { page_start: pSpan[0], page_end: pSpan[1] } };
  if (axis === "q") return { axis, unit: { page_start: qSpan[0], page_end: qSpan[1] } };
  // ⚠️ 잴 자가 없다 — chunk 가 「모른다」로 받아 ◐ + 「이걸로 끝」 물음이 된다
  return { axis: null, unit: { page_start: null } };
}

/** 문항 축인데 chunk 가 「남은 쪽 p.31~60」이라고 말한다 — 그 교재에 없는 쪽수가 아이에게 그대로 나간다 */
const sayQ = (w) => String(w ?? "").replace(/남은 쪽/g, "남은 문항")
  .replace(/p\.(\d+)(?:~(\d+))?/g, (_s, a, b) => (b ? `${a}~${b}번` : `${a}번`));

/** 저장된 조각을 그 축의 쪽 목록으로 */
const partsOn = (axis, parts) =>
  parts.map((p) => (axis === "q" ? { pageFrom: p.q_from, pageTo: p.q_to }
                                 : { pageFrom: p.page_from, pageTo: p.page_to }))
       .filter((p) => p.pageFrom != null);

/* ── 판정 한 벌 ────────────────────────────────────────────────── */

/**
 * ⚠️ **한 단원에 대한 판정 전부가 여기 있다.** 화면도, 다른 lib 도 이 판단을 다시 하지 않는다.
 *
 * @returns {act:'none'|'set'|'down'|'block', status?, doneOn?, ask?, why}
 */
export function decideOne({ mark, slot, unit, parts = [], range = { kind: "none", spans: [] },
                            existing = null, by = "staff", on, judge, viaParts = false }) {
  if (IGNORE.has(mark ?? null)) return { act: "none", why: "미검사는 손댄 적 없는 것이다" };
  if (rankOf(mark) < 0) return { act: "none", why: `모르는 낱말 「${mark}」 — 안 건드린다` };

  // ⚠️ ⑤ 아이는 **빈 줄만** 채운다. 원장·검사가 찍은 줄은 못 덮는다 (절 ㊶ ③)
  if (by === "student" && existing && existing.status !== "none" && existing.last_by !== "student")
    return { act: "block", why: "원장·검사가 찍은 줄이라 아이가 못 덮는다" };
  if (by === "student" && mark === "skip")
    return { act: "block", why: "건너뛰기는 원장님만 한다" };

  const prevDone = existing?.status === "done";
  // 아이가 찍었고 원장님이 아직 확인 안 한 줄은 **아이가 자기 손으로 고칠 수 있다**(절 ㊶ —
  // 「나중에도 진도에 잘못된 게 있으면 애들이 수정할 수 있잖아」). 그 줄에는 지난 완료 자물쇠를 안 건다
  const ownPending = by === "student" && existing?.last_by === "student" && existing?.confirmed === false;
  const doneToday = prevDone && (ownPending || day(existing.done_on) === on);
  // ⚠️ **지난 완료 자물쇠는 「검사·이관」에만 건다.** 원장님이 직접 찍는 것과 ❗이의 되돌림까지 막으면
  //    잘못 올라간 지난 완료를 **앱 안에서 내릴 길이 아예 없다** — 눌렀는데 값이 안 바뀐다(검증 2026-09-02).
  const lockPast = by === "check" || by === "import";
  const markedToday = day(existing?.marked_on) === on;

  // ✕ — **지우지 않는다. 상태로 내린다.** 그리고 검사는 **오늘 찍은 것만** 건드린다
  if (mark === "missing") {
    if (!existing || existing.status === "none") return { act: "none", why: "내릴 것이 없다" };
    if (prevDone && !doneToday && lockPast)
      // ⚠️ 자물쇠가 없으면 이번 주에 안 해왔다는 이유로 **지난달 완료가 지워진다**
      return { act: "none", why: `지난 완료(${day(existing.done_on)})는 오늘 검사가 못 내린다` };
    if (existing.status === "doing" && lockPast && !markedToday)
      // 0065 에서 marked_on 이 생겼다. 그래도 **언제 찍혔는지 모르는 옛 줄**은 안 건드린다(대전제 0)
      return { act: "none", why: existing.marked_on == null
        ? "◐ 이 언제 찍혔는지 몰라 안 내린다 (marked_on 이 빈 옛 줄)"
        : `지난 ◐(${day(existing.marked_on)})는 오늘 검사가 못 내린다` };
    return { act: "down",
             why: by === "check" || by === "import" ? "오늘 찍은 것을 도로 내린다" : "원장님이 도로 내렸다" };
  }

  if (mark === "skip")
    return { act: "set", status: "skip", doneOn: null, why: "건너뜀 — 분모에서 빠진다" };

  // △ — 「하는 중」까지. ⚠️ 검사는 이미 완료인 것을 **못 낮춘다** (오늘 찍은 것만 예외)
  if (mark === "weak") {
    if (prevDone && !doneToday && lockPast) return { act: "none", why: "지난 완료는 △ 로 안 낮춘다" };
    return { act: "set", status: "doing", doneOn: null, why: "하는 중" };
  }

  /* ── ○ ─────────────────────────────────────────────────────── */
  // 배정 줄에서 온 ○ 은 **반드시** 예습·덮음 판정을 지난다.
  // 원장이 진도판에서 직접 찍는 ○(배정 줄이 아님)은 커서 잠김을 푸는 기본 손잡이라 그대로 올린다(1100줄).
  // ⚠️ **「판정 없이 그대로 올리는 손잡이」는 원장(staff)·이관만 쥔다.** 아이 찍기(⑤)가 이 손잡이를
  //    같이 쥐고 있어서, 조각만 낸 단원도 아이가 누르면 완료가 되고 자취에는 「원장님이 직접 찍었다」가
  //    남았다 — 원장님은 누른 적이 없다(검증 2026-09-02).
  const judged = judge ?? (slot != null || by === "check" || by === "student");

  // ⚠️ ① 예습은 완료로 안 올라간다. **입구가 무엇이든** 똑같다 (메모 마감도, 아이 찍기도)
  if (slot === "next")
    return prevDone
      ? { act: "none", why: "예습이라 완료로 안 올리고, 이미 완료인 것도 안 내린다" }
      : { act: "set", status: "doing", doneOn: null,
          why: "⚠️ 예습(slot='next')이라 ○ 을 줘도 「하는 중」까지다" };

  if (!judged) return { act: "set", status: "done", doneOn: on, why: "원장님이 직접 찍었다" };

  // ⚠️ ② 덮음 판정 — 판단은 lib/chunk.js 가 한다. 여기서 다시 짜지 않는다
  if (range.kind === "unknown") {
    // ⚠️ 못 읽는 형제가 섞여도 **읽힌 형제의 범위는 조각으로 남긴다**(`save`). 판정에는 안 쓴다 —
    //    상태는 그대로 ◐ + 물음이다. 안 남기면 「짝수만」 한 줄 때문에 그날 실제로 낸 18쪽이
    //    어디에도 안 남아 이튿날 rollup 으로도 영영 안 덮인다(검증 2026-09-02).
    const k = range.known;
    const mk = k?.spans?.length ? measure(unit, k.kind === "num" ? null : k.kind, k.spans, parts) : null;
    return { act: prevDone ? "none" : "set", status: "doing", doneOn: null, ask: true,
             axis: mk?.axis ?? null,
             save: mk ? { axis: mk.axis ?? (k.kind === "q" ? "q" : "page"), spans: k.spans } : null,
             why: "⚠️ 범위 메모를 숫자로 못 읽었다 — 원장님이 「이걸로 이 소단원 끝」을 눌러야 한다" };
  }

  const m = measure(unit, range.kind === "num" ? null : range.kind, range.spans, parts);
  const merged = [...partsOn(m.axis, parts),
                  ...range.spans.map(([a, b]) => ({ pageFrom: a, pageTo: b }))];
  // 범위 메모가 비고 저장된 조각도 없으면 **다 덮은 것**이다 (계획 1082)
  // ⚠️ **조각으로만 판정하는 입구(③ rollup)는 이 지름길을 못 탄다.** 이 줄이 열려 있어서
  //    조각이 한 줄도 없는 ◐(예습 ○ · △ 로 선 것)이 rollup 한 번에 완료로 찍혔다 —
  //    수업을 한 번도 안 한 단원이 완료가 되고 커서가 그 단원을 지나갔다(검증 2026-09-02).
  if (range.kind === "none" && !merged.length)
    return viaParts
      ? { act: "none", axis: m.axis, why: "조각이 하나도 없다 — 조각만으로는 완료로 안 올린다" }
      : { act: "set", status: "done", doneOn: on, axis: m.axis, why: "범위 메모가 없다 — 통째로 냈다" };

  const s = chunkStatus("done", [m.unit], merged);
  const why = m.axis === "q" ? sayQ(s.why) : s.why;        // 「남은 쪽 p.31~60」이 문항 줄에 나가면 안 된다
  if (s.status === "done") return { act: "set", status: "done", doneOn: on, axis: m.axis, why };
  if (prevDone) return { act: "none", axis: m.axis, why: "조각만 냈지만 이미 완료인 것을 안 내린다" };
  return { act: "set", status: "doing", doneOn: null, ask: s.ask === true, axis: m.axis, why };
}

/**
 * 같은 판·같은 단원에 붙은 항목을 **한 줄로 접는다.** 등원과 예습이 같은 단원에 같이 깔리는 일이
 * 이 학원의 보통이다(실측 — 한 판·한 단원에 항목이 4줄인 판이 있다).
 * ⚠️ 순위가 같으면 **등원·숙제가 예습을 이긴다.** 안 그러면 어느 칩을 먼저 눌렀는지에 따라
 *    같은 입력에 done 과 doing 이 갈렸다(검증 2026-09-02).
 */
const slotRank = (s) => (s === "next" ? 0 : s == null ? 1 : 2);

/**
 * ⚠️ **항목 전체를 모아 한 판정으로.** 한 단원에 본교재 ○ 와 워크북 ✕ 가 같이 걸리는 것이
 * 이 학원의 보통이다 — 하나씩 처리하면 **마지막 항목이 이겨서 ○ 이 지워진다.**
 *
 * ⚠️ **진 항목의 범위 메모를 버리지 않는다.** 대표 하나만 남기면 「등원 p.35-40 · 숙제 p.41-52」로
 *    18쪽을 다 낸 단원이 ◐ 에 머물고 뒤 조각은 저장조차 안 돼 **영영 안 덮인다**(검증 2026-09-02).
 *    → `notes` 에 ○ 짜리 범위 메모를 **전부** 모아 넘긴다.
 */
export function winner(marks = []) {
  const by = new Map();
  for (const m of marks) {
    if (!m?.unitId) continue;
    let g = by.get(m.unitId);
    if (!g) { g = { unitId: m.unitId, mark: null, slot: null, notes: [], had: false }; by.set(m.unitId, g); }
    // ⚠️⚠️ **예습(next)의 범위는 안 모은다.** 「반드시 막는 것 ①」은 상태만이 아니라 **범위에도** 걸린다.
    //    안 거르면 등원 ○ 'p.9-15' 옆에 예습 ○ 이 하나 있는 것만으로 notes 에 「범위 없는 ○」이 섞여
    //    mergeRanges 가 「통째」로 접고 13쪽짜리 단원이 완료가 됐다 — 실제로 낸 p.9~15 조각조차
    //    안 남았다(검증 2026-09-02). 예습 ○ 이 **범위를 적은 경우도 같다** — 그 범위로 조각이 남으면
    //    이튿날 rollup 이 그 조각만 보고 완료로 올려, 수업을 한 번도 안 한 단원이 ○ 이 된다.
    if (m.mark === "done" && m.slot !== "next") g.notes.push(m.range ?? null);   // 범위 없는 ○ 은 「통째」
    const better = !g.had
      || rankOf(m.mark) > rankOf(g.mark)
      || (rankOf(m.mark) === rankOf(g.mark) && slotRank(m.slot) > slotRank(g.slot));
    if (better) {
      g.had = true;
      g.mark = m.mark; g.slot = m.slot ?? null; g.range = m.range ?? null;
      g.itemId = m.itemId; g.sheetId = m.sheetId;
      g.judge = m.judge; g.viaParts = m.viaParts; g.round = m.round;
    }
  }
  return [...by.values()].map(({ had, ...g }) => g);
}

/* ── 하나뿐인 쓰는 길 ──────────────────────────────────────────── */

/**
 * @param db     { query(sql, params) }
 * @param input  { studentId, on:'YYYY-MM-DD', by:'check'|'staff'|'student'|'import',
 *                 marks:[{ unitId, mark, slot?, range?, itemId?, sheetId? }] }
 * @param opts   { dryRun, tx, gather, slots }
 */
export async function checkProgress(db, input = {}, opts = {}) {
  const { studentId, on, by = "staff" } = input;
  const dryRun = opts.dryRun === true;
  const out = { ok: false, on, by, applied: [], skipped: [], blocked: [], parts: [], notes: [] };

  if (!studentId) return { ...out, why: "학생이 없다" };
  if (!isDate(on)) return { ...out, why: "검사일(YYYY-MM-DD)이 없다 — 날짜를 지어내지 않는다" };

  let marks = (input.marks ?? []).filter((m) => m && m.unitId);
  if (!marks.length) return { ...out, ok: true, why: "찍힌 것이 없다" };

  // ⚠️ ⑤ 아이 찍기는 **스위치가 열려 있을 때만.** 판단은 v2.can_edit_progress 한 곳에만 있다
  if (by === "student") {
    const r = await db.query(Q.canEdit, [studentId]);
    if (r.rows?.[0]?.ok !== true)
      return { ...out, why: "진도 체크가 닫혀 있다 — 설정에서 켜야 아이가 찍는다" };

    // ⚠️ ① **그날 판의 slot 을 여기서 붙인다.** 아이 화면은 slot 을 안 보내고, 형제 긁기(gather)는
    //    검사(check) 입구에서만 돈다 — 그래서 「그날 예습으로만 깔린 단원」을 아이가 누르면
    //    통째로 완료가 됐다(검증 2026-09-02). 같은 단원이 등원·숙제로도 깔려 있으면 그쪽이 이긴다.
    const dayIds = [...new Set(marks.map((m) => m.unitId))];
    const dRows = (await db.query(Q.daySlots, [studentId, on, dayIds])).rows ?? [];
    const slotOf = new Map();
    for (const r2 of dRows) {
      const cur = slotOf.get(r2.unit_id);
      if (cur === undefined || slotRank(r2.slot) > slotRank(cur)) slotOf.set(r2.unit_id, r2.slot ?? null);
    }
    marks = marks.map((m) => (m.slot == null && slotOf.has(m.unitId)
      ? { ...m, slot: slotOf.get(m.unitId) } : m));
  }

  // ⚠️ ③ 한 건씩 불러도 안 깨지게, **같은 판의 형제 항목을 다시 긁어 온다.**
  //    옛 앱은 /check 에서 ○ 뒤 「한 번에 ✕」를 누르면 그 ○ 이 지워졌다.
  //    → 부르는 쪽은 day_item 을 **먼저 쓰고** 이 함수를 부른다.
  const sheetIds = [...new Set(marks.map((m) => m.sheetId).filter(Boolean))];
  if (opts.gather !== false && by === "check" && sheetIds.length) {
    const sib = await db.query(Q.siblings, [sheetIds]);
    const mine = new Set(marks.map((m) => m.itemId).filter(Boolean));
    for (const r of sib.rows ?? []) {
      if (mine.has(r.id)) continue;                       // 부르는 쪽이 넘긴 값이 더 새것이다
      marks.push({ unitId: r.unit_id, mark: r.status, slot: r.slot,
                   range: r.range_note, itemId: r.id, sheetId: r.sheet_id, gathered: true });
    }
  }
  marks = winner(marks);

  const unitIds = [...new Set(marks.map((m) => m.unitId))];
  const uRows = (await db.query(Q.units, [unitIds])).rows ?? [];
  const unitOf = new Map(uRows.map((u) => [u.id, u]));

  // ⚠️ 없는 단원이 하나라도 섞이면 **아무것도 저장하지 않는다.** 부분 저장이 더 나쁘다
  //    (2026-08-17 실제 사고 — 엑셀로 단원을 갈아끼운 뒤 그 전에 열어 둔 화면으로 저장)
  const stale = unitIds.filter((id) => !unitOf.has(id));
  if (stale.length)
    return { ...out, why: "화면을 새로고침해 주세요 — 교재 단원이 바뀌었습니다", stale };

  // ⚠️ ④ 회독은 배정 줄에서 온다. **지어내지 않는다**
  const bookIds = [...new Set(uRows.map((u) => u.book_id))];
  const rRows = (await db.query(Q.round, [studentId, bookIds, on])).rows ?? [];
  const roundOf = new Map();
  for (const r of rRows) if (!roundOf.has(r.book_id)) roundOf.set(r.book_id, r);

  const prev = (await db.query(Q.progress, [studentId, unitIds])).rows ?? [];
  const parts = (await db.query(Q.parts, [studentId, unitIds])).rows ?? [];

  const plan = [];
  for (const m of marks) {
    const unit = unitOf.get(m.unitId);
    // 내려둔 단원(state≠'active')은 진도율 분모에서도 빠진다 — 여기서도 안 올린다
    if (unit.state !== "active") {
      out.skipped.push({ unitId: m.unitId, why: `내려둔 단원(${unit.state})이라 안 올렸다` });
      continue;
    }
    const rr = roundOf.get(unit.book_id);
    // ⚠️ 회독은 **지어내지 않는다.** 배정 줄에서 오거나(보통), ❗이의처럼 그 줄이 스스로
    //    「몇 회독 이야기인가」를 들고 온 경우에만 그것을 쓴다(`m.round`).
    const round = m.round != null ? Number(m.round) : rr ? Number(rr.round) : null;
    if (round == null) {                                  // 배정 줄이 없다 — 1회독으로 치지 않는다
      out.skipped.push({ unitId: m.unitId, why: "⚠️ 이 교재 배정 줄이 없어 회독을 모른다 — 안 올렸다" });
      continue;
    }
    if (m.round == null && !rr.in_window)
      out.notes.push(`⚠️ ${unit.chapter ?? ""} — 오늘 열린 배정이 아니라 마지막 배정의 ${round}회독으로 썼다`);

    // ⚠️ 대표 하나의 메모가 아니라 **그 단원에 붙은 ○ 의 메모를 전부** 접어서 잰다
    const range = mergeRanges(m.notes ?? (m.range == null ? [] : [m.range]));
    const mine = parts.filter((p) => p.unit_id === m.unitId && Number(p.round) === round);
    const existing = prev.find((p) => p.unit_id === m.unitId && Number(p.round) === round) ?? null;
    const d = decideOne({ mark: m.mark, slot: m.slot, unit, parts: mine, range,
                          existing, by, on, judge: m.judge, viaParts: m.viaParts === true });

    if (d.act === "block") { out.blocked.push({ unitId: m.unitId, why: d.why }); continue; }
    if (d.act === "none") { out.skipped.push({ unitId: m.unitId, why: d.why }); continue; }
    plan.push({ m, unit, round, range, existing, d });
  }

  if (dryRun) {   // 절 ㊳ 「이대로 마감하면 PSS 1-4 · 1-5 가 ○ 로 올라갑니다」
    for (const p of plan)
      out.applied.push(view(p, by));
    return { ...out, ok: true, dryRun: true };
  }

  const tx = opts.tx !== false;
  if (tx) await db.query("begin");
  try {
    for (const p of plan) {
      // 조각을 먼저 남긴다 — 다음에 이 소단원이 나올 때 「지난번 p.31-34 까지 냈습니다」가 여기서 나온다
      // ⚠️ 못 읽는 메모가 섞인 판에서는 `d.save`(읽힌 형제의 범위)로 남긴다 — 그 자리에서만 다르다
      const save = p.d.save ?? (p.range.spans.length
        ? { axis: p.d.axis ?? (p.range.kind === "q" ? "q" : "page"), spans: p.range.spans } : null);
      if (p.d.act === "set" && p.m.mark === "done" && save?.spans?.length) {
        // 자를 못 정했으면 **메모가 스스로 밝힌 축**으로 남긴다 (쪽으로 지어내지 않는다)
        const ax = save.axis;
        const note = (p.m.notes ?? [p.m.range]).filter(Boolean).join(" · ") || null;
        for (const [a, b] of save.spans) {
          const v = ax === "q" ? [a, b, null, null] : [null, null, a, b];
          const seen = await db.query(Q.partSeen,
            [studentId, p.m.unitId, p.round, v[0], v[1], v[2], v[3]]);
          if ((seen.rows ?? []).length) continue;         // 같은 조각을 두 번 안 남긴다
          await db.query(Q.partAdd,
            [studentId, p.m.unitId, p.round, v[0], v[1], v[2], v[3], note, on]);
          out.parts.push({ unitId: p.m.unitId, round: p.round, axis: ax, from: a, to: b });
        }
      }
      const status = p.d.act === "down" ? "none" : p.d.status;
      const doneOn = p.d.act === "down" ? null : (p.d.doneOn ?? null);
      // ⚠️ 아이가 찍은 줄은 **확인 기다리는 중**으로만 선다 (절 ㊶ ②)
      const lastBy = by === "import" ? "import" : by === "student" ? "student"
                   : by === "check" ? "check" : "staff";
      // marked_on — **만진 날.** ◐ 에도 날짜가 남아야 ✕ 가 오늘 찍은 ◐ 을 도로 내릴 수 있다(0065)
      await db.query(Q.write,
        [studentId, p.m.unitId, p.round, status, doneOn, lastBy, by !== "student", on]);
      out.applied.push(view(p, by));
    }
    if (tx) await db.query("commit");
  } catch (e) {
    if (tx) await db.query("rollback").catch(() => {});
    return { ...out, why: `저장 못 했다 — ${String(e?.message ?? e)}` };
  }
  return { ...out, ok: true };
}

const view = (p, by) => ({
  unitId: p.m.unitId, round: p.round,
  from: p.existing?.status ?? "none",
  to: p.d.act === "down" ? "none" : p.d.status,
  ask: p.d.ask === true,
  pending: by === "student",
  slot: p.m.slot ?? null,
  axis: p.d.axis ?? null,          // 화면이 「남은 쪽」과 「남은 문항」을 구별해 쓴다
  why: p.d.why,
});

/* ── 다섯 입구 ────────────────────────────────────────────────── */

/** ① 숙제 검사 ○△✕ — day_item 을 **먼저 쓰고** 부른다 */
export const fromCheck = (db, i, o) => checkProgress(db, { ...i, by: "check" }, o);

/** ② 원장이 진도판에서 직접 — 커서가 잠겼을 때 푸는 **기본 손잡이**(계획 1100줄) */
export const fromStaff = (db, i, o) => checkProgress(db, { ...i, by: "staff" }, o);

/** ⑤ 아이가 찍기(절 ㊶) — `last_by='student'` · `confirmed=false` 로만 선다 */
export const fromStudent = (db, i, o) => checkProgress(db, { ...i, by: "student" }, o);

/**
 * ④ 메모로 대신한 날 마감(절 ㊳). ⚠️ **방아쇠는 마감이다** — 메모를 적는 순간이 아니다(적다 지울 수 있다).
 * ⚠️ **그 교재만.** 한 줄이 새면 그날 판의 모든 교재가 통째로 ○ 가 되고, 오류도 안 나고 진도율은 좋아 보인다.
 * ⚠️ 확인 안 됨 — 어느 묶음을 올릴지. 지금은 **등원(class)** 만 올린다(메모는 그날의 「오늘 학습」이다).
 *    숙제·예습은 아이가 집에서 하는 것이라 안 올린다. `opts.slots` 로 넓힐 수 있다.
 * `opts.dryRun` 이면 「이대로 마감하면 …가 ○ 로 올라갑니다」 목록만 돌려준다.
 */
export async function fromMemo(db, { studentId, on, bookId, by = "staff" } = {}, opts = {}) {
  if (!bookId) return { ok: false, why: "교재가 없다 — 메모 자동완료는 **그 교재만** 건드린다" };
  const slots = new Set(opts.slots ?? ["class"]);
  const rows = (await db.query(Q.memoItems, [studentId, on, bookId])).rows ?? [];
  const mine = rows.filter((r) => slots.has(r.slot));
  // ⚠️ **이미 찍어 둔 줄은 마감이 안 건드린다.** 그날 ✕(안 해왔다)로 찍어 둔 항목까지
  //    통째로 ○ 로 뒤집혀서, 원장님이 남긴 판단이 마감 한 번에 조용히 사라졌다(검증 2026-09-02).
  //    「손 안 댄 것」의 뜻은 IGNORE 한 곳에만 있다(원칙 1).
  const kept = mine.filter((r) => !IGNORE.has(r.status ?? null));
  const marks = mine.filter((r) => IGNORE.has(r.status ?? null))
    .map((r) => ({ unitId: r.unit_id, mark: "done", slot: r.slot,
                   range: r.range_note, itemId: r.id, sheetId: r.sheet_id }));
  const res = await checkProgress(db, { studentId, on, by, marks }, { ...opts, gather: false });
  // 미리보기에도 「이건 이미 ✕ 라 안 올립니다」가 같이 나가야 원장님이 속지 않는다
  return { ...res, kept: kept.map((r) => ({ unitId: r.unit_id, itemId: r.id, status: r.status,
    why: `이미 ${MARK_LABEL[r.status] ?? r.status} 로 찍힌 줄이라 마감이 안 건드린다` })) };
}

const MARK_LABEL = { done: "○", weak: "△", missing: "✕", skip: "건너뜀" };

/**
 * ③ 조각이 원본을 다 덮을 때. **원장님이 돌아와서 다시 안 찍는다.**
 * ⚠️ 이미 ◐ 인 것만 올린다 — 아무도 ○ 을 준 적 없는 단원을 조각만으로 완료로 올리지 않는다.
 * ⚠️ **조각이 실제로 있는 단원만 본다.** 이 두 줄이 없어서 조각이 0줄인 ◐(예습 ○ 으로 선 것,
 *    △ 로 선 것)이 rollup 한 번에 완료로 찍혔다 — 「반드시 막는 것 ①」이 입구 ③ 으로 통째로
 *    새 나가던 자리다(검증 2026-09-02). `viaParts` 는 「범위 메모가 없으면 통째」 지름길을 막는다.
 */
export async function rollup(db, { studentId, unitIds = [], on, by = "staff" } = {}, opts = {}) {
  if (!unitIds.length) return { ok: true, applied: [], skipped: [], blocked: [], parts: [], notes: [] };
  const prev = (await db.query(Q.progress, [studentId, unitIds])).rows ?? [];
  const parts = (await db.query(Q.parts, [studentId, unitIds])).rows ?? [];
  // (단원, 회독)이 열쇠다 — 1회독 조각으로 2회독 ◐ 을 올리지 않는다
  const hasPart = new Set(parts.map((p) => `${p.unit_id}#${Number(p.round)}`));
  const marks = prev
    .filter((p) => p.status === "doing" && unitIds.includes(p.unit_id)
                && hasPart.has(`${p.unit_id}#${Number(p.round)}`))
    .map((p) => ({ unitId: p.unit_id, mark: "done", slot: null, range: null,
                   round: Number(p.round), judge: true, viaParts: true }));
  return checkProgress(db, { studentId, on, by, marks }, { ...opts, gather: false });
}

/* ── 아이가 찍은 것 · 이의 ─────────────────────────────────────── */

/** 「아이가 찍은 것 14개」 — **한 자리에서** 확인/되돌린다 (절 ㊶ ④) */
export const pendingMarks = (db, { limit = 200 } = {}) =>
  db.query(Q.pending, [limit]).then((r) => r.rows ?? []);

/** 확인(테두리 없앰) 또는 되돌림. ⚠️ 되돌려도 **지우지 않는다 — 상태로 내린다** */
export async function settleMarks(db, keys = [], { revert = false } = {}) {
  let n = 0;
  for (const k of keys) {
    const r = await db.query(revert ? Q.revert : Q.confirm, [k.studentId, k.unitId, k.round]);
    n += r.rowCount ?? 0;
  }
  return { n, revert };
}

/** ❗이의를 단다. ⚠️ **진도는 안 바뀐다** — 원장님이 누르는 순간에만 바뀐다 */
export async function raiseFlag(db, { studentId, unitId, round, kind, said } = {}) {
  const r = await db.query(Q.flagAdd, [studentId, unitId, round, kind, said ?? null]);
  return { id: r.rows?.[0]?.id ?? null };
}

/** 아직 안 본 이의 — `outcome is null` 이 곧 미처리 대기열이다 */
export const openFlags = (db, { limit = 200 } = {}) =>
  db.query(Q.flagOpen, [limit]).then((r) => r.rows ?? []);

/**
 * 원장님이 이의를 닫는다. `outcome='changed'` 일 때 **그때 처음** 진도가 바뀐다 —
 * 그것도 이 파일의 `checkProgress` 를 지난다(옆문 없음). `kept` 면 진도는 그대로.
 *
 * ⚠️ **이의와 진도는 한 판이다.** 먼저 이의를 닫고 나중에 진도를 바꾸면, 진도가 안 바뀌어도
 *    이의는 이미 `outcome='changed'` 로 닫혀 **대기열에서 사라진다** — 다시 볼 길이 없다.
 *    (날짜를 안 넘긴 경우 · 그 교재 배정 줄이 없는 경우에 실제로 그랬다. 검증 2026-09-02)
 * ⚠️ **진도가 안 바뀌었으면 이의도 안 닫는다.** 그리고 그때는 `ok:false` 로 답한다 —
 *    `ok:true` 를 돌려주면 원장님은 눌렀고 화면은 성공이라 하는데 값만 안 바뀐다.
 * ⚠️ **회독은 이의가 들고 있던 그 회독**이다. 여기서 오늘 배정을 다시 뽑으면
 *    1회독 때 단 이의를 2회독 시작 뒤에 닫을 때 **2회독 줄이 바뀐다.**
 * ⚠️ `opts.tx === false` 로 부르면 이 한 판이 풀린다 — 그때는 진도가 안 바뀌어도 이의가 닫힌다.
 */
export async function resolveFlag(db, { flagId, outcome, seenBy, on, to } = {}, opts = {}) {
  if (outcome === "changed" && !isDate(on))
    return { ok: false, why: "검사일(YYYY-MM-DD)이 없다 — 이의를 열어 둔 채 아무것도 안 했다" };
  const tx = opts.tx !== false;
  if (tx) await db.query("begin");
  try {
    const row = (await db.query(Q.flagClose, [flagId, seenBy ?? null, outcome])).rows?.[0];
    if (!row) { if (tx) await db.query("rollback"); return { ok: false, why: "이미 처리된 이의다" }; }
    if (outcome !== "changed") { if (tx) await db.query("commit"); return { ok: true, changed: null }; }

    const res = await checkProgress(db, {
      studentId: row.student_id, on, by: "staff",
      marks: [{ unitId: row.unit_id, round: row.round,
                mark: to ?? (row.kind === "not_done" ? "missing" : "done") }],
    }, { tx: false, gather: false });

    if (!res.ok || res.applied.length !== 1) {
      if (tx) await db.query("rollback");
      return { ok: false, changed: res,
               why: res.why ?? res.skipped[0]?.why ?? res.blocked[0]?.why
                    ?? "진도가 안 바뀌었다 — 이의를 열어 둔다" };
    }
    if (tx) await db.query("commit");
    return { ok: true, changed: res };
  } catch (e) {
    if (tx) await db.query("rollback").catch(() => {});
    return { ok: false, why: `저장 못 했다 — ${String(e?.message ?? e)}` };
  }
}
