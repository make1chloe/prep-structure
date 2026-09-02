/**
 * **등원 문** — 아이가 「핸드폰 냈어요」를 누르면 여기로 온다.
 *
 * ⚠️ **여기에 판단을 적지 마라.** 「학원에서 눌렀나 · 지각인가 · 몇 분인가 · 어느 반인가」는
 *    전부 `lib/arrival.js` 가, 「그날 판을 어떻게 세우나」는 `lib/attend.js` 가 판단한다.
 *    이 파일은 **문을 열고 받아 적기만** 한다.
 *
 * ⚠️ **서비스 열쇠(`SUPABASE_SERVICE_ROLE_KEY`)를 한 글자도 안 쓴다.**
 *    로그인한 그 사람으로 갈아타 접근 규칙을 그대로 걸고 쓴다 (`app/today/db.js` 의 `openAs`).
 *
 * ⚠️⚠️ **관문(학원 IP 대역)만은 그 사람 자격으로 못 읽는다.**
 *    대역은 `v2.integration('arrival')` 에 있고 그 표는 **원장·강사만** 본다 —
 *    평문 열쇠(솔라피·나이스·앤트로픽·VAPID)가 같이 들어 있어 **아이에게 열어서는 안 된다.**
 *    그래서 `openGate()` 로 **그 한 줄만** 읽고 곧바로 닫는다. 그 문으로는 아무것도 더 안 읽는다.
 *
 * ── 쓰는 법 ────────────────────────────────────────────────────
 *   GET  /api/arrival                    → 오늘 내 등원 판 (화면이 그대로 그린다)
 *   GET  /api/arrival?student=<uuid>     → 원장·강사가 남의 아이 것을 본다
 *   POST /api/arrival { step: 1 }        → 아이가 한 걸음 찍는다 (1·2·3 또는 phone/attend/homework)
 *   POST /api/arrival { act:"mark", student:"<uuid>", step:1, date:"YYYY-MM-DD" }
 *                                        → **원장님이 손으로** 대신 찍는다 (폰 없음·와이파이 안 됨)
 *   POST /api/arrival { act:"allow", note:"학원 와이파이" }
 *                                        → **원장님이 학원에서 한 번 눌러** 지금 IP 를 등록한다
 *
 * ⚠️ 답의 `ok` 는 **그날 판까지 실제로 섰을 때만** 참이다. 찍기만 남고 판이 안 서면
 *    `ok:false` 로 온다 — 「등원 했어요」라고 그려 놓고 원장님 화면에 안 뜨는 것이 가장 나쁘다.
 */
import { cookies, headers } from "next/headers";
import { Client } from "pg";
import { serverClientFromStore, roleOf } from "../../../lib/supabase-server.js";
import { openAs } from "../../today/db.js";
import {
  STEPS, pickIp, netGate, readNet, allowThisIp, whoAmI, arrivalView, markArrival,
} from "../../../lib/arrival.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAFF = new Set(["principal", "instructor"]);
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * **관문 문 하나.** `v2.integration('arrival')` 한 줄만 읽고 닫는다.
 *
 * ⚠️ 여기서는 접근 규칙 밖(postgres)이다. 그래서 **읽는 것을 딱 하나로 못 박았다** —
 *    `readNet` 이 도는 동안 다른 SQL 이 지나가면 `n` 이 늘어 그 자리에서 던진다.
 *    (`scripts/check-arrival.mjs` 가 이 파일 글자에서 그 자물쇠를 확인한다)
 */
async function openGate() {
  const url = process.env.DATABASE_URL;
  if (!url) return { ok: false, why: "⚠️ `DATABASE_URL` 이 없어 학원 회선 설정을 못 읽습니다" };
  const client = new Client({
    connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000,
  });
  try { await client.connect(); }
  catch (e) { return { ok: false, why: `⚠️ DB 에 못 붙었습니다 — ${String(e?.message ?? e).slice(0, 140)}` }; }
  let n = 0;
  try {
    const net = await readNet({
      query(sql, params) {
        if (++n > 1) throw new Error("이 문으로는 학원 회선 설정 한 줄 말고 아무것도 안 읽는다");
        return client.query(sql, params);
      },
    });
    return { ok: true, net };
  } catch (e) {
    return { ok: false, why: `⚠️ 학원 회선 설정을 못 읽었습니다 — ${String(e?.message ?? e).slice(0, 140)}` };
  } finally {
    await client.end().catch(() => {});
  }
}

/** 누구인가. ⚠️ 문지기(`middleware.js`)는 역할로 화면을 안 지킨다 — 이 문이 스스로 본다 */
async function whoIsIt() {
  let who;
  try { who = await roleOf(serverClientFromStore(await cookies())); }
  catch (e) { return { ok: false, why: "read-failed", msg: `로그인을 못 읽었습니다 — ${String(e?.message ?? e).slice(0, 160)}` }; }
  if (!who.user) return { ok: false, why: "no-user", msg: "로그인하지 않았습니다." };
  if (who.role == null) return { ok: false, why: who.why, msg: who.msg || "역할을 못 읽었습니다." };
  return { ok: true, profileId: who.user.id, role: who.role, isStaff: STAFF.has(who.role) };
}

export async function GET(req) {
  const me = await whoIsIt();
  if (!me.ok) return json({ ok: false, why: me.why, msg: me.msg }, 403);

  const gateDoor = await openGate();
  const net = gateDoor.ok ? gateDoor.net : { has: false, ips: [], graceMin: 0 };
  const ip = pickIp(await headers());
  const gate = netGate({ ip, net, isStaff: me.isStaff });

  const door = await openAs(me.profileId);
  if (!door.ok) return json({ ok: false, why: "no-db", msg: door.why }, 500);
  try {
    const asked = new URL(req.url).searchParams.get("student");
    let studentId = null;
    if (asked && me.isStaff) {
      if (!UUID.test(asked)) return json({ ok: false, why: "bad-student", msg: "학생 아이디 모양이 아닙니다" }, 400);
      studentId = asked;
    } else {
      const who = await whoAmI(door.db);
      studentId = who.studentId;
      if (!studentId) {
        return json({ ok: false, why: "not-student",
          msg: me.isStaff ? "원장·강사는 `?student=<아이디>` 로 아이를 골라 보세요"
                          : "이 계정에 이어진 아이가 없습니다 — 학생 계정으로 로그인해 주세요",
          gate, steps: STEPS }, 400);
      }
    }
    // ⚠️ 아이가 반을 골라 두었으면 그 반으로 그린다 (원장님 2026-09-03 — 앱이 짐작 안 한다)
    const view = await arrivalView(door.db, {
      studentId, graceMin: net.graceMin,
      classId: new URL(req.url).searchParams.get("class") || null });
    return json({
      ok: true, gate, view,
      netReady: gateDoor.ok ? undefined : gateDoor.why,
      // ⚠️ 화면이 셈을 다시 하지 않게 **그릴 값을 그대로** 준다
      can: { tap: gate.ok && !!view.next, register: me.isStaff },
    });
  } finally { await door.end(); }
}

export async function POST(req) {
  const me = await whoIsIt();
  if (!me.ok) return json({ ok: false, why: me.why, msg: me.msg }, 403);

  let body = null;
  try { body = await req.json(); } catch { body = null; }
  const act = String(body?.act ?? "tap");
  const ip = pickIp(await headers());

  // ── 원장님이 학원에서 한 번 눌러 지금 IP 를 등록한다 ────────────────────────
  if (act === "allow") {
    if (!me.isStaff) return json({ ok: false, why: "not-staff", msg: "학원 주소 등록은 원장·강사만 합니다" }, 403);
    const door = await openAs(me.profileId);
    if (!door.ok) return json({ ok: false, why: "no-db", msg: door.why }, 500);
    try {
      const r = await allowThisIp(door.db, { ip, note: body?.note ?? null, graceMin: body?.graceMin ?? null });
      return json({ ...r, seenIp: ip }, r.ok ? 200 : 400);
    } finally { await door.end(); }
  }

  // ── 찍는다 ────────────────────────────────────────────────────────────────
  const gateDoor = await openGate();
  if (!gateDoor.ok) return json({ ok: false, why: "no-net", msg: gateDoor.why }, 500);
  const gate = netGate({ ip, net: gateDoor.net, isStaff: me.isStaff });

  const door = await openAs(me.profileId);
  if (!door.ok) return json({ ok: false, why: "no-db", msg: door.why }, 500);
  try {
    let studentId = null, by = "student", date = null;
    if (act === "mark") {
      // 원장님이 **손으로** 대신 찍는다 — 아이가 못 찍은 날이 있다
      if (!me.isStaff) return json({ ok: false, why: "not-staff", msg: "대신 찍기는 원장·강사만 합니다" }, 403);
      const s = String(body?.student ?? "");
      if (!UUID.test(s)) return json({ ok: false, why: "bad-student", msg: "학생 아이디 모양이 아닙니다" }, 400);
      studentId = s; by = "staff";
      const d = body?.date ?? null;
      if (d != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) {
        return json({ ok: false, why: "bad-date", msg: "날짜는 'YYYY-MM-DD' 글자여야 합니다" }, 400);
      }
      date = d ?? null;
    } else {
      // ⚠️ **제 아이만.** 학부모의 아이는 안 든다 — 학부모가 집에서 찍으면 조건이 뜻을 잃는다
      const who = await whoAmI(door.db);
      studentId = who.studentId;
      if (!studentId) {
        return json({ ok: false, why: "not-student", gate,
          msg: "학생 계정으로 로그인해 주세요 — 등원은 아이가 제 손으로 찍습니다" }, 403);
      }
    }

    let r;
    try {
      r = await markArrival(door.db, {
        gate, studentId, step: body?.step, ip, date, by, graceMin: gateDoor.net.graceMin,
        // ⚠️ 반이 둘인 날 아이가 고른 반. **안 보내면 판을 안 세우고 되묻는다**(why: pick-class)
        classId: body?.classId ?? null,
      });
    } catch (e) {
      return json({ ok: false, why: "bad", msg: String(e?.message ?? e).slice(0, 200), gate }, 400);
    }
    return json({ ...r, gate }, r.ok ? 200 : 400);
  } finally { await door.end(); }
}
