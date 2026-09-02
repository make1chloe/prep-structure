"use server";
/**
 * 오늘 화면이 **쓰는** 자리. 여기에도 판단은 없다 — `lib/` 을 부르고 결과를 그대로 돌려준다.
 *
 * ── 무엇을 쓰나 · 누가 판단하나
 *    ○△✕     `v2.day_item.status` 한 줄을 쓰고 → `lib/progress.js` 의 `fromCheck()` 를 부른다.
 *              (그 파일 주석 그대로 — 「부르는 쪽은 day_item 을 **먼저 쓰고** 이 함수를 부른다」)
 *    출결      `lib/attend.js` 의 `attendanceWrite()` **한 벌만** 지난다 (여덟 길 중 하나).
 *    글        `v2.day_sheet.comment` · `staff_note` · `v2.late_stay` 는 **글자 칸**이다 —
 *              판단이 아니라 원장님이 적은 그대로 담는다.
 *    마감      `lib/close.js` 의 `closeGate()` 로 **먼저 보여주고** `closeSheet()` 로 닫는다.
 *
 * ── ⚠️ 여기 **없는** 것과 그 까닭 (지어내지 않는다)
 *    ① ✅ **굳히는 단추가 생겼다** (2026-09-02). 한 벌은 `lib/day.js` 의 `freezeDay` 이고
 *       이 파일은 **부르기만** 한다 — 「무엇을 몇 줄로 어떤 차례로 남기나」는 거기 한 곳에 있다.
 *       ⚠️ **화면이 보낸 줄을 그대로 안 적는다.** 초안을 여기서 `routineNext` 로 **다시 차려**
 *          굳힌다. 화면 값을 믿고 적으면 아이 화면에 아무 숙제나 넣을 수 있게 된다.
 *          화면에서 받는 것은 **조절(갯수·범위·뺄 항목)과 메모**뿐이다.
 *    ② **늦귀가 「보내기」가 없다.** 발송은 `lib/notify.js` 한 곳을 지나야 하는데
 *       그 함수는 실제로 쏘는 손(`opts.push`)을 **밖에서 받는다.** 화면이 그 손을 만들면
 *       발송이 두 벌이 되고(대전제 7 · `scripts/check-notify.mjs`), 빈 손을 넘기면
 *       발송 스위치를 켠 날 **자취에는 「보냄」이 남고 폰에는 아무것도 안 간다.**
 *       → 안 보낸 늦귀가는 마감이 **반드시 한 번 묻는다**(`ASK.LATE_UNSENT`). 그 길은 살아 있다.
 *
 * ⚠️ **되돌릴 수 없는 것은 서버 답을 기다린다** (§속도 5). 마감이 그것이다.
 *    ○△✕ 는 화면에서 먼저 바뀌고 여기로는 뒤에서 온다 — 실패하면 그 단추만 되돌린다.
 * ⚠️ 여기서 `revalidatePath` 를 부르지 않는다. 한 번 누를 때마다 화면 전체가 다시 조회되면
 *    23명을 이어서 처리하는 수업 한 번에 그 값을 **23번** 치른다 (§속도 5).
 */
import { openAs } from "./db.js";
import { staffOnly } from "./who.js";
import { fromCheck } from "../../lib/progress.js";
import { attendanceWrite } from "../../lib/attend.js";
import { closeGate, closeSheet } from "../../lib/close.js";
import { routineNext } from "../../lib/routine.js";
import { freezeDay, putAreaMemos } from "../../lib/day.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-fA-F-]{36}$/;

/** ○△✕ · 학원에서 함 · 미검사. `v2.day_item.status` 가 받는 낱말 그대로다 (0011) */
const MARKS = new Set(["done", "weak", "missing", "inclass", "none"]);

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

/**
 * 검사 ○△✕ 한 칸.
 *
 * ⚠️⚠️ **한 덩어리다** (0-4). 한 번 누르면 표 셋을 건드린다 —
 *    `v2.day_item`(표시) · `v2.progress_part`(조각) · `v2.progress`(진도).
 *    묶지 않으면 진도 쓰기가 터졌을 때 **조각만 남은 반쪽**이 굳는다.
 *    `fromCheck` 에 `{ tx: false }` 를 주는 것은 **이 트랜잭션이 주인이기 때문**이다 —
 *    안쪽이 또 begin 하면 저장점이 겹친다.
 *
 * ⚠️⚠️ **진도가 안 올라갔으면 「저장됨」이라 말하지 않는다.**
 *    예전에는 `fromCheck` 가 `why` 를 줘도 여기서 `ok:true` 를 돌려주어
 *    **○ 이 켜진 채 아무 말도 안 떴다.** 진도가 하나도 안 올라가도 화면은 조용했다.
 *    한 함수 안에 잣대가 둘이었다 — `day_item` 0줄은 실패로 되돌리면서(검사-⑪)
 *    바로 아래 진도 실패는 안 봤다. 이제 **같은 잣대**로 본다.
 *
 * ⚠️ 「단원이 안 붙어 못 올린다」는 **실패가 아니다.** 표시는 남아야 한다 —
 *    되돌리면 원장님이 찍은 ○ 이 사라진다. 그래서 `ok:true` 로 주되 **까닭을 말한다**.
 */
export async function markCheck({ itemId, studentId, on, mark }) {
  if (!UUID.test(String(itemId ?? ""))) return { ok: false, msg: "어느 줄인지 모릅니다" };
  if (!MARKS.has(mark)) return { ok: false, msg: `모르는 표시 「${mark}」` };
  if (!DATE.test(String(on ?? ""))) return { ok: false, msg: "날짜가 없습니다 — 날짜를 지어내지 않습니다" };

  return run(async (db) => {
    await db.query("begin");
    try {
      const w = await db.query(
        `/* today:mark */ update v2.day_item set status = $2, updated_at = now()
          where id = $1::uuid returning id, unit_id, sheet_id, range_note, slot`,
        [itemId, mark]);
      const row = (w.rows ?? [])[0];
      if (!row) {
        await db.query("rollback");
        return { ok: false, why: "no_rows",
          msg: "한 줄도 안 바뀌었습니다 — 접근 규칙이 막았거나 그 줄이 없습니다" };
      }
      if (!row.unit_id) {
        // ⚠️ 실측 — 지금 DB 의 검사 줄 3,994개가 **전부** 단원이 안 붙어 있다.
        //    그러면 진도를 올릴 곳이 없다. **올린 척하지 않는다.**
        await db.query("commit");
        return { ok: true, saved: true, raised: null, note: true,
          msg: "표시는 남았지만 이 줄에 **단원이 안 붙어** 진도는 안 올라갑니다" };
      }
      const r = await fromCheck(db, {
        studentId, on,
        marks: [{ unitId: row.unit_id, mark, slot: row.slot, range: row.range_note,
                  itemId: row.id, sheetId: row.sheet_id }],
      }, { tx: false });

      // ⚠️ **여기가 그 자리다.** `fromCheck` 는 실패를 `why` 로만 준다(`ok` 를 안 붙인다).
      //    `lib/close.js` 의 `progress_failed` 와 **같은 잣대**로 본다.
      if (r?.ok !== true) {
        await db.query("rollback");
        return { ok: false, why: "progress_failed",
          msg: r?.why ?? "진도를 못 올렸습니다 — 표시도 되돌렸습니다" };
      }
      await db.query("commit");
      return { ok: true, saved: true, raised: r?.applied?.length ?? 0,
               skipped: r?.skipped ?? [], notes: r?.notes ?? [], msg: null };
    } catch (e) {
      // ⚠️ 되돌리고 나서 다시 던진다 — `run()` 이 사람 말로 바꿔 준다
      await db.query("rollback").catch(() => {});
      throw e;
    }
  });
}

/**
 * 출결. **여덟 길이 전부 `attendanceWrite` 를 지난다** — 여기서 판을 직접 안 만든다.
 * ⚠️ `classId` 를 빼먹으면 `keyOf` 가 거절한다. 반이 없으면 `null` 이라고 **적어서** 보낸다.
 */
export async function setAttend({ studentId, on, classId, attend, late = null, startTime = null }) {
  if (!DATE.test(String(on ?? ""))) return { ok: false, msg: "날짜가 없습니다" };
  return run(async (db) => {
    // ⚠️ `via` 는 `WRITE_PATHS` 에 **이름이 있는 길**이라야 한다. 오늘 화면은 `quick` 이다
    const r = await attendanceWrite(db, {
      via: "quick", studentId, date: on, classId: classId ?? null, attend, late, startTime,
    });
    return { ok: r.ok === true, sheetId: r.sheetId ?? null, msg: r.ok ? (r.warn ?? null) : r.msg };
  });
}

/**
 * 부모님께 나갈 글. **판단이 아니다** — 원장님이 적은 그대로 담는다.
 *
 * ⚠️⚠️ **원장님만 볼 메모 칸은 이 화면이 안 건드린다.** 그 칸 이름은 `lib/close.js` 밖
 *    어디에도 못 나오고 `scripts/check-close.mjs` 가 `app/`·`lib/` 전수로 막는다 —
 *    가리는 목록에서 한 줄만 빠지면 그 칸이 학부모 화면에 그대로 뜨기 때문이다(사고 #7).
 *    쓰려면 `lib/close.js` 에 「원장에게만 주는 한 벌」이 먼저 서야 한다.
 */
export async function saveComment({ sheetId, text }) {
  if (!UUID.test(String(sheetId ?? ""))) return { ok: false, msg: "판이 없습니다 — 먼저 출결을 찍어야 판이 섭니다" };
  return run(async (db) => {
    const w = await db.query(
      `/* today:comment */ update v2.day_sheet set comment = $2, updated_at = now()
        where id = $1::uuid and closed_at is null returning id`,
      [sheetId, String(text ?? "")]);
    if (!(w.rows ?? []).length) {
      return { ok: false, why: "no_rows", msg: "안 바뀌었습니다 — 이미 마감했거나 접근 규칙이 막았습니다" };
    }
    return { ok: true };
  });
}

/**
 * 늦귀가 한 줄 (⑭). 판마다 한 줄이다.
 * ⚠️ **예상 귀가 시각은 약속이 된다** — 실제 하원(`left_at`)을 같이 남겨야
 *    「10시라더니 10시 40분」이 어디엔가 남는다.
 * ⚠️ 보내는 것은 여기 없다 (파일 머리 ② 참고). 안 보내면 마감이 한 번 묻는다.
 * ⚠️ **「판마다 한 줄」이 표 주석에는 있는데 DB 제약이 없다** (실측 — `late_stay` 에 sheet_id 유일
 *    인덱스가 없다). 그래서 `on conflict` 를 못 쓴다 — 있는 줄을 고치고, 없을 때만 넣는다.
 *    유일 인덱스는 보고의 `needsDb` 에 적었다.
 */
export async function saveLate({ sheetId, reason, untilAt, leftAt }) {
  if (!UUID.test(String(sheetId ?? ""))) return { ok: false, msg: "판이 없습니다 — 먼저 출결을 찍어야 판이 섭니다" };
  return run(async (db) => {
    const w = await db.query(
      `/* today:late */
       with up as (
         update v2.late_stay
            set reason = $2, until_at = nullif($3,'')::time, left_at = nullif($4,'')::time
          where sheet_id = $1::uuid returning id, sent_at),
       ins as (
         insert into v2.late_stay (sheet_id, reason, until_at, left_at)
         select $1::uuid, $2, nullif($3,'')::time, nullif($4,'')::time
          where not exists (select 1 from up)
         returning id, sent_at)
       select id, sent_at from up union all select id, sent_at from ins`,
      [sheetId, reason || null, untilAt || "", leftAt || ""]);
    const row = (w.rows ?? [])[0];
    if (!row) return { ok: false, why: "no_rows", msg: "한 줄도 안 바뀌었습니다" };
    return { ok: true, id: row.id, sentAt: row.sent_at ?? null,
             msg: row.sent_at ? null : "⚠️ 아직 **안 보냈습니다** — 마감할 때 한 번 묻습니다" };
  });
}

/**
 * 마감하기 전에 **보여준다** — 「이대로 마감하면 무엇이 ○ 로 올라가나」(㊳) ·
 * 「무엇이 학부모에게 보이나」 · 「반드시 답해야 하는 물음」.
 * ⚠️ 되돌릴 수 없는 자리라 낙관 갱신을 안 쓴다.
 */
export async function previewClose(sheetId) {
  if (!UUID.test(String(sheetId ?? ""))) return { ok: false, msg: "판이 없습니다" };
  return run(async (db) => {
    const g = await closeGate(db, sheetId);
    if (!g.ok) return { ok: false, msg: "그 판이 없습니다" };
    return {
      ok: true,
      closedAt: g.sheet.closed_at ?? null,
      asks: g.asks, mustAsk: g.mustAsk,
      autoDone: g.preview.autoDone, unitCount: g.preview.unitCount,
      reachesFamily: g.preview.reachesFamily, stamp: g.preview.stamp,
    };
  });
}

/**
 * 마감한다. `expect` 는 `previewClose` 가 준 지문 — **보여준 뒤 판이 바뀌었으면 멈춘다.**
 * ⚠️ 0줄이면 실패다. 「누가 먼저 눌렀다」와 「성공」을 섞지 않는다.
 */
export async function closeDay({ sheetId, confirm = [], expect = null }) {
  if (!UUID.test(String(sheetId ?? ""))) return { ok: false, msg: "판이 없습니다" };
  return run(async (db, me) => {
    const r = await closeSheet(db, sheetId, { by: me.profileId, confirm, expect, tx: true });
    if (r.ok) return { ok: true, closedAt: r.closedAt, autoDone: r.autoDone ?? [] };
    const msg =
      r.why === "ask" ? `아직 답 안 한 물음이 있습니다: ${r.need.join(" · ")}`
      : r.why === "changed" ? "보여준 뒤 판이 바뀌었습니다 — 다시 보고 누르세요"
      : r.why === "already_closed" ? "이미 마감했습니다"
      : r.why === "no_rows" ? "한 줄도 안 닫혔습니다 — 누가 먼저 눌렀거나 접근 규칙이 막았습니다"
      : r.why === "progress_failed" ? `진도가 안 올라가 마감을 되돌렸습니다 — ${r.said ?? ""}`
      : `마감하지 못했습니다 (${r.why})`;
    return { ok: false, why: r.why, msg };
  });
}

/**
 * ②③ 을 **판으로 굳힌다** (⑨ · ⑨-a).
 *
 * ⚠️⚠️ **화면이 보낸 줄을 그대로 적지 않는다.** 여기서 `routineNext` 로 초안을 **다시 차려**
 *    그것을 굳힌다. 화면 값을 믿고 적으면 아이 화면에 아무 숙제나 밀어 넣을 수 있고,
 *    「무엇을 낼지 정하는 것」이 두 벌이 된다(원칙 1 — 그 판단은 `lib/routine.js` 하나다).
 *    화면에서 받는 것은 **조절(갯수·범위·뺄 항목)과 메모**뿐이다 — 「안 누르면 보이는 그대로」.
 *
 * ⚠️ **판이 먼저 서 있어야 한다.** 판을 세우는 것은 `lib/attend.js` 의 `attendanceWrite` 다
 *    (「출결을 어디서 찍든 그날 판이 선다」). 여기서 판을 만들지 않는다 — 만들면 쓰는 길이 두 벌이다.
 *
 * ⚠️ **되돌릴 수 없는 것은 서버 답을 기다린다.** 굳히면 아이 화면에 나가므로 낙관 갱신을 안 쓴다.
 *
 * ⚠️ 아이가 이미 낸 것과 원장님이 이미 찍은 ○△✕ 는 `freezeDay` 가 안 건드린다
 *    (그 파일의 「다시 굳힐 때 아이가 낸 것을 지우지 않는다」).
 */
export async function freezeToday({ studentId, on, adjust = {}, memo = {}, classId }) {
  if (!UUID.test(String(studentId ?? ""))) return { ok: false, msg: "학생이 없습니다" };
  if (!DATE.test(String(on ?? ""))) return { ok: false, msg: "날짜가 이상합니다" };
  return run(async (db) => {
    // ① 초안을 **여기서** 다시 차린다 (화면 값을 안 믿는다)
    const plan = await routineNext(db, { studentId, on, adjust, memo });

    // ② 굳힌다. 「범위가 빈 숙제」는 `freezeDay` 가 통째로 거절한다(넷째 길목)
    const opts = {};
    if (classId !== undefined) opts.classId = classId;
    const r = await freezeDay(db, plan, opts);

    // ③ ⚠️ 「바뀔 줄이 애초에 없었다」와 「막혀서 0줄」은 다르다 — freezeDay 가 갈라 준다
    if (r?.ok === false) return { ok: false, why: r.why ?? "freeze", msg: r.msg ?? "굳히지 못했습니다" };
    return { ok: true, ...r };
  });
}

/**
 * 굳히기 **미리보기** — 아무것도 안 만든다 (`freezeDay` 의 `dryRun`).
 *
 * ⚠️ 굳히기는 **되돌릴 수 없는 쪽**이다 — 굳히면 그 줄이 아이 화면으로 간다.
 *    그래서 「무엇이 몇 줄 서는지」를 **누르기 전에** 보인다(대전제 8 · §속도 5).
 * ⚠️ 미리보기는 **판을 안 세운다.** 판을 세우는 것은 「왔다」를 찍는 일이라
 *    미리 눌러 보다가 출결이 찍히면 안 된다.
 */
export async function previewFreeze({ studentId, on, adjust = {}, memo = {}, classId }) {
  if (!UUID.test(String(studentId ?? ""))) return { ok: false, msg: "학생이 없습니다" };
  if (!DATE.test(String(on ?? ""))) return { ok: false, msg: "날짜가 이상합니다" };
  return run(async (db) => {
    const plan = await routineNext(db, { studentId, on, adjust, memo });
    const opts = { dryRun: true };
    if (classId !== undefined) opts.classId = classId;
    const r = await freezeDay(db, plan, opts);
    return { ok: r?.ok !== false, ...r };
  });
}

/**
 * 영역 메모 한 줄 (단어 · 독해 · 문법 · 영작 — 목업 31 · 0079).
 *
 * ⚠️ **판단은 `lib/day.js` 의 `putAreaMemos` 한 벌**이다. 여기는 부르기만 한다(대전제-4).
 *    「준 영역만 건드린다」도 「빈 줄은 **내린다**(안 지운다)」도 거기 있다.
 * ⚠️ **판이 서 있어야 적을 수 있다.** 판을 세우는 것은 `attendanceWrite` 다 —
 *    여기서 판을 만들면 출결이 안 찍힌 아이가 「왔다」로 서 버린다.
 * ⚠️ 이 줄은 **아이·학부모에게 그대로 나간다**(마감해야). 원장님만 볼 말은 판의 staff_note 다.
 */
export async function saveAreaMemo({ sheetId, area, text }) {
  if (!UUID.test(String(sheetId ?? ""))) {
    return { ok: false, msg: "판이 없습니다 — 먼저 출결을 찍어야 판이 섭니다" };
  }
  if (!area) return { ok: false, msg: "어느 영역인지 모릅니다" };
  return run(async (db) => {
    try {
      const r = await putAreaMemos(db, sheetId, { [area]: text ?? "" });
      // ⚠️ 「같은 값이라 안 바뀜」은 실패가 아니다 — `putAreaMemos` 가 `same` 으로 갈라 준다
      return { ok: true, saved: (r.wrote + r.removed) > 0, same: r.same > 0 };
    } catch (e) {
      // 없는 영역은 DB(도메인)가 막는다 — 사람 말로 올린다
      return { ok: false, why: "threw", msg: String(e?.message ?? e).slice(0, 200) };
    }
  });
}
