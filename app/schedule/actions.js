"use server";
/**
 * 일정 화면이 **쓰는** 자리. 여기에도 판단은 없다 — `lib/` 을 부르고 결과를 그대로 돌려준다.
 *
 * ── 무엇을 쓰나 · 누가 판단하나
 *    결석·지각 예정  `lib/attend.js` 의 `attendanceWrite()` **한 벌만** 지난다 (길 이름 `plan` — ㉔).
 *    예정 무르기      같은 파일의 `attendanceClear()` — **지우지 않고 되돌린다**(대전제 6).
 *    보강 잡기        `v2.makeup` 한 줄 + **그날 판**(`attendanceWrite`, 길 이름 `makeup`).
 *    휴강             `v2.holiday` 한 줄. ⚠️ **회차는 여기서 안 센다** — `lib/session.js` 가 센다.
 *    영어 시험일      `v2.exams.english_on` 한 칸. ⚠️ **나이스는 안 준다**(㊲).
 *    다음 달 도장     `v2.month_confirm` 한 줄 (① 안내 → ② 확인 → ③ 확정).
 *    할 일 체크       `v2.todo.state`.
 *
 * ── ⚠️ **`v2.makeup` · `v2.holiday` 를 쓰는 한 벌이 `lib/` 에 없다** (실측 2026-09-02 —
 *    `insert into v2.makeup` 이 lib 에 0곳. `lib/attend.js` 는 「보강 표 쓰기는 보강 한 벌의 몫」이라
 *    적어 두고 스스로는 안 쓴다). 그 한 벌이 서기 전까지 **여기가 유일한 문**이다.
 *    ⚠️ 두 번째 문을 만들지 마라 — 만드는 순간 「보강이 무엇인가」가 두 벌이 된다(원칙 1).
 *    → 보고의 `notes` 에 `lib/makeup.js` 로 옮길 것을 적었다.
 *
 * ── ⚠️⚠️ **못 하는 것 둘. 할 수 있는 척하지 않는다** (진짜 DB 로 확인, 2026-09-02)
 *    ① **휴강을 무를 수 없다.** `v2.holiday` 에 상태 칸이 없고 `authenticated` 에 delete 권한이 없다
 *       (`has_table_privilege('v2.holiday','delete')` = false). 그래서 「휴강 풀기」 단추를 안 만들었다.
 *    ② **도장을 풀 수 없다.** `v2.month_confirm` 도 마찬가지다. 계획 3단계의
 *       「**휴강은 그 달 전체를 푼다**」를 지금 코드로 지킬 길이 없다.
 *       → 화면이 **그 사실을 그대로 띄운다.** 풀린 척 그리면 원장님이 안 풀린 도장을 믿으신다.
 *       → 보고의 `needsDb` 에 완성된 SQL 을 적었다.
 *
 * ⚠️ **몇 줄이 실제로 바뀌었는지 본다. 0줄이면 실패다** (자동 검사 ⑪).
 *    접근 규칙이 막았는데 화면이 「성공」이라 말하면 안 된다.
 * ⚠️ 여기서 `revalidatePath` 를 부르지 않는다 (§속도 5 — 누른 그 단추만 바뀐다).
 *    회차를 다시 세는 것은 원장님이 **직접** 누르신다(화면의 「회차 다시 세기」).
 */
import { openAs, staffOnly } from "./db.js";
import { attendanceWrite, attendanceClear } from "../../lib/attend.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** 문을 열고 → 하고 → 반드시 닫는다 */
async function run(fn) {
  const me = await staffOnly();
  if (!me.ok) return { ok: false, why: me.why, msg: me.msg };
  const c = await openAs(me.profileId);
  if (!c.ok) return { ok: false, why: "no-db", msg: c.why };
  try { return await fn(c.db, me); }
  catch (e) { return { ok: false, why: "threw", msg: String(e?.message ?? e).slice(0, 300) }; }
  finally { await c.end(); }
}

/* ══ ㉔ 결석·지각 예정은 달력에서 고른다 ═══════════════════════════════
 * ⚠️ **한 달 뒤를 미리 말하는 아이가 있다.** 그래서 앞날에도 찍힌다 —
 *    막는 것은 **세는 자리**지 쓰는 자리가 아니다(`lib/attend.js` 주석).
 * ⚠️ **지각에 「얼마나」는 없다** (원장님 2026-09-02 「지각은 시간이 필요없을 듯」) —
 *    아이가 등원을 찍은 그 시각이 곧 도착 시각이다. 손으로 고를 것도, 담을 칸도 없다.
 *    몇 분 늦었는지는 `lib/attend.js` 의 `lateFromStamp()` 가 **세어 준다.**
 * ⚠️ **결석은 회차에서 안 빠진다.** 여기서 회차를 건드리지 않는 까닭이 그것이다.
 * ═══════════════════════════════════════════════════════════════════ */
export async function planAttend({ studentId, date, classId = null, attend } = {}) {
  if (!UUID.test(String(studentId ?? ""))) return { ok: false, msg: "학생을 못 골랐습니다" };
  if (!DATE.test(String(date ?? ""))) return { ok: false, msg: "날짜가 'YYYY-MM-DD' 가 아닙니다" };
  if (attend !== "absent" && attend !== "late")
    return { ok: false, msg: "달력에서 고르는 것은 **결석·지각 예정** 둘뿐입니다" };
  return run(async (db) => {
    // ⚠️ `classId` 는 **생략 금지**다 — 빠뜨리면 특강 줄이 정규 줄을 덮는다(lib/attend.js `keyOf`)
    const r = await attendanceWrite(db, {
      via: "plan", studentId, date, classId: classId || null, attend,
    });
    return r.ok
      ? { ok: true, sheetId: r.sheetId, attend: r.attend }
      : { ok: false, why: r.why, msg: r.msg };
  });
}

/** 예정을 **무른다.** ⚠️ 지우는 것이 아니다(대전제 6) — `attend` 를 'present' 로 되돌린다 */
export async function clearPlan({ studentId, date, classId = null } = {}) {
  if (!UUID.test(String(studentId ?? ""))) return { ok: false, msg: "학생을 못 골랐습니다" };
  if (!DATE.test(String(date ?? ""))) return { ok: false, msg: "날짜가 'YYYY-MM-DD' 가 아닙니다" };
  return run(async (db) => {
    const r = await attendanceClear(db, { studentId, date, classId: classId || null });
    return r.ok ? { ok: true, sheetId: r.sheetId } : { ok: false, why: r.why, msg: r.msg };
  });
}

/* ══ ㉔ · 오류 82 — 보강일은 **학생마다 따로**, **앱이 시각을 제안하지 않는다** ══════
 * 원장님: 「니가 시간이랑 일정을 잡으면 내가 고칠 수가 없잖아.」
 * → 달력을 열어 **아무 날이나** 고르고 **시각도 직접** 적는다. 칸이 차 있어도 넣을 수 있다.
 *   빈 자리 셈은 화면이 **보여 주기만** 하고 **여기서 막지 않는다.**
 * ⚠️ 그래서 이 함수에는 「그날 몇 명까지」 같은 조건이 **한 줄도 없다.** 일부러 없다.
 * ═══════════════════════════════════════════════════════════════════ */
const SQL_MAKEUP_ADD = `/* sc:makeup-add */
insert into v2.makeup (student_id, on_date, of_date, at_time, state)
values ($1, $2::date, $3::date, $4::time, 'set')
on conflict (student_id, on_date, of_date) do update
   set at_time = excluded.at_time, state = 'set'
returning id, student_id, to_char(on_date,'YYYY-MM-DD') as on_date, at_time::text as at_time, state`;

/** 무른 보강 — ⚠️ **지우지 않는다.** 'waived' 로 내린다 (`v2.is_makeup_day` 가 그 줄을 뺀다) */
const SQL_MAKEUP_WAIVE = `/* sc:makeup-waive */
update v2.makeup set state = 'waived' where id = $1 and state <> 'waived'
returning id, state`;

export async function saveMakeup({ studentId, onDate, ofDate = null, atTime = null } = {}) {
  if (!UUID.test(String(studentId ?? ""))) return { ok: false, msg: "학생을 못 골랐습니다" };
  if (!DATE.test(String(onDate ?? ""))) return { ok: false, msg: "보강 날짜를 골라 주세요" };
  if (ofDate && !DATE.test(String(ofDate))) return { ok: false, msg: "빠진 날짜가 'YYYY-MM-DD' 가 아닙니다" };
  const t = String(atTime ?? "").slice(0, 5);
  if (t && !TIME.test(t)) return { ok: false, msg: "시각이 'HH:MM' 이 아닙니다" };

  return run(async (db) => {
    const r = await db.query(SQL_MAKEUP_ADD, [studentId, onDate, ofDate || null, t || null]);
    const row = (r.rows ?? [])[0];
    if (!row) {
      return { ok: false, why: "blocked", msg:
        "한 줄도 안 바뀌었습니다 — 접근 규칙이 막았습니다. ⚠️ 확인 안 됨: 여기서는 무엇이 막았는지 못 가릅니다" };
    }
    // ⚠️ **잡은 그 날짜에 판이 선다** — 출결을 쓰는 길은 `attendanceWrite` 한 벌뿐이다(길 이름 `makeup`).
    //    판은 'present' 다. 「보강이냐」는 다른 축이고 `v2.is_makeup_day()` 로 **세어 나온다**(0047).
    const sheet = await attendanceWrite(db, {
      via: "makeup", studentId, date: onDate, classId: null, attend: "present",
    });
    return {
      ok: true, id: row.id, onDate: row.on_date, atTime: row.at_time ?? null,
      sheetOk: sheet.ok,
      // ⚠️ 판이 안 섰으면 **성공이라 말하지 않는다.** 보강만 적히고 판이 없으면 그날 화면이 빈다
      warn: sheet.ok ? null : `⚠️ 보강은 적혔지만 **그날 판이 안 섰습니다** — ${sheet.msg}`,
      // ⚠️ 시각을 안 적었으면 그대로 밝힌다. 앱이 채워 넣지 않는다(오류 82)
      note: t ? null : "시각을 안 적으셨습니다 — 앱은 시각을 지어내지 않습니다.",
    };
  });
}

export async function waiveMakeup({ id } = {}) {
  if (!UUID.test(String(id ?? ""))) return { ok: false, msg: "무를 보강을 못 골랐습니다" };
  return run(async (db) => {
    const r = await db.query(SQL_MAKEUP_WAIVE, [id]);
    return (r.rows ?? []).length
      ? { ok: true, id }
      : { ok: false, why: "blocked", msg: "한 줄도 안 바뀌었습니다 — 이미 무른 보강이거나 접근 규칙이 막았습니다" };
  });
}

/* ══ 휴강 — **회차에서 빠진다** (결석은 안 빠진다) ══════════════════════ */
const SQL_HOLIDAY_ADD = `/* sc:holiday-add */
insert into v2.holiday (date, class_id, reason)
values ($1::date, $2::uuid, $3)
on conflict (date, class_id) do update set reason = excluded.reason
returning id, to_char(date,'YYYY-MM-DD') as date, class_id, reason`;

/**
 * 휴강 한 줄. `classId` 가 비면 **학원 전체 휴강**이다.
 *
 * ⚠️ **무르는 길을 안 만들었다** — `v2.holiday` 에 상태 칸이 없고 delete 권한도 없다(위 ⚠️⚠️).
 *    지우는 척하는 단추보다 없는 편이 낫다.
 * ⚠️ **이 한 줄이 그 달 회차를 통째로 바꾼다.** 그래서 돌려주는 값에 「회차를 다시 세야 한다」를 싣는다 —
 *    화면이 원장님께 **직접 누르시라고** 보여 준다(§속도 5 — 화면을 멋대로 다시 그리지 않는다).
 */
export async function saveHoliday({ date, classId = null, reason = "" } = {}) {
  if (!DATE.test(String(date ?? ""))) return { ok: false, msg: "날짜가 'YYYY-MM-DD' 가 아닙니다" };
  if (classId && !UUID.test(String(classId))) return { ok: false, msg: "반을 못 골랐습니다" };
  const why = String(reason ?? "").trim();
  if (!why) return { ok: false, msg: "휴강 사유를 한 줄 적어 주세요 — 달력이 사유별로 묶습니다" };
  return run(async (db) => {
    const r = await db.query(SQL_HOLIDAY_ADD, [date, classId || null, why]);
    const row = (r.rows ?? [])[0];
    if (!row) return { ok: false, why: "blocked", msg: "한 줄도 안 바뀌었습니다 — 접근 규칙이 막았습니다" };
    return {
      ok: true, id: row.id, date: row.date, reason: row.reason,
      recount: true,
      note: "휴강은 **회차에서 빠집니다** — 위 회차 표를 다시 세워 주세요.",
      // ⚠️ 계획 3단계: 「휴강은 그 달 전체를 푼다」. 지금 **풀 길이 없다** — 척하지 않는다
      warn: `⚠️ ${String(date).slice(0, 7)} 확정 도장은 **자동으로 안 풀립니다** — ` +
            "`v2.month_confirm` 에 무름 칸도 지우기 권한도 없습니다 (needsDb).",
    };
  });
}

/* ══ ㊲ 학사일정 — **영어 시험일은 안 온다.** 한 줄이 여럿을 세운다 ══════ */
const SQL_ENGLISH_ON = `/* sc:english-on */
update v2.exams set english_on = $2::date where id = $1 and state = 'active'
returning id, to_char(english_on,'YYYY-MM-DD') as english_on`;

/**
 * 영어 시험일 한 줄.
 * ⚠️ **나이스는 기간만 준다.** 기간 끝으로 잡으면 루틴 아홉이 사흘 늦게 선다(㉞ 실측 2) —
 *    그래서 앱이 **짐작해 채우지 않는다.** 원장님이 적으신다.
 * ⚠️ 이 한 줄이 **전날 등원·안내 문구·할 일 마감·성적 기본 날짜**를 한꺼번에 세운다(4단계).
 */
export async function saveEnglishOn({ examId, on } = {}) {
  if (!UUID.test(String(examId ?? ""))) return { ok: false, msg: "시험을 못 골랐습니다" };
  if (!DATE.test(String(on ?? ""))) return { ok: false, msg: "영어 시험일이 'YYYY-MM-DD' 가 아닙니다" };
  return run(async (db) => {
    const r = await db.query(SQL_ENGLISH_ON, [examId, on]);
    return (r.rows ?? []).length
      ? { ok: true, examId, englishOn: (r.rows[0].english_on ?? on),
          note: "이 한 줄이 전날 등원·안내·할 일 마감을 한꺼번에 세웁니다." }
      : { ok: false, why: "blocked", msg: "한 줄도 안 바뀌었습니다 — 끝난 시험이거나 접근 규칙이 막았습니다" };
  });
}

/* ══ 3단계 — 다음 달 일정 확정 도장 셋 ═════════════════════════════════ */
const SQL_STAMP = `/* sc:stamp */
insert into v2.month_confirm (ym, class_id, step, by_who)
values ($1, $2::uuid, $3::smallint, $4::uuid)
on conflict (ym, class_id, step) do nothing
returning ym, class_id, step, at`;

/**
 * 도장 하나 (① 원장 안내 → ② 학부모 확인 → ③ 원장 확정).
 * ⚠️ **③까지 끝난 달은 안 건드린다.** 화면이 그 달 단추를 끈다 — 여기서도 한 번 더 막는다.
 * ⚠️ **푸는 길이 없다** (위 ⚠️⚠️). 그래서 「되돌리기」 단추도 없다.
 */
export async function stampMonth({ ym, classId, step } = {}) {
  if (!YM.test(String(ym ?? ""))) return { ok: false, msg: "달이 'YYYY-MM' 이 아닙니다" };
  if (!UUID.test(String(classId ?? ""))) return { ok: false, msg: "반을 못 골랐습니다" };
  const s = Number(step);
  if (![1, 2, 3].includes(s)) return { ok: false, msg: "도장은 ①안내 ②확인 ③확정 셋뿐입니다" };
  return run(async (db, me) => {
    const r = await db.query(SQL_STAMP, [ym, classId, s, me.profileId]);
    return (r.rows ?? []).length
      ? { ok: true, ym, classId, step: s, at: r.rows[0].at }
      : { ok: false, why: "already", msg: "이미 찍힌 도장입니다 — 푸는 길이 아직 없습니다 (needsDb)" };
  });
}

/* ══ ㊴ 내 할 일 — 체크 ═════════════════════════════════════════════════
 * ⚠️ **묶인 카드는 속에 든 줄을 전부 바꾼다.** 하나만 바꾸면 나머지가 다음 날 또 뜬다
 *    (`lib/todo.js` 의 `mergeSame` 주석 — 원장님은 「체크했는데 또 나온다」로 겪는다).
 * ⚠️ **세어 나온 카드(`counted`)는 여기 안 온다** — `v2.todo` 에 줄이 없어 누를 것이 없다.
 *    화면이 그 카드에 체크 단추를 안 붙인다.
 * ═══════════════════════════════════════════════════════════════════ */
const SQL_TODO_STATE = `/* sc:todo-state */
update v2.todo set state = $2, done_at = case when $2 = 'done' then now() else null end
 where id = any($1::uuid[])
returning id, state`;

export async function setTodoState({ ids = [], done = true } = {}) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((x) => UUID.test(String(x ?? "")));
  if (!list.length) return { ok: false, msg: "고른 할 일이 없습니다 (앱이 세어 준 카드는 체크할 줄이 없습니다)" };
  return run(async (db) => {
    const r = await db.query(SQL_TODO_STATE, [list, done ? "done" : "todo"]);
    const n = (r.rows ?? []).length;
    // ⚠️ **몇 줄이 바뀌었는지 본다.** 묶인 카드는 전부 바뀌어야 한다
    if (n === 0) return { ok: false, why: "blocked", msg: "한 줄도 안 바뀌었습니다 — 접근 규칙이 막았습니다" };
    return { ok: true, changed: n,
             warn: n < list.length ? `⚠️ ${list.length}줄 중 ${n}줄만 바뀌었습니다` : null };
  });
}
