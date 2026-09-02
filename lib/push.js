/**
 * 발송 손 — **실제로 폰에 쏘는 자리.** `web-push` 를 부르는 곳은 여기 하나뿐이다.
 *
 * `lib/notify.js` 가 「지금 정말 내보내도 되나」를 판단하고 `opts.push` 로 **손을 받는다.**
 * 그 손이 여기다. **빈 손을 넘기면 자취에는 「보냄」이 남고 폰에는 아무것도 안 간다.**
 *
 * ⚠️ **여기서 다시 판단하지 않는다.** 잠금화면 글 갈아치우기 · 발송 스위치 · 꼬리표(tag) ·
 *    누구에게 갈지는 **전부 `lib/notify.js` 가 이미 했다.** 이 파일은 **받은 글을 그대로 쏜다.**
 *    여기서 또 갈아 끼우면 같은 판단이 두 벌이 되고, 두 벌이 어긋나는 날
 *    **잠금화면에 내용이 실린다** (서비스워커 계약서 ⑤ · 원칙 1).
 *
 * ⚠️ **옛 앱의 주소와 VAPID 열쇠를 그대로 물려받는다.** 그래서 미리보기 배포에서 누른 발송도
 *    **학부모 폰에 진짜 알림으로 뜬다.** 막는 것은 `lib/notify.js` 의 발송 스위치 하나뿐이고,
 *    그 기본값은 「아무것도 안 나감」이다 — **기본 상태에서 한 발도 안 나가는 것이 정상이다.**
 *
 * ── 이 파일이 지키는 것 ─────────────────────────────────────────
 *  ① 열쇠가 없으면 **쏘는 척을 하지 않는다.** 부르는 그 자리에서 던지고,
 *     `lib/notify.js` 가 그 까닭을 `notify_log.fail_why` 에 적는다.
 *     「없으니 그냥 통과」는 자취를 거짓말로 만든다.
 *  ② 구독이 죽었으면(410·404) **`push_sub.revoked_at` 을 찍는다.**
 *     안 찍으면 죽은 기기에 영원히 쏘고 실패 자취만 쌓인다.
 *     ⚠️ 500·429 같은 **잠깐 탈에는 절대 안 끈다** — 끄면 멀쩡한 학부모 폰이 영영 죽는다.
 *  ③ 「보냄」 도장(`late_stay.sent_at` · `day_sheet.sent_at`)은
 *     **정말 한 대라도 나갔을 때만** 찍는다.
 *
 * DB 는 `{ query(sql, params) -> { rows } }` 만 받는 얕은 어댑터다 (검사가 가짜를 끼운다).
 */
import webpush from "web-push";
import { notify } from "./notify.js";

/**
 * 알림이 살아 있는 시간 (초).
 * ⚠️ **옛 앱이 얼마를 썼는지는 확인 안 됨** — 옛 소스가 이 컴퓨터에 없다.
 *    6시간으로 둔다: 늦귀가·데일리리포트는 **그날 저녁 얘기**라, 폰이 꺼져 있다가
 *    다음 날 낮에 배달되면 뜻이 없고 오히려 헷갈린다. (web-push 기본값은 4주다)
 */
export const TTL_SEC = 6 * 3600;

const str = (v) => String(v ?? "").trim();

/**
 * VAPID 열쇠를 읽는다.
 *
 * ⚠️ **옛 앱 것을 그대로 물려받아야 한다** — 주소와 열쇠가 둘 다 같아야 폰에 박힌 구독이 산다.
 *    새로 만들면(`web-push generate-vapid-keys`) 전 학부모의 구독이 **그날로 죽는다.**
 * ⚠️ **옛 앱이 어떤 이름으로 넣어 뒀는지는 확인 안 됨** — 그래서 공개키는 두 이름을 다 받는다.
 *    (구독하는 쪽 화면은 `NEXT_PUBLIC_…` 이 있어야 브라우저에서 읽는다)
 * · `VAPID_SUBJECT` 는 푸시 서버가 문제 생겼을 때 연락할 자리다. 배달에는 영향이 없지만
 *   **없으면 web-push 가 던진다.** 없을 때는 지어내지 않고 배포 주소(`VERCEL_URL`)를 쓴다.
 */
export function vapidFrom(env = process.env) {
  const host = str(env.VERCEL_URL);
  return {
    subject: str(env.VAPID_SUBJECT) || (host ? "https://" + host : ""),
    publicKey: str(env.VAPID_PUBLIC_KEY) || str(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    privateKey: str(env.VAPID_PRIVATE_KEY),
  };
}

/**
 * 열쇠가 **쓸 수 있는 모양인가.**
 *
 * ⚠️ 모양 판단은 **web-push 에게 직접 물어본다.** 여기서 길이·글자를 다시 세면
 *    같은 판단이 두 벌이 되고, 한쪽만 고쳐지는 날 조용히 갈린다 (원칙 1).
 *    `getVapidHeaders` 는 서명만 만들 뿐 **아무 데도 안 보낸다.**
 *
 * @returns { ok, why, msg } — 화면은 `why` 로 갈래를 잡고 `msg` 를 그대로 띄운다
 */
export function pushReady(env = process.env) {
  const v = vapidFrom(env);
  const miss = [];
  if (!v.publicKey) miss.push("VAPID_PUBLIC_KEY");
  if (!v.privateKey) miss.push("VAPID_PRIVATE_KEY");
  if (!v.subject) miss.push("VAPID_SUBJECT");
  if (miss.length)
    return { ok: false, why: "no_key",
      msg: "⚠️ 웹푸시 열쇠가 없어 **한 대도 못 쏩니다** — " + miss.join(" · ") +
           " 를 넣어야 합니다. ⚠️ 새로 만들지 말고 **옛 앱과 같은 열쇠**를 넣어야 " +
           "폰에 박힌 구독이 삽니다" };
  try {
    // 아무 데도 안 보낸다 — 서명이 만들어지나만 web-push 에게 물어본다
    webpush.getVapidHeaders("https://example.com", v.subject, v.publicKey, v.privateKey, "aes128gcm");
  } catch (e) {
    return { ok: false, why: "bad_key",
      msg: "⚠️ 웹푸시 열쇠 모양이 틀렸습니다 — " + String(e?.message ?? e).slice(0, 140) };
  }
  return { ok: true, why: "ok", msg: "" };
}

/**
 * 구독이 **죽었나.**
 * ⚠️ 410(Gone)·404 뿐이다. 500·429·408 은 **잠깐 탈**이라 여기서 참을 주면
 *    푸시 서버가 한 번 흔들린 날 멀쩡한 학부모 폰이 통째로 꺼진다.
 */
export function isGone(err) {
  const s = Number(err?.statusCode);
  return s === 410 || s === 404;
}

const SQL_REVOKE = `update v2.push_sub set revoked_at = now()
   where endpoint = $1 and revoked_at is null returning id`;

/**
 * `lib/notify.js` 에 넘길 **손**.
 *
 * @param db    `{ query(sql, params) }` — 죽은 구독을 끄는 데만 쓴다
 * @param opts  { env, send, ttl } — `send` 는 검사가 갈아 끼운다 (기본값이 진짜 web-push)
 * @returns `(sub, payload) => Promise<void>` — `sub` 는 `v2.push_sub` 한 줄,
 *          `payload` 는 `notify` 가 이미 만든 **글자 그대로**다
 */
export function makePush(db, opts = {}) {
  const env = opts.env ?? process.env;
  const send = opts.send ?? ((sub, payload, o) => webpush.sendNotification(sub, payload, o));
  const ttl = opts.ttl ?? TTL_SEC;
  let ready = null;                         // 한 번만 본다 (한 통에 기기가 여럿이다)

  return async function push(sub, payload) {
    // ⚠️ ① 열쇠가 없으면 **여기서 던진다.** 「없으니 그냥 통과」하면
    //    자취에는 「보냄」이 남고 폰에는 아무것도 안 간다 — 그게 제일 나쁘다
    if (ready === null) ready = pushReady(env);
    if (!ready.ok) throw new Error(ready.msg);

    try {
      await send(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,                            // ⚠️ **받은 글을 그대로.** 여기서 안 만진다
        { vapidDetails: vapidFrom(env), TTL: ttl }
      );
    } catch (e) {
      // ⚠️ ② 죽은 구독은 끈다. 안 끄면 죽은 기기에 **영원히** 쏘고 실패 자취만 쌓인다
      if (isGone(e)) {
        let note = "";
        try { await db.query(SQL_REVOKE, [sub.endpoint]); }
        catch (e2) { note = " (구독을 못 껐다: " + String(e2?.message ?? e2).slice(0, 80) + ")"; }
        throw new Error(e.statusCode + " — 구독이 죽어 이 기기를 껐습니다" + note);
      }
      throw e;                              // 잠깐 탈은 **그대로 올린다.** 구독은 안 끈다
    }
  };
}

// ─────────────────────────────────────────────────────────────
// 보내는 문 — 늦귀가 · 데일리리포트
// ⚠️ 여기 있는 것은 **「보내도 되나 · 정말 나갔나 · 도장을 찍어도 되나」**뿐이다.
//    누구에게 · 무엇을 지우고 나가나는 `lib/notify.js` 가 판단한다.
// ─────────────────────────────────────────────────────────────

const SQL_LATE = `select l.id, l.sheet_id, l.reason, l.until_at, l.sent_at,
         s.student_id, s.date, st.name as student_name
    from v2.late_stay l
    join v2.day_sheet s on s.id = l.sheet_id
    join v2.students st on st.id = s.student_id
   where l.id = $1`;

const SQL_SHEET = `select s.id, s.student_id, s.date, s.closed_at, s.sent_at, s.comment,
         st.name as student_name
    from v2.day_sheet s
    join v2.students st on st.id = s.student_id
   where s.id = $1`;

const SQL_PARENTS = `select ps.parent_profile_id as profile_id
    from v2.parent_student ps where ps.student_id = $1`;

// 「보낼 데가 있나」 — 없으면 **자취만 남고 아무도 모른다.** 그 사실을 돌려준다
const SQL_DEVICES = `select count(*)::int as n from v2.push_sub
   where profile_id = any($1::uuid[]) and revoked_at is null`;

// ⚠️ 도장은 **정말 나갔을 때만** 찍는다 (아래 `outcome`)
const SQL_LATE_SENT = `update v2.late_stay set sent_at = now() where id = $1
   returning id, sent_at`;
const SQL_SHEET_SENT = `update v2.day_sheet set sent_at = now() where id = $1
   returning id, sent_at`;

/** `21:00:00` → `21:00`. 값이 없으면 빈 글자 */
export function hhmm(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(str(t));
  return m ? m[1].padStart(2, "0") + ":" + m[2] : "";
}

/**
 * 늦귀가 한 줄 글.
 * ⚠️ **학부모 폰에는 이 글이 안 뜬다** — `lib/notify.js` 가 잠금화면 글로 갈아 끼운다.
 *    그래도 그대로 넘긴다: 갈아 끼우는 판단은 거기 한 곳에 있어야 한다(원칙 1).
 */
export function lateBody(row) {
  const when = hhmm(row?.until_at);
  return ["오늘 남아서 하고 갑니다.",
          str(row?.reason) ? "사유: " + str(row.reason) : "",
          when ? "예상 귀가 " + when : ""].filter(Boolean).join(" · ");
}

/**
 * **정말 밖으로 나갔나.** 「보냄」 도장을 찍어도 되는지 가르는 유일한 자리.
 *
 * ⚠️ `ok` 는 **한 대라도 진짜 나갔을 때만** 참이다.
 *    자취에 줄이 남았다고 참을 주면, 발송이 꺼져 있던 날에도 화면이 「보냈습니다」라 말하고
 *    **마감은 더 이상 묻지 않는데 학부모는 모른 채 기다린다.** 그게 이 파일이 막는 사고다.
 */
export function outcome(r) {
  if (r.hole)
    return { ok: false, why: "hole",
      msg: "⚠️ 안 채운 자리 " + r.hole + " 가 남아 있어 **보내지 않았습니다**" };
  if (!r.parents)
    return { ok: false, why: "no_parent",
      msg: "⚠️ 이 아이에게 연결된 학부모 계정이 없습니다 — 보낼 곳이 없습니다" };
  if (r.sent > 0)
    return { ok: true, why: "sent", msg: r.sent + "대에 보냈습니다" };

  const blocked = r.log.length > 0 && r.log.every((x) => x.blocked);
  if (blocked)
    return r.sink === "off"
      ? { ok: false, why: "sink_off",
          msg: "지금은 발송이 꺼져 있습니다(기본값) — **자취에만 남았습니다.** 폰으로는 안 갔습니다" }
      : { ok: false, why: "blocked_self",
          msg: "지금은 원장 기기에만 나갑니다 — **학부모 폰으로는 안 갔습니다**" };
  if (!r.devices)
    return { ok: false, why: "no_device",
      msg: "⚠️ 학부모 폰에 **알림을 받는 기기가 없습니다** — 앱을 깔고 알림을 켜야 닿습니다. " +
           "지금은 전화로 알려야 합니다" };
  return { ok: false, why: "all_failed",
    msg: "⚠️ 보내려 했지만 **한 대도 못 갔습니다** — 발송 자취의 까닭을 보세요" };
}

/** 학부모에게 한 통 — 자취를 남기고 결과를 돌려준다 */
async function deliver(db, { kind, title, body, tag, url, studentId, env, push }) {
  const ids = (await db.query(SQL_PARENTS, [studentId])).rows.map((x) => x.profile_id);
  const devices = ids.length ? (await db.query(SQL_DEVICES, [ids])).rows[0].n : 0;
  const targets = ids.map((id) => ({ profileId: id, studentId, role: "parent" }));
  const r = await notify(db, { kind, title, body, tag, url, targets }, { env, push });
  return { ...r, devices, parents: ids.length };
}

/**
 * 늦귀가 보내기 — **누르는 것이다. 저절로 안 나간다** (계획 ⑭).
 *
 * ⚠️ 보낸 뒤 `late_stay.sent_at` 을 찍는다. **정말 나갔을 때만** 찍는다 —
 *    안 찍으면 마감이 계속 묻고(그게 맞다), 거짓으로 찍으면 마감이 안 묻는다.
 *
 * @param opts { lateId, env, push, again, title, body }
 *             `title`·`body` 는 문구를 밖에서 넣을 자리다 (안 주면 아래 기본값)
 * @returns { ok, why, msg, sink, sent, devices, stamped, lateId }
 */
export async function sendLate(db, opts = {}) {
  const lateId = opts.lateId;
  const env = opts.env ?? process.env;
  const row = (await db.query(SQL_LATE, [lateId])).rows[0];
  if (!row) return { ok: false, why: "no_row", msg: "그 늦귀가 줄이 없습니다", stamped: false };
  if (row.sent_at && !opts.again)
    return { ok: false, why: "already_sent", sentAt: row.sent_at, stamped: false,
      msg: "이미 보냈습니다 — 다시 보내려면 「다시 보내기」로 눌러야 합니다" };

  const r = await deliver(db, {
    kind: "late",
    // ⚠️ 제목은 **잠금화면에 그대로 뜬다.** 성적·태도 같은 내용을 넣지 마라 (계약서 ⑤)
    title: opts.title ?? row.student_name + " 늦귀가 안내",
    body: opts.body ?? lateBody(row),
    tag: "send-late",              // ⚠️ 옛 SW 가 쓰던 꼬리표. 아이별로는 notify 가 붙인다
    url: "/parent",
    studentId: row.student_id,
    env,
    push: opts.push ?? makePush(db, { env }),
  });

  const out = outcome(r);
  let stamped = false;
  if (out.ok) { await db.query(SQL_LATE_SENT, [lateId]); stamped = true; }
  return { ...out, sink: r.sink, sent: r.sent, devices: r.devices, stamped, lateId };
}

/**
 * 데일리리포트 보내기.
 *
 * ⚠️ **마감 안 한 판은 못 보낸다.** 접근 규칙(`v2.sheet_visible`)이 `closed_at` 을 요구해서,
 *    보내 봐야 학부모가 눌렀을 때 「아직 정리 중이에요」만 본다.
 *    알림은 왔는데 내용이 없으면 학부모는 앱이 고장 난 줄 안다.
 */
export async function sendDaily(db, opts = {}) {
  const sheetId = opts.sheetId;
  const env = opts.env ?? process.env;
  const row = (await db.query(SQL_SHEET, [sheetId])).rows[0];
  if (!row) return { ok: false, why: "no_row", msg: "그 판이 없습니다", stamped: false };
  if (!row.closed_at)
    return { ok: false, why: "not_closed", stamped: false,
      msg: "⚠️ 아직 **마감 안 한 판**입니다 — 마감해야 학부모 화면에 보입니다. " +
           "지금 보내면 눌러도 「아직 정리 중이에요」만 보입니다" };
  if (row.sent_at && !opts.again)
    return { ok: false, why: "already_sent", sentAt: row.sent_at, stamped: false,
      msg: "이미 보냈습니다 — 다시 보내려면 「다시 보내기」로 눌러야 합니다" };

  const r = await deliver(db, {
    kind: "daily",
    title: opts.title ?? row.student_name + " 데일리리포트",
    body: opts.body ?? str(row.comment),
    tag: "send-daily",
    url: "/parent",
    studentId: row.student_id,
    env,
    push: opts.push ?? makePush(db, { env }),
  });

  const out = outcome(r);
  let stamped = false;
  if (out.ok) { await db.query(SQL_SHEET_SENT, [sheetId]); stamped = true; }
  return { ...out, sink: r.sink, sent: r.sent, devices: r.devices, stamped, sheetId };
}
