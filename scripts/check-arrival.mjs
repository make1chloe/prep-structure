/**
 * 등원 찍기 검사 — **아이가 찍은 시각 하나로 지각까지 세어 나오는가.**
 *
 *  핵심 셋 (이것이 깨지면 기능이 뜻을 잃는다)
 *   ① 아이는 **시각만** 찍는다. 출결 갈래(present/late)는 **앱이 센다** — 아이가 못 고른다
 *   ② **찍으면 그날 판이 선다** — `lib/attend.js` 의 `attendanceWrite({via:"arrival"})` 한 벌을 지난다
 *   ③ **학원 회선에서만** 찍힌다. ⚠️ **등록이 없으면 「그냥 통과」가 아니다**
 *
 *  ⚠️ 가짜 DB 만 상대하면 **죽은 칸과 접근 규칙을 원리적으로 못 잡는다.**
 *     그래서 아래에서 **진짜 DB 로도 한 번** 돌린다 — 트랜잭션 안에서 쓰고 `rollback`.
 *  ⚠️⚠️ 진짜 학생은 **한 명도 안 건드린다.** `import_batch='fixture'`(zz_시험_) 로만 쓴다.
 *     검사가 장원우의 오늘 판에 숙제 52줄을 굳힌 적이 있다. `scripts/check-residue.mjs` 가 센다.
 */
import {
  STEPS, stepOf, pickIp, expandIp6, sameNet, netGate, lateOf,
  readNet, allowThisIp, whoAmI, classOfDay, arrivalView, markArrival,
} from "../lib/arrival.js";
import { WRITE_PATHS } from "../lib/attend.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let fail = 0, n = 0;
const ok = (t, c, why = "") => {
  n++;
  if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
  else console.log(`   ✅ ${t}`);
};
const throws = async (t, fn, part = "") => {
  let msg = null;
  try { await fn(); } catch (e) { msg = String(e?.message ?? e); }
  ok(t, msg !== null && msg.includes(part), msg === null ? "안 던졌다" : `말이 다르다: ${msg}`);
};

// ── 리허설 자리 (실측 2026-09-02 — 진짜 학생이 아니다) ──────────────────────
const FX = {
  student: "00000000-0000-4000-9000-000000000001",   // zz_시험_학생
  other:   "00000000-0000-4000-9000-000000000002",   // zz_시험_남의아이
  sProf:   "00000000-0000-4000-8000-000000000003",   // zz_시험_학생 프로필
  pProf:   "00000000-0000-4000-8000-000000000001",   // zz_시험_원장
  klass:   "00000000-0000-4000-a000-000000000001",   // 월·수 17:00
};

// ═════════════════════════════════════════════════════════════════════════════
console.log("■ 세 걸음 — 지어낸 것이 아니다 (옛 public.arrival_checks 칸에서 그대로 읽었다)");
ok("걸음은 셋이다", STEPS.length === 3, String(STEPS.length));
ok("차례가 ① 핸드폰 ② 출석체크 ③ 숙제다 (옛 0039 주석 그대로)",
   STEPS.map((s) => s.key).join(",") === "phone,attend,homework", STEPS.map((s) => s.key).join(","));
ok("번호로도 이름으로도 같은 걸음을 가리킨다", stepOf(1).key === "phone" && stepOf("phone").step === 1);
ok("글자로 온 번호도 받는다", stepOf("2").key === "attend");
await throws("네 번째 걸음은 없다 — 던진다", () => stepOf(4), "세 걸음뿐");
await throws("모르는 이름은 던진다", () => stepOf("leave"), "모르는 걸음");

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n■ ⚠️ 「몇 분 늦었다」를 **고르는 자리가 없다** — 찍은 시각에서 세어 나온다 (원칙 5)");
{
  const a = lateOf({ startTime: "17:00", atHm: "16:58" });
  ok("수업 전에 찍으면 정시다", a.attend === "present" && a.minutes === 0, JSON.stringify(a));
  const b = lateOf({ startTime: "17:00", atHm: "17:20" });
  ok("20분 뒤에 찍으면 지각 20분이다", b.attend === "late" && b.minutes === 20, JSON.stringify(b));
  ok("그 값은 **앱이 정한 것**이고 원장님이 고른 것이 아니다", b.sure === true);
  const c = lateOf({ startTime: "17:00", atHm: "17:00" });
  ok("딱 맞춰 오면 정시다", c.attend === "present" && c.minutes === 0, JSON.stringify(c));
  const g = lateOf({ startTime: "17:00", atHm: "17:05", graceMin: 10 });
  ok("유예 10분이면 5분 늦어도 정시다", g.attend === "present" && g.minutes === 5, JSON.stringify(g));
  const g2 = lateOf({ startTime: "17:00", atHm: "17:11", graceMin: 10 });
  ok("유예를 넘기면 지각 11분이다", g2.attend === "late" && g2.minutes === 11, JSON.stringify(g2));
  ok("⚠️ 유예 기본값은 0이다 — 원장님이 정하신 값이 아니라 지어내지 않았다",
     lateOf({ startTime: "17:00", atHm: "17:01" }).attend === "late");
}
{
  const u = lateOf({ startTime: null, atHm: "17:20" });
  ok("⚠️ 반 시각을 모르면 **정시라고 우기지 않는다** (sure:false)", u.sure === false, JSON.stringify(u));
  ok("그 까닭을 「확인 안 됨」으로 그대로 적는다", /확인 안 됨/.test(u.why), u.why);
  const t = lateOf({ startTime: "07:00", atHm: "23:30" });
  ok("열 시간 넘게 늦은 것은 지각이 아니라 결석 — 원장님께 넘긴다", t.tooLate === true, JSON.stringify(t));
}
await throws("찍은 시각이 없으면 던진다", () => lateOf({ startTime: "17:00", atHm: null }), "HH:MM");

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n■ 어느 IP 를 믿는가 — ⚠️ **뒤엣것은 손님이 지어낼 수 있다**");
{
  const H = (o) => ({ get: (k) => o[k] ?? null });
  ok("Vercel 이 붙인 것을 가장 믿는다",
     pickIp(H({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "9.9.9.9" })) === "1.1.1.1");
  ok("x-forwarded-for 는 **맨 앞**이 진짜 손님이다",
     pickIp(H({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })) === "203.0.113.7");
  ok("⚠️ 손님이 앞에 지어낸 것을 넣어도 **뒤를 보지 않는다** (뒤를 보면 그게 더 위험하다)",
     pickIp(H({ "x-forwarded-for": "8.8.8.8, 203.0.113.7" })) === "8.8.8.8");
  ok("둘 다 없으면 x-real-ip", pickIp(H({ "x-real-ip": "203.0.113.9" })) === "203.0.113.9");
  ok("아무것도 없으면 null 이다 — 지어내지 않는다", pickIp(H({})) === null);
}

console.log("\n■ IPv6 — ⚠️ **계획서가 「확인 안 됨」으로 남긴 자리다** (앞 4덩어리 = /64)");
{
  ok("줄여 쓴 주소를 여덟 덩어리로 편다",
     expandIp6("2001:db8::1").join(":") === "2001:db8:0:0:0:0:0:1", String(expandIp6("2001:db8::1")));
  ok("⚠️ 옛 앱은 이것을 못 폈다 — split(':') 이 `2001:db8::1` 을 4덩어리로 잘못 잘랐다",
     "2001:db8::1".split(":").slice(0, 4).join(":") !== expandIp6("2001:db8::1").slice(0, 4).join(":"));
  ok("IPv4 는 IPv6 가 아니다", expandIp6("203.0.113.7") === null);
  ok("`::` 가 둘이면 주소가 아니다", expandIp6("1::2::3") === null);

  const net = ["2001:db8:abcd:12::1"];
  ok("같은 공유기(앞 4덩어리가 같다)면 통과",
     sameNet("2001:db8:abcd:12:aaaa:bbbb:cccc:dddd", net).ok, JSON.stringify(sameNet("2001:db8:abcd:12:a::1", net)));
  ok("다섯째 덩어리가 아니라 **넷째**가 다르면 막는다",
     !sameNet("2001:db8:abcd:99::1", net).ok);
  ok("IPv4 는 글자가 똑같아야 통과", sameNet("203.0.113.7", ["203.0.113.7"]).ok);
  ok("IPv4 는 대역으로 안 뭉갠다 (앞 세 덩어리가 같아도 다른 집이다)",
     !sameNet("203.0.113.8", ["203.0.113.7"]).ok);
  ok("::ffff: 로 감싸 와도 같은 주소로 본다", sameNet("::ffff:203.0.113.7", ["203.0.113.7"]).ok);
}

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n■ ⚠️⚠️ 관문 — **등록이 없으면 「그냥 통과」가 아니다** (옛 앱은 통과였고 표는 0줄이었다)");
{
  const g0 = netGate({ ip: "203.0.113.7", net: { ips: [] } });
  ok("등록이 없으면 아이는 **못 찍는다**", g0.ok === false && g0.why === "net-not-set", JSON.stringify(g0));
  ok("그래도 막다른 길이 아니다 — 지금 그 자리의 IP 를 답에 담는다", g0.seenIp === "203.0.113.7");
  ok("원장님이 한 번 눌러 등록할 수 있다고 알린다", g0.canRegister === true);
  ok("아이에게는 **아이가 할 수 있는 말**로 알린다", /선생님/.test(g0.msg), g0.msg);

  const g1 = netGate({ ip: "203.0.113.7", net: { ips: ["203.0.113.9"] } });
  ok("등록이 있는데 안 맞으면 막는다", g1.ok === false && g1.why === "not-academy");
  ok("「학원 와이파이에 연결한 뒤 눌러 주세요」", /와이파이/.test(g1.msg), g1.msg);

  const g2 = netGate({ ip: "203.0.113.7", net: { ips: ["203.0.113.7"] } });
  ok("학원에서 누르면 통과", g2.ok === true);

  const g3 = netGate({ ip: null, net: { ips: ["203.0.113.7"] } });
  ok("주소를 못 읽으면 **통과시키지 않는다**", g3.ok === false && g3.why === "no-ip");

  const gs = netGate({ ip: null, net: { ips: [] }, isStaff: true });
  ok("⚠️ 원장·강사는 관문을 안 지난다 — 아이가 못 찍은 날 손으로 찍어 줘야 한다", gs.ok === true);
}

// ═════════════════════════════════════════════════════════════════════════════
// 가짜 DB — Postgres 를 흉내낸다. ⚠️ **넘어온 SQL 글자를 읽는다** (뜻으로 흉내내면 못 잡는다)
// ═════════════════════════════════════════════════════════════════════════════
function fakeDb(seed = {}) {
  const arrivals = [];                      // {student_id, date, step, at, ip}
  const sheets = [];
  const today = seed.today ?? "2026-09-02"; // 수요일 (dow 3)
  const sched = seed.sched ?? [{
    class_id: "K1", kind: "regular", nickname: null,
    from_date: "2026-01-01", to_date: null, weekdays: [1, 3],
    start_time: "17:00:00", end_time: "19:30:00",
  }];
  const holidays = seed.holidays ?? [];
  const net = seed.net ?? null;
  const noSheet = seed.noSheet === true;    // 판에 쓰기 규칙이 없다 (아이 자격 흉내)
  const me = seed.me ?? [{ id: "S1", name: "zz_시험_학생" }];
  let clock = seed.clock ?? ["16:58", "17:20", "17:25"];
  let i = 0, id = 0;

  return {
    arrivals, sheets,
    async query(sql, p = []) {
      const tag = (sql.match(/\/\* (?:arrival|attend):(\w+) \*\//) || [])[1];
      const d = p[1] ?? today;
      switch (tag) {
        case "today": return { rows: [{ d: p[0] ?? today }] };
        case "me": return { rows: me };
        case "net": return { rows: seed.net ?? net ? [{ config: seed.net ?? net }] : [] };
        case "allow": {
          const cfg = JSON.parse(p[0]);
          seed.net = { ...(seed.net ?? {}), ...cfg };
          return { rows: [{ config: seed.net }] };
        }
        case "mark": {
          const [s, , st, ip] = p;
          // ⚠️ **SQL 글자를 읽는다.** 「뜻으로」 흉내내면 `do nothing` 을 `do update` 로 바꿔도
          //    검사가 통과한다 — 실제로 일부러 바꿔 보고 안 잡히는 것을 봤다
          const overwrite = /on conflict \([^)]*\)\s*do update/i.test(sql);
          const had = arrivals.find((a) => a.student_id === s && a.date === d && a.step === Number(st));
          // ⚠️ 열쇠는 (student, date, step) 이다 — 진짜 DB 에 그 unique 가 있다
          if (had) {
            if (!overwrite) return { rows: [] };        // on conflict do nothing → **0줄**
            had.hm = clock[Math.min(i++, clock.length - 1)];   // 덮어쓰면 시각이 뒤로 밀린다
            return { rows: [{ id: had.id, date: d, step: had.step, hm: had.hm }] };
          }
          const hm = clock[Math.min(i++, clock.length - 1)];
          arrivals.push({ id: `ar${++id}`, student_id: s, date: d, step: Number(st), hm, ip });
          return { rows: [{ id: `ar${id}`, date: d, step: Number(st), hm }] };
        }
        case "day": {
          const rows = arrivals.filter((a) => a.student_id === p[0] && a.date === d)
            .sort((a, b) => (a.hm === b.hm ? a.step - b.step : a.hm < b.hm ? -1 : 1))
            .map((a) => ({ step: a.step, ip: a.ip, hm: a.hm }));
          return { rows };
        }
        case "sched": return { rows: sched };
        case "holiday": return { rows: holidays };
        case "upsert": {
          const [s, dd, c, a] = p;
          if (noSheet) return { rows: [] };             // 접근 규칙이 막는다 → **0줄**
          const cur = sheets.find((x) => x.student_id === s && x.date === dd && (x.class_id ?? null) === (c ?? null));
          if (cur) { cur.attend = a; return { rows: [{ ...cur, updated_at: "t2" }] }; }
          const row = { id: `sh${++id}`, student_id: s, date: dd, class_id: c ?? null, attend: a, updated_at: "t1" };
          sheets.push(row);
          return { rows: [{ ...row }] };
        }
        case "one": return { rows: [] };
        default: throw new Error(`가짜 DB 가 모르는 SQL: ${String(sql).slice(0, 60)}`);
      }
    },
  };
}

console.log("\n■ 찍으면 **그날 판이 선다** — 아이는 시각만 찍고 갈래는 앱이 센다");
{
  const db = fakeDb({ clock: ["17:20"] });
  const gate = netGate({ ip: "203.0.113.7", net: { ips: ["203.0.113.7"] } });
  const r = await markArrival(db, { gate, studentId: "S1", step: "phone", ip: "203.0.113.7" });
  ok("찍혔다", r.ok === true && r.first === true, JSON.stringify(r.msg));
  ok("**판이 섰다** — attendanceWrite 한 벌을 지났다", db.sheets.length === 1, String(db.sheets.length));
  ok("갈래는 **앱이 센 late** 다 (아이가 안 골랐다)", db.sheets[0].attend === "late", db.sheets[0].attend);
  ok("판이 그 반에 붙었다", db.sheets[0].class_id === "K1", String(db.sheets[0].class_id));
  ok("도착 시각은 찍은 그 시각이다", r.view.arrivedAt === "17:20", r.view.arrivedAt);
  ok("몇 분 늦었는지는 **세어 나왔다**", r.view.late.minutes === 20, String(r.view.late.minutes));
  ok("⚠️ 지각 분을 저장하지 않아도 흠이 아니다 — 도착 시각이 남아 다시 센다", r.lateDerivable === true);
  ok("화면이 그릴 다음 걸음을 준다", r.view.next?.key === "attend", JSON.stringify(r.view.next));
  ok("찍힌 걸음에 시각이 붙어 있다", r.view.steps[0].done && r.view.steps[0].at === "17:20");
}
{
  const db = fakeDb({ clock: ["16:58"] });
  const gate = netGate({ ip: "203.0.113.7", net: { ips: ["203.0.113.7"] } });
  const r = await markArrival(db, { gate, studentId: "S1", step: 1, ip: "203.0.113.7" });
  ok("일찍 오면 판이 present 로 선다", db.sheets[0].attend === "present", db.sheets[0].attend);
  ok("그래도 도착 시각은 남는다", r.view.arrivedAt === "16:58");
}

console.log("\n■ 같은 걸음을 두 번 찍어도 **한 줄** — 그리고 **먼저 찍은 시각을 지킨다**");
{
  const db = fakeDb({ clock: ["17:20", "17:40"] });
  const gate = netGate({ ip: "203.0.113.7", net: { ips: ["203.0.113.7"] } });
  await markArrival(db, { gate, studentId: "S1", step: 1, ip: "203.0.113.7" });
  const again = await markArrival(db, { gate, studentId: "S1", step: 1, ip: "203.0.113.7" });
  ok("줄이 하나뿐이다", db.arrivals.length === 1, String(db.arrivals.length));
  ok("두 번째는 「이미 찍혀 있다」로 답한다", again.first === false && again.why === "already", again.why);
  ok("⚠️ 도착 시각이 **뒤로 안 밀린다** (밀리면 지각 분이 조용히 달라진다)",
     again.view.arrivedAt === "17:20", again.view.arrivedAt);
  ok("그래도 성공이다 — 아이가 두 번 눌렀다고 빨간 글씨를 띄우지 않는다", again.ok === true);
}

console.log("\n■ 도착 시각은 **그날 가장 먼저 찍은 걸음**의 시각이다");
{
  const db = fakeDb({ clock: ["17:10", "17:25"] });
  const gate = netGate({ ip: "203.0.113.7", net: { ips: ["203.0.113.7"] } });
  await markArrival(db, { gate, studentId: "S1", step: "phone", ip: "203.0.113.7" });
  const r = await markArrival(db, { gate, studentId: "S1", step: "homework", ip: "203.0.113.7" });
  ok("두 걸음이 찍혔다", db.arrivals.length === 2);
  ok("도착은 첫 걸음(17:10)이다 — 나중 걸음이 안 덮는다", r.view.arrivedAt === "17:10", r.view.arrivedAt);
  ok("지각 분도 첫 걸음 기준이다", r.view.late.minutes === 10, String(r.view.late.minutes));
}

console.log("\n■ ⚠️ 판이 안 서면 **성공이라 말하지 않는다** (옛 앱이 여기서 다쳤다)");
{
  const db = fakeDb({ clock: ["17:20"], noSheet: true });
  const gate = netGate({ ip: "203.0.113.7", net: { ips: ["203.0.113.7"] } });
  const r = await markArrival(db, { gate, studentId: "S1", step: 1, ip: "203.0.113.7" });
  ok("찍기는 남았다", db.arrivals.length === 1);
  ok("**ok 가 거짓이다** — 화면이 「등원 했어요」라고 그리면 안 된다", r.ok === false, JSON.stringify(r.ok));
  ok("판이 안 섰다고 말로 밝힌다", /판이 안 섰/.test(r.msg), r.msg);
  ok("숨기지 않는다 — 판 쪽 답을 그대로 올려보낸다", r.sheet && r.sheet.ok === false);
}

console.log("\n■ 관문을 건너뛸 길이 없다");
{
  const db = fakeDb();
  await throws("관문 없이 부르면 던진다",
    () => markArrival(db, { studentId: "S1", step: 1 }), "관문");
  const r = await markArrival(db, { gate: netGate({ ip: "8.8.8.8", net: { ips: ["203.0.113.7"] } }), studentId: "S1", step: 1 });
  ok("막힌 관문으로 부르면 한 줄도 안 쓴다", r.ok === false && db.arrivals.length === 0, String(db.arrivals.length));
  ok("까닭을 그대로 돌려준다", r.why === "not-academy", r.why);
}

console.log("\n■ 반이 없는 날 · 휴강 · 반이 둘인 날");
{
  const db = fakeDb({ today: "2026-09-01", clock: ["17:20"] });   // 화요일 — 월·수 반이 아니다
  const gate = netGate({ ip: "203.0.113.7", net: { ips: ["203.0.113.7"] } });
  const r = await markArrival(db, { gate, studentId: "S1", step: 1, ip: "203.0.113.7", date: "2026-09-01" });
  ok("수업 없는 날에 찍어도 판은 선다 (보강일 수 있다)", r.ok === true && db.sheets.length === 1);
  ok("반이 없으면 **classId 를 null 이라고 적는다** (빼먹지 않는다)", db.sheets[0].class_id === null);
  ok("반 시각을 모르니 지각을 **못 셌다**고 밝힌다", r.view.late.sure === false, JSON.stringify(r.view.late));
  ok("그래도 present 로 눕히되 「확인 안 됨」을 달고 간다", db.sheets[0].attend === "present" && /확인 안 됨/.test(r.view.late.why));
}
{
  const db = fakeDb({ holidays: [{ date: "2026-09-02", class_id: null }] });
  const c = await classOfDay(db, { studentId: "S1" });
  ok("휴강이면 그날 반이 없다", c.pick === null && c.off === true, JSON.stringify(c));
}
{
  const db = fakeDb({ sched: [
    { class_id: "K1", kind: "regular", nickname: null, from_date: "2026-01-01", to_date: null,
      weekdays: [1, 3], start_time: "19:30:00", end_time: null },
    { class_id: "K2", kind: "special", nickname: "특강", from_date: "2026-01-01", to_date: null,
      weekdays: [3], start_time: "17:00:00", end_time: null },
  ] });
  const c = await classOfDay(db, { studentId: "S1" });
  // ⚠️⚠️ **원장님 2026-09-03 정정** — 「학생에게 출결하면서 **바로 연달아 고르게** 해」.
  //    예전에는 **가장 이른 반**으로 짐작했다. 그러면 7시 특강만 오는 날에도 5시 정규에 찍혀
  //    **특강 회차가 안 차고 보강이 잘못 뜬다.** 이제 앱이 안 고른다.
  ok("⚠️⚠️ 반이 둘이면 **앱이 안 고른다** (아이가 고른다)", c.pick === null, JSON.stringify(c.pick));
  ok("물어야 한다고 밝힌다", c.mustPick === true);
  ok("고를 목록을 **둘 다** 준다", c.all.length === 2
     && c.all.map((x) => x.classId).sort().join() === "K1,K2", JSON.stringify(c.all.map((x) => x.classId)));
  ok("나머지를 숨기지 않고 others 로도 밝힌다", c.others.length === 1 && c.others[0].classId === "K1");

  // ⚠️ 아이가 고르면 **그 반으로** 선다 — 그리고 **목록에 없는 반은 안 받는다**
  const v1 = await arrivalView(db, { studentId: "S1", classId: "K1" });
  ok("아이가 고른 반으로 선다", v1.cls?.classId === "K1" && v1.mustPick === false, JSON.stringify(v1.cls));
  const v2 = await arrivalView(db, { studentId: "S1", classId: "없는반" });
  ok("⚠️ **목록에 없는 반은 안 받는다** (남의 반 출결을 못 만든다)",
     v2.cls === null && v2.mustPick === true, JSON.stringify(v2.cls));
}
{
  const db = fakeDb({ sched: [
    { class_id: "K1", kind: "regular", nickname: null, from_date: "2026-01-01", to_date: "2026-08-31",
      weekdays: [1, 3], start_time: "17:00:00", end_time: null },
    { class_id: "K1", kind: "regular", nickname: null, from_date: "2026-09-01", to_date: null,
      weekdays: [1, 3], start_time: "19:30:00", end_time: null },
  ] });
  const c = await classOfDay(db, { studentId: "S1" });
  ok("⚠️ 요일 이력이 바뀌면 **그날에 걸리는 나중 줄**의 시각을 쓴다 (옛 줄로 지각을 세면 안 된다)",
     c.pick?.startTime === "19:30", JSON.stringify(c.pick));
}

console.log("\n■ 원장님이 학원에서 한 번 눌러 지금 IP 를 등록한다");
{
  const seed = { net: null };
  const db = fakeDb(seed);
  const before = await readNet(db);
  ok("아직 등록이 없다", before.has === false && before.ips.length === 0);
  const r = await allowThisIp(db, { ip: "203.0.113.7", note: "학원 와이파이" });
  ok("등록됐다", r.ok === true && r.ips.includes("203.0.113.7"), JSON.stringify(r));
  const after = await readNet(db);
  ok("이제 관문이 열린다", netGate({ ip: "203.0.113.7", net: after }).ok === true);
  ok("다른 데서는 그대로 막힌다", netGate({ ip: "8.8.8.8", net: after }).ok === false);
  const dup = await allowThisIp(db, { ip: "203.0.113.7" });
  ok("두 번 등록해도 늘지 않는다", dup.ok === false && dup.why === "already", JSON.stringify(dup));
  const bad = await allowThisIp(db, { ip: "" });
  ok("주소를 못 읽으면 등록 안 한다", bad.ok === false && bad.why === "no-ip");
}

console.log("\n■ **제 아이만** 찍는다 — 학부모의 아이는 안 든다");
{
  const db = fakeDb({ me: [] });
  const who = await whoAmI(db);
  ok("학생이 아니면 아이가 없다", who.isStudent === false && who.studentId === null);
  const db2 = fakeDb({ me: [{ id: "S1", name: "zz_시험_학생" }] });
  ok("제 아이 하나를 준다 (v2.my_own_student — my_students 가 아니다)",
     (await whoAmI(db2)).studentId === "S1");
}
{
  const src = readFileSync(join(ROOT, "lib/arrival.js"), "utf8");
  ok("⚠️ SQL 이 `my_own_student` 를 부른다 — `my_students` 면 학부모가 집에서 찍는다",
     /my_own_student/.test(src) && !/select v2\.my_students\(\)/.test(src));
}

// ═════════════════════════════════════════════════════════════════════════════
console.log("\n■ 파일 규칙 — 다른 자리로 새지 않았나");
{
  const lib = readFileSync(join(ROOT, "lib/arrival.js"), "utf8");
  const route = readFileSync(join(ROOT, "app/api/arrival/route.js"), "utf8");
  // ⚠️ **주석은 코드가 아니다.** 안 지우고 훑으면 「new Date() 를 쓰지 않는다」라고 적은
  //    그 주석 글자에 걸려 검사가 늘 빨갛다 — 실제로 여기서 한 번 걸렸다
  const bare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const libC = bare(lib), routeC = bare(route);
  // SQL 은 손잡이(/* arrival:… */)로 뽑는다 — 뒤 코드까지 삼키지 않게 백틱까지가 한 덩어리다
  const sqls = [...lib.matchAll(/`\/\* arrival:\w+ \*\/[^`]*`/g)].map((m) => m[0]);

  ok("⚠️ v2.day_sheet 에 직접 쓰지 않는다 (쓰는 길 전부가 한 벌을 부른다)",
     !/insert\s+into\s+v2\.day_sheet/i.test(libC + routeC) &&
     !/update\s+v2\.day_sheet\s+set/i.test(libC + routeC));
  ok("attendanceWrite 를 via:\"arrival\" 로 부른다", /attendanceWrite\(/.test(libC) && /via:\s*"arrival"/.test(libC));
  ok("그 길이 여덟 길 표에 있다", !!WRITE_PATHS.arrival, Object.keys(WRITE_PATHS).join(" "));
  ok("⚠️ new Date() 로 서버 시간을 안 쓴다 (시간대는 Asia/Seoul 하나다)",
     !/new Date\s*\(\s*\)/.test(libC + routeC));
  ok("오늘은 v2.today() 에서 온다", /v2\.today\(\)/.test(lib));
  ok("찍은 시각은 DB 가 서울로 바꿔 준다", sqls.some((s) => /at time zone 'Asia\/Seoul'/.test(s)));
  ok("⚠️ SQL 안에 ${} 를 안 끼웠다 (끼우면 기계로 못 본다)",
     sqls.length > 0 && sqls.every((s) => !s.includes("${")),
     sqls.filter((s) => s.includes("${")).join(" "));
  ok("허용 대역을 **코드에 안 박았다** — v2.integration 에서 읽는다",
     /from v2\.integration/.test(lib) && !/\b(?:192|10|172)\.\d+\.\d+\.\d+/.test(libC));
  ok("소속은 v2.student_classes() 로만 읽는다 (직접 class_member 를 안 읽는다)",
     /v2\.student_classes\(/.test(lib) && !/from v2\.class_member/.test(lib));
  ok("요일 이력 셈은 lib/session.js 의 countDates 를 부른다 (다시 세지 않는다)",
     /countDates/.test(libC));

  ok("⚠️ 문에서 서비스 열쇠를 안 쓴다", !/SERVICE_ROLE/.test(routeC) && !/serviceDb/.test(routeC));
  ok("관문 문은 **한 줄만** 읽는다 (접근 규칙 밖이라 자물쇠를 건다)",
     /\+\+n > 1/.test(route) && /openGate/.test(route));
  ok("문이 스스로 역할을 본다 (문지기는 역할로 안 지킨다)", /roleOf\(/.test(route));
  ok("아이 화면(app/me)은 안 건드렸다", !existsSync(join(ROOT, "app/me/arrival.js")));
}

// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ 여기부터 **진짜 DB**. 가짜 DB 는 죽은 칸도 접근 규칙도 원리적으로 못 잡는다.
//    쓰는 것은 전부 `begin … rollback` 안이고, 학생은 **fixture(zz_시험_)** 뿐이다.
// ═════════════════════════════════════════════════════════════════════════════
console.log("\n■ 진짜 DB — fixture 학생으로 쓰고 **되돌린다** (진짜 아이는 한 명도 안 건드린다)");
let skipped = 0;
const env = join(ROOT, ".env.local");
const url = existsSync(env) ? (readFileSync(env, "utf8").match(/DATABASE_URL=(.+)/) || [])[1]?.trim() : null;
if (!url) {
  skipped = 1;
  console.log("   ⚠️ 확인 안 됨 — .env.local 의 DATABASE_URL 이 없어 **진짜 DB 로 못 돌렸다**");
} else {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  let up = false;
  for (let i = 1; i <= 3; i++) { try { await c.connect(); up = true; break; } catch { await new Promise((r) => setTimeout(r, 3000)); } }
  if (!up) {
    skipped = 1;
    console.log("   ⚠️ 확인 안 됨 — DB 에 못 붙어 **진짜 DB 로 못 돌렸다**");
  } else {
    const db = { query: (s, p) => c.query(s, p) };
    const as = async (profile) => {
      await c.query("reset role");
      await c.query(`select set_config('request.jwt.claims', $1, false)`,
        [JSON.stringify({ sub: profile, role: "authenticated" })]);
      await c.query("set role authenticated");
    };
    // ⚠️ 진짜 학생이 아닌지 **먼저 확인하고** 쓴다
    // ⚠️ 0078 이 미리 세워 둔 줄을 빼려면 **시작할 때** 세어 둬야 한다
    const netBefore = (await c.query("select count(*)::int n from v2.integration where id = 'arrival'")).rows[0].n;
    const fx = (await c.query(
      "select id, name, import_batch::text b from v2.students where id = any($1::uuid[])",
      [[FX.student, FX.other]])).rows;
    ok("쓸 학생이 fixture(zz_시험_) 인지 먼저 본다",
       fx.length === 2 && fx.every((r) => r.b === "fixture" && r.name.startsWith("zz_시험_")),
       JSON.stringify(fx));
    if (fx.length !== 2 || !fx.every((r) => r.b === "fixture")) {
      console.log("   ⛔ fixture 가 아니라 **아무것도 안 쓴다**");
    } else {
      await c.query("begin");
      try {
        const today = (await c.query("select v2.today()::text d")).rows[0].d;
        const gate = netGate({ ip: "203.0.113.7", net: { ips: ["203.0.113.7"] } });

        // ── ① 아이 자격으로 ──────────────────────────────────────────────
        await as(FX.sProf);
        const who = await whoAmI(db);
        ok("아이 자격으로 **제 아이 하나**만 읽힌다",
           who.studentId === FX.student && who.students.length === 1, JSON.stringify(who));

        const cls = await classOfDay(db, { studentId: FX.student });
        ok("그날 반과 시각을 진짜 표에서 읽었다 (수업일이면 반이 있다)",
           cls.pick === null || /^\d{2}:\d{2}$/.test(String(cls.pick.startTime)), JSON.stringify(cls.pick));

        // ⚠️ `tx:true` — **나는 트랜잭션 안이다**라고 말해 준다. 안 말하면 판 쓰기가 막히는 순간
        //    트랜잭션이 통째로 죽어(25P02) 뒤 검사가 한 줄도 못 돈다 (여기서 실제로 그랬다)
        const r1 = await markArrival(db, { gate, studentId: FX.student, step: 1, ip: "203.0.113.7" }, { tx: true });
        const arr = (await c.query(
          "select step, to_char(at at time zone 'Asia/Seoul','HH24:MI') hm, ip::text raw, host(ip) ip from v2.arrival where student_id=$1 and date=$2::date order by step",
          [FX.student, today])).rows;
        ok("**찍기가 진짜로 남았다** (아이 자격으로도 v2.arrival 에 들어간다)",
           arr.length === 1 && arr[0].step === 1, JSON.stringify(arr));
        ok("IP 가 inet 칸에 담겼다", arr[0]?.ip === "203.0.113.7", String(arr[0]?.ip));
        ok("⚠️ `ip::text` 는 `/32` 를 붙여 준다 — 그 글자로 등록 목록과 견주면 한 번도 안 맞는다",
           arr[0]?.raw === "203.0.113.7/32", String(arr[0]?.raw));
        ok("그래서 lib 은 `host(ip)` 로 읽는다",
           /host\(ip\)/.test(readFileSync(join(ROOT, "lib/arrival.js"), "utf8")));
        ok("도착 시각이 서울 시각 HH:MM 이다", /^\d{2}:\d{2}$/.test(String(r1.view?.arrivedAt)), String(r1.view?.arrivedAt));
        ok("갈래는 앱이 셌고 present·late 둘 중 하나다",
           ["present", "late"].includes(r1.view?.late?.attend), JSON.stringify(r1.view?.late));

        // ⚠️ 여기가 이 검사의 핵심 — **판이 안 서면 성공이라 말하면 안 된다**
        const sheetOk = r1.sheet?.ok === true;
        ok("판 쪽 답을 숨기지 않는다 (안 서면 ok 도 거짓이다)",
           sheetOk === (r1.ok === true), `sheet=${sheetOk} ok=${r1.ok}`);
        console.log(sheetOk
          ? "      (아이 자격으로 판이 섰다 — v2.day_sheet 에 학생용 쓰기 규칙이 생겼다)"
          : `      ⚠️ **아이 자격으로는 판이 안 선다** — ${r1.sheet?.why} · 보고 needsDb 의 규칙이 아직 없다`);

        // 두 번 찍어도 한 줄
        const r1b = await markArrival(db, { gate, studentId: FX.student, step: 1, ip: "203.0.113.7" }, { tx: true });
        const arr2 = (await c.query(
          "select count(*)::int n from v2.arrival where student_id=$1 and date=$2::date", [FX.student, today])).rows[0].n;
        ok("진짜 열쇠(student,date,step)가 두 줄을 막는다", arr2 === 1, String(arr2));
        ok("두 번째는 「이미 찍혀 있다」다", r1b.first === false, JSON.stringify(r1b.first));
        ok("도착 시각이 안 밀렸다", r1b.view.arrivedAt === r1.view.arrivedAt);

        // 남의 아이는 못 찍는다 (접근 규칙이 막는다)
        let denied = null;
        try {
          await c.query("savepoint zz_other");
          await markArrival(db, { gate, studentId: FX.other, step: 1, ip: "203.0.113.7" }, { tx: true });
        } catch (e) { denied = String(e.message).split("\n")[0]; }
        await c.query("rollback to savepoint zz_other").catch(() => {});
        const otherRows = (await c.query(
          "select count(*)::int n from v2.arrival where student_id=$1", [FX.other])).rows[0].n;
        ok("⚠️ 남의 아이 등원은 한 줄도 안 남는다", otherRows === 0, `${otherRows}줄 · ${denied ?? "안 던짐"}`);

        // ── ② 원장 자격으로 — **손으로 대신 찍는 길** ────────────────────
        await c.query("rollback");
        await c.query("begin");
        await as(FX.pProf);
        const staffGate = netGate({ ip: null, net: { ips: [] }, isStaff: true });
        ok("원장님은 등록이 없어도 관문을 지난다", staffGate.ok === true);
        const r2 = await markArrival(db, { gate: staffGate, studentId: FX.student, step: 2, by: "staff" }, { tx: true });
        ok("원장 자격으로는 **판이 선다**", r2.ok === true && r2.sheet?.ok === true, JSON.stringify(r2.msg));
        const sh = (await c.query(
          "select attend, class_id::text c, date::text d from v2.day_sheet where student_id=$1 and date=$2::date",
          [FX.student, today])).rows;
        ok("진짜 v2.day_sheet 에 그날 판이 한 줄 섰다", sh.length === 1, JSON.stringify(sh));
        ok("갈래가 present·late 다 (아이가 고른 것이 아니다)",
           ["present", "late"].includes(sh[0]?.attend), String(sh[0]?.attend));
        ok("판이 그날 그 반에 붙었다 (반이 없으면 null 이라고 적혔다)",
           sh[0]?.c === (r2.view.cls?.classId ?? null), `${sh[0]?.c} vs ${r2.view.cls?.classId}`);
        // ⚠️ 저장한 것은 **찍은 시각 하나**뿐이다 — 판에는 갈래만 있고 「몇 분」이 아무 데도 없다
        const cols = (await c.query(
          `select column_name from information_schema.columns
            where table_schema='v2' and table_name='day_sheet'`)).rows.map((x) => x.column_name);
        ok("⚠️ 판에 「몇 분 늦었나」 칸이 아예 없다 — 세어 나오는 값은 저장 안 한다 (원칙 5)",
           !cols.some((x) => /late|minute|지각/i.test(x)), cols.join(" "));

        // ── ③ 원장님이 지금 IP 를 등록하는 길 ────────────────────────────
        const before = await readNet(db);
        const add = await allowThisIp(db, { ip: "203.0.113.7", note: "검사" });
        ok("원장 자격으로 학원 주소를 등록할 수 있다", add.ok === true, JSON.stringify(add));
        const after = await readNet(db);
        ok("등록한 뒤 관문이 열린다", netGate({ ip: "203.0.113.7", net: after }).ok === true);
        console.log(`      (등록 전 ${before.ips.length}개 → 뒤 ${after.ips.length}개 · 유예 ${after.graceMin}분)`);

        // ── ④ 아이는 그 표를 **못 읽는다** ───────────────────────────────
        await as(FX.sProf);
        const asKid = await readNet(db);
        ok("⚠️ 아이 자격으로는 학원 회선 설정이 안 읽힌다 (평문 열쇠가 든 표다)",
           asKid.has === false && asKid.ips.length === 0, JSON.stringify(asKid));
        console.log("      (그래서 문이 접근 규칙을 걸기 **전에** 그 한 줄만 읽는다 — openGate)");
      } catch (e) {
        // ⚠️ **터진 것을 초록으로 넘기지 않는다.** 진짜 DB 앞에서 터지면 그 자체가 실패다
        //    (일부러 `on conflict do nothing` 을 `do update` 로 바꿔 보니 여기서 터졌다 —
        //     v2.arrival 에 학생용 update 규칙이 없어 `do update` 는 원리적으로 못 쓴다)
        fail++; n++;
        console.log("   ❌ 진짜 DB 에서 터졌다 —", String(e?.message ?? e).split("\n")[0]);
      } finally {
        await c.query("rollback").catch(() => {});
        await c.query("reset role").catch(() => {});
      }

      // ── ⑤ 되돌아갔나 — 「되돌렸겠지」를 믿지 않는다 ──────────────────────
      const left = (await c.query(
        "select count(*)::int n from v2.arrival where student_id = any($1::uuid[])",
        [[FX.student, FX.other]])).rows[0].n;
      ok("⚠️ 검사가 남긴 등원 줄이 없다", left === 0, `${left}줄 남았다`);
      const leftSheet = (await c.query(
        "select count(*)::int n from v2.day_sheet where student_id = any($1::uuid[]) and date = v2.today()",
        [[FX.student, FX.other]])).rows[0].n;
      ok("⚠️ 검사가 남긴 판이 없다", leftSheet === 0, `${leftSheet}줄 남았다`);
      // ⚠️ 0078 이 `arrival` 설정 한 줄을 **미리 세운다**(학원 IP 대역·유예 분).
      //    그 줄은 검사가 남긴 것이 아니다 — 검사가 **더 만든 것**만 센다.
      const leftNet = Math.max(0,
        (await c.query("select count(*)::int n from v2.integration where id = 'arrival'")).rows[0].n - netBefore);
      // ⚠️ 0078 이 `arrival` 설정 한 줄을 **미리 세운다**(학원 IP 대역·유예 분).
  //    그 줄은 검사가 남긴 것이 아니다 — 검사가 **더 만든 것**만 센다.
  ok("⚠️ 검사가 학원 회선 설정을 남기지 않았다", leftNet === 0, `${leftNet}줄 남았다`);
    }

    // ── SQL 이 진짜 칸 이름으로 서 있나 — **한 줄도 안 쓴다**(파싱·계획만) ──
    console.log("\n■ SQL 이 진짜 v2 스키마에 맞는가 — DB 에 물어본다 (한 줄도 안 쓴다)");
    const TYPES = {   // ⚠️ SQL 을 더하면 여기 타입도 더해야 한다. 안 더하면 이 검사가 깨진다
      mark: "(uuid,text,int,text)", day: "(uuid,text)", sched: "(uuid,text)",
      holiday: "(uuid,text)", net: "()", allow: "(text)", me: "()",
    };
    const src = readFileSync(join(ROOT, "lib/arrival.js"), "utf8");
    const found = [...src.matchAll(/`(\/\* arrival:(\w+) \*\/[\s\S]*?)`/g)].map((m) => ({ sql: m[1], tag: m[2] }));
    ok("SQL 문마다 타입이 적혀 있다 (새 문을 몰래 못 더한다)",
       found.length > 0 && found.every((f) => TYPES[f.tag]),
       found.filter((f) => !TYPES[f.tag]).map((f) => f.tag).join(" "));
    const bad = [];
    for (const f of found) {
      if (!TYPES[f.tag]) continue;
      try {
        await c.query(`prepare zz_ar_${f.tag} ${TYPES[f.tag] === "()" ? "" : TYPES[f.tag]} as ${f.sql}`);
        await c.query(`deallocate zz_ar_${f.tag}`);
      } catch (e) { bad.push(`${f.tag}: ${String(e.message).split("\n")[0]}`); }
    }
    ok(`SQL ${found.length}문이 v2 의 진짜 칸 이름으로 서 있다`, bad.length === 0, bad.join(" / "));

    // 열쇠가 진짜로 있는가 — 「두 번 찍어도 한 줄」이 코드가 아니라 **DB** 로 지켜지나
    const uq = (await c.query(
      `select pg_get_constraintdef(oid) d from pg_constraint
        where conrelid = 'v2.arrival'::regclass and contype = 'u'`)).rows.map((r) => r.d);
    ok("⚠️ (학생,날짜,걸음) 열쇠가 **DB 에 있다** — 코드만 믿지 않는다",
       uq.some((d) => /UNIQUE \(student_id, date, step\)/i.test(d)), uq.join(" / "));
    const chk = (await c.query(
      `select pg_get_constraintdef(oid) d from pg_constraint
        where conrelid = 'v2.arrival'::regclass and contype = 'c'`)).rows.map((r) => r.d);
    console.log(chk.some((d) => /step/i.test(d))
      ? "      (step 에 1·2·3 제약이 있다)"
      : "      ⚠️ **step 에 제약이 없다** — 9번째 걸음도 들어간다. 보고 needsDb 에 적었다");

    await c.end();
  }
}

/* ══ 고르는 길이 화면까지 이어져 있나 (원장님 2026-09-03) ═══════════════════
 * ⚠️ lib 이 되물어도 **화면이 그 답을 안 보내면** 아이는 영영 못 고른다.
 *    이음이 끊기면 오류가 안 나고 「반이 둘입니다」만 계속 뜬다.                     */
{
  const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const api = 코드만(readFileSync("app/api/arrival/route.js", "utf8"));
  ok("⚠️ 찍는 길이 **아이가 고른 반**을 넘긴다 (classId)", /classId:\s*body\?\.classId/.test(api),
     "안 넘기면 아이가 골라도 lib 이 못 받아 계속 되묻는다");
  ok("⚠️ 보는 길도 고른 반을 받는다 (?class=)", /searchParams\.get\("class"\)/.test(api));
}

console.log(`\n■ 등원 찍기 검사 ${n}건 · 실패 ${fail}${skipped ? " · ⚠️ 진짜 DB 못 봄" : ""}`);
process.exit(fail ? 1 : 0);
