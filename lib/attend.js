/**
 * 출결 쓰기 — **어디서 찍든 그날 판이 선다.**
 *
 * 규칙은 「출결의 진실을 한 곳으로」가 아니라
 * **「읽는 쪽이 무엇을 보는지 먼저 정하고, 쓰는 길 전부가 그것을 만들게 하라」**다
 * (계획 「1단계에서 특히 조심할 자리 셋」 ①).
 *
 * 그래서 이 파일은 **읽는 쪽(`dayView`)을 맨 앞에 적고**, 여덟 갈래 쓰는 길이
 * 전부 `attendanceWrite` 한 벌을 지나 그 판을 만들게 한다.
 * 길은 늘 는다. 늘 때마다 `WRITE_PATHS` 에 이름을 더하고,
 * `scripts/check-attend.mjs` 가 「lib/attend.js 밖에서 v2.day_sheet 에 쓰지 않는가」를 본다 (자동 검사 ②).
 *
 * ⚠️ 0047_attend_axis.sql 을 먼저 읽어라. 어제 여기서 큰 것을 고쳤다.
 *   · attend 는 **present · late · absent · off** 넷이다. **makeup 이 없다.**
 *   · 「왔나」와 「보강이냐」는 **다른 축**이다. 「그날 보강인가」는 `v2.is_makeup_day()` 로 **세어 나온다.**
 *   · 열쇠는 (student_id, date, class_id) 이고 **nulls not distinct** 다.
 *
 * ⚠️ 여기서 **안 하는 것** (다른 한 벌의 몫이다 — 두 벌로 만들면 그날부터 어긋난다):
 *   · 마감·마감 전 가리기 → `closeGate`
 *   · 회차 셈 (결석은 회차에서 **안 빠진다**, 휴강만 빠진다) → `sessionCount`
 *   · 반 명단 → `v2.class_roster()` / `v2.student_classes()`
 *   · 판의 글(comment·staff_note)·항목 → 판 저장 한 벌. 여기는 **출결 칸만** 만진다.
 *   · 보강 표(v2.makeup) 쓰기 → 보강 한 벌. 여기는 그날 **판을 세워** 준다.
 *
 * DB 는 `{ query(sql, params) -> { rows } }` 를 받는 얕은 어댑터다 (pg 든 supabase 든).
 * 검사가 가짜 DB 를 끼울 수 있어야 하므로 여기서 직접 붙지 않는다.
 */

/** 그날 왔나 — 넷뿐이다. ⚠️ 'makeup' 은 **없다** (0047) */
export const ATTEND = Object.freeze(["present", "late", "absent", "off"]);

/**
 * 출결을 쓰는 **여덟 갈래**. 전부 `attendanceWrite` 한 벌을 부른다.
 * ⚠️ 길을 더할 때는 **여기 이름부터 더한다.** 안 더하면 `attendanceWrite` 가 그 자리에서 거절한다 —
 *    이름 없는 길이 몰래 늘어 판을 안 세우는 것이 옛 앱에서 난 일이다.
 */
export const WRITE_PATHS = Object.freeze({
  quick:   "빠른 찍기 — 오늘 화면에서 한 번 누른다",
  sheet:   "판 저장 — 그날 판을 저장할 때 같이",
  makeup:  "보강 — 잡은 그 날짜에 판이 선다 (판은 'present'. 보강 여부는 v2.makeup 이 가진다)",
  parent:  "학부모 요청 — v2.request(kind='absence'|'makeup')를 원장님이 받아들일 때",
  arrival: "등원 체크 — 아이가 스스로 찍는다 (v2.arrival 세 걸음)",
  todo:    "할 일 — 「보강 잡기」 같은 카드에서 바로",
  plan:    "일정 — 달력에서 결석·지각 **예정**을 고른다 (계획 ㉔)",
  excel:   "엑셀 — 여러 줄 한꺼번에",
});

/** 지각 「얼마나」의 버튼 (계획 ㉔). 이 넷 말고 **도착 시각**을 직접 적을 수도 있다 */
export const LATE_PRESETS = Object.freeze([10, 20, 30, 60]);

// ── SQL — 앞머리 주석(/* attend:… */)은 **가짜 DB 가 붙잡는 손잡이**다. 지우지 마라 ──────────
// ⚠️ SQL 안에 `${…}` 를 끼워 넣지 마라. 끼우는 순간 이 글자를 그대로 DB 에 물어볼 수가 없어서
//    「칸 이름이 진짜 있나」를 기계로 못 본다. 값은 전부 $1·$2 로 넘긴다.

const SQL_TODAY = `/* attend:today */
select coalesce($1::date, v2.today())::text as d`;

const SQL_UPSERT = `/* attend:upsert */
insert into v2.day_sheet (student_id, date, class_id, attend)
values ($1, $2::date, $3, $4)
on conflict (student_id, date, class_id) do update
   set attend = excluded.attend
 where ($5::text is null or day_sheet.updated_at::text = $5::text)
returning id, student_id, date::text as date, class_id, attend, updated_at::text as updated_at`;
// ⚠️ 시각을 **글자로** 견준다. timestamptz 로 견주면 **한 번도 안 맞는다** —
//    Postgres 는 마이크로초까지 재는데 자바스크립트 Date 는 밀리초까지라, 읽어서 도로 보내면
//    끝자리가 잘려 늘 다르다. 그러면 「내가 읽은 그 줄이 그대로일 때만」(0단계 3번)이
//    **언제나 거짓**이 되어 저장이 조용히 0줄이 된다. 오류도 안 난다.

const SQL_ONE = `/* attend:one */
select id, student_id, date::text as date, class_id, attend, closed_at, updated_at::text as updated_at
  from v2.day_sheet
 where student_id = $1 and date = $2::date and class_id is not distinct from $3`;

const SQL_DAY = `/* attend:day */
select id, student_id, date::text as date, class_id, attend, closed_at, sent_at,
       updated_at::text as updated_at
  from v2.day_sheet
 where student_id = $1 and date = $2::date
 order by class_id nulls first`;
// ⚠️ updated_at 을 **여기서 줘야** 「내가 읽은 그 줄이 그대로일 때만」을 쓸 수 있다.
//    안 주면 화면이 늘 null 을 넘겨 잠금이 통째로 꺼진다 (폰과 PC 가 서로를 덮는다)

const SQL_IS_MAKEUP = `/* attend:ismakeup */
select v2.is_makeup_day($1, $2::date) as yes`;

const SQL_COUNT = `/* attend:count */
select class_id, attend, count(*)::int as n
  from v2.day_sheet
 where student_id = $1 and date >= $2::date and date <= $3::date
 group by class_id, attend`;

/**
 * ⚠️ **「보강이 살아 있나」(state <> 'waived')의 규칙이 지금 두 곳에 있다** — 여기와 `v2.is_makeup_day()` 안.
 *    한쪽만 고치면 **화면의 보강 표시와 대조 리포트의 보강 횟수가 어긋난다.**
 *    → 보고의 needsDb 에 `v2.makeup_days(student, from, to)` 를 적었다. 그것이 생기면 이 문을 그것으로 바꾼다.
 */
const SQL_COUNT_MAKEUP = `/* attend:countmakeup */
select count(distinct on_date)::int as n
  from v2.makeup
 where student_id = $1 and on_date >= $2::date and on_date <= $3::date
   and state <> 'waived'`;

const SQL_PLANNED = `/* attend:planned */
select id, student_id, class_id, date::text as date, attend
  from v2.day_sheet
 where date >= $1::date and attend in ('late','absent')
   and ($2::uuid is null or student_id = $2::uuid)
 order by date, student_id`;

const SQL_CHILDREN = `/* attend:children */
select s.id, s.closed_at,
       (select count(*)::int from v2.day_item i where i.sheet_id = s.id) as items
  from v2.day_sheet s
 where s.student_id = $1 and s.date = $2::date and s.class_id is not distinct from $3`;

// ⚠️ **지우지 않는다 — 되돌린다**(대전제 6). 앞날 결석 예정을 무르는 것은
//    「그날 안 온다」를 「온다」로 되돌리는 일이지 판을 없애는 일이 아니다.
//    판이 남아 있어도 회차는 안 부푼다 — 회차는 **반 요일**에서 나오지 판에서 안 나온다.
const SQL_UNDO = `/* attend:undo */
update v2.day_sheet set attend = 'present'
 where id = $1 and closed_at is null
returning id, attend`;

// ── ① 읽는 쪽이 보는 것 — 여덟 길이 **전부 이것을 만든다** ────────────────────────────

/**
 * 그날 그 아이의 판. **이것이 읽는 쪽이 보는 전부**다.
 *
 * ⚠️ 한 아이가 같은 날 **정규·특강 두 줄**에 설 수 있으므로 `rows` 는 **목록**이다.
 *    한 줄로 접지 마라 — 접는 순간 특강 결석이 정규 결석으로 새어 **수강료가 조용히 틀어진다.**
 * ⚠️ 학부모·학생에게 내보낼 때 comment 를 가리는 것은 `closeGate` 의 몫이다.
 *    여기서 또 가리면 규칙이 두 벌이 된다.
 */
export async function dayView(db, { studentId, date }) {
  if (!studentId) throw new Error("학생이 없다");
  assertDate(date);
  const sheets = await db.query(SQL_DAY, [studentId, date]);
  const mk = await db.query(SQL_IS_MAKEUP, [studentId, date]);
  const rows = (sheets.rows ?? []).map((r) => ({
    sheetId: r.id,
    classId: r.class_id ?? null,
    attend: r.attend,
    closedAt: r.closed_at ?? null,
    sentAt: r.sent_at ?? null,
  }));
  return {
    studentId,
    date,
    has: rows.length > 0,          // 판이 섰나 — 여덟 길이 만들어야 하는 것이 이 값이다
    rows,
    isMakeupDay: !!(mk.rows?.[0]?.yes),   // ⚠️ 저장하지 않는다. 세어 나온다 (0047)
  };
}

// ── ② 쓰는 길 한 벌 — 여덟 갈래가 전부 여기를 지난다 ─────────────────────────────────

/**
 * 열쇠를 만든다. **(학생 + 날짜 + 반) 복합키**다.
 *
 * ⚠️ `classId` 를 **빼먹으면 거절한다.** 반이 없으면 `classId: null` 이라고 **적어라.**
 *    빠뜨린 것과 비운 것은 다르다 — 빠뜨린 채로 두면 특강 줄이 정규 줄을 덮는다(이미 난 사고).
 * ⚠️ 비교는 언제나 `class_id is not distinct from $n` 이다. `= $n` 을 쓰면
 *    반이 안 붙은 줄(지금 DB 의 1,954줄 전부)이 **한 줄도 안 걸린다.**
 */
export function keyOf(one) {
  if (!one || typeof one !== "object") throw new Error("쓸 것이 없다");
  if (!one.studentId) throw new Error("학생이 없다");
  assertDate(one.date);
  if (!("classId" in one)) {
    throw new Error(
      "classId 를 빼먹었다 — 정규·특강 두 줄이 한 줄로 뭉개진다. 반이 없으면 classId: null 로 **적어라**");
  }
  return { studentId: one.studentId, date: one.date, classId: one.classId ?? null };
}

/**
 * 지각 「얼마나」를 정규화한다 (계획 ㉔).
 *
 * 받는 꼴: `20` · `"20"` · `"19:20"` · `{minutes:20}` · `{arriveAt:"19:20"}` · `{unknown:true}`
 * @param opts.startTime "HH:MM" — 그 반 수업 시작 시각. 있어야 도착 시각↔분을 오간다
 * @returns { minutes, arriveAt, unknown, why }
 *
 * ⚠️ 「몇 분」과 「도착 시각」은 **같은 사실의 두 단위**다. 둘 다 주면서 서로 안 맞으면 거절한다.
 * ⚠️ 정말 모르면 `{unknown:true}` 라고 **적어야** 한다. 빈 값은 안 받는다 —
 *    「안 적었다」와 「모른다」가 같아 보이면 나중에 무엇을 물어야 할지 모른다.
 */
export function lateMinutes(late, opts = {}) {
  if (late === undefined || late === null || late === "") {
    throw new Error("지각에는 「얼마나」가 있어야 한다 — 10·20·30·60분이나 도착 시각. " +
      "정말 모르면 { unknown: true } 라고 **적어라**");
  }
  if (late === true || (typeof late === "object" && late.unknown)) {
    return { minutes: null, arriveAt: null, unknown: true, why: "원장님이 「모른다」고 적었다" };
  }

  let minutes = null, arriveAt = null;
  if (typeof late === "number") minutes = late;
  else if (typeof late === "string") {
    if (/^\d{1,2}:\d{2}$/.test(late)) arriveAt = late;
    else if (/^\d+$/.test(late.trim())) minutes = Number(late.trim());
    else throw new Error(`지각 「얼마나」를 못 읽겠다: ${late}`);
  } else {
    if (late.minutes !== undefined && late.minutes !== null) minutes = Number(late.minutes);
    if (late.arriveAt) arriveAt = String(late.arriveAt);
  }
  if (minutes === null && arriveAt === null) {
    throw new Error("지각 「얼마나」가 비어 있다 — 분이나 도착 시각 중 하나는 있어야 한다");
  }

  const start = opts.startTime ?? (typeof late === "object" ? late.startTime : null) ?? null;
  if (arriveAt !== null && !/^\d{1,2}:\d{2}$/.test(arriveAt)) {
    throw new Error(`도착 시각이 이상하다: ${arriveAt} (HH:MM)`);
  }

  let why = null;
  if (minutes !== null && arriveAt !== null) {
    if (start) {
      const calc = hm(arriveAt) - hm(start);
      if (calc !== minutes) {
        throw new Error(
          `지각 분(${minutes})과 도착 시각(${arriveAt}, 시작 ${start} → ${calc}분)이 안 맞는다 — ` +
          "같은 사실을 두 단위로 적었으면 같아야 한다");
      }
    } else {
      // ⚠️ 확인 안 됨 — 수업 시작 시각이 없어 둘이 맞는지 **못 봤다.** 지어내지 않는다.
      why = "⚠️ 확인 안 됨 — 수업 시작 시각을 몰라 분과 도착 시각이 맞는지 못 봤다";
    }
  } else if (arriveAt !== null) {
    if (!start) {
      why = "⚠️ 확인 안 됨 — 수업 시작 시각을 몰라 도착 시각을 분으로 못 바꿨다";
    } else {
      minutes = hm(arriveAt) - hm(start);
      if (minutes <= 0) throw new Error(`도착(${arriveAt})이 수업 시작(${start})보다 이르다 — 지각이 아니다`);
    }
  } else if (start) {
    arriveAt = toHm(hm(start) + minutes);
  }

  if (minutes !== null) {
    if (!Number.isInteger(minutes) || minutes <= 0) throw new Error(`지각 분이 이상하다: ${minutes}`);
    // ⚠️ 열 시간 넘게 늦는 것은 지각이 아니라 결석이다. 손이 미끄러진 값을 그대로 담지 않는다
    if (minutes > 600) throw new Error(`${minutes}분은 지각이 아니라 결석이다 — attend:'absent' 로 찍어라`);
  }
  return { minutes, arriveAt, unknown: false, why };
}

/**
 * ⚠️ **지각 「얼마나」를 담을 칸이 v2.day_sheet 에 아직 없다** (실측 2026-09-02 — 칸 13개를 다 봤다).
 *    나는 마이그레이션을 못 만든다 → 보고의 needsDb 에 적었다.
 *    그래서 값을 **저장하지 않는다. 저장한 척도 하지 않는다** — 돌려주는 값에 `lateSaved:false` 로 적는다.
 * ⚠️ 안 지키면: 「20분 늦어요」를 학부모께 못 보내고(㉔), 화면은 저장됐다고 말한다.
 */
const LATE_MIN_COLUMN = null;   // 칸이 생기면 여기 이름 한 줄 + SQL_UPSERT 에 칸 하나다

/**
 * **출결을 쓰는 단 한 벌.** 여덟 갈래가 전부 여기를 지난다.
 *
 * @param one  { via, studentId, date:'YYYY-MM-DD', classId(널 허용, **생략 금지**),
 *               attend:'present'|'late'|'absent'|'off',
 *               late(지각일 때 필수), startTime?, ifUnchanged? }
 * @returns { ok, sheetId, key, attend, late, lateSaved, changed, why, msg, warn }
 *
 * ⚠️ **몇 줄이 실제로 바뀌었는지 본다. 0줄이면 실패다** (자동 검사 ⑪).
 *    접근 규칙이 막았는데 화면이 「성공」이라 말하면 안 된다 — 그게 옛 앱의 사고 #19 다.
 * ⚠️ 앞날에도 찍힌다 (결석·지각 **예정**, 계획 ㉔). 그래서 여기서 날짜를 오늘로 막지 않는다.
 *    막는 것은 **세는 자리**다 (`countAttend` 는 「오늘까지」).
 */
export async function attendanceWrite(db, one, opts = {}) {
  const via = one?.via;
  if (!WRITE_PATHS[via]) {
    throw new Error(`모르는 길: ${JSON.stringify(via)} — 출결은 여덟 길로만 쓴다 ` +
      `(${Object.keys(WRITE_PATHS).join(" · ")}). 길이 늘었으면 WRITE_PATHS 에 먼저 적어라`);
  }
  const key = keyOf(one);

  const attend = one.attend;
  if (attend === "makeup") {
    throw new Error("attend 에 'makeup' 은 없다 (0047) — 「왔나」와 「보강이냐」는 다른 축이다. " +
      "보강은 v2.makeup 에 적고 그날 판에는 'present' 를 찍어라");
  }
  if (!ATTEND.includes(attend)) {
    throw new Error(`모르는 출결: ${JSON.stringify(attend)} — ${ATTEND.join(" · ")} 넷뿐이다`);
  }

  // 지각이면 「얼마나」가 반드시 있다 (계획 ㉔)
  const late = attend === "late"
    ? lateMinutes(one.late, { startTime: one.startTime ?? opts.startTime ?? null })
    : null;

  const ifUnchanged = one.ifUnchanged ?? null;   // 「내가 읽은 그 줄이 그대로일 때만」 (0단계 3번)

  const r = await db.query(SQL_UPSERT,
    [key.studentId, key.date, key.classId, attend, ifUnchanged]);
  const rows = r.rows ?? [];

  if (rows.length === 0) {
    // ⚠️ 0줄이다. **성공이라 말하지 않는다.** 무엇이 막았는지 한 번 더 물어본다
    const back = await db.query(SQL_ONE, [key.studentId, key.date, key.classId]);
    const there = (back.rows ?? [])[0] ?? null;
    const stale = !!(ifUnchanged && there && String(there.updated_at) !== String(ifUnchanged));
    return {
      ok: false, changed: 0, sheetId: null, key, attend, via,
      why: stale ? "stale" : "blocked",
      msg: stale
        ? "다른 데서 먼저 저장했다 — 내가 읽은 줄이 아니다. 다시 읽고 찍어라"
        : "한 줄도 안 바뀌었다 — 접근 규칙이 막았거나 줄이 없다. ⚠️ 확인 안 됨: 둘 중 어느 쪽인지 여기서는 못 가른다",
    };
  }

  const row = rows[0];
  const lateSaved = late && late.minutes !== null ? LATE_MIN_COLUMN !== null : null;
  return {
    ok: true, changed: rows.length, sheetId: row.id, key, attend, via, late,
    lateSaved,
    warn: lateSaved === false
      ? "⚠️ 지각 「얼마나」는 **저장 안 됐다** — v2.day_sheet 에 담을 칸이 없다 (needsDb)"
      : null,
    updatedAt: row.updated_at ?? null,
  };
}

/**
 * 여러 줄 한꺼번에 (엑셀 길·일괄 찍기).
 *
 * ⚠️ 하나라도 0줄이면 **전부 되돌린다** (자동 검사 ⑪).
 *    단 되돌리려면 어댑터가 트랜잭션을 받아야 한다 → `opts.tx === true` 로 **말해 줘야** 한다.
 *    안 말하면 되돌리지 못하고, 그 사실을 `warn` 에 적어 돌려준다. **되돌린 척은 안 한다.**
 */
export async function attendanceWriteMany(db, list, opts = {}) {
  const tx = opts.tx === true;
  if (tx) await db.query("begin");

  const rows = [], bad = [];
  for (const one of list ?? []) {
    let r;
    try {
      r = await attendanceWrite(db, one, opts);
    } catch (e) {
      r = { ok: false, changed: 0, why: "bad", msg: String(e?.message ?? e), key: null, via: one?.via ?? null };
    }
    rows.push(r);
    if (!r.ok) bad.push(r);
  }

  if (bad.length) {
    if (tx) await db.query("rollback");
    return {
      ok: false, saved: 0, rolledBack: tx, rows, bad,
      warn: tx ? null
        : "⚠️ 되돌리지 못했다 — opts.tx 가 아니라 **앞줄은 이미 들어갔다.** 부르는 쪽이 되돌려야 한다",
    };
  }
  if (tx) await db.query("commit");
  return { ok: true, saved: rows.length, rolledBack: false, rows, bad: [] };
}

/**
 * 앞날 결석·지각 **예정을 무른다.** 지우는 것이 아니다(대전제 6).
 *
 * ⚠️ 앞서 여기 적혀 있던 「`v2.day_item` 이 on delete cascade」는 **사실과 반대**였다 —
 *    0052 에서 **RESTRICT** 로 바꿨다. 판을 지우려 해도 DB 가 막는다.
 *    그래서 지우는 길을 아예 없앴다. `attend` 를 'present' 로 되돌린다.
 * ⚠️ 마감한 판은 안 건드린다 — 이미 학부모가 본 것이다.
 * ⚠️ 되돌린 뒤 **몇 줄이 바뀌었는지 본다. 0줄이면 실패다** (자동 검사 ⑪).
 */
export async function attendanceClear(db, one, opts = {}) {
  const key = keyOf(one);
  const found = await db.query(SQL_CHILDREN, [key.studentId, key.date, key.classId]);
  const there = (found.rows ?? [])[0] ?? null;
  if (!there) {
    return { ok: false, changed: 0, key, why: "none",
      msg: "지울 판이 없다 — 접근 규칙이 막았거나 애초에 없었다. ⚠️ 확인 안 됨: 여기서는 못 가른다" };
  }
  if (there.closed_at) {
    return { ok: false, changed: 0, key, why: "closed", sheetId: there.id,
      msg: "이미 마감한 판이다 — 학부모가 이미 본 것이라 안 건드린다. 되돌리려면 마감을 먼저 무른다" };
  }
  const del = await db.query(SQL_UNDO, [there.id]);
  const n = (del.rows ?? []).length;
  if (n === 0) {
    return { ok: false, changed: 0, key, sheetId: there.id, why: "blocked",
      msg: "한 줄도 안 바뀌었다 — 접근 규칙이 막았거나 그 사이 마감됐다. 화면은 「성공」이라 말하면 안 된다" };
  }
  return { ok: true, changed: n, key, sheetId: there.id };
}

// ── ③ 세는 자리 — **「오늘까지」** ────────────────────────────────────────────────

/** 「학원의 오늘」. ⚠️ 시간대 규칙은 `v2.today()` 한 곳에 있다 — 여기서 다시 세지 않는다 */
export async function todayOf(db, given = null) {
  const { rows } = await db.query(SQL_TODAY, [given ?? null]);
  return rows[0].d;
}

/**
 * 학생 × 기간 출결 횟수 — 대조 리포트가 읽는 값 (계획 1-3 「업무 사실로 대조」).
 *
 * ⚠️ **앞날은 안 센다.** 앞날에도 판이 서므로(결석·지각 예정) 그냥 세면
 *    아직 오지도 않은 결석이 지난 달 횟수에 섞인다. 끝을 **「오늘까지」로 자른다.**
 * ⚠️ **반별로 갈라 센다.** `all` 은 보여주기용 합계일 뿐이고,
 *    수강료·회차는 **반별 숫자**를 쓴다 — 합치면 특강 결석이 정규로 샌다(이미 난 사고).
 * ⚠️ 보강 횟수는 attend 에 없다 (0047) — `v2.makeup` 에서 센다.
 */
export async function countAttend(db, { studentId, from, to, today = null }) {
  if (!studentId) throw new Error("학생이 없다");
  assertDate(from); assertDate(to);
  const t = await todayOf(db, today);
  const upto = to < t ? to : t;          // ISO 날짜 글자는 사전순 = 날짜순이다
  const cut = upto !== to;

  const empty = () => ({ present: 0, late: 0, absent: 0, off: 0, total: 0 });
  const byClass = new Map();
  const all = empty();

  if (upto >= from) {
    const { rows } = await db.query(SQL_COUNT, [studentId, from, upto]);
    for (const r of rows ?? []) {
      const k = r.class_id ?? null;
      if (!byClass.has(k)) byClass.set(k, { classId: k, ...empty() });
      const b = byClass.get(k);
      b[r.attend] += r.n; b.total += r.n;
      all[r.attend] += r.n; all.total += r.n;
    }
  }

  let makeup = 0;
  if (upto >= from) {
    const m = await db.query(SQL_COUNT_MAKEUP, [studentId, from, upto]);
    makeup = m.rows?.[0]?.n ?? 0;
  }

  return {
    studentId, from, to, upto, makeup,
    cut,                                   // 앞날을 잘랐나
    byClass: [...byClass.values()],
    all,
    warn: cut ? `앞날은 안 셌다 — ${upto} 까지만 셌다 (오늘 ${t})` : null,
  };
}

/**
 * 앞으로의 결석·지각 **예정** — 발송 화면의 「결석·지각 예정 알림」 묶음이 읽는다 (계획 ㉔).
 *
 * ⚠️ **오늘도 넣는다.** 오늘 저녁 수업을 아침에 찍는 일이 흔하다.
 *    그래서 오늘 하루는 `countAttend`(오늘까지)와 여기 둘 다에 든다 — 서로 다른 물음이라 맞다.
 * ⚠️ 여기서 문자를 만들지 않는다. 내보내는 것은 `notify` 한 곳뿐이다.
 */
export async function plannedAttend(db, { studentId = null, today = null } = {}) {
  const t = await todayOf(db, today);
  const { rows } = await db.query(SQL_PLANNED, [t, studentId ?? null]);
  return {
    from: t,
    rows: (rows ?? []).map((r) => ({
      sheetId: r.id, studentId: r.student_id, classId: r.class_id ?? null,
      date: r.date, attend: r.attend,
    })),
  };
}

// ── 잔손 ────────────────────────────────────────────────────────────────────

/** ⚠️ 날짜는 **글자 'YYYY-MM-DD'** 로만 받는다. Date 를 넘기면 UTC 로 하루 어긋난다 */
function assertDate(d) {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`날짜는 'YYYY-MM-DD' 글자여야 한다: ${JSON.stringify(d)} ` +
      "(Date 를 넘기면 밤 9시 이후 하루가 어긋난다)");
  }
}
const hm = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const toHm = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
