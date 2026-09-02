"use server";
/**
 * 발송 화면이 **쓰는** 자리. 여기에도 판단은 없다 — `lib/` 을 부르고 결과를 그대로 돌려준다.
 *
 * ── ⚠️⚠️ **밖으로 나가는 길은 `lib/` 하나를 지난다.**
 *    · 데일리 · 하원 → `lib/push.js` 의 `sendDaily`·`sendLate`
 *      「보내도 되나(마감·이미 보냄) · 받는 사람 찾기 · 기기 세기 · 정말 나갔나 · 도장 찍기」가
 *      **전부 거기 있다.** 여기서 다시 세면 도장과 화면이 갈리고, 갈리는 날
 *      **마감이 「안 보냈습니다」를 안 묻는데 학부모는 모른 채 기다린다.**
 *    · 안내(공지) → `lib/` 에 아직 한 벌이 없어 `lib/notify.js` 를 **직접** 부른다.
 *      그래도 「정말 나갔나」는 `lib/push.js` 의 `outcome()` 이 답한다 — 그 판단은 한 벌뿐이다.
 *    ⚠️ 여기서 `web-push` 를 부르거나 발송 스위치 이름을 읽으면 `scripts/check-notify.mjs` 가 깨진다.
 *
 * ── ⚠️ **기본값은 「아무 데도 안 나감」이다.** 그래도 `v2.notify_log` 에는 줄이 남는다.
 *    화면이 그 사실을 밝힌다 — 자취만 보고 「보냈다」로 읽으면 안 된다.
 *
 * ── ⚠️ 여기서 `revalidatePath` 를 부르지 않는다. 한 번 누를 때마다 화면 전체가 다시 조회되면
 *    23명을 이어서 처리하는 저녁 한 번에 그 값을 23번 치른다 (§속도 5).
 * ── ⚠️ **되돌릴 수 없는 것은 서버 답을 기다린다** (§속도 5). 발송·예약이 바로 그것이다 —
 *    화면은 여기에 낙관 갱신을 안 쓴다.
 */
import { openAs } from "./db.js";
import { staffOnly } from "./who.js";
import { textFor } from "./read.js";
import { msgFor } from "./kinds.js";
import { Q_NOTICE_TARGETS, Q_NOTICE_SENT, Q_PICKED, Q_TEXT, Q_SCHED, Q_CANCEL } from "./sql.js";
import { notify, sinkOf } from "../../lib/notify.js";
import { sendDaily, sendLate, makePush, outcome } from "../../lib/push.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const uuids = (list) => [...new Set((list ?? []).map(String).filter((s) => UUID.test(s)))];

/** 예약 시각을 고르는 세 길 — 화면과 여기가 **같은 낱말**을 쓴다 (원칙 1) */
export const WHEN = Object.freeze(["tonight", "tomorrow", "at"]);

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
 * 안내(공지) 한 통 — ⚠️ `lib/` 에 공지를 보내는 한 벌이 아직 없어 여기서 잇는다.
 * 그 한 벌이 서면 이 함수는 통째로 지운다. 「정말 나갔나」는 지금도 `outcome()` 이 답한다.
 */
async function sendNoticeOne(db, one) {
  const t = textFor([], "notice", one);
  const targets = one.targets ?? [];
  const r = await notify(db, msgFor({ kind: "notice", text: t, targets }), { push: makePush(db) });
  // ⚠️ `outcome` 이 보는 모양 그대로 맞춰 준다 — 「정말 나갔나」를 여기서 다시 판정하지 않는다
  const out = outcome({ ...r, parents: targets.length, devices: one.devices ?? 0 });
  let stamped = false;
  if (out.ok && (await db.query(Q_NOTICE_SENT, [one.noticeId])).rows?.length) stamped = true;
  return { key: one.key, name: one.title, kind: "notice", ...out,
           sink: r.sink, sent: r.sent, hole: r.hole, stamped, targets: targets.length };
}

/** `lib/push.js` 가 준 답을 화면 한 줄로 — **여기서 다시 판정하지 않는다** */
const asRow = (kind, key, name, r) => ({
  key, name, kind,
  ok: r.ok === true, why: r.why, msg: r.msg ?? null,
  sink: r.sink ?? null, sent: r.sent ?? 0, devices: r.devices ?? null,
  stamped: r.stamped === true, hole: r.why === "hole" ? true : null,
});

/**
 * ⭐ **지금 보낸다.** 고른 것을 한 번에.
 *
 * @param picks `{ daily:[sheetId], late:[lateId], notice:[noticeId], again:boolean }`
 * @returns `{ ok, sink, rows:[…], stamped }`
 */
export async function sendNow({ on = null, picks = {}, again = false }) {
  if (on && !DATE.test(String(on))) return { ok: false, msg: "날짜가 이상합니다 — 날짜를 지어내지 않습니다" };
  const d = uuids(picks.daily), l = uuids(picks.late), n = uuids(picks.notice);
  if (!d.length && !l.length && !n.length) return { ok: false, msg: "고른 것이 없습니다" };

  return run(async (db) => {
    const rows = [];
    let stamped = 0;

    // ⚠️ 한 통씩 부른다. 묶어서 한 번에 쏘는 길을 여기서 만들면 「누구에게 갔나」가 두 벌이 된다
    for (const sheetId of d) {
      const r = await sendDaily(db, { sheetId, again });
      if (r.stamped) stamped++;
      rows.push(asRow("daily", sheetId, r.studentName ?? null, r));
    }
    for (const lateId of l) {
      const r = await sendLate(db, { lateId, again });
      if (r.stamped) stamped++;
      rows.push(asRow("late", lateId, r.studentName ?? null, r));
    }
    if (n.length) {
      const list = (await db.query(Q_NOTICE_TARGETS, [on || null, n])).rows[0]?.j ?? [];
      for (const one of list) {
        const r = await sendNoticeOne(db, one);
        if (r.stamped) stamped++;
        rows.push(r);
      }
    }

    // ⚠️ 아무 줄도 못 찾았으면 **성공이라 말하지 않는다** (자동 검사 ⑪)
    if (!rows.length) {
      return { ok: false, why: "no_rows", msg: "고른 줄을 하나도 못 찾았습니다 — 접근 규칙이 막았거나 그 줄이 없습니다" };
    }
    return { ok: true, sink: sinkOf(), rows, stamped, out: rows.filter((r) => r.ok).length };
  });
}

/**
 * ⭐ **다시 보내기** — 이미 보낸 그 줄 하나만.
 *
 * ⚠️ 묶음으로는 안 준다. 「이미 보낸 것도 다시」를 한 번에 켜면 **스무 집에 두 번째 알림**이 간다.
 *    되돌릴 수 없는 일이므로 **그 줄에서 따로** 누르게 한다 (§속도 5).
 */
export async function resendOne({ kind, id }) {
  if (kind !== "daily" && kind !== "late") return { ok: false, msg: `다시 보낼 수 없는 갈래 「${kind}」` };
  if (!UUID.test(String(id ?? ""))) return { ok: false, msg: "어느 줄인지 모릅니다" };
  return run(async (db) => {
    const r = kind === "daily"
      ? await sendDaily(db, { sheetId: id, again: true })
      : await sendLate(db, { lateId: id, again: true });
    return { ok: r.ok === true, ...asRow(kind, id, null, r) };
  });
}

/**
 * ⭐ **예약한다.** 오늘 21:00 · 내일 9:00 · 직접.
 *
 * ⚠️ **화면이 여는 순간 예약이 나가지 않는다** (§속도 3 — 옛 앱은 렌더 안에서 돌아 여는 사람이 기다렸다).
 * ⚠️⚠️ **크론이 아직 예약을 안 내보낸다** — `app/api/cron/route.js` 는 밀린 예약을 **세기만** 하고
 *    `deps.sendScheduled` 자리가 비어 있다(그 파일 주석에 그렇게 적혀 있다). 화면이 그 사실을 밝힌다.
 * ⚠️ `v2.scheduled_send` 에는 **어느 판·어느 늦귀가인지 가리키는 칸이 없다**(kind·student_id·body·at 뿐).
 *    그래서 크론이 붙는 날 「그 아이의 **어느 날** 판인가」를 못 고른다 — 보고의 `needsDb` 에 적었다.
 */
export async function schedule({ on = null, picks = {}, when = "tonight", at = null }) {
  if (!WHEN.includes(when)) return { ok: false, msg: `모르는 예약 갈래 「${when}」` };
  if (when === "at" && !AT.test(String(at ?? "")))
    return { ok: false, msg: "예약 시각을 적어야 합니다 — 시각을 지어내지 않습니다" };
  const d = uuids(picks.daily), l = uuids(picks.late), n = uuids(picks.notice);
  if (!d.length && !l.length) {
    return {
      ok: false,
      msg: n.length
        ? "안내(공지)는 예약할 자리가 다릅니다 — 예약 표에 공지를 가리키는 칸이 없습니다"
        : "고른 것이 없습니다",
    };
  }

  return run(async (db, me) => {
    const list = (await db.query(Q_PICKED, [d, l])).rows ?? [];
    const made = [];
    for (const one of list) {
      const r = await db.query(Q_SCHED, [one.kind, one.student_id, one.body ?? null, when, at, me.profileId]);
      if (r.rows?.length) made.push({ id: r.rows[0].id, at: r.rows[0].at, name: one.name, kind: one.kind });
    }
    if (!made.length) return { ok: false, why: "no_rows", msg: "한 줄도 안 잡혔습니다 — 접근 규칙이 막았거나 그 줄이 없습니다" };
    return { ok: true, made };
  });
}

/** 예약을 내린다 — ⚠️ 지우지 않고 **상태로** 내린다 (대전제 6) */
export async function cancelSchedule(id) {
  if (!UUID.test(String(id ?? ""))) return { ok: false, msg: "어느 예약인지 모릅니다" };
  return run(async (db) => {
    const r = await db.query(Q_CANCEL, [id]);
    if (!r.rows?.length) return { ok: false, why: "no_rows", msg: "안 내려졌습니다 — 이미 나갔거나 이미 내린 예약입니다" };
    return { ok: true, id: r.rows[0].id };
  });
}

/**
 * 나갈 글을 고쳐 저장한다.
 * ⚠️ **「원래대로 되돌리기」(`resetText`)를 반드시 같이 둔다** — 안 두면 고친 글이 그대로 굳어
 *    나중에 점수를 고쳐도 **옛 글이 나간다.**
 * ⚠️⚠️ **원장님만 볼 메모 칸은 이 화면이 안 건드린다.** 그 칸 이름은 `lib/close.js` 밖 어디에도
 *    못 나오고 `scripts/check-close.mjs` 가 `app/`·`lib/` 전수로 막는다 (사고 #7).
 */
export async function saveText({ sheetId, text }) {
  if (!UUID.test(String(sheetId ?? ""))) return { ok: false, msg: "판이 없습니다 — 먼저 출결을 찍어야 판이 섭니다" };
  return run(async (db) => {
    const r = await db.query(Q_TEXT, [sheetId, String(text ?? "")]);
    if (!r.rows?.length) {
      return { ok: false, why: "no_rows", msg: "안 바뀌었습니다 — 이미 나간 글이거나 접근 규칙이 막았습니다" };
    }
    return { ok: true, comment: r.rows[0].comment ?? "" };
  });
}

/**
 * ⭐ **원래대로 되돌리기.** 원장님이 고친 글을 비워 **그 판의 값 그대로** 나가게 한다.
 *
 * ⚠️ 고친 글이 **없어지는 것이 아니다** — `v2.day_sheet` 에는 자취 방아쇠가 걸려 있어
 *    바뀌기 전 값이 `v2.audit` 에 남는다 (대전제 6 — 지우지 않는다).
 */
export async function resetText({ sheetId }) {
  if (!UUID.test(String(sheetId ?? ""))) return { ok: false, msg: "판이 없습니다" };
  return run(async (db) => {
    const r = await db.query(Q_TEXT, [sheetId, null]);
    if (!r.rows?.length) {
      return { ok: false, why: "no_rows", msg: "안 되돌려졌습니다 — 이미 나간 글이거나 접근 규칙이 막았습니다" };
    }
    return { ok: true, comment: "" };
  });
}
