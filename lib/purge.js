/**
 * 개인정보 파기 · 파일 정리 — **여기 한 벌뿐이다.**
 *
 * 파기는 **삭제가 아니라 비식별화**다 (대전제 6 — 지우지 않는다, 상태로 내린다).
 * 이름·전화·굳은 글만 비우고 **줄과 숫자는 남긴다.** 옛 앱은 그 뒤 「이름 없는 통계」가 된다.
 *
 * ⚠️ **화면마다 따로 지우게 두면 언젠가 한 곳이 빠진다.**
 *    빠진 자리는 오류를 안 내므로 **아무도 모른 채 이름이 남는다.**
 *    그래서 파기는 `v2.purge_map`(파기 목록 표) **한 벌을 돌아** 돈다.
 *    목록에 없는 새 표를 만들면 `scripts/check-schema.mjs` 가 깨진다 (자동 검사 ⑨).
 *
 * ⚠️ **`v2` 밖은 이 파일이 한 톨도 안 건드린다** — `auth.users` · Storage · 옛 `public` 스키마.
 *    거기 남는 것은 `HAND_WORK` 로 **목록만** 낸다. 「손으로 하는 자리」다 (계획 0단계 9번).
 *
 * ⚠️ **검증 6-a 의 함정** — `fixture` 학생으로 도는 파기 리허설은 `fixture` 가 `v2` 에만 있어서
 *    **`public` 을 한 번도 안 본다.** 그 초록을 「DB 전체가 깨끗하다」로 읽으면 안 된다.
 *    두 벌 확인(검증 6-b)은 D+30 에 **따로** 센다.
 *
 * ⚠️ **파기는 한 트랜잭션에서 돌아야 한다.** 부르는 쪽이 `begin`/`commit` 을 잡는다.
 *    중간에 터지면 **앞 칸은 비고 뒤 칸은 그대로**인 반쪽 상태가 남는데, 오류가 조용해서
 *    다음 리허설 때까지 아무도 모른다.
 *
 * db 는 `{ query(sql, params) -> { rows, rowCount } }` 짜리 얕은 어댑터다 (검사가 가짜를 끼운다).
 */

/** 가리는 글자 */
export const MASK_CHAR = "○";

/**
 * 가리기 — 첫 글자만 남기고 나머지를 ○ 로. 「최윤정」 → 「최○○」
 * ⚠️ 규칙이 **SQL 로만** 있다. JS 에 한 벌 더 두면 두 벌이 어긋나도 아무도 모른다(원칙 1).
 *    검사는 이 식을 **진짜 DB 에서 SELECT 로 평가해** 본다.
 */
export function maskExpr(col) {
  return `left(${col}, 1) || repeat('${MASK_CHAR}', greatest(char_length(${col}) - 1, 0))`;
}

/**
 * ⚠️ **모양 제약이 걸린 칸은 가리면 안 된다.**
 *    `v2.profiles.login_id` 에는 `profiles_login_id_shape` CHECK 가 걸려 있다
 *    (학생 `^chloe[0-9]{4}$` · 학부모 `^01[0-9]{8,9}$`).
 *    여기에 「최○○」 을 넣으면 **그 UPDATE 가 그 자리에서 터지고 파기가 중간에 멈춘다.**
 *    → 모양 제약이 걸린 칸은 **가리지 않고 비운다(null).** NULL 은 제약을 통과한다.
 *    학부모 아이디는 곧 전화번호이므로, 비우는 것이 가리는 것보다 맞기도 하다.
 *    이 집합은 `columnFacts()` 가 진짜 제약을 읽어 채운다 — 아래는 **안 읽었을 때의 바닥값**이다.
 */
export const SHAPED = new Set(["profiles.login_id"]);

/**
 * 닿는 길 표 — 「이 표의 한 줄이 **누구 것인가**」.
 *
 * 파기 목록 표(`v2.purge_map`)는 **어느 칸에 개인정보가 있나**만 말한다.
 * 그 줄이 **누구 것인지**는 표마다 다르고, 그건 판단이라 `lib/` 에 산다.
 * ⚠️ 두 목록이 어긋나면 파기가 그 표를 **조용히 건너뛴다** — `coverageGaps()` 와
 *    `scripts/check-purge.mjs` 가 양쪽을 맞물려 검사한다.
 *
 *   id      — 그 줄이 곧 학생 줄
 *   profile — 사람 줄 (학생 본인 + **지울 수 있는** 학부모)
 *   student — `student_id` 로 바로 닿는다
 *   sheet   — `sheet_id` 를 타고 그날 판으로 닿는다
 *   file    — 그 아이에게 붙었거나 **그 집이 올린** 파일
 *   none    — ⚠️ **학생으로는 안 닿는다.** 나이(보관 기한)로 돌아야 하는데 기한이 아직 없다
 */
export const REACH = {
  students:       { by: "id" },
  student_alias:  { by: "student" },   // ⚠️ alias 는 사람 이름이다
  profiles:       { by: "profile" },
  day_sheet:      { by: "student" },
  day_item:       { by: "sheet" },
  late_stay:      { by: "sheet" },
  day_area_memo:  { by: "sheet" },   // 그날 그 아이에게 나간 한 줄 — 판을 타고 닿는다 (0079)
  progress:       { by: "student" },
  progress_part:  { by: "student" },
  progress_flag:  { by: "student" },
  consult:        { by: "student" },
  monthly_report: { by: "student" },
  payment:        { by: "student" },
  score:          { by: "student" },
  todo:           { by: "student" },
  warning_action: { by: "student" },
  request:        { by: "student" },
  scheduled_send: { by: "student" },
  notify_log:     { by: "student",
    warn: "학생이 안 붙은 알림 자취(집 전체에 간 것)는 안 닿는다 — 학부모 파기 때 같이 돈다" },
  inquiry:        { by: "student",
    warn: "학생으로 안 이어진 신규 문의(student_id 가 빈 줄)는 안 닿는다 — 나이로 돌아야 한다" },
  file:           { by: "file",
    // ⚠️ 자료함 묶음에 붙은 파일은 **다른 아이도 본다.** 한 집이 퇴원했다고 손대면
    //    옥련여고 1학기 수행평가 안내가 다른 집들에서 통째로 사라진다.
    //    계획 ㊸ — 「퇴원해도 학교 묶음의 것은 다른 아이 것이기도 하므로 **「올린 사람 것」만 지운다**」
    // ⚠️ **이 술어는 세 자리 전부에 걸려야 한다** — 줄 내리기(row) · 이름 가리기(mask) ·
    //    Storage 경로 목록(`storagePaths`). 앞 판에서는 **row 한 자리에만** 걸려 있었고,
    //    그 결과 (ㄱ) 이름이 「옥○○○○○」 로 덮이고 (ㄴ) service_role 이 경로를 받아
    //    **버킷에서 진짜 파일을 지웠다.** 줄은 active 로 남고 path 도 멀쩡해서
    //    다른 학교 아이들 자료함에는 그대로 보이는데 **누르면 안 열린다.**
    //    오류도 안 나고 로그도 안 남는다. `scripts/check-files.mjs` 가 세 자리를 다 본다.
    exceptRow: "id not in (select file_id from v2.file_link where bin_id is not null)" },
  notice:         { by: "none" },
  holiday:        { by: "none" },
  comment_sample: { by: "none" },
};

export function reachOf(tbl) {
  return REACH[tbl] ?? null;
}

/** ⚠️ `v2` 밖 — **이 파일이 안 건드린다.** 손으로 하는 자리다 (계획 0단계 9번) */
export const HAND_WORK = [
  { where: "auth.users",
    what: "학생 로그인 아이디 · 학부모는 **전화번호가 곧 아이디**",
    why: "v2 밖이라 파기 한 벌이 안 닿는다. 안 지우면 퇴원생 학부모가 **그대로 로그인된다**" },
  { where: "Storage 버킷",
    what: "v2.file.path 가 가리키는 **진짜 파일** (숙제 사진 · 녹음)",
    why: "v2 밖. `purgeStudent`/`purgeFiles` 가 낸 `storagePaths` 를 받아 지운다" },
  { where: "옛 public 스키마",
    what: "같은 아이의 이름·전화·상담일지·굳은 발송 글 **한 벌 더**",
    why: "D+30 에 한 번 도는 SQL 파일 하나. ⚠️ **지우는 날을 안 적으면 그 두 벌은 영구가 된다**" },
  { where: "바깥 단어 서비스 원본 3표",
    what: "저쪽에 남는 아이 이름·아이디",
    why: "v2 밖" },
];

export function handWork(mapRows = []) {
  const outside = mapRows
    .filter((r) => (r.schema_name ?? "v2") !== "v2")
    .map((r) => ({ where: `${r.schema_name}.${r.tbl}`, what: r.col, why: "v2 밖 — 파기 한 벌이 안 닿는다" }));
  return [...HAND_WORK, ...outside];
}

// ── 칸 사정 ────────────────────────────────────────────────────────────
/**
 * 「이 칸이 비워지는가 · 겹치면 안 되는가 · 제약이 걸렸는가」를 **진짜 DB 에서 읽는다.**
 * ⚠️ 읽기 전용이다. 이걸 안 읽고 계획을 세우면 not null 칸에 null 을 넣으려다 터진다.
 */
export async function columnFacts(db) {
  const col = {}, table = {};
  const c = await db.query(
    `select table_name t, column_name c, is_nullable n
       from information_schema.columns where table_schema = 'v2'`, []);
  for (const r of c.rows) {
    col[`${r.t}.${r.c}`] = { notNull: r.n === "NO", unique: false, checked: false };
    table[r.t] = table[r.t] || { state: false, id: false };
    if (r.c === "state") table[r.t].state = true;
    if (r.c === "id") table[r.t].id = true;
  }
  const one = await db.query(
    `select c.relname t, a.attname c, k.contype ty
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join unnest(k.conkey) ck(attnum) on true
       join pg_attribute a on a.attrelid = c.oid and a.attnum = ck.attnum
      where n.nspname = 'v2' and k.contype in ('u', 'p', 'c')`, []);
  for (const r of one.rows) {
    const k = `${r.t}.${r.c}`;
    if (!col[k]) continue;
    if (r.ty === "c") col[k].checked = true;
    else col[k].unique = true;
  }
  return { col, table };
}

const FACT = (facts, tbl, c) =>
  facts?.col?.[`${tbl}.${c}`] ?? { notNull: false, unique: false, checked: false };
const TFACT = (facts, tbl) => facts?.table?.[tbl] ?? { state: false, id: false };

// ── 어디를 겨누는가 ─────────────────────────────────────────────────────
function predFor(tbl, target) {
  const r = REACH[tbl];
  if (!r) return { kind: "gap" };

  if (target.kind === "file") {
    if (tbl !== "file") return { kind: "skip" };
    return { kind: "ok", sql: "id = any($1)", params: [target.fileIds] };
  }
  switch (r.by) {
    case "id":      return { kind: "ok", sql: "id = $1", params: [target.studentId] };
    case "student": return { kind: "ok", sql: "student_id = $1", params: [target.studentId] };
    case "sheet":   return { kind: "ok",
      sql: "sheet_id in (select id from v2.day_sheet where student_id = $1)", params: [target.studentId] };
    case "profile": return { kind: "ok", sql: "id = any($1)", params: [target.profileIds ?? []] };
    case "file":    return { kind: "ok",
      sql: "(student_id = $1 or by_profile = any($2))", params: [target.studentId, target.profileIds ?? []] };
    case "none":    return { kind: "none" };
    default:        return { kind: "gap" };
  }
}

/** how = 'row' 일 때 그 칸에 넣을 무덤값. ⚠️ 겹치면 안 되는 칸을 통째로 비우면 UPDATE 가 터진다 */
function tombExpr(tbl, c, f, t) {
  if (f.unique) {
    if (!t.id) return null;           // 열쇠가 겹치는데 붙일 id 가 없다 → 못 돈다
    return `'purged:' || id::text`;
  }
  if (!f.notNull) return "null";
  return "''";
}

// ── 계획을 세운다 (순수 함수 — 검사가 이것만 따로 부른다) ───────────────
/**
 * 파기 목록 표 + 닿는 길 + 칸 사정 → **실제로 돌 문장들.**
 *
 * @returns {steps, blocked, notReached, outside, warns}
 *   steps      돌 문장
 *   blocked    ⚠️ **돌면 터지는 자리.** 안 돌고 세워 둔다 — 목록이나 스키마를 고쳐야 한다
 *   notReached ⚠️ **학생으로 안 닿는 표.** 조용히 넘기지 않고 내놓는다
 *   outside    ⚠️ v2 밖 — 손으로 하는 자리
 *   expired    **날짜로 지우는 줄** — 사람으로 못 찾는 자리(엑셀 되돌리기 자료). 크론이 따로 돈다
 */
export function planFor({ map = [], facts = {}, target }) {
  const steps = [], blocked = [], notReached = [], outside = [], warns = [], expired = [];
  const shaped = new Set(SHAPED);
  for (const [k, v] of Object.entries(facts.col ?? {})) if (v.checked) shaped.add(k);

  for (const m of map) {
    const schema = m.schema_name ?? "v2";
    if (schema !== "v2") { outside.push({ ...m, why: "v2 밖 — 이 파일이 안 건드린다" }); continue; }

    // ⚠️ **날짜로 지우는 줄은 사람 파기 계획에 안 들어간다.** 닿는 길을 물어서는 안 된다 —
    //    `excel_row.before` 는 어느 표의 줄이든 통째로 담아 「이 아이 것만」을 원리적으로 못 고른다.
    //    그래서 기한(after_days)이 반드시 있고, 크론이 그 기한으로 돈다.
    if (isExpire(m)) {
      if (m.after_days == null) { blocked.push({ ...m, why: "날짜로 지우는데 기한이 없다 — 무기한은 못 쓴다" }); continue; }
      expired.push({ tbl: m.tbl, col: m.col, afterDays: m.after_days,
        sql: `update v2.${m.tbl} set ${m.col} = null
               where at < (v2.today() - ($1||' days')::interval) and ${m.col} is not null`,
        params: [String(m.after_days)] });
      continue;
    }

    const p = predFor(m.tbl, target);
    if (p.kind === "skip") continue;
    if (p.kind === "gap") { blocked.push({ ...m, why: "닿는 길이 없다 — REACH 에 이 표가 없다" }); continue; }
    if (p.kind === "none") {
      notReached.push({ ...m, why: "학생으로 안 닿는다 — 보관 기한(나이)으로 돌아야 하는데 기한이 아직 없다" });
      continue;
    }
    if (REACH[m.tbl]?.warn) warns.push({ tbl: m.tbl, warn: REACH[m.tbl].warn });

    const f = FACT(facts, m.tbl, m.col), t = TFACT(facts, m.tbl);
    const key = `${m.tbl}.${m.col}`;

    // ⚠️ **지키는 술어는 어느 가지에서도 빠지면 안 된다.** 줄만 지키고 이름을 가리면
    //    남의 집 학교 자료가 「옥○○○○○」 가 되고, 그건 되돌릴 수 없다.
    //    앞 판에서 이 줄이 `how === 'row'` 가지 **안**에 있었다 (사고 원인).
    const except = REACH[m.tbl]?.exceptRow ? ` and ${REACH[m.tbl].exceptRow}` : "";

    if (m.how === "row") {
      if (!t.state) { blocked.push({ ...m, why: "줄을 내릴 state 칸이 없다" }); continue; }
      const tomb = tombExpr(m.tbl, m.col, f, t);
      if (tomb === null) { blocked.push({ ...m, why: "겹치면 안 되는 칸인데 붙일 id 가 없다" }); continue; }
      steps.push({ tbl: m.tbl, col: m.col, how: "row", as: "row", last: true,
        sql: `update v2.${m.tbl} set state = 'purged', ${m.col} = ${tomb}`
           + ` where ${p.sql} and state <> 'purged'${except}`,
        params: p.params });
      continue;
    }

    let as = m.how, set;
    if (m.how === "null") {
      if (f.notNull) { blocked.push({ ...m, why: "not null 인 칸인데 목록이 null 이라 한다" }); continue; }
      set = `${m.col} = null`;
    } else if (m.how === "blank") {
      set = `${m.col} = ''`;
    } else if (m.how === "mask") {
      // ⚠️ 모양 제약이 걸린 칸은 가리면 UPDATE 가 터져 **파기가 중간에 멈춘다** → 비운다
      if (shaped.has(key)) {
        if (f.notNull) { blocked.push({ ...m, why: "모양 제약 + not null — 가릴 수도 비울 수도 없다" }); continue; }
        as = "null"; set = `${m.col} = null`;
      } else {
        set = `${m.col} = ${maskExpr(m.col)}`;
      }
    } else {
      blocked.push({ ...m, why: `모르는 파기 방법 '${m.how}'` }); continue;
    }

    steps.push({ tbl: m.tbl, col: m.col, how: m.how, as, last: false,
      sql: `update v2.${m.tbl} set ${set} where ${p.sql} and ${m.col} is not null${except}`,
      params: p.params });
  }

  // ⚠️ 줄 내리기는 **맨 뒤.** file.path 를 무덤값으로 덮기 전에 Storage 경로를 읽어야 한다
  steps.sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0));
  // ⚠️ expired 는 **사람 파기와 같이 안 돈다.** 크론이 날마다 따로 돌린다 —
  //    한 아이를 지운다고 남의 되돌리기 자료를 같이 날리면 안 된다.
  return { steps, blocked, notReached, outside, warns, expired };
}

/* ══ 「파기한 날」 도장 (처음-3) ══════════════════════════════════════════
 * ⚠️⚠️ **도장은 걸음(step)이 아니다.** `planFor` 안에 넣지 않는다 —
 *    `planFor` 를 부르는 곳이 셋이고(사람 파기 · 파일 정리 · **기한 크론**),
 *    걸음으로 넣으면 기한 크론 계획에 `update v2.students … where id = null` 이 실린다.
 *    술어를 누가 손대는 날 **야간 크론이 전원에게 도장을 찍는다.**
 *    그리고 목록에서 안 나온 걸음을 끼우면 이미 있는 검사 다섯이 한꺼번에 깨진다.
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * **이름이 v2 어딘가에 그대로 남았나** — 목록을 안 믿고 진짜로 훑는다.
 *
 * ⚠️ 왜 목록을 안 믿나: `runSteps` 는 **0줄을 고쳐도 통과한다**(터지는 조건이
 *    「rowCount 를 못 센다」뿐이다). 접근 규칙이 막거나 술어가 빗나가 한 줄도 안 바뀌어도
 *    막힘(blocked)은 0 이고 예외도 안 난다 — 그 상태로 도장을 찍으면 **거짓말**이다.
 * ⚠️ 가려진 이름(`최○○`)은 남은 것이 아니다 — 가린 결과다. 그래서 **가림표를 뺀 뒤** 찾는다.
 */
export async function residue(db, name) {
  const 이름 = String(name ?? "").trim();
  if (!이름) return [];
  const cols = await db.query(
    `select table_name as tbl, column_name as col
       from information_schema.columns
      where table_schema = 'v2' and data_type in ('text','character varying')
        and table_name not in ('audit','purge_map','import_map','import_skip','import_check','migration')
      order by 1, 2`);
  // ⚠️ 이름은 information_schema 에서 왔지만 **그래도 거른다.** 소문자·밑줄·숫자만 통과 —
  //    이상한 이름 하나가 문장을 통째로 깨뜨리는 길을 아예 없앤다
  const 성한이름 = (x) => /^[a-z_][a-z0-9_]*$/.test(String(x ?? ""));
  const 자리 = (cols.rows ?? [])
    .filter((r) => 성한이름(r.tbl) && 성한이름(r.col))
    .filter((r) => !(r.tbl === "students" && r.col === "state"));
  if (!자리.length) return [];
  // ⚠️ 칸마다 한 번씩 물으면 파기 한 번에 조회가 수백 번이다 — **한 문장으로 합친다**
  // ⚠️ 표·칸 **이름 자리**라 `scripts/check-sql.mjs` 가 물어볼 수가 없다(「못 물어봄」으로 센다).
  //    그래서 위 거르개가 그 자리를 대신 지킨다.
  const 조각 = 자리.map((r) =>
    `select '${r.tbl}' t, '${r.col}' c, count(*)::int n from v2.${r.tbl} where ${r.col} like $1`);
  const r = await db.query(조각.join(" union all "), [`%${이름}%`]);
  return (r.rows ?? []).filter((x) => x.n > 0).map((x) => ({ tbl: x.t, col: x.c, rows: x.n }));
}

/**
 * **도장을 찍어도 되나** — 셋이 다 맞아야 한다. 판단은 여기 한 곳이다(원칙 1).
 *
 * ⚠️ 「막힌 걸음이 하나라도 있으면 안 찍는다」로 하면 **영영 안 찍힌다.**
 *    막힘에는 날짜로 지우는 줄(`expire`)이 섞이는데 그건 **이 아이와 아무 상관이 없다** —
 *    남의 표 사정으로 이 아이의 파기일이 비면 안 된다. 그건 크론이 따로 운다.
 * ⚠️ 그리고 막힘은 「이 아이가 반쪽 파기됐나」가 아니라 **「목록+스키마가 지금 성한가」**다.
 *    나중에 목록에 잘못된 줄 하나가 들어와도 **이미 다 파기된 아이들 도장까지 같이 막힌다.**
 */
export function stampGate({ plan = {}, ran = [], residue: 남은 = [] }) {
  const why = [];
  const steps = plan.steps ?? [], blocked = plan.blocked ?? [];
  // ㄱ 계획한 문장이 전부 돌았다
  if (ran.length !== steps.length) why.push(`돈 문장 ${ran.length} ≠ 계획 ${steps.length}`);
  // ㄴ 이 아이와 상관있는 막힘만 본다
  const 내막힘 = blocked.filter((b) => !isExpire(b));
  if (내막힘.length) why.push("막힌 자리: " + 내막힘.map((b) => `${b.tbl}.${b.col}`).join(" "));
  // ㄷ 이름이 진짜로 남았나 — 목록을 안 믿는다
  if (남은.length) why.push("이름이 남았다: " + 남은.map((r) => `${r.tbl}.${r.col}(${r.rows}줄)`).join(" "));
  return { ok: why.length === 0, why };
}

/** 목록과 닿는 길이 어긋난 자리 — 어느 쪽이 비어도 파기가 그 표를 조용히 건너뛴다 */
/** ⚠️ `expire` 는 **사람이 아니라 날짜로** 지운다 — 닿는 길이 필요 없고, 있을 수도 없다.
 *  (excel_row.before 는 어느 표의 줄이든 통째로 담아 「이 아이 것만」을 못 고른다) */
export const isExpire = (r) => r.how === "expire";

export function coverageGaps(mapRows = []) {
  const v2rows = mapRows.filter((r) => (r.schema_name ?? "v2") === "v2" && !isExpire(r));
  const inMap = new Set(mapRows.filter((r) => (r.schema_name ?? "v2") === "v2").map((r) => r.tbl));
  return {
    noReach: [...new Set(v2rows.filter((r) => !REACH[r.tbl]).map((r) => r.tbl))],
    dead: Object.keys(REACH).filter((t) => !inMap.has(t)),
  };
}

// ── 돈다 ───────────────────────────────────────────────────────────────
async function runSteps(db, steps) {
  const ran = [];
  for (const s of steps) {
    const r = await db.query(s.sql, s.params);
    const n = r?.rowCount;
    // ⚠️ 몇 줄이 바뀌었는지 못 세면 **접근 규칙이 막았을 때도 화면이 「성공」이라고 말한다** (자동 검사 ⑪)
    if (typeof n !== "number") throw new Error(`어댑터가 rowCount 를 안 준다 — ${s.tbl}.${s.col}`);
    ran.push({ tbl: s.tbl, col: s.col, how: s.how, as: s.as, rows: n });
  }
  return ran;
}

export async function purgeMap(db) {
  const r = await db.query(`select schema_name, tbl, col, how, note from v2.purge_map order by tbl, col`, []);
  return r.rows;
}

/**
 * ⚠️ **형제가 재원 중이면 학부모 계정은 못 지운다.**
 *    지우면 아직 다니는 동생의 어머니가 **그날 저녁부터 로그인이 안 되고**,
 *    알림도 끊긴다. 오류는 안 나므로 「앱이 이상하다」는 전화로만 알게 된다.
 * ⚠️ 휴원(`paused`)은 **재원으로 본다** — 안 지우는 쪽이 되돌릴 수 있다. (확인 안 됨: 원장님 확인 필요)
 */
export async function siblingHold(db, parentProfileId, exceptStudentId) {
  const r = await db.query(
    `select s.id, s.name, s.state from v2.students s
       join v2.parent_student ps on ps.student_id = s.id
      where ps.parent_profile_id = $1 and s.id <> $2 and s.state <> 'left'`,
    [parentProfileId, exceptStudentId]);
  return r.rows;
}

/** 그 아이 파기에 딸려 갈 사람 줄 — 본인 + **지울 수 있는** 학부모 */
export async function whoToPurge(db, studentId) {
  // ⚠️ **이름을 여기서 잡아 둔다.** 가린 **뒤에** 물으면 이미 「최○○」라 훑을 이름이 없다
  const s = await db.query(`select profile_id, name from v2.students where id = $1`, [studentId]);
  const studentProfileId = s.rows[0]?.profile_id ?? null;
  const name = s.rows[0]?.name ?? null;
  const ps = await db.query(
    `select parent_profile_id from v2.parent_student where student_id = $1`, [studentId]);
  const parents = [];
  for (const row of ps.rows) {
    const sib = await siblingHold(db, row.parent_profile_id, studentId);
    parents.push({ id: row.parent_profile_id, held: sib.length > 0, siblings: sib });
  }
  const profileIds = [studentProfileId, ...parents.filter((p) => !p.held).map((p) => p.id)]
    .filter(Boolean);
  return { studentProfileId, name, parents, profileIds };
}

/**
 * 학생 한 명 파기 — **목록 한 벌을 돈다.**
 * ⚠️ 부르는 쪽이 트랜잭션을 잡는다. 안 잡으면 반쪽 파기가 남는다.
 */
export async function purgeStudent(db, studentId, opts = {}) {
  const map = opts.map ?? (await purgeMap(db));
  const facts = opts.facts ?? (await columnFacts(db));
  const who = await whoToPurge(db, studentId);
  const target = { kind: "student", studentId, profileIds: who.profileIds };
  const plan = planFor({ map, facts, target });

  // ⚠️ Storage 경로는 **path 를 덮기 전에** 읽는다. 덮은 뒤엔 진짜 파일을 못 찾아
  //    아이 숙제 사진이 버킷에 영원히 남는다.
  // ⚠️ **자료함 파일은 이 목록에 실으면 안 된다.** 받는 쪽(service_role)이 버킷에서 진짜 파일을
  //    지우는데, 줄은 남아 있어 **다른 학교 아이들 자료함에는 그대로 보이고 누르면 404** 다.
  //    지키는 술어는 `REACH.file.exceptRow` **한 곳**에 산다 (원칙 1).
  const keep = REACH.file?.exceptRow ? ` and ${REACH.file.exceptRow}` : "";
  const paths = await db.query(
    `select path from v2.file
      where (student_id = $1 or by_profile = any($2)) and state <> 'purged'${keep}`,
    [studentId, who.profileIds]);

  const ran = await runSteps(db, plan.steps);

  // ── 「파기한 날」 도장 (처음-3) ─────────────────────────────────────
  // ⚠️ **걸음이 아니다.** `planFor` 는 목록(purge_map)에서 나온 것만 계획한다 —
  //    그 계약을 깨면 파일·기한 크론까지 사람 표를 UPDATE 한다(위 주석).
  // ⚠️ 이름을 **가린 뒤에** 훑는다. 먼저 훑으면 안 가린 이름이 당연히 나와 늘 안 찍힌다.
  const 남은 = await residue(db, who.name ?? null);
  const gate = stampGate({ plan, ran, residue: 남은 });
  let stamped = null;
  if (gate.ok) {
    // ⚠️ `v2_masked_at is null` — **두 번 돌려도 첫 파기일이 안 바뀐다.** 첫 날이 진실이다
    const a = await db.query(
      `update v2.students set v2_masked_at = now() where id = $1::uuid and v2_masked_at is null`,
      [studentId]);
    const b = await db.query(
      `update v2.profiles set v2_masked_at = now()
        where id = any($1::uuid[]) and v2_masked_at is null`, [who.profileIds]);
    stamped = { students: a.rowCount ?? 0, profiles: b.rowCount ?? 0 };
  }

  return {
    studentId, at: new Date().toISOString(),
    ran, blocked: plan.blocked, notReached: plan.notReached,
    outside: plan.outside, warns: plan.warns,
    // ⚠️ 도장을 **못 찍었으면 왜 못 찍었는지**를 같이 준다 — 조용히 안 찍고 넘어가지 않는다
    stamped, gate, residue: 남은,
    parents: who.parents,
    // ⚠️ Storage 는 v2 밖이다 — 이 파일은 **목록만 낸다.** 받은 쪽이 지운다
    storagePaths: paths.rows.map((r) => r.path),
    hand: handWork(map),
  };
}

// ── 파일 정리 — **자동이 기본이다** ────────────────────────────────────
/**
 * ⚠️ **승인 단추를 만들지 마라.** 안 눌러도 아무 일이 안 나므로 결국 안 누르게 되고,
 *    아이들 숙제 사진·녹음이 **해가 지나도 그대로 쌓인다.**
 *    원장님이 누르는 것은 「이건 남겨 둘래요」 하나뿐이다.
 *    그래서 이 함수에는 **승인 인자가 없다.**
 */
export function beatsKeep({ purgeOn, keepUntil, today }) {
  // ⚠️ **파기가 보관을 이긴다** — 「남겨 둘래요」 기한이 남아 있어도 파기 예정일이 오면 지운다
  if (purgeOn && purgeOn <= today) return true;
  if (keepUntil && keepUntil > today) return false;
  // 보관 기한(파일 나이)으로 도는 정리는 아직 못 돈다 — 기한 숫자도 칸도 없다 (⚠️ 확인 안 됨)
  return false;
}

/**
 * 파기 예정일이 온 파일.
 * ⚠️ `keep_until` 을 where 에 넣으면 **보관이 파기를 이긴다** — 넣지 않는다.
 * ⚠️ `hasKeep` 은 「남겨 둘래요」 칸이 **생긴 뒤**에만 켠다. 지금 `v2.file` 에는 그 칸이 없다.
 * ⚠️ `in_bin` — **자료함 묶음에 붙은 파일인가.** 붙었으면 줄도 안 내려가고
 *    Storage 경로도 안 넘긴다 (다른 아이 것이기도 하다 — 계획 ㊸).
 *    판단은 `REACH.file.exceptRow` **한 곳**에서 온다. 여기서 다시 쓰지 않는다 (원칙 1).
 */
export function filesDueSql() {
  return `select id, path, orig_name, student_id, purge_on,
                 not (${REACH.file.exceptRow}) as in_bin
            from v2.file
           where state = 'active' and purge_on is not null and purge_on <= $1
           order by purge_on`;
}

export async function filesDue(db, today) {
  const r = await db.query(filesDueSql(), [today]);
  return r.rows;
}

/** 기한이 온 파일을 **목록 한 벌로** 파기한다 (크론이 부른다) */
export async function purgeFiles(db, today, opts = {}) {
  const due = opts.due ?? (await filesDue(db, today));
  if (due.length === 0) return { at: new Date().toISOString(), due: 0, ran: [], storagePaths: [], blocked: [], kept: [] };
  const map = (opts.map ?? (await purgeMap(db))).filter((m) => m.tbl === "file");
  const facts = opts.facts ?? (await columnFacts(db));
  const plan = planFor({ map, facts, target: { kind: "file", fileIds: due.map((d) => d.id) } });
  const ran = await runSteps(db, plan.steps);

  // ⚠️ **기한이 왔어도 자료함에 붙은 파일은 버킷에서 안 지운다** — 다른 아이 것이기도 하다.
  //    `due` 를 그대로 실어 보내면 옥련여고 학사일정의 진짜 파일이 사라지고,
  //    줄은 active 로 남아 다른 집 화면에는 보이는데 **누르면 안 열린다.** 오류도 안 난다.
  //    (줄 내리기는 `REACH.file.exceptRow` 가 이미 막는다 — 경로 목록만 새고 있었다.)
  // ⚠️ 그 판단을 **여기서 다시 묻지 않는다.** `filesDueSql()` 이 이미 `in_bin` 으로 실어 온다 —
  //    묻는 문장을 하나 더 두면 부르는 쪽 어댑터가 그 문장을 모를 때 **조용히 빈 목록**이 된다.
  const kept = due.filter((d) => d.in_bin === true);

  return { at: new Date().toISOString(), due: due.length, ran,
           blocked: plan.blocked,
           storagePaths: due.filter((d) => d.in_bin !== true).map((d) => d.path),
           // ⚠️ 조용히 빼지 않는다 — 안 지운 것은 내놓는다 (기한이 와도 계속 남는 자리다)
           kept: kept.map((d) => ({ id: d.id, path: d.path })) };
}
