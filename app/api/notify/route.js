/**
 * **보내기 문** — 늦귀가 안내 · 데일리리포트를 실제로 쏘는 자리.
 *
 * ⚠️ **여기에 판단을 적지 마라.** 「보내도 되나 · 정말 나갔나 · 도장을 찍어도 되나」는
 *    `lib/push.js` 가, 「지금 정말 내보내도 되나 · 잠금화면에 무엇이 뜨나」는
 *    `lib/notify.js` 가 판단한다. 이 파일은 **문을 열고 받아 적기만** 한다.
 *
 * ⚠️ **서비스 열쇠를 안 쓴다.** 로그인한 원장님으로 갈아타 접근 규칙을 그대로 걸고 쓴다
 *    (`app/today/db.js` 의 `openAs` — 실측으로 `notify_log` 넣기 · `push_sub` 끄기 ·
 *    `late_stay.sent_at` 찍기가 그 자격으로 다 된다. `scripts/check-push.mjs` 가 진짜 DB로 본다).
 *
 * ⚠️ **문지기(`middleware.js`)는 역할로 화면을 지키지 않는다** — 실측으로 학생 세션의
 *    `GET /parent` 가 200 이었다. 그래서 이 문은 **스스로** 원장·강사인지 본다.
 *
 * ── 쓰는 법 ────────────────────────────────────────────────────
 *   POST /api/notify   { "what": "late",  "id": "<late_stay.id>",  "again": false }
 *   POST /api/notify   { "what": "daily", "id": "<day_sheet.id>",  "again": false }
 *   GET  /api/notify   → 열쇠가 있나만 본다 (설정 화면이 「열쇠 없음」을 띄울 자리)
 *
 * ⚠️ 답의 `ok` 는 **한 대라도 진짜 폰에 나갔을 때만** 참이다.
 *    발송이 꺼져 있으면(기본값) `ok:false · why:"sink_off"` 로 온다 — **그게 정상이다.**
 *    자취에는 남고 폰에는 안 간 것을 「보냈습니다」로 그리면 안 된다.
 */
import { sendLate, sendDaily, pushReady } from "@/lib/push";
import { staffOnly } from "../../today/who.js";
import { openAs } from "../../today/db.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** 무엇을 보내나 — **이 표에 없는 것은 안 보낸다** */
const WHAT = new Map([
  ["late", { run: sendLate, key: "lateId", what: "늦귀가 안내" }],
  ["daily", { run: sendDaily, key: "sheetId", what: "데일리리포트" }],
]);

export async function GET() {
  const me = await staffOnly();
  if (!me.ok) return json({ ok: false, why: me.why, msg: me.msg, how: me.how ?? [] }, 403);
  const ready = pushReady();
  return json({ ok: true, ready });
}

export async function POST(req) {
  // ① 누구인가 — 원장·강사만
  const me = await staffOnly();
  if (!me.ok) return json({ ok: false, why: me.why, msg: me.msg, how: me.how ?? [] }, 403);

  // ② 무엇을 보내나
  let body = null;
  try { body = await req.json(); }
  catch { return json({ ok: false, why: "bad_body", msg: "보낼 것을 못 읽었습니다" }, 400); }

  const pick = WHAT.get(String(body?.what ?? ""));
  if (!pick)
    return json({ ok: false, why: "bad_what",
      msg: "무엇을 보낼지 모르겠습니다 — `what` 은 " + [...WHAT.keys()].join(" · ") + " 중 하나입니다" }, 400);

  const id = String(body?.id ?? "");
  if (!UUID.test(id))
    return json({ ok: false, why: "bad_id", msg: "보낼 줄의 아이디를 못 읽었습니다" }, 400);

  // ③ 문을 연다 — **로그인한 그 사람으로** (접근 규칙 그대로)
  const door = await openAs(me.profileId);
  if (!door.ok) return json({ ok: false, why: "no_db", msg: door.why }, 500);

  try {
    const r = await pick.run(door.db, { [pick.key]: id, again: body?.again === true });
    // ⚠️ 열쇠가 없어 한 대도 못 간 것인지 화면이 알아야 한다 — 까닭을 같이 싣는다
    const ready = pushReady();
    return json({ ...r, what: pick.what, ready });
  } catch (e) {
    return json({ ok: false, why: "threw",
      msg: "보내다 터졌습니다 — " + String(e?.message ?? e).slice(0, 200) }, 500);
  } finally {
    await door.end();
  }
}
