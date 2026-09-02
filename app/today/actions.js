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
 *    ① **초안(②③)을 판으로 굳히는 단추가 없다.** `v2.day_item` 에 줄을 만드는 한 벌이
 *       `lib/` 에 **하나도 없다** (실측 2026-09-02 — `insert into v2.day_item` 이 0곳).
 *       화면이 만들면 「무엇을 몇 줄로 어떤 차례로 남기나」가 **두 벌째 규칙**이 된다(원칙 1).
 *       → 보고의 `notes` 에 적었다. 그 한 벌이 서면 이 파일에 단추 하나만 붙이면 된다.
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
 * ⚠️ **0줄이면 실패다** (자동 검사 ⑪) — 접근 규칙이 막았는데 「저장됨」이라 말하지 않는다.
 * ⚠️ 진도를 여기서 안 올린다. `fromCheck` 가 예습 예외·덮음·지난 완료 자물쇠를 다 본다.
 */
export async function markCheck({ itemId, studentId, on, mark }) {
  if (!UUID.test(String(itemId ?? ""))) return { ok: false, msg: "어느 줄인지 모릅니다" };
  if (!MARKS.has(mark)) return { ok: false, msg: `모르는 표시 「${mark}」` };
  if (!DATE.test(String(on ?? ""))) return { ok: false, msg: "날짜가 없습니다 — 날짜를 지어내지 않습니다" };

  return run(async (db) => {
    const w = await db.query(
      `/* today:mark */ update v2.day_item set status = $2, updated_at = now()
        where id = $1::uuid returning id, unit_id, sheet_id, range_note, slot`,
      [itemId, mark]);
    const row = (w.rows ?? [])[0];
    if (!row) {
      return { ok: false, why: "no_rows",
        msg: "한 줄도 안 바뀌었습니다 — 접근 규칙이 막았거나 그 줄이 없습니다" };
    }
    if (!row.unit_id) {
      // ⚠️ 실측 — 지금 DB 의 검사 줄 3,994개가 **전부** 단원이 안 붙어 있다.
      //    그러면 진도를 올릴 곳이 없다. **올린 척하지 않는다.**
      return { ok: true, saved: true, raised: null,
        msg: "표시는 남았지만 이 줄에 **단원이 안 붙어** 진도는 안 올라갑니다" };
    }
    const r = await fromCheck(db, {
      studentId, on,
      marks: [{ unitId: row.unit_id, mark, slot: row.slot, range: row.range_note,
                itemId: row.id, sheetId: row.sheet_id }],
    }, { tx: false });
    return { ok: true, saved: true, raised: r?.applied?.length ?? 0,
             skipped: r?.skipped ?? [], notes: r?.notes ?? [], msg: null };
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
