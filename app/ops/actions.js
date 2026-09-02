"use server";
/**
 * 운영 화면이 **쓰는** 자리. 여기에도 판단은 없다 — 원장님이 적으신 것을 그대로 담는다.
 *
 * ── 무엇을 쓰나
 *    수납      `v2.payment` 한 줄 (학생 × 달). **금액과 받은 날뿐이다** —
 *              청구서를 만들지 않는다(원장님: 「아직 결제는 중요한 내용이 아니다」).
 *    단가      `v2.fee_rule` 에 **「언제부터 얼마」 한 줄을 쌓는다.** 고치지 않고 **쌓는다** —
 *              값 하나만 두면 단가를 올리는 순간 **지난달이 소급해 바뀐다**(처음부터 넣는 것 ①).
 *    상담      `v2.consult` 한 줄. 글자 칸이다
 *    문의      `v2.inquiry` 한 줄 · 단계 · **등록 전환**(학생 줄 + 문의 잇기 + 반 배정)
 *
 * ── ⚠️ 여기 **없는** 것과 그 까닭 (지어내지 않는다)
 *    ① **발송 단추가 없다.** 「전화 끊고 즉시 발송」이 계획서에 있지만, 밖으로 나가는 길은
 *       `lib/notify.js` 하나뿐이고 그 함수는 **실제로 쏘는 손(`opts.push`)을 밖에서 받는다.**
 *       화면이 그 손을 만들면 발송이 두 벌이 되고(대전제 7 · `scripts/check-notify.mjs`),
 *       빈 손을 넘기면 **자취에는 「보냄」이 남고 폰에는 아무것도 안 간다.**
 *       → 지금 `app/api/notify` 를 다른 판이 짓고 있다. 그 문이 서면 여기에 단추 하나만 붙이면 된다.
 *    ② **지우는 길이 없다.** 대전제 6 — 지우지 않고 상태로 내린다.
 *       (`authenticated` 는 `delete` 권한 자체가 없다 — 0017·0070 이 회수해 뒀다.)
 *    ③ **계정(로그인)을 안 만든다.** 계정은 `auth.users` 이고 그건 `v2` 밖이다 —
 *       계획 「전환일까지 `v2` 밖에는 손대지 않는다」. 화면이 건드리면 **옛 앱의 계정 발급이
 *       그 자리에서 멈춘다.**
 *    ④ **청구액을 안 만든다** (오류 대장 83). 정규는 월정액, 특강만 회차만큼 —
 *       그래도 곱셈은 화면이 안 한다. 단가 줄과 회차를 나란히 보이고 금액은 원장님이 적으신다.
 *
 * ⚠️ **0줄이면 실패다** (자동 검사 ⑪) — 접근 규칙이 막았는데 「저장됨」이라 말하지 않는다.
 * ⚠️ 여기서 `revalidatePath` 를 부르지 않는다. 한 번 누를 때마다 화면 전체가 다시 조회되면
 *    25명을 이어서 적는 한 달 마감에 그 값을 **25번** 치른다 (§속도 5).
 */
import { openAs } from "./db.js";
import { staffOnly } from "./who.js";
import { assertYm } from "../../lib/monthly.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const UUID = /^[0-9a-fA-F-]{36}$/;

/** ⚠️ **0줄이면 실패다** (자동 검사 ⑪). 트랜잭션 안에서 던질 때 이 표시를 앞에 붙인다 */
const NO_ROWS = "no_rows";

/**
 * 문의 단계 — `v2.inquiry.stage` 가 받는 낱말 **그대로**다 (0014). 화면이 새 낱말을 만들지 않는다.
 * ⚠️ **내보내지 않는다.** `"use server"` 파일에서는 **async 함수만** 내보낼 수 있다 —
 *    상수를 내보내면 클라이언트가 그걸 들여오는 날 빌드가 그 자리에서 깨진다.
 */
const STAGES = Object.freeze(["new", "test", "visit", "joined", "dropped"]);

/** 문을 열고 → 하고 → 반드시 닫는다 */
async function run(fn) {
  const me = await staffOnly();
  if (!me.ok) return { ok: false, why: me.why, msg: me.msg };
  const c = await openAs(me.profileId);
  if (!c.ok) return { ok: false, why: "no-db", msg: c.why };
  try {
    return await fn(c.db, me);
  } catch (e) {
    return { ok: false, why: "threw", msg: String(e?.message ?? e).slice(0, 300) };
  } finally {
    await c.end();
  }
}

/** 빈 글자는 `null` 이다. ⚠️ **`0` 으로 바꾸지 않는다** — 「아직 안 적음」과 「0원」은 다르다 */
function money(v) {
  const s = String(v ?? "").replace(/[\s,원]/g, "");
  if (s === "") return { ok: true, value: null };
  if (!/^\d{1,9}$/.test(s)) return { ok: false, msg: `금액이 숫자가 아닙니다 — 「${String(v).slice(0, 20)}」` };
  return { ok: true, value: Number(s) };
}

/**
 * 그 아이 그 달 수납 한 줄 — **금액과 받은 날이 전부**다.
 *
 * ⚠️ `source` 를 안 채운다. 손으로 적은 줄은 **출처가 비어야** 「바깥에서 받아온 것의
 *    중복 방지」 부분 유니크에 안 걸린다 (자동화 뼈대 ⑦).
 * ⚠️ 열쇠는 `(student_id, ym)` 유일 — 같은 달을 두 번 적어도 줄이 안 는다.
 */
export async function savePayment({ studentId, ym, amount, paidOn, method, note }) {
  if (!UUID.test(String(studentId ?? ""))) return { ok: false, msg: "어느 아이인지 모릅니다" };
  let month;
  try { month = assertYm(ym); }
  catch { return { ok: false, msg: "달이 'YYYY-MM' 이 아닙니다 — 달을 지어내지 않습니다" }; }
  const m = money(amount);
  if (!m.ok) return { ok: false, msg: m.msg };
  if (paidOn && !DATE.test(String(paidOn))) return { ok: false, msg: "받은 날이 날짜가 아닙니다" };

  return run(async (db) => {
    const w = await db.query(
      `/* ops:pay */
       insert into v2.payment (student_id, ym, amount, paid_on, method, note)
       values ($1::uuid, $2, $3::int, nullif($4,'')::date, nullif($5,''), nullif($6,''))
       on conflict (student_id, ym) do update
          set amount = excluded.amount, paid_on = excluded.paid_on,
              method = excluded.method, note = excluded.note, updated_at = now()
       returning id, amount, to_char(paid_on,'YYYY-MM-DD') as paid_on, method, note`,
      [studentId, month, m.value, paidOn || "", method || "", note || ""]);
    const row = (w.rows ?? [])[0];
    if (!row) {
      return { ok: false, why: "no_rows",
        msg: "한 줄도 안 바뀌었습니다 — 접근 규칙이나 권한이 막았습니다" };
    }
    return {
      ok: true,
      row: { paymentId: row.id, amount: row.amount == null ? null : Number(row.amount),
             paidOn: row.paid_on ?? null, method: row.method ?? null, note: row.note ?? null },
      msg: row.amount == null ? "금액이 비었습니다 — **0원이 아니라 「아직 안 적음」**으로 남습니다" : null,
    };
  });
}

/**
 * 단가 한 줄을 **쌓는다** — 「언제부터 얼마」.
 *
 * ⚠️ **고치지 않고 쌓는다.** 값 하나만 두면 단가를 올리는 순간 지난달 청구액이 소급해 바뀐다.
 * ⚠️ 이 화면은 **어느 줄이 이기는지 안 정한다** — 학생 줄과 반 줄이 겹칠 때의 우선순위가
 *    계획서에도 DB 에도 없다. 겹치면 화면이 **둘 다 보이고 겹쳤다고 밝힌다.**
 * ⚠️ `per_session` 은 **특강만** 참이다 — 정규는 월정액이라 회차와 무관하다(오류 83).
 */
export async function addFeeRule({ studentId, classId, fromDate, toDate, amount, perSession }) {
  if (!DATE.test(String(fromDate ?? ""))) return { ok: false, msg: "「언제부터」가 없습니다 — 날짜를 지어내지 않습니다" };
  if (toDate && !DATE.test(String(toDate))) return { ok: false, msg: "「언제까지」가 날짜가 아닙니다" };
  const m = money(amount);
  if (!m.ok) return { ok: false, msg: m.msg };
  if (m.value == null) return { ok: false, msg: "단가 줄에는 금액이 있어야 합니다 (수납 칸과 달리 빈 칸을 못 둡니다)" };
  const sid = String(studentId ?? ""), cid = String(classId ?? "");
  if (!UUID.test(sid) && !UUID.test(cid))
    return { ok: false, msg: "학생이나 반 중 하나는 골라야 합니다" };

  return run(async (db) => {
    const w = await db.query(
      `/* ops:fee-add */
       insert into v2.fee_rule (student_id, class_id, from_date, to_date, amount, per_session)
       values (nullif($1,'')::uuid, nullif($2,'')::uuid, $3::date, nullif($4,'')::date, $5::int, $6)
       returning id`,
      [UUID.test(sid) ? sid : "", UUID.test(cid) ? cid : "", fromDate, toDate || "", m.value, perSession === true]);
    if (!(w.rows ?? []).length) return { ok: false, why: "no_rows", msg: "한 줄도 안 들어갔습니다" };
    return { ok: true, id: w.rows[0].id };
  });
}

/**
 * 단가 줄의 **끝을 찍는다** (`to_date`). 지우는 것이 아니다 (대전제 6).
 * ⚠️ 끝일 앞의 달은 그대로다 — 그래서 지난달이 소급해 안 바뀐다.
 */
export async function endFeeRule({ id, toDate }) {
  if (!UUID.test(String(id ?? ""))) return { ok: false, msg: "어느 줄인지 모릅니다" };
  if (!DATE.test(String(toDate ?? ""))) return { ok: false, msg: "끝나는 날이 날짜가 아닙니다" };
  return run(async (db) => {
    const w = await db.query(
      `/* ops:fee-end */ update v2.fee_rule set to_date = $2::date where id = $1::uuid returning id`,
      [id, toDate]);
    if (!(w.rows ?? []).length) return { ok: false, why: "no_rows", msg: "한 줄도 안 바뀌었습니다" };
    return { ok: true };
  });
}

/**
 * 상담 한 줄. **판단이 아니다** — 원장님이 적으신 그대로 담는다.
 *
 * ⚠️ 「언제」를 안 적으면 `now()` 다. 적으면 **서울 시각으로 읽는다** —
 *    `'2026-09-02T14:30'::timestamptz` 로 두면 서버가 UTC 라 **9시간이 밀린다.**
 * ⚠️ `created_by` 는 **서버가 정한다.** 화면이 보낸 값을 안 믿는다
 *    (「했다」를 남기는 자리는 서버가 시각과 사람을 정한다 — 처음부터 지키는 규칙).
 */
export async function saveConsult({ studentId, at, way, body }) {
  if (studentId && !UUID.test(String(studentId)))
    return { ok: false, msg: "어느 아이인지 모릅니다" };
  if (!String(body ?? "").trim()) return { ok: false, msg: "적을 내용이 없습니다 — 빈 상담 줄은 안 만듭니다" };
  if (at && !LOCAL_AT.test(String(at))) return { ok: false, msg: "「언제」가 날짜·시각이 아닙니다" };

  return run(async (db, me) => {
    const w = await db.query(
      `/* ops:consult-add */
       insert into v2.consult (student_id, at, way, body, created_by)
       values (nullif($1,'')::uuid,
               coalesce((nullif($2,'')::timestamp at time zone 'Asia/Seoul'), now()),
               nullif($3,''), $4, $5::uuid)
       returning id, to_char(at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI') as at, way, body`,
      [studentId || "", at || "", way || "", String(body), me.profileId]);
    const row = (w.rows ?? [])[0];
    if (!row) return { ok: false, why: "no_rows", msg: "한 줄도 안 들어갔습니다" };
    return { ok: true, row: { id: row.id, at: row.at, way: row.way, body: row.body,
                              studentId: studentId || null } };
  });
}

/**
 * 신규 문의 한 줄 — **전화 끊고 바로.** 칸이 다 비어도 이름 하나면 들어간다.
 * ⚠️ 여기서 발송을 안 한다 (파일 머리 ①). 대신 화면이 그 사실을 그 자리에 띄운다.
 */
export async function saveInquiry({ name, phone, school, grade, way, body }) {
  if (!String(name ?? "").trim()) return { ok: false, msg: "이름이 없습니다 — 이름 하나는 있어야 나중에 찾습니다" };
  const g = String(grade ?? "").trim();
  if (g && !/^\d{1,2}$/.test(g)) return { ok: false, msg: "학년이 숫자가 아닙니다" };

  return run(async (db) => {
    const w = await db.query(
      `/* ops:inq-add */
       insert into v2.inquiry (name, phone, school, grade, way, body, stage)
       values ($1, nullif($2,''), nullif($3,''), nullif($4,'')::smallint, nullif($5,''), nullif($6,''), 'new')
       returning id, name, phone, school, grade, way, stage, body,
                 to_char(created_at at time zone 'Asia/Seoul','YYYY-MM-DD') as on_date`,
      [String(name).trim(), phone || "", school || "", g, way || "", body || ""]);
    const r = (w.rows ?? [])[0];
    if (!r) return { ok: false, why: "no_rows", msg: "한 줄도 안 들어갔습니다" };
    return { ok: true, row: { ...r, onDate: r.on_date, studentId: null, studentName: null } };
  });
}

/** 문의 단계 한 칸. ⚠️ `joined` 는 **여기서 못 만든다** — 등록 전환이 학생 줄까지 세워야 한다 */
export async function setStage({ id, stage }) {
  if (!UUID.test(String(id ?? ""))) return { ok: false, msg: "어느 문의인지 모릅니다" };
  if (!STAGES.includes(stage)) return { ok: false, msg: `모르는 단계 「${stage}」` };
  if (stage === "joined")
    return { ok: false, msg: "「등록」은 단계만 바꿔서는 안 됩니다 — 아래 「등록 전환」을 눌러야 학생 줄이 섭니다" };

  return run(async (db) => {
    const w = await db.query(
      `/* ops:inq-stage */ update v2.inquiry set stage = $2 where id = $1::uuid returning id, stage`,
      [id, stage]);
    if (!(w.rows ?? []).length) return { ok: false, why: "no_rows", msg: "한 줄도 안 바뀌었습니다" };
    return { ok: true, stage };
  });
}

/**
 * **등록 전환** — 문의 하나를 아이 하나로. 한 번에 끝난다.
 *
 * 한 덩어리로 하는 것 (트랜잭션 — 「한 동작이 여러 표를 건드리면 어디까지가 한 덩어리인지 정한다」):
 *   ① `v2.students` 에 아이 한 줄 (이름 · 학년 · 학교)
 *   ② `v2.inquiry` 에 `stage='joined'` 와 그 아이 잇기
 *   ③ (반을 고르면) `v2.class_member` 에 **「언제부터」가 든** 소속 한 줄
 *
 * ⚠️ **안 하는 것과 까닭**
 *   · **계정(로그인)** — `auth.users` 는 `v2` 밖이다. 건드리면 옛 앱의 계정 발급이 멈춘다.
 *   · **학부모 잇기** — 학부모 계정이 아직 없다. 전화번호만으로 사람을 만들지 않는다.
 *   · **교재 배정 · 단가 줄 · 첫 안내 발송** — 계획의 「한 번에 7가지」가 무엇 무엇인지
 *     ⚠️ **확인 안 됨.** 지어내면 되돌릴 길이 없다(대전제 6). 화면이 못 한 것을 그대로 띄운다.
 *
 * ⚠️ 학교는 **이름으로 찾기만 한다.** 없으면 `null` 로 두고 밝힌다 —
 *    학교를 여기서 만들면 「신정중」과 「신정중학교」가 두 줄이 된다.
 * ⚠️ 같은 이름의 재원생이 이미 있으면 **한 번 되돌린다.** `force` 로 다시 누르면 만든다 —
 *    아이 줄은 지울 수 없어서(대전제 6) 잘못 만들면 영영 남는다.
 */
export async function enroll({ inquiryId, name, grade, classId, fromDate, force = false }) {
  if (!UUID.test(String(inquiryId ?? ""))) return { ok: false, msg: "어느 문의인지 모릅니다" };
  if (!String(name ?? "").trim()) return { ok: false, msg: "아이 이름이 없습니다" };
  const g = String(grade ?? "").trim();
  if (g && !/^\d{1,2}$/.test(g)) return { ok: false, msg: "학년이 숫자가 아닙니다" };
  const cid = String(classId ?? "");
  if (cid && !UUID.test(cid)) return { ok: false, msg: "반을 못 알아봤습니다" };
  if (cid && !DATE.test(String(fromDate ?? "")))
    return { ok: false, msg: "반을 고르면 **「언제부터」**가 있어야 합니다 — 소속은 기간이 열쇠입니다" };

  return run(async (db) => {
    // ① 그 문의가 아직 안 이어졌나 — 두 번 누르면 아이가 둘이 된다
    const inq = await db.query(
      `/* ops:enroll-look */ select id, student_id, school from v2.inquiry where id = $1::uuid`, [inquiryId]);
    const row = (inq.rows ?? [])[0];
    if (!row) return { ok: false, why: "no_inquiry", msg: "그 문의가 없습니다" };
    if (row.student_id) return { ok: false, why: "already", msg: "이미 등록 전환한 문의입니다" };

    // ② 같은 이름이 이미 있나 — 되돌릴 수 없는 자리라 한 번 묻는다
    if (!force) {
      const same = await db.query(
        `/* ops:enroll-same */ select id, name, grade from v2.students
          where name = $1 and state <> 'left' limit 3`, [String(name).trim()]);
      if ((same.rows ?? []).length) {
        return { ok: false, why: "same_name",
          msg: `같은 이름의 아이가 이미 ${same.rows.length}명 있습니다 — 그래도 새로 만들려면 한 번 더 누르세요`,
          same: same.rows };
      }
    }

    await db.query("begin");
    try {
      const st = await db.query(
        `/* ops:enroll-student */
         insert into v2.students (name, grade, school_id, state)
         values ($1, nullif($2,'')::smallint,
                 (select s.id from v2.schools s where s.name = nullif($3,'')), 'active')
         returning id, name, grade, school_id`,
        [String(name).trim(), g, row.school || ""]);
      const kid = (st.rows ?? [])[0];
      // ⚠️ **0줄이면 실패다** (자동 검사 ⑪). 트랜잭션 안이라 던져서 통째로 되돌린다 —
      //    까닭 표시는 `NO_ROWS|사람이 읽을 말` 로 붙여 아래 catch 가 갈라 담는다
      if (!kid) throw new Error(`${NO_ROWS}|아이 줄이 안 만들어졌습니다`);

      const up = await db.query(
        `/* ops:enroll-link */
         update v2.inquiry set stage = 'joined', student_id = $2::uuid
          where id = $1::uuid and student_id is null returning id`,
        [inquiryId, kid.id]);
      if (!(up.rows ?? []).length) throw new Error(`${NO_ROWS}|문의를 아이에게 못 이었습니다 (누가 먼저 눌렀습니다)`);

      let joinedClass = null;
      if (cid) {
        // ⚠️ 소속은 **「언제부터」가 열쇠에 든다** (처음부터 넣는 것 ⑤).
        //    붙이기만 하면 나갔다 돌아온 아이의 두 번째 기간이 안 들어간다
        const cm = await db.query(
          `/* ops:enroll-class */
           insert into v2.class_member (class_id, student_id, from_date)
           values ($1::uuid, $2::uuid, $3::date)
           on conflict (class_id, student_id, from_date) do nothing
           returning class_id`,
          [cid, kid.id, fromDate]);
        joinedClass = (cm.rows ?? []).length ? cid : null;
        if (!joinedClass) throw new Error(`${NO_ROWS}|반 소속 줄이 안 만들어졌습니다`);
      }

      await db.query("commit");
      return {
        ok: true,
        studentId: kid.id, name: kid.name, grade: kid.grade,
        schoolFound: kid.school_id != null,
        joinedClass,
        // ⚠️ **못 한 것을 그대로 말한다** (대전제 0). 조용히 넘어가면 몇 주 뒤에나 알아챈다
        notDone: [
          "로그인 계정 — `auth.users` 는 `v2` 밖이라 이 화면이 안 만듭니다",
          "학부모 잇기 — 학부모 계정이 아직 없습니다",
          "교재 배정 · 단가 줄 · 첫 안내 발송 — 여기서 안 했습니다",
        ],
      };
    } catch (e) {
      await db.query("rollback").catch(() => {});
      // ⚠️ 「한 줄도 안 바뀌었다」와 「그 밖의 사고」를 **가려서** 돌려준다.
      //    섞으면 접근 규칙이 막은 것을 「알 수 없는 오류」로 말하게 된다
      const [tag, said] = String(e?.message ?? e).split("|");
      return { ok: false, why: tag === NO_ROWS ? NO_ROWS : "tx",
               msg: (said ?? tag).slice(0, 200) };
    }
  });
}
