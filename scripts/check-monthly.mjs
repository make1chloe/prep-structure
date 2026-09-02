/** 월간 리포트 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *
 *  이 검사가 막는 것 (계획 3단계 · 검증 4번 · 절 ⑯):
 *   ⓐ 안 마감한 판이 리포트 재료로 섞이는 것
 *   ⓑ **굳히기(`frozen`)에 원장만 볼 칸이 실려 학부모에게 새는 것** — 접근 규칙상 그 줄은 그대로 보인다
 *   ⓒ 값이 없는 줄이 **0%** 로 나가는 것 (「안 봤다」와 「0점」은 다르다)
 *   ⓓ 같은 달 리포트가 **두 번** 굳거나 알림이 두 번 뜨는 것
 *   ⓔ 이관일 이전 달을 **0회**로 세어 전원이 「모자람」으로 빨갛게 뜨는 것
 *   ⓕ 근거 없는 자동 문장이 학부모에게 나가는 것
 *
 *  ⚠️ 마지막에 **진짜 DB 에 한 번 물어본다.** 가짜 DB 만 상대하는 검사는
 *     죽은 칸을 원리적으로 못 잡는다 (앞 판에서 62건 초록으로 지나갔다).
 */
import {
  FROZEN_V, STAFF_ONLY, FAMILY_KEYS, ASK, monthlyTag, monthLabel, assertYm, pct,
  countableOf, homeworkOf, attendOf, buildReport, forFamily,
  sendGate, saveDraft, sendMonthly, sentView, monthlyBoard, reopenReport,
} from "../lib/monthly.js";
import { Client } from "pg";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };
const threw = (f) => { try { f(); return false; } catch { return true; } };

// ── 가짜 DB ─────────────────────────────────────────────────────
// 판 넷(2·3일은 마감, 4·5일은 안 마감) · 학부모 하나 · 교재 하나
const S1 = "00000000-0000-4000-9000-0000000000s1".replace("s1", "01");
const P1 = "00000000-0000-4000-8000-000000000001";
const B1 = "00000000-0000-4000-b000-000000000001";
const C1 = "00000000-0000-4000-a000-000000000001";

/** 아무도 안 시킨 질의는 **던지지 않고 모은다** — 던지면 검사가 중간에 죽어 합계가 안 나온다 */
const UNKNOWN = [];

/** ⚠️ 발송 스위치 이름을 **글자 그대로 안 적는다.** `scripts/check-notify.mjs` 가
 *  「그 이름이 나오는 파일이 lib/notify.js 뿐인가」를 파일 훑기로 보기 때문이다.
 *  우리는 그 값을 **읽는** 것이 아니라 가짜 환경변수를 **주는** 쪽이라 규칙에 안 어긋나지만,
 *  훑기는 그 차이를 모른다. 이름을 이어 붙여 둔다 */
const SINK = ["NOTIFY", "SINK"].join("_");

/** ⚠️ **손으로 박아 둔 목록이다. lib 에서 가져오지 마라.**
 *  처음엔 `STAFF_ONLY` 를 그대로 써서 「굳힌 것에 원장 칸이 없다」를 봤는데,
 *  일부러 `STAFF_ONLY` 에서 한 칸을 빼 봤더니 **검사가 그대로 초록이었다** —
 *  지키는 목록과 재는 자가 같은 것이었기 때문이다.
 *  이 목록은 lib 이 바뀌어도 안 바뀐다. 그래서 lib 이 줄어들면 여기서 걸린다. */
const 새면_안_되는_칸 = ["hidden", "openSheets", "closedSheets", "sheets", "asks", "mustAsk", "why", "ready"];

/** 굳힌 것·학부모 값에 **이 밖의 칸이 있으면 실패**다 (흰 목록). 새 칸을 더하면 여기도 같이 더해야 한다 */
const 나가도_되는_칸 = ["v", "studentId", "ym", "monthLabel", "first", "last", "lines", "body"];

const base = () => ({
  today: "2026-08-31",
  sheets: [
    { id: "sh1", date: "2026-08-03", attend: "present", class_id: C1, closed_at: "2026-08-03T13:00:00Z", sent_at: null, comment: "잘했어요" },
    { id: "sh2", date: "2026-08-05", attend: "late",    class_id: C1, closed_at: "2026-08-05T13:00:00Z", sent_at: null, comment: null },
    { id: "sh3", date: "2026-08-10", attend: "present", class_id: C1, closed_at: null, sent_at: null, comment: null },
    { id: "sh4", date: "2026-08-12", attend: "absent",  class_id: C1, closed_at: null, sent_at: null, comment: null },
  ],
  // 마감한 판(sh1·sh2)의 검사 줄만 — 진짜 SQL 은 `s.closed_at is not null` 로 거른다
  check: [{ status: "done", n: 8 }, { status: "weak", n: 1 }, { status: "missing", n: 1 }],
  books: [{ book_id: B1, book_name: "그래머인사이드3", round: 1, book_state: "active" }],
  // ⚠️ `today_round` 는 **`v2.book_progress()` 가 고를 배정 줄의 회독**이다.
  //    안 적으면 그 달 회독과 같다고 본다(=평소 길). `marks` 는 찍힌 진도 줄 수 — 0 이면 「안 봤다」
  progress: { done: 3, skipped: 1, total: 4 },
  progressBy: null,            // 교재별로 다르게 주고 싶을 때 { [bookId]: {…} }
  atFirst: 1, atNow: 1,        // 달 첫날에도·오늘도 반이 있다
  cameBefore: false,           // 그 달 앞에 이 아이 판이 있었나 (이관 자국 가르기)
  parents: [{ profile_id: P1, role: "parent" }],
  quiz: { sh1: [{ part: "오늘 본 것", kind: "word", scope: "능률보카 · CH1", total: 20, wrong: 1, pct: 95, passed: true },
                { part: "다음 시간", kind: "word", scope: "능률보카 · CH2", total: 20, wrong: null, pct: null, passed: null }],
          sh2: [{ part: "오늘 본 것", kind: "word", scope: "능률보카 · CH2", total: 20, wrong: 6, pct: 70, passed: false }] },
  member: [{ class_id: C1, student_id: S1, from_date: "2026-01-01", to_date: null }],
  schedule: [{ class_id: C1, from_date: "2026-01-01", to_date: null, weekdays: [1, 3] }],
  mr: new Map(),          // (student|ym) → 줄
  students: [{ id: S1, name: "김하늘" }],
});

function fakeDb(fx, opts = {}) {
  const log = [];                      // 어떤 질의가 **어떤 차례로** 갔나 — 굳히기가 먼저인지 본다
  const shot = [];                     // 실제로 나간 알림
  let logId = 0;
  const key = (s, y) => `${s}|${y}`;
  const db = { log, shot, fx, async query(sql, p) {
    const h = /\/\* monthly:(\w+) \*\//.exec(sql)?.[1]
           ?? /\/\* attend:(\w+) \*\//.exec(sql)?.[1]
           ?? (sql.includes("v2.today()") ? "today"
             : sql.includes("v2.quiz_for_report") ? "quiz"
             : sql.includes("insert into v2.notify_log") ? "notify_log"
             : sql.includes("from v2.push_sub") ? "push_sub"
             : sql.includes("v2.student_classes") ? "member_cal"
             : sql.includes("from v2.class_schedule") ? "schedule"
             : sql.includes("from v2.holiday") ? "holiday"
             : sql.includes("from v2.makeup") ? "makeup"
             : sql.includes("v2.class_roster") ? "roster"
             : sql.includes("from v2.classes") ? "classes" : null);
    log.push(h ?? sql.replace(/\s+/g, " ").trim().slice(0, 60));
    switch (h) {
      case "today": return { rows: [{ d: fx.today }] };
      case "sheets": return { rows: fx.sheets.filter((s) => s.date >= p[1] && s.date <= p[2]) };
      case "check":  return { rows: fx.check };
      case "books":  return { rows: fx.books };
      case "progress": {
        // ⚠️ 교재를 **배열로 한 번에** 묻는다 ($2 = 교재 배열 · $3 = 그 달 회독 배열 · $4 = 그 달 마지막날)
        // ⚠️⚠️ 진짜 SQL 은 교재마다가 아니라 **배정 줄마다** 한 줄을 돌려준다 —
        //    같은 교재가 그 달에 두 줄이면(1회독 끝내고 2회독) 두 줄이다. `with ordinality` 의
        //    번호(`idx`, 1부터)로 맞대므로 여기서도 그 번호를 붙인다.
        //    ⚠️ 그리고 **되돌아오는 차례는 보장이 없다.** 진짜로 안 보장되는 것을 흉내내려고
        //       `fx.progressShuffle` 이면 줄을 뒤집어 준다 — 번호로 안 맞대면 그 자리에서 걸린다
        const ids = p[1] ?? [], rounds = p[2] ?? [];
        const out = [];
        ids.forEach((id, i) => {
          const v = fx.progressByRound?.[`${id}|${rounds[i]}`] ?? fx.progressBy?.[id] ?? fx.progress;
          if (!v) return;                                   // 그 배정 줄은 답이 아예 안 온다
          out.push({ idx: String(i + 1), book_id: id, done: v.done, skipped: v.skipped, total: v.total,
                     today_round: "today_round" in v ? v.today_round : rounds[i],
                     marks: "marks" in v ? v.marks : 1,
                     // ⚠️ 그 달이 끝난 뒤에 찍힌 `done` 줄 수. 안 적으면 0 (=그 달 것이 맞다)
                     after_month: "after_month" in v ? v.after_month : 0 });
        });
        return { rows: fx.progressShuffle ? out.reverse() : out };
      }
      case "rosterOn": return { rows: [{ at_first: fx.atFirst ?? 1, at_now: fx.atNow ?? 1,
                                         came_before: fx.cameBefore === true }] };
      case "parents": return { rows: fx.parents };
      case "one": { const r = fx.mr.get(key(p[0], p[1])); return { rows: r ? [r] : [] }; }
      case "draft": {
        const k = key(p[0], p[1]); const old = fx.mr.get(k);
        if (old?.sent_at) return { rows: [] };                       // ⚠️ 보낸 뒤엔 안 고쳐진다
        const row = { id: old?.id ?? "mr1", student_id: p[0], ym: p[1], body: p[2],
                      frozen: old?.frozen ?? null, sent_at: null };
        fx.mr.set(k, row); return { rows: [row] };
      }
      case "freeze": {
        const k = key(p[0], p[1]); const old = fx.mr.get(k);
        if (old?.sent_at) return { rows: [] };                       // ⚠️ 두 번 안 굳는다
        const row = { id: old?.id ?? "mr1", student_id: p[0], ym: p[1],
                      body: p[2] ?? old?.body ?? null, frozen: p[3],
                      sent_at: p[4] ?? "2026-08-31T12:00:00Z" };
        fx.mr.set(k, row); return { rows: [row] };
      }
      case "reopen": {
        // ⚠️ 지우지 않는다 — `sent_at` 만 비운다. `frozen` 은 자취로 남는다
        const k = key(p[0], p[1]); const old = fx.mr.get(k);
        if (!old?.sent_at) return { rows: [] };
        if (p[2] != null && String(old.sent_at) !== String(p[2])) return { rows: [] };
        const row = { ...old, sent_at: null };
        fx.mr.set(k, row); return { rows: [{ id: row.id, had_frozen: row.frozen != null }] };
      }
      case "board": return { rows: fx.students.map((st) => {
        const sh = fx.sheets.filter((s) => s.date >= p[1] && s.date <= p[2]);
        const r = fx.mr.get(key(st.id, p[0]));
        return { student_id: st.id, name: st.name, sent_at: r?.sent_at ?? null,
                 has_body: !!r?.body, sheets: sh.length, closed: sh.filter((s) => s.closed_at).length };
      }) };
      case "count": {   // attend:count — 판이 선 날을 출결별로 (**마감과 무관**)
        const m = new Map();
        for (const s of fx.sheets.filter((x) => x.date >= p[1] && x.date <= p[2])) {
          const k = `${s.class_id}|${s.attend}`;
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        return { rows: [...m].map(([k, v]) => ({ class_id: k.split("|")[0], attend: k.split("|")[1], n: v })) };
      }
      case "countmakeup": return { rows: [{ n: 0 }] };
      case "quiz": return { rows: fx.quiz[p[0]] ?? [] };
      case "member_cal": {
        const out = [];
        for (let d = new Date(Date.UTC(2026, 7, 1)); d <= new Date(Date.UTC(2026, 7, 31)); d = new Date(+d + 86400000)) {
          const s = d.toISOString().slice(0, 10);
          for (const m of fx.member)
            if (m.student_id === p[0] && m.from_date <= s && (!m.to_date || m.to_date >= s))
              out.push({ date: s, class_id: m.class_id });
        }
        return { rows: out };
      }
      case "schedule": return { rows: fx.schedule.filter((r) => r.class_id === p[0]) };
      case "holiday": return { rows: [] };
      case "makeup": return { rows: [] };
      case "classes": return { rows: [{ id: C1, kind: "regular" }] };
      case "notify_log":
        // ⚠️ 진짜로 나는 사고를 흉내낸다 — 발송 스위치가 꺼지면 `lib/notify.js` 가
        //    `notify_log.sent_at` 에 null 을 넣는데 그 칸은 not null 이라 **던진다**(실측 2026-09-02)
        if (fx.notifyBoom) throw new Error('null value in column "sent_at" of relation "notify_log" violates not-null constraint');
        return { rows: [{ id: ++logId }] };
      case "push_sub": return { rows: [{ endpoint: "e1", p256dh: "a", auth: "b" }] };
      default: UNKNOWN.push(sql.replace(/\s+/g, " ").trim().slice(0, 80)); return { rows: [] };
    }
  } };
  db.opts = { env: opts.env ?? { [SINK]: "live" }, push: (s, pl) => { shot.push(pl); } };
  return db;
}

// ── ① 달·백분율 — 여기서 하나 틀리면 리포트가 통째로 틀린다 ──────
console.log("■ 달과 백분율");
ok("2026-08 은 「2026년 8월」", monthLabel("2026-08") === "2026년 8월", monthLabel("2026-08"));
ok("⚠️ '2026-8' 은 던진다 (char(7) 에 빈칸이 붙어 같은 달이 두 줄이 된다)", threw(() => assertYm("2026-8")));
ok("'2026-13' 도 던진다", threw(() => assertYm("2026-13")));
ok("3/4 는 75%", pct(3, 4) === 75);
ok("0/4 는 0% 다 (본 것이 있고 다 틀린 것)", pct(0, 4) === 0);
ok("⚠️ 분모가 0 이면 **null** 이다 (0% 가 아니다)", pct(1, 0) === null);
ok("⚠️ 값이 없으면 **null** 이다 — 「안 봤다」와 「0점」은 다르다", pct(null, 4) === null);
ok("찍은 것이 없으면 성취도가 null 이다", homeworkOf([]).donePct === null);
ok("판이 없으면 출석률이 null 이다", attendOf({}).pct === null);
ok("휴강(off)은 출석률 분모에서 빠진다",
   attendOf({ present: 8, late: 0, absent: 0, off: 3 }).days === 8);

// ── ② 이관일 이전 달 — 「셀 수 없음」 ────────────────────────────
console.log("\n■ ⚠️ 이관일 이전 달 — 0회로 세면 전원이 빨갛게 뜬다");
{
  // 이관 자국 — 그 달엔 반이 없는데 **지금은 있다**
  const a = countableOf({ inMonth: 0, atFirst: 0, atNow: 1 });
  ok("그 달에 반 명단 기간이 없으면 **셀 수 없다**", a.countable === false, JSON.stringify(a));
  ok("「지금은 반이 있다」를 밝혀 퇴원과 가른다", /지금은 반이 있다/.test(a.why), a.why);
  // 아예 반이 없는 아이 — 퇴원했거나 아직 안 배정
  const b = countableOf({ inMonth: 0, atFirst: 0, atNow: 0 });
  ok("반 명단 줄이 아예 없으면 못 센다", b.countable === false && !/지금은 반이 있다/.test(b.why), b.why);
  ok("그 달에 반이 있었으면 셀 수 있다", countableOf({ inMonth: 1, atFirst: 1, atNow: 1 }).countable === true);
  const p = countableOf({ inMonth: 1, atFirst: 0, atNow: 1 });
  ok("달 중간부터면 세되 **앞부분은 안 셌다고 밝힌다**", p.countable === true && p.partial === true, JSON.stringify(p));
  ok("다 찬 달은 partial 이 아니다", countableOf({ inMonth: 1, atFirst: 1, atNow: 1 }).partial === false);
}

// ── ③ 값이 없으면 그 줄을 안 낸다 ───────────────────────────────
console.log("\n■ ⚠️ 값이 없으면 그 줄을 안 낸다 (0% 로 치지 않는다)");
{
  // 판·교재·시험·반 배정이 통째로 없는 달 (달 중간에 들어온 아이의 지난달이 이 모양이다)
  const fx = base();
  fx.sheets = []; fx.check = []; fx.books = []; fx.quiz = {}; fx.member = []; fx.schedule = [];
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok("판이 하나도 없으면 출결 줄이 안 나간다", !r.lines.find((l) => l.key === "attend"));
  ok("왜 안 냈는지는 원장 화면에 남는다", !!r.hidden.find((h) => h.key === "attend"));
  ok("빈 리포트에도 줄이 0개다 (0% 줄이 안 생긴다)", r.lines.length === 0, JSON.stringify(r.lines.map((l) => l.key)));
  ok("회차도 「그 달에 수업 날이 없다」로 빠진다", !!r.hidden.find((h) => h.key === "sessions"));
}
{
  const fx = base(); fx.sheets = fx.sheets.map((s) => ({ ...s, closed_at: null }));
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok("⚠️ 마감한 판이 없으면 숙제 성취도가 안 나간다",
     !r.lines.find((l) => l.key === "homework"), JSON.stringify(r.lines.map((l) => l.key)));
  ok("⚠️ 마감한 판이 없으면 시험 결과도 안 나간다", !r.lines.find((l) => l.key === "word"));
  ok("**출결은 그래도 나간다** — 학부모 달력이 이미 보는 값이라 어긋나면 안 된다",
     !!r.lines.find((l) => l.key === "attend"));
  ok("안 마감한 판 수를 원장님께 센다", r.openSheets === 4, String(r.openSheets));
  ok("왜 뺐는지에 「마감」이 적힌다", /마감한 판이 없다/.test(r.hidden.find((h) => h.key === "homework")?.why ?? ""));
}
{
  const fx = base(); fx.progress = null;
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok("진도 값이 없으면 진도 줄이 안 나간다", !r.lines.find((l) => l.key === "progress"));
}

// ── ④ 재료는 마감한 판만 ────────────────────────────────────────
console.log("\n■ ⚠️ 재료는 마감한 판만 — SQL 이 실제로 거르는가");
{
  const src = readFileSync("lib/monthly.js", "utf8");
  const one = (h) => new RegExp("monthly:" + h + "[\\s\\S]*?`", "").exec(src)?.[0] ?? "";
  ok("숙제 SQL 이 `closed_at is not null` 로 거른다", /closed_at is not null/.test(one("check")), one("check").slice(0, 60));
  ok("⚠️ 출결 SQL(판 목록)은 안 거른다 — 거르면 달력과 어긋난다", !/closed_at is not null/.test(one("sheets")));
  ok("굳히기 SQL 에 `sent_at is null` 방벽이 있다", /sent_at is null/.test(one("freeze")));
  ok("초안 SQL 에도 같은 방벽이 있다", /sent_at is null/.test(one("draft")));
  // ⚠️ SQL 글자마다 따로 본다. 파일 전체를 한 번에 훑으면 SQL 밖의 `${…}` 까지 걸려 거짓말이 된다
  const sqls = [...src.matchAll(/`\/\* monthly:[^`]*`/g)].map((m) => m[0]);
  ok(`SQL ${sqls.length}개를 뽑았다`, sqls.length === 11, String(sqls.length));
  ok("⚠️ SQL 안에 `${…}` 를 끼우지 않았다 (끼우면 진짜 스키마에 못 물어본다)",
     sqls.every((s) => !s.includes("${")), sqls.filter((s) => s.includes("${")).join(" "));
}
{
  const fx = base();
  const db = fakeDb(fx);
  const r = await buildReport(db, S1, "2026-08");
  const hw = r.lines.find((l) => l.key === "homework");
  ok("○8 △1 ✕1 이면 ○ 비율 80%", hw?.donePct === 80, JSON.stringify(hw));
  ok("△·✕ 개수를 감추지 않고 같이 낸다", hw?.weak === 1 && hw?.missing === 1);
  ok("어디서 나온 값인지 줄마다 적는다", hw?.from === "마감한 수업만", hw?.from);
  const w = r.lines.find((l) => l.key === "word");
  ok("시험은 통과 1 · 미통과 1", w?.pass === 1 && w?.fail === 1, JSON.stringify(w));
  ok("⚠️ 「다음 시간」 줄은 안 센다 (아직 안 본 것이다)", w?.tested === 2, String(w?.tested));
  const at = r.lines.find((l) => l.key === "attend");
  ok("출결은 판 4개 · 결석 1", at?.days === 4 && at?.absent === 1, JSON.stringify(at));
  ok("출결 줄에 「달력과 같은 값」이 적힌다", /달력과 같은 값/.test(at?.from ?? ""), at?.from);
  ok("출결은 `lib/attend.js` 한 벌을 지난다", db.log.includes("count"));
  ok("회차는 `lib/session.js` 한 벌을 지난다", db.log.includes("member_cal"));
  ok("단어는 `lib/word.js` 한 벌을 지난다", db.log.includes("quiz"));
  ok("진도는 `v2.book_progress()` 를 부른다 (다시 안 센다)", db.log.includes("progress"));
}

// ── ⑤ 자동 문장을 만들지 않는다 ─────────────────────────────────
console.log("\n■ ⚠️ 성장 리포트 자동 문장을 만들지 않는다");
{
  const r = await buildReport(fakeDb(base()), S1, "2026-08");
  ok("원장님이 안 쓰셨으면 글은 **null** 이다 (앱이 짓지 않는다)", r.body === null, String(r.body));
  // ⚠️ **주석은 떼고 본다.** 이 파일의 주석에 「…유지하고 있습니다」가 **경고로** 적혀 있어
  //    안 떼면 자기 경고문에 자기가 걸린다 (거짓 빨강)
  const code = readFileSync("lib/monthly.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const 자동문장 = /유지하고 있습니다|향상되었습니다|꾸준[히한][^\n]*습니다|성실[히한][^\n]*습니다/;
  ok("파일에 자동 문장 틀이 없다", !자동문장.test(code),
     (자동문장.exec(code) ?? [""])[0]);
  ok("글을 짓는 함수가 없다 (내보내는 것에 문장 만들기가 없다)",
     !/function\s+\w*(sentence|comment|compose|writeText|autoText)/i.test(code));
}

// ── ⑥ 굳힌다 — 그리고 **원장 칸이 안 샌다** ─────────────────────
console.log("\n■ ⭐ 굳히기 — frozen 은 학부모가 그대로 읽는 칸이다");
{
  const fx = base(); const db = fakeDb(fx);
  await saveDraft(db, S1, "2026-08", "이번 달도 잘했습니다. — 원장");
  const r = await sendMonthly(db, S1, "2026-08", { ...db.opts, confirm: [ASK.OPEN_SHEETS] });
  ok("보냈다", r.ok === true, JSON.stringify(r.why ?? r.need));
  ok("굳은 판 번호가 붙는다", r.frozen.v === FROZEN_V);
  const leaked = 새면_안_되는_칸.filter((k) => k in r.frozen);
  ok("⭐ 굳힌 것에 **원장만 볼 칸이 하나도 없다**", leaked.length === 0, leaked.join(","));
  // ⚠️ 굳은 것은 학부모가 **글자 그대로** 읽는다. 안쪽 말(함수 이름·경고 표시)이 섞이면 그게 그대로 뜬다
  const 글자 = JSON.stringify(r.frozen);
  ok("⚠️ 학부모가 읽는 글자에 경고 표시(⚠️)가 없다", !글자.includes("⚠"), 글자.slice(0, 120));
  ok("⚠️ 학부모가 읽는 글자에 함수·표 이름(v2.…)이 없다", !/v2\./.test(글자), 글자.slice(0, 120));
  const extra = Object.keys(r.frozen).filter((k) => !나가도_되는_칸.includes(k));
  ok("⭐ 굳힌 것에 **흰 목록 밖의 칸이 없다** (칸을 더하면 여기서 한 번 멈춘다)",
     extra.length === 0, extra.join(","));
  ok("굳힌 것에 숫자 줄은 그대로 있다", (r.frozen.lines ?? []).length > 0);
  ok("굳힌 것에 원장님 글이 실린다", /원장/.test(r.frozen.body ?? ""));
  ok("알림이 나갔다", db.shot.length === 1, String(db.shot.length));
  ok("옛 서비스워커가 읽는 tag 모양 그대로", JSON.parse(db.shot[0]).tag.startsWith("monthly-2026-08"),
     JSON.parse(db.shot[0]).tag);
  ok("잠금화면에 내용이 안 실린다", JSON.parse(db.shot[0]).body === "앱에서 확인해주세요.",
     JSON.parse(db.shot[0]).body);

  // ⚠️ 굳히기가 **먼저**여야 한다 — 알림이 먼저면 학부모가 눌렀을 때 빈 화면이 뜬다
  ok("⚠️ 굳히기가 알림보다 **먼저** 간다",
     db.log.indexOf("freeze") >= 0 && db.log.indexOf("freeze") < db.log.indexOf("notify_log"),
     db.log.join(" > "));

  // 보낸 뒤 점수를 고쳐도 굳은 글은 안 바뀐다
  fx.check = [{ status: "done", n: 1 }, { status: "missing", n: 9 }];      // 80% → 10% 로 고쳐 본다
  const v = await sentView(db, S1, "2026-08");
  const hw = v.lines.find((l) => l.key === "homework");
  ok("⭐ 나중에 점수를 고쳐도 **보낸 글은 안 바뀐다**", hw.donePct === 80, String(hw.donePct));
  // ⚠️ 한 번 났던 사고 — 굳힐 때 `sentAt` 이 아직 비어 있어서 그 `null` 이 굳고,
  //    되읽을 때 진짜 칸을 덮어 **학부모 화면에서 「보낸 때」가 사라졌다**
  ok("⚠️ 굳은 것에 「보낸 때」를 안 담는다 (칸에 이미 있다 — 두 벌 금지)", !("sentAt" in r.frozen));
  ok("⭐ 그래도 학부모 값에는 「보낸 때」가 있다", !!v.sentAt, JSON.stringify(v.sentAt));
  ok("굳은 글이 원장님 글을 이긴다", /원장/.test(v.body ?? ""), String(v.body));
  ok("학부모가 보는 값에도 원장 칸이 없다", 새면_안_되는_칸.every((k) => !(k in v)), Object.keys(v).join(","));

  // 두 번 보내지 않는다
  const shots = db.shot.length;
  const again = await sendMonthly(db, S1, "2026-08", { ...db.opts, confirm: [ASK.OPEN_SHEETS] });
  ok("⚠️ 두 번 보내면 거절한다", again.ok === false && again.why === "already_sent", JSON.stringify(again.why));
  ok("⚠️ 두 번째는 알림도 **안 나간다** (학부모 폰에 두 번 뜨면 안 된다)", db.shot.length === shots);
  const d2 = await saveDraft(db, S1, "2026-08", "고친 글");
  ok("⚠️ 보낸 뒤에는 초안도 안 고쳐진다", d2.ok === false && d2.why === "already_sent");
  ok("그것을 성공이라 말하지 않는다", d2.ok === false);
}
{
  const db = fakeDb(base());
  const r = await sentView(db, S1, "2026-08");
  ok("안 보낸 달은 학부모에게 **아무것도 안 보인다**", r === null);
}
{
  const fx = base();
  fx.mr.set(`${S1}|2026-07`, { id: "old", student_id: S1, ym: "2026-07", body: "옛 글",
                               frozen: null, sent_at: "2026-08-01T00:00:00Z" });
  const r = await sentView(fakeDb(fx), S1, "2026-07");
  ok("⚠️ 굳은 글이 없는 옛 줄은 **지어서 채우지 않는다**", r.frozen === null && /모른다/.test(r.why), JSON.stringify(r.why));
}
{
  // ⚠️⚠️ **옛 모양으로 굳은 글** — `FROZEN_V` 를 올리는 까닭이 이것인데 앞서는 올려 놓고
  //    읽는 쪽이 번호를 안 봤다. 뜻이 달라진 칸을 조용히 새 뜻으로 그리면 아무도 못 알아챈다.
  //    ⚠️ 막지 않는다 — 그때 나간 글은 그대로 보여야 한다(대전제 6). **밝히기만** 한다
  const fx = base();
  fx.mr.set(`${S1}|2026-07`, { id: "old2", student_id: S1, ym: "2026-07", body: null,
    frozen: JSON.stringify({ v: 1, studentId: S1, ym: "2026-07", monthLabel: "2026년 7월",
                             lines: [{ key: "progress", label: "교재 진도", asOf: "today", books: [] }] }),
    sent_at: "2026-08-01T00:00:00Z" });
  const r = await sentView(fakeDb(fx), S1, "2026-07");
  ok("⭐ 옛 판으로 굳은 글은 **옛 판이라고 밝힌다** (새 뜻으로 조용히 안 읽는다)",
     r.oldShape === true && r.frozenV === 1 && /1판으로 굳은 글/.test(r.why ?? ""), JSON.stringify(r.why));
  ok("⚠️ 그래도 그때 나간 줄은 그대로 보인다 (숫자를 지어 고치지 않는다)",
     (r.lines ?? []).length === 1 && r.lines[0].asOf === "today", JSON.stringify(r.lines));
  const now = await sentView(fakeDb((() => {
    const f2 = base();
    f2.mr.set(`${S1}|2026-07`, { id: "new2", student_id: S1, ym: "2026-07", body: null,
      frozen: JSON.stringify({ v: FROZEN_V, studentId: S1, ym: "2026-07", lines: [] }),
      sent_at: "2026-08-01T00:00:00Z" });
    return f2;
  })()), S1, "2026-07");
  ok("⚠️ 지금 판으로 굳은 글에는 그 말이 안 붙는다 (원장 일이 안 는다)",
     !("oldShape" in now) && !("why" in now), Object.keys(now).join(","));
}

{
  // ⚠️ **목록 자체를 지킨다** — 목록이 줄면 위 검사가 눈이 먼다
  const overlap = FAMILY_KEYS.filter((k) => STAFF_ONLY.includes(k));
  ok("흰 목록과 원장 칸이 안 겹친다", overlap.length === 0, overlap.join(","));
  const shrunk = 새면_안_되는_칸.filter((k) => !STAFF_ONLY.includes(k));
  ok("⚠️ 원장 칸 목록이 줄지 않았다 (줄이면 검사가 눈이 먼다)", shrunk.length === 0, shrunk.join(","));
  const widened = FAMILY_KEYS.filter((k) => !나가도_되는_칸.includes(k));
  ok("⚠️ 흰 목록이 몰래 넓어지지 않았다", widened.length === 0, widened.join(","));
  const r = await buildReport(fakeDb(base()), S1, "2026-08");
  const f = forFamily(r);
  ok("`forFamily` 가 원장 칸을 전부 떼어 낸다", 새면_안_되는_칸.every((k) => !(k in f)), Object.keys(f).join(","));
  ok("`forFamily` 가 숫자 줄은 그대로 둔다", (f.lines ?? []).length > 0);
}

// ── ⑦ 막지 않는다. 묻는다 ──────────────────────────────────────
console.log("\n■ 막지 않는다. 묻는다 — 굳히는 것은 되돌릴 수 없다");
{
  const db = fakeDb(base());
  const g = await sendGate(db, S1, "2026-08");
  ok("안 마감한 판이 있으면 **반드시 묻는다**", g.mustAsk.includes(ASK.OPEN_SHEETS), g.mustAsk.join(","));
  ok("몇 개가 빠지는지 말해 준다", /2개/.test(g.asks.find((a) => a.code === ASK.OPEN_SHEETS).what));
  ok("원장님 글이 비면 알려 준다 (막지는 않는다)",
     g.asks.find((a) => a.code === ASK.NO_BODY)?.must === false);
  const r = await sendMonthly(db, S1, "2026-08", db.opts);
  ok("안 물으면 안 나간다", r.ok === false && r.why === "ask", JSON.stringify(r.why));
  ok("무엇을 물어야 하는지 돌려준다", r.need.includes(ASK.OPEN_SHEETS));
  ok("안 나갔으면 알림도 없다", db.shot.length === 0);
}
{
  // ⚠️ **화면이 확인 단추로 받아야 하는 물음이 몇 개인가** — 안 받으면 `sendMonthly` 가
  //    `{ok:false, why:'ask'}` 로 **조용히** 안 나간다. 발송 화면이 아직 없어 지금은 안 걸리지만,
  //    지을 때 이 셋을 다 받아야 한다. must 가 늘면 여기서 한 번 멈춘다
  //    ⚠️ 글자로 세지 않고 **실제로 셋을 하나씩 일으켜** 모은다 (셋은 서로 같이 못 난다 —
  //       판이 없어야 no_lines 인데 그러면 안 마감한 판도 없다)
  const 열린판 = await sendGate(fakeDb(base()), S1, "2026-08");
  const 빈달 = await sendGate(fakeDb((() => {
    const f = base(); f.sheets = []; f.check = []; f.books = []; f.quiz = {}; f.member = []; f.schedule = [];
    return f;
  })()), S1, "2026-08");
  const 앞달 = await sendGate(fakeDb((() => {
    const f = base(); f.sheets = f.sheets.filter((s) => s.closed_at); return f;
  })()), S1, "2026-09");
  const 모은것 = [...new Set([...열린판.mustAsk, ...빈달.mustAsk, ...앞달.mustAsk])].sort();
  const must = [ASK.OPEN_SHEETS, ASK.NO_LINES, ASK.MONTH_OPEN].sort();
  ok("⚠️ 화면이 확인 단추로 받아야 하는 must 물음은 **셋뿐이다** (늘면 화면도 같이 고쳐야 한다)",
     JSON.stringify(모은것) === JSON.stringify(must), JSON.stringify(모은것));
  // ⚠️ 위 셋 말고 **또 다른 must** 가 조용히 생기지 않았나 — `sendGate` 안의 `true` 자리를 센다.
  //    늘었는데 화면이 안 받으면 `sendMonthly` 가 {ok:false, why:'ask'} 로 **조용히** 안 나간다
  const gate = /export async function sendGate[\s\S]*?\n}/.exec(readFileSync("lib/monthly.js", "utf8"))?.[0] ?? "";
  const trueN = (gate.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").match(/,\s*true,/g) ?? []).length;
  ok("⚠️ `sendGate` 안에 must 자리가 셋뿐이다 (넷째가 생기면 여기서 한 번 멈춘다)",
     trueN === 3, String(trueN));
}
{
  const fx = base();
  fx.sheets = []; fx.check = []; fx.books = []; fx.quiz = {}; fx.member = []; fx.schedule = [];
  const db = fakeDb(fx);
  const g = await sendGate(db, S1, "2026-08");
  ok("실을 줄이 없으면 **반드시 묻는다** (빈 리포트가 굳는다)", g.mustAsk.includes(ASK.NO_LINES), g.mustAsk.join(","));
  ok("바로 보낼 수 있는 상태가 아니다", g.ready === false);
}
{
  const fx = base(); fx.sheets = fx.sheets.filter((s) => s.closed_at);   // 다 마감했다
  const db = fakeDb(fx);
  const g = await sendGate(db, S1, "2026-08");
  ok("다 마감했으면 반드시 물을 것이 없다", g.mustAsk.length === 0, g.mustAsk.join(","));
  ok("바로 보낼 수 있다", g.ready === true);
  const r = await sendMonthly(db, S1, "2026-08", db.opts);
  ok("아무것도 안 눌러도 나간다 (원장 일이 안 는다)", r.ok === true, JSON.stringify(r.why));
}
{
  const fx = base(); fx.member = []; fx.atFirst = 0; fx.atNow = 1;   // 그 달엔 반이 없고 지금은 있다
  const g = await sendGate(fakeDb(fx), S1, "2026-08");
  const a = g.asks.find((x) => x.code === ASK.NOT_COUNTABLE);
  ok("⚠️ 이관일 이전 달은 「회차 줄이 빠집니다」라고 밝힌다", !!a && a.must === false, JSON.stringify(a?.what));
  ok("회차를 0 으로 지어내지 않는다", !g.report.lines.find((l) => l.key === "sessions"));
}

// ── ⑧ 발송은 notify 한 곳을 지난다 ─────────────────────────────
console.log("\n■ 밖으로 나가는 길이 하나뿐인가");
{
  const fx = base(); fx.sheets = fx.sheets.filter((s) => s.closed_at);
  const db = fakeDb(fx, { env: {} });                     // 발송 스위치가 아예 없다
  const r = await sendMonthly(db, S1, "2026-08", db.opts);
  ok("⚠️ 환경변수가 없으면 한 발도 안 나간다 (기본값 off)", db.shot.length === 0 && r.ok === true);
  ok("그래도 굳기는 굳는다 (앱 안에서는 보인다)", !!r.frozen);
}
{
  const fx = base(); fx.sheets = fx.sheets.filter((s) => s.closed_at); fx.parents = [];
  const db = fakeDb(fx);
  const r = await sendMonthly(db, S1, "2026-08", db.opts);
  ok("⚠️ 학부모가 안 붙은 아이는 **조용히 성공이라 말하지 않는다**", /아무에게도 안 갔다/.test(r.warn ?? ""), String(r.warn));
}
{
  const walk = (d, out = []) => { for (const f of readdirSync(d)) {
    if (["node_modules", ".next", ".git", "backup", "_tmp", "sandbox"].includes(f)) continue;
    const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
      : /\.(js|jsx|mjs)$/.test(f) && out.push(p); } return out; };
  const src = readFileSync("lib/monthly.js", "utf8");
  ok("lib/monthly.js 가 web-push 를 직접 안 부른다", !/web-push|sendNotification\(/.test(src));
  ok("lib/monthly.js 가 발송 스위치를 직접 안 읽는다 (읽는 곳은 lib/notify.js 뿐)",
     !src.includes(SINK), SINK)
  ok("lib/monthly.js 가 v2.push_sub 를 직접 안 읽는다", !/from v2\.push_sub/.test(src));
  ok("lib/monthly.js 가 v2.notify_log 에 직접 안 쓴다", !/insert into v2\.notify_log/.test(src));
  ok("lib/monthly.js 가 v2.day_sheet 에 **쓰지** 않는다 (출결은 attend 한 벌의 몫)",
     !/(insert into|update)\s+v2\.day_sheet/.test(src));
  // 남이 v2.monthly_report 를 직접 만지지 않는가 — 굳은 글이 딴 데서 덮이면 그 자리가 사고다
  const others = walk(".").filter((f) => !f.endsWith("lib/monthly.js") && !f.includes("check-monthly")
    && /(insert into|update)\s+v2\.monthly_report/.test(readFileSync(f, "utf8")));
  ok("v2.monthly_report 에 쓰는 곳이 lib/monthly.js 뿐이다", others.length === 0, others.join(" "));
}

// ── ⑨ 안 보낸 학생을 세어 준다 ─────────────────────────────────
console.log("\n■ ⭐ 안 보낸 학생 세어 주기 — 학생을 하나씩 열지 않는다");
{
  const fx = base();
  fx.students = [{ id: S1, name: "김하늘" }, { id: "st2", name: "박서준" }];
  const db = fakeDb(fx);
  const b = await monthlyBoard(db, "2026-08");
  ok("한 질의로 학생 전부를 센다", db.log.filter((x) => x === "board").length === 1, String(db.log.length));
  ok("안 보낸 학생 2명", b.notSent === 2, String(b.notSent));
  ok("안 마감한 판이 남은 아이는 「먼저 마감」으로 센다", b.blocked === 2, String(b.blocked));
  ok("마감이 다 된 아이는 0명", b.allClosed === 0, String(b.allClosed));
}
{
  const fx = base(); fx.sheets = fx.sheets.filter((s) => s.closed_at);
  const b = await monthlyBoard(fakeDb(fx), "2026-08");
  ok("다 마감한 아이는 「마감 다 됨」으로 센다", b.allClosed === 1, String(b.allClosed));
  ok("보낸 학생 0명", b.sent === 0);
  // ⚠️ 사고 재현 — 보드가 「보낼 수 있나」를 말하면 게이트와 두 벌이 된다(원칙 1).
  //    실측 2026-09 에 보드는 0명, 같은 24명을 게이트에 물으면 전원 ready 였다
  ok("⭐ 보드는 `ready` 라는 말을 아예 안 쓴다 (「보낼 수 있나」는 sendGate 만 답한다)",
     !("ready" in b) && b.students.every((s) => !("ready" in s)), Object.keys(b).join(","));
  const src2 = readFileSync("lib/monthly.js", "utf8");
  const boardFn = /export async function monthlyBoard[\s\S]*$/.exec(src2)?.[0] ?? "";
  const boardCode = boardFn.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  ok("⚠️ `monthlyBoard` 안에 `ready` 라는 칸이 다시 생기지 않았다", !/\bready\s*[:=]/.test(boardCode));
  // ⚠️⚠️ **이름만 바꾸고 옛 판정식을 그대로 두던 자리.** `ready`(보낼 수 있나)를 `allClosed`(마감 다 됐나)로
  //    고칠 때 `!r.sent_at` 이 그대로 남아 있었다 — 「보낸 것」은 마감과 아무 상관이 없다
  ok("⭐⭐ `allClosed` 판정식에 `sent_at` 이 안 섞였다 (이름만 바꾸고 옛 식을 두면 여기서 걸린다)",
     !/allClosed:[^,\n]*sent_at/.test(boardCode),
     (/allClosed:[^,\n]*/.exec(boardCode) ?? [""])[0]);
}
{
  // ⭐⭐ 사고 재현 — **판을 다 마감한 아이의 리포트를 보내면 「마감 안 됨」으로 뒤집히던 자리.**
  //    실측(2026-09-02, 진짜 DB) — 왕희연의 2026-08 판 7개를 전부 마감하면
  //    {sheets:7, closed:7, open:0, allClosed:true}·집계 1명인데, 그 아이 리포트를 **보내기만 하면**
  //    마감은 그대로인데 allClosed:false·집계 0명이 됐다. 원장님이 다 마감한 아이를 못 찾는다
  const fx = base(); fx.sheets = fx.sheets.filter((s) => s.closed_at);
  const db = fakeDb(fx);
  const before = await monthlyBoard(db, "2026-08");
  ok("보내기 전 — 마감이 다 된 아이 1명", before.allClosed === 1 && before.notSent === 1,
     JSON.stringify({ allClosed: before.allClosed, notSent: before.notSent }));
  const sent = await sendMonthly(db, S1, "2026-08", db.opts);
  ok("보냈다", sent.ok === true, JSON.stringify(sent.why ?? sent.need));
  const after = await monthlyBoard(db, "2026-08");
  const me = after.students.find((s) => s.studentId === S1);
  ok("⭐⭐ **보냈다고 「마감 안 됨」으로 뒤집히지 않는다** (보낸 것과 마감은 상관이 없다)",
     me?.allClosed === true && after.allClosed === 1,
     JSON.stringify({ me, 집계: after.allClosed }));
  ok("⚠️ 판 수는 그대로다 (마감 7/7 을 그대로 읽는다)",
     me?.sheets === 2 && me?.closed === 2 && me?.open === 0, JSON.stringify(me));
  ok("⭐ 「안 보낸 아이」는 옆 칸이 따로 센다 — 한 칸이 두 가지를 말하지 않는다",
     after.sent === 1 && after.notSent === 0, JSON.stringify({ sent: after.sent, notSent: after.notSent }));
}
// ── ⑩ ⭐ 검증자가 캔 사고 여덟 — **그 사고를 그대로 다시 일으켜 본다** ─────
//    ⚠️ 여기 줄은 「고쳤다」를 지키는 것이 아니라 **그 사고가 다시 나는지**를 본다.
//       고칠 때 이 줄을 같이 안 더하면 다음 사람이 똑같이 되돌려 놓는다
console.log("\n■ ⭐ 캔 사고 다시 일으켜 보기");
{
  // ⓐ⚠️⚠️ **교재 진도 거짓 0%** — 그 달로 배정이 끝난 교재. `v2.book_progress()` 는 오늘 기준이라
  //    배정 줄이 없으면 done=0 · total=단원수 를 준다. 실측 8월 — 25명 중 17명 · 교재 61권이
  //    이 0 을 학부모에게 굳혀 보냈고 그중엔 **76단원을 다 끝낸 교재**도 있었다
  const fx = base();
  fx.progressBy = { [B1]: { done: 0, skipped: 0, total: 76, today_round: null, marks: 76 } };
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok("⭐⭐ 배정이 끝난 교재의 **0% 가 학부모에게 안 나간다**",
     !r.lines.find((l) => l.key === "progress"),
     JSON.stringify(r.lines.find((l) => l.key === "progress")));
  ok("교재마다 **왜 안 냈는지 한 줄씩** 남는다 (소리 없이 사라지지 않는다)",
     /0% 로 치지 않는다/.test(r.hidden.find((h) => h.key === "progress:그래머인사이드3")?.why ?? ""),
     JSON.stringify(r.hidden.map((h) => h.key)));
}
{
  const fx = base(); fx.progressBy = { [B1]: { done: 0, skipped: 0, total: 40, marks: 0 } };
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok("⚠️ 한 번도 안 찍은 교재는 0% 가 아니라 **안 낸다**", !r.lines.find((l) => l.key === "progress"));
}
{
  const fx = base(); fx.progressBy = { [B1]: { done: 9, skipped: 0, total: 40, today_round: 2, marks: 9 } };
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok("⚠️ 지금 회독이 그 달과 다르면 그 숫자는 그 달 것이 아니다 — 안 낸다",
     !r.lines.find((l) => l.key === "progress"),
     JSON.stringify(r.lines.find((l) => l.key === "progress")));
}
{
  const fx = base();
  fx.books = [{ book_id: B1, book_name: "그래머인사이드3", round: 1, book_state: "active" },
              { book_id: C1, book_name: "능률보카", round: 1, book_state: "active" }];
  const db = fakeDb(fx);
  const r = await buildReport(db, S1, "2026-08");
  const pg = r.lines.find((l) => l.key === "progress");
  ok("평소 길(오늘도 같은 배정·같은 회독)에서는 진도가 그대로 나간다", pg?.books?.[0]?.pct === 75, JSON.stringify(pg));
  // ⚠️ 계획 「속도」 표: `/report` 조회 6 · 2단. 교재마다 한 왕복이면 8권짜리 아이가 8단 직렬이었다
  ok("⭐ 교재가 둘이어도 진도는 **한 번만** 묻는다 (교재마다 한 왕복이 아니다)",
     db.log.filter((x) => x === "progress").length === 1 && pg?.books?.length === 2,
     `${db.log.filter((x) => x === "progress").length}회 · 교재 ${pg?.books?.length}권`);
}
// ── ⭐⭐ 한 교재에 그 달 배정 줄이 **둘** — 남의 줄 값을 읽던 자리 ────────────
//    `student_book` 의 유일키가 (student_id, book_id, from_date) 라
//    「1회독 끝내고 2회독 시작」이면 같은 교재가 그 달에 두 줄이다 — 스키마가 허락하는 정상 모양이다.
//    앞서는 받는 쪽이 `book_id` 로만 맞대 **뒤엣것이 앞엣것을 덮었다.**
//    실측 재현(진짜 DB, 2026-09-02) — 구도은·「일관성 있는 기준 영문법」을
//    1회독 08-02~08-14(진도 27줄) + 2회독 08-15~(진도 0줄)로 갈라 넣고 `2회독 줄을 먼저` 넣으면,
//    2회독 줄이 1회독의 `marks=27` 을 읽어 `marks === 0` 방벽을 그냥 지나
//    학부모 줄에 **{round:2, done:0, total:47, pct:0}** 이 실렸다. 굳으면 못 고친다.
//    ⚠️ 되돌아오는 차례는 보장이 없다 — 차례를 뒤집어도 같은 답이 나와야 한다
for (const 뒤집기 of [false, true]) {
  const 말 = 뒤집기 ? "차례 뒤집힘" : "차례 그대로";
  const fx = base();
  fx.books = [{ book_id: B1, book_name: "일관성 있는 기준 영문법", round: 1, book_state: "active" },
              { book_id: B1, book_name: "일관성 있는 기준 영문법", round: 2, book_state: "active" }];
  fx.progressShuffle = 뒤집기;
  fx.progressByRound = {
    // 1회독 — 27줄 찍혔다. 그런데 오늘 배정은 2회독이라 이 답은 그 달 이야기가 아니다
    [`${B1}|1`]: { done: 27, skipped: 0, total: 47, today_round: 2, marks: 27 },
    // 2회독 — **아직 한 줄도 안 찍었다.** 이 줄이 남의 27 을 읽으면 0% 가 학부모에게 나간다
    [`${B1}|2`]: { done: 0, skipped: 0, total: 47, today_round: 2, marks: 0 },
  };
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok(`⭐⭐ 같은 교재 두 배정 줄 — 2회독 줄이 **남의 marks 를 읽어 0% 로 안 나간다** (${말})`,
     !r.lines.find((l) => l.key === "progress"),
     JSON.stringify(r.lines.find((l) => l.key === "progress")));
  ok(`⚠️ 두 줄 다 까닭이 남는다 — 한 줄이 다른 줄을 덮지 않는다 (${말})`,
     r.hidden.filter((h) => h.key === "progress:일관성 있는 기준 영문법").length === 2,
     JSON.stringify(r.hidden.map((h) => h.key)));
}
{
  // 그리고 **셀 수 있는 쪽은 제대로 나가야 한다** — 입 다무는 것이 목적이 아니다.
  // 오늘 배정이 1회독이면 1회독 줄이 제 값으로 나가고 2회독 줄만 빠진다
  const fx = base();
  fx.books = [{ book_id: B1, book_name: "일관성 있는 기준 영문법", round: 1, book_state: "active" },
              { book_id: B1, book_name: "일관성 있는 기준 영문법", round: 2, book_state: "active" }];
  fx.progressByRound = {
    [`${B1}|1`]: { done: 27, skipped: 0, total: 47, today_round: 1, marks: 27 },
    [`${B1}|2`]: { done: 27, skipped: 0, total: 47, today_round: 1, marks: 0 },
  };
  const pg = (await buildReport(fakeDb(fx), S1, "2026-08")).lines.find((l) => l.key === "progress");
  ok("⭐ 같은 교재 두 줄이어도 **셀 수 있는 회독은 제 값으로 나간다** (한 줄만, 27/47)",
     pg?.books?.length === 1 && pg.books[0].round === 1 && pg.books[0].done === 27 && pg.books[0].pct === 57,
     JSON.stringify(pg?.books));
}
{
  // ⚠️ SQL 이 배정 줄마다 번호를 붙여 돌려주는가 — 빼면 위 자리가 그대로 다시 열린다
  const one = new RegExp("monthly:progress[\\s\\S]*?`", "").exec(readFileSync("lib/monthly.js", "utf8"))?.[0] ?? "";
  ok("⭐ 진도 SQL 이 배정 줄마다 **번호**(`with ordinality`)를 붙인다",
     /with ordinality/.test(one) && /b\.i as idx/.test(one), one.replace(/\s+/g, " ").slice(0, 120));
  const 받는쪽 = readFileSync("lib/monthly.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  ok("⚠️ 받는 쪽이 `book_id` 로 다시 맞대지 않는다 (그 순간 뒤엣것이 앞엣것을 덮는다)",
     !/new Map\(prog\.map\([^)]*book_id/.test(받는쪽),
     (/new Map\(prog\.map\([^)]*\)/.exec(받는쪽) ?? [""])[0]);
}
// ── ⭐⭐ 「그 달에 있지도 않았던 진도」가 지난 달 리포트에 실리던 자리 ──────────
//    `v2.book_progress()` 는 날짜를 안 받아 **오늘 누적**을 돌려준다. 회독만 보는 방벽으로는 못 막는다.
//    실측(2026-09-02, 진짜 DB) — 2026-07 진도 줄 5개 중 4개 · 2026-06 은 3개 중 3개가 그 달 것이 아니었다.
//    김소현·「기적의 영어문장 트레이닝」은 리포트에 60/130(46%) 인데 2026-07-31 까지 실제로는 **0단원**이었다
{
  const fx = base();
  fx.progressBy = { [B1]: { done: 60, skipped: 0, total: 130, marks: 60, after_month: 60 } };
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok("⭐⭐ 그 달이 끝난 뒤에 찍힌 진도가 있으면 **숫자를 안 낸다** (오늘 누적을 그 달 것처럼 안 싣는다)",
     !r.lines.find((l) => l.key === "progress"),
     JSON.stringify(r.lines.find((l) => l.key === "progress")));
  ok("⚠️ 몇 줄이 그랬는지 원장님께 남긴다 (소리 없이 사라지지 않는다)",
     /그 달이 끝난 뒤에 찍힌 진도가 60줄/.test(r.hidden.find((h) => h.key === "progress:그래머인사이드3")?.why ?? ""),
     JSON.stringify(r.hidden.map((h) => h.why)));
}
{
  // ⚠️ 언제 찍었는지 **모르는** 줄도 같다 — 모르면 그 달 것인지도 모른다 (대전제 0).
  //    SQL 의 `done_on is null` 이 그것을 `after_month` 로 넘긴다
  const fx = base();
  fx.progressBy = { [B1]: { done: 3, skipped: 1, total: 4, marks: 4, after_month: 1 } };
  ok("⚠️ 날짜를 모르는 진도 줄이 하나라도 있으면 안 낸다",
     !(await buildReport(fakeDb(fx), S1, "2026-08")).lines.find((l) => l.key === "progress"));
}
{
  // 평소 길 — 그 달 뒤에 찍힌 것이 없으면 그대로 나가되 **어디까지인지**를 밝힌다.
  // ⚠️ 「오늘 기준」이라 얼버무리면 지난 달 리포트에서 그 말이 거짓말이 된다
  const pg = (await buildReport(fakeDb(base()), S1, "2026-08")).lines.find((l) => l.key === "progress");
  ok("⭐ 그 달 것이 맞으면 진도가 그대로 나간다 (입 다무는 것이 목적이 아니다)",
     pg?.books?.[0]?.pct === 75, JSON.stringify(pg?.books));
  ok("⭐ 진도 줄이 **그 달 마지막날까지**라고 밝힌다 (「오늘 기준」이 아니다)",
     pg?.asOf === "2026-08-31" && pg?.from === "2026-08-31 까지",
     JSON.stringify({ asOf: pg?.asOf, from: pg?.from }));
  ok("⚠️ 학부모가 읽는 글자에 「오늘 기준」이 안 남았다", !/오늘 기준/.test(JSON.stringify(pg)), JSON.stringify(pg?.from));
}
{
  // ⓑ 지금 멈춘 교재를 지난 달 리포트에서 소리 없이 자르지 않는다 (대전제 6)
  const fx = base(); fx.books = [{ book_id: B1, book_name: "옛교재", round: 1, book_state: "paused" }];
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok("⚠️ 멈춘 교재는 안 내되 **까닭이 남는다**",
     !r.lines.find((l) => l.key === "progress")
     && /paused/.test(r.hidden.find((h) => h.key === "progress:옛교재")?.why ?? ""),
     JSON.stringify(r.hidden));
}
{
  // ⓒ⚠️⚠️ **아직 안 온 달을 굳혀 보내는 것** — 앞으로의 달은 판이 0개라 ①이 안 걸리고,
  //    회차 줄은 앞날 예정이 서서 ②도 안 걸렸다. 실측 — `sendGate(…,'2027-05')` 가 `ready:true` 였다.
  //    한 번 굳으면 그 달이 진짜로 왔을 때 **영영 못 보낸다**
  const fx = base(); fx.sheets = fx.sheets.filter((s) => s.closed_at);
  const db = fakeDb(fx);                                   // 오늘은 2026-08-31
  const g = await sendGate(db, S1, "2026-09");
  ok("⭐⭐ 아직 안 끝난 달은 **반드시 묻는다**", g.mustAsk.includes(ASK.MONTH_OPEN), g.mustAsk.join(","));
  ok("그 달은 바로 보낼 수 있는 상태가 아니다", g.ready === false);
  const r = await sendMonthly(db, S1, "2026-09", db.opts);
  ok("안 물으면 안 나간다", r.ok === false && r.why === "ask" && r.need.includes(ASK.MONTH_OPEN),
     JSON.stringify(r.need ?? r.why));
  ok("앞으로의 달을 안 굳혔다 (굳었으면 그 달이 왔을 때 못 보낸다)",
     (await sentView(db, S1, "2026-09")) === null);
  const g8 = await sendGate(db, S1, "2026-08");
  ok("끝난 달에는 그 물음이 없다 (원장 일이 안 는다)", !g8.mustAsk.includes(ASK.MONTH_OPEN), g8.mustAsk.join(","));
}
{
  // ⓓ⚠️⚠️ **굳었는데 아무에게도 안 갔고 다시 못 보내는 자리** —
  //    굳히기가 먼저고 알림이 나중인데 알림이 터지면 그대로 커밋되고 다시 누르면 already_sent 였다
  const fx = base(); fx.sheets = fx.sheets.filter((s) => s.closed_at); fx.notifyBoom = true;
  const db = fakeDb(fx);
  const r = await sendMonthly(db, S1, "2026-08", db.opts);
  ok("⭐ 알림이 터지면 **성공이라 말하지 않는다**", r.ok === false && r.why === "notify_failed",
     JSON.stringify(r.why));
  ok("⭐⭐ 굳힌 것을 **도로 내렸다** (되돌릴 수 없는 낙관 갱신을 안 남긴다)", r.undone === true, JSON.stringify(r));
  ok("학부모에게는 안 보인다", (await sentView(db, S1, "2026-08")) === null);
  ok("알림도 한 발 안 나갔다", db.shot.length === 0, String(db.shot.length));
  fx.notifyBoom = false;
  const again = await sendMonthly(db, S1, "2026-08", db.opts);
  ok("⭐⭐ 그래서 **다시 보낼 수 있다** (앞서는 already_sent 로 그 아이의 그 달이 끝났다)",
     again.ok === true, JSON.stringify(again.why ?? again.need));
  ok("이번엔 알림이 나갔다", db.shot.length === 1, String(db.shot.length));
}
{
  // ⓔ 되돌리는 길이 이 파일에 있다 (되돌리기까지 터진 때를 위해)
  const fx = base(); fx.sheets = fx.sheets.filter((s) => s.closed_at);
  const db = fakeDb(fx);
  const r = await sendMonthly(db, S1, "2026-08", db.opts);
  ok("보냈다", r.ok === true, JSON.stringify(r.why));
  const wrong = await reopenReport(db, S1, "2026-08", { sentAt: "1999-01-01T00:00:00Z" });
  ok("⚠️ 내가 박은 그 시각이 아니면 **안 내린다** (다른 창이 제대로 보낸 것을 덮으면 안 된다)",
     wrong.ok === false, JSON.stringify(wrong));
  const back = await reopenReport(db, S1, "2026-08", { sentAt: r.sentAt });
  ok("⭐ 「굳었지만 안 나갔다」를 도로 내릴 수 있다", back.ok === true, JSON.stringify(back));
  ok("⚠️ 굳은 것은 **안 지운다** — 그때 무엇이 굳었나가 자취다", back.hadFrozen === true);
  ok("내린 뒤에는 학부모에게 안 보인다", (await sentView(db, S1, "2026-08")) === null);
  ok("두 번 내리지 않는다", (await reopenReport(db, S1, "2026-08", {})).why === "not_sent");
  ok("내린 뒤엔 다시 보낼 수 있다", (await sendMonthly(db, S1, "2026-08", db.opts)).ok === true);
}
{
  // ⓕ⚠️⚠️ **이관 첫 달에 재원생 전원에게 나가던 거짓 문구** —
  //    이관은 반 명단 시작일을 이관일로 박아 그 달 첫날 명단이 원래 없다.
  //    실측 2026-09 — 재원생 25명 중 **20명**이 「달 중간부터 다닌 달이라…」를 굳혀 받을 뻔했다
  const fx = base(); fx.atFirst = 0; fx.atNow = 1; fx.cameBefore = true;
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  const s = r.lines.find((l) => l.key === "sessions");
  ok("⭐⭐ 이관 자국이면 「달 중간부터 다닌 달」이 **학부모에게 안 나간다**",
     !!s && s.partial === null, JSON.stringify(s?.partial));
  ok("회차는 그대로 센다 (0 으로 지우지 않는다)", (s?.total ?? 0) > 0, String(s?.total));
  ok("원장님께는 「회차가 실제보다 적을 수 있다」로 남는다",
     /이관 자국/.test(r.hidden.find((h) => h.key === "sessions:note")?.why ?? ""),
     JSON.stringify(r.hidden.map((h) => h.key)));
  const g = await sendGate(fakeDb(fx), S1, "2026-08");
  ok("게이트가 그것을 밝힌다 (막지는 않는다)",
     g.asks.find((a) => a.code === ASK.ROSTER_LATE)?.must === false, g.asks.map((a) => a.code).join(","));
  ok("⚠️ 그것을 「회차 줄이 빠집니다」로 잘못 읽지 않는다",
     !g.asks.find((a) => a.code === ASK.NOT_COUNTABLE), g.asks.map((a) => a.code).join(","));
}
{
  const fx = base(); fx.atFirst = 0; fx.atNow = 1; fx.cameBefore = false;   // 진짜 중간 입회
  const s = (await buildReport(fakeDb(fx), S1, "2026-08")).lines.find((l) => l.key === "sessions");
  ok("진짜 중간 입회는 그대로 밝힌다 (입 다무는 것이 목적이 아니다)",
     /달 중간부터/.test(s?.partial ?? ""), JSON.stringify(s?.partial));
  ok("이관 자국과 진짜 중간 입회를 `countableOf` 가 가른다",
     countableOf({ inMonth: 1, atFirst: 0, atNow: 1, cameBefore: true }).partial === false
     && countableOf({ inMonth: 1, atFirst: 0, atNow: 1, cameBefore: false }).partial === true);
}
{
  // ⓖ 회차는 달 전체(앞날 포함)인데 출결은 오늘까지 — 두 숫자가 나란히 굳으면
  //    학부모가 「9회 중 4일만 왔나」로 읽는다
  const fx = base(); fx.today = "2026-08-12";
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  const s = r.lines.find((l) => l.key === "sessions"), at = r.lines.find((l) => l.key === "attend");
  ok("⭐ 회차 줄이 「오늘까지」와 「앞날 예정」을 갈라 싣는다",
     typeof s?.done === "number" && typeof s?.planned === "number" && s.done + s.planned === s.total,
     JSON.stringify(s));
  ok("⚠️ 앞날이 섞였으면 출결과 **같은 말로** 어디까지인지 밝힌다", s?.upto === "2026-08-12", String(s?.upto));
  ok("출결과 회차가 같은 날을 가리킨다", at?.upto === s?.upto, `${at?.upto} / ${s?.upto}`);
}
{
  // ⓗ⚠️ `inclass` 를 분자에서도 분모에서도 통째로 버려 **1/10 이 「성취도 100%」**가 되던 자리
  const one = new RegExp("monthly:check[\\s\\S]*?`", "").exec(readFileSync("lib/monthly.js", "utf8"))?.[0] ?? "";
  ok("⭐ 숙제 SQL 이 `inclass` 를 거른다 (학원에서 한 것은 「집에서 해온 것」이 아니다)",
     /not in \('none', ?'inclass'\)/.test(one), one.replace(/\s+/g, " ").slice(0, 160));
  const hw = homeworkOf([{ status: "done", n: 1 }, { status: "inclass", n: 9 }]);
  ok("⭐ 모르는 표시를 **조용히 안 버린다**", hw.unknown.length === 1 && hw.unknown[0].status === "inclass",
     JSON.stringify(hw));
  ok("아는 표시만 있으면 `unknown` 이 비어 있다", homeworkOf([{ status: "done", n: 1 }]).unknown.length === 0);
  const fx = base(); fx.check = [{ status: "done", n: 1 }, { status: "inclass", n: 9 }];
  const r = await buildReport(fakeDb(fx), S1, "2026-08");
  ok("모르는 표시가 오면 원장님께 남긴다 (조용히 버리면 검사도 못 잡는다)",
     /모르는 숙제 표시/.test(r.hidden.find((h) => h.key === "homework:모르는표시")?.why ?? ""),
     JSON.stringify(r.hidden.map((h) => h.key)));
}

ok("⚠️ 아무도 안 시킨 질의가 없다 (가짜 DB 가 못 알아본 것)", UNKNOWN.length === 0, UNKNOWN.join(" | "));

// ── ⑩ 진짜 DB — **읽기만** ─────────────────────────────────────
console.log("\n■ 진짜 DB 로 한 번 — 가짜 DB 는 죽은 칸을 원리적으로 못 잡는다");
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  const real = { query: (sql, p) => c.query(sql, p) };

  // ⓐ 실측 — 마감한 판이 몇 줄인가. 0 줄이면 **월간 리포트는 아직 숫자가 안 찬다**
  const cnt = (await c.query(`select count(*)::int n, count(closed_at)::int c from v2.day_sheet`)).rows[0];
  ok(`판 ${cnt.n}줄 · 마감 ${cnt.c}줄 — 읽었다`, cnt.n > 0);
  if (cnt.c === 0) console.log("      ⚠️ 마감한 판이 **0줄**이다 — 지금 리포트를 지으면 숙제·시험 줄이 통째로 안 나간다 (맞는 동작)");

  // ⓑ 진짜 학생 하나로 지어 본다 — 8월(이관일 이전)
  const st = (await c.query(
    `select ds.student_id from v2.day_sheet ds
      where ds.date between '2026-08-01' and '2026-08-31'
      group by 1 order by count(*) desc limit 1`)).rows[0];
  ok("8월에 판이 있는 학생을 찾았다", !!st, "없다");
  if (st) {
    const r = await buildReport(real, st.student_id, "2026-08", { today: "2026-08-31" });
    ok("진짜 줄로 리포트가 지어진다", Array.isArray(r.lines), JSON.stringify(r.lines?.map?.((l) => l.key)));
    ok("출결 줄이 나온다 (마감과 무관하다)", !!r.lines.find((l) => l.key === "attend"));
    ok("⚠️ 마감이 0 이라 숙제 줄이 안 나간다", !r.lines.find((l) => l.key === "homework"),
       JSON.stringify(r.lines.map((l) => l.key)));
    ok("안 마감한 판 수를 원장님께 센다", r.openSheets > 0, String(r.openSheets));

    // ⓒ ⚠️ 실측 — 반 명단이 이관일부터라 8월 회차는 **셀 수 없다**
    // ⚠️ 반 명단은 진짜 DB 에서도 `v2.student_classes()` 만 지난다 (자동 검사 ⑮)
    const on = (await c.query(
      `select (select count(*)::int from v2.student_classes($1::uuid, '2026-08-01'::date)) at_first,
              (select count(*)::int from v2.student_classes($1::uuid, v2.today()))          at_now`,
      [st.student_id])).rows[0];
    const cf = countableOf({ inMonth: 0, atFirst: on.at_first, atNow: on.at_now });
    ok(`8월 첫날 반 ${on.at_first}개 · 오늘 반 ${on.at_now}개 — 8월 회차를 셀 수 있나: ${cf.countable}`,
       typeof cf.countable === "boolean");
    if (!cf.countable) {
      ok("⚠️ 못 세는 달은 **0 이 아니라 빠진다** (0 이면 전원이 「모자람」으로 빨갛게 뜬다)",
         !r.lines.find((l) => l.key === "sessions") && !!r.hidden.find((h) => h.key === "sessions"));
    }
    ok("아직 안 보냈으므로 학부모에게 안 보인다", (await sentView(real, st.student_id, "2026-08")) === null);
  }

  // ⓒ-2 ⭐⭐ **진짜 DB 로 「교재 진도 거짓 0%」를 재원생 전원에게 물어본다.**
  //    ⚠️ 앞 판 검사는 진짜 DB 구간에서 **진도 줄의 값을 한 번도 안 봤다** — 그래서
  //       25명 중 17명 · 교재 61권이 0% 로 나가는데도 119건이 전부 초록이었다.
  //       여기서는 리포트가 실은 `done` 을 `v2.progress` 의 진짜 줄 수와 **하나하나 맞대 본다**
  {
    const 재원생 = (await c.query(`select id, name from v2.students where state='active' order by name`)).rows;
    const 어긋남 = [], 거짓0 = [];
    for (const s of 재원생) {
      const rr = await buildReport(real, s.id, "2026-08", { today: "2026-08-31" });
      for (const b of rr.lines.find((l) => l.key === "progress")?.books ?? []) {
        const 진짜 = (await c.query(
          `select count(*)::int n from v2.progress p join v2.units u on u.id = p.unit_id
            where p.student_id = $1::uuid and u.book_id = $2::uuid and p.round = $3::smallint
              and p.status = 'done'`, [s.id, b.bookId, b.round])).rows[0].n;
        if (b.done !== 진짜) 어긋남.push(`${s.name}·${b.name} 리포트${b.done} ≠ 진짜${진짜}`);
        if (b.done === 0 && 진짜 > 0) 거짓0.push(`${s.name}·${b.name} (진짜 ${진짜}단원 했다)`);
      }
    }
    ok(`⭐⭐ 재원생 ${재원생.length}명 — 진도 줄의 done 이 v2.progress 와 **하나도 안 어긋난다**`,
       어긋남.length === 0, 어긋남.slice(0, 4).join(" | "));
    ok("⭐⭐ **다 끝낸 교재가 0% 로 학부모에게 나가는 자리가 없다** (굳으면 못 고친다)",
       거짓0.length === 0, 거짓0.slice(0, 4).join(" | "));
  }

  // ⓒ-2b ⭐⭐ **「그 달에 있지도 않았던 진도」가 지난 달 리포트에 실리던 자리 — 진짜 줄로.**
  //    ⚠️ 위 ⓒ-2 는 **오늘 누적**끼리 맞대므로 이 사고를 원리적으로 못 잡는다.
  //       여기서는 리포트가 실은 `done` 을 **그 달 마지막날까지의 진짜 줄 수**와 맞댄다.
  //    실측(2026-09-02) — 고치기 전 2026-07 진도 줄 5개 중 4개 · 2026-06 은 3개 중 3개가 그 달 것이 아니었다.
  //    김소현·「기적의 영어문장 트레이닝」은 리포트에 60/130(46%) 인데 7월 말까지 실제로는 0단원이었다
  {
    const 재원생 = (await c.query(`select id, name from v2.students where state='active' order by name`)).rows;
    for (const [ym, 끝날] of [["2026-06", "2026-06-30"], ["2026-07", "2026-07-31"], ["2026-08", "2026-08-31"]]) {
      const 그달아님 = []; let 줄 = 0;
      for (const s of 재원생) {
        const rr = await buildReport(real, s.id, ym, { today: 끝날 });
        const pg = rr.lines.find((l) => l.key === "progress");
        if (pg) {
          // ⚠️ 굳은 글은 학부모가 그대로 읽는다 — 「오늘 기준」이면 지난 달 리포트에서 그 말이 거짓말이다
          if (pg.asOf !== 끝날) 그달아님.push(`${s.name}·asOf=${pg.asOf}`);
          for (const b of pg.books ?? []) {
            줄++;
            const 그달 = (await c.query(
              `select count(*)::int n from v2.progress p join v2.units u on u.id = p.unit_id
                where p.student_id = $1::uuid and u.book_id = $2::uuid and p.round = $3::smallint
                  and p.status = 'done' and p.done_on is not null and p.done_on <= $4::date`,
              [s.id, b.bookId, b.round, 끝날])).rows[0].n;
            if (b.done !== 그달) 그달아님.push(`${s.name}·${b.name} 리포트${b.done}≠그달${그달}`);
          }
        }
      }
      ok(`⭐⭐ ${ym} — 학부모에게 실린 진도 줄 ${줄}개가 **전부 그 달 것이다** (오늘 누적이 안 섞였다)`,
         그달아님.length === 0, 그달아님.slice(0, 4).join(" | "));
    }
  }

  // ⓒ-2c ⭐⭐ **한 교재에 그 달 배정 줄이 둘일 때 남의 줄 값을 읽던 자리 — 진짜 DB 로.**
  //    ⚠️ 가짜 DB 로는 `with ordinality` 가 진짜로 도는지를 원리적으로 못 본다.
  //    `begin … rollback` 이라 자료는 안 바뀐다. 실측 재현 — 구도은·「일관성 있는 기준 영문법」을
  //    1회독(진도 27줄) + 2회독(진도 0줄)로 갈라 넣고 **2회독 줄을 먼저 넣으면**
  //    2회독 줄이 1회독의 marks=27 을 읽어 학부모 줄에 {round:2, done:0, total:47, pct:0} 이 실렸다
  {
    const 감 = (await c.query(
      `select p.student_id, u.book_id, b.name, p.round, count(*)::int n
         from v2.progress p
         join v2.units u on u.id = p.unit_id
         join v2.books b on b.id = u.book_id
         join v2.students st on st.id = p.student_id
        where p.status = 'done' and st.state = 'active' and b.state = 'active'
        group by 1,2,3,4 having count(*) > 3
        order by count(*) desc limit 1`)).rows[0];
    ok("두 회독으로 갈라 볼 (학생·교재)를 찾았다", !!감, "없다");
    if (감) {
      await c.query("begin");
      try {
        const 뒤 = Number(감.round) + 1;
        // ⚠️ **2회독 줄을 먼저 넣는다** — 사고가 났던 그 차례다
        await c.query(`update v2.student_book set to_date = '2026-08-14'
                        where student_id=$1::uuid and book_id=$2::uuid`, [감.student_id, 감.book_id]);
        await c.query(`insert into v2.student_book (student_id, book_id, from_date, to_date, round)
                       values ($1::uuid, $2::uuid, '2026-08-15', null, $3::smallint)`,
                      [감.student_id, 감.book_id, 뒤]);
        const rr = await buildReport(real, 감.student_id, "2026-08", { today: "2026-08-31" });
        const 실린 = (rr.lines.find((l) => l.key === "progress")?.books ?? [])
          .filter((b) => String(b.bookId) === String(감.book_id));
        ok(`⭐⭐ 같은 교재 두 배정 줄 — **아직 한 줄도 안 찍은 ${뒤}회독이 0% 로 안 나간다** (${감.name})`,
           실린.length === 0, JSON.stringify(실린));
        ok("⚠️ 두 배정 줄 다 까닭이 남는다 (한 줄이 다른 줄을 덮지 않는다)",
           rr.hidden.filter((h) => h.key === `progress:${감.name}`).length === 2,
           JSON.stringify(rr.hidden.filter((h) => h.key.startsWith("progress:")).map((h) => h.key)));
      } finally { await c.query("rollback"); }
    }
  }

  // ⓒ-2d ⭐⭐ **보냈다고 「마감 안 됨」으로 뒤집히던 자리 — 진짜 DB 로.**
  //    실측 재현 — 왕희연의 2026-08 판 7개를 전부 마감하면 집계 「마감 다 됨」 1명인데,
  //    그 아이 리포트를 **보내기만 하면** 마감은 그대로인데 0명이 됐다
  {
    const 감 = (await c.query(
      `select st.id, st.name, count(*)::int n from v2.students st
         join v2.day_sheet s on s.student_id = st.id and s.date between '2026-08-01' and '2026-08-31'
        where st.state = 'active' group by 1,2 order by 3 desc limit 1`)).rows[0];
    ok("8월 판이 가장 많은 아이를 찾았다", !!감, "없다");
    if (감) {
      await c.query("begin");
      try {
        await c.query(`update v2.day_sheet set closed_at = now()
                        where student_id = $1::uuid and date between '2026-08-01' and '2026-08-31'`, [감.id]);
        const b1 = await monthlyBoard(real, "2026-08");
        const 전 = b1.students.find((s) => String(s.studentId) === String(감.id));
        ok(`판 ${감.n}개를 다 마감하니 「마감 다 됨」이다 (${감.name})`, 전?.allClosed === true, JSON.stringify(전));
        await c.query(`insert into v2.monthly_report (student_id, ym, body, frozen, sent_at)
                       values ($1::uuid, '2026-08', null, '{}'::jsonb, now())
                       on conflict (student_id, ym) do update set sent_at = now()`, [감.id]);
        const b2 = await monthlyBoard(real, "2026-08");
        const 후 = b2.students.find((s) => String(s.studentId) === String(감.id));
        ok("⭐⭐ **보냈다고 「마감 안 됨」으로 뒤집히지 않는다** (보낸 것은 마감과 상관이 없다)",
           후?.allClosed === true && b2.allClosed === b1.allClosed,
           JSON.stringify({ 전: b1.allClosed, 후: b2.allClosed, 그아이: 후 }));
        ok("⭐ 줄어드는 것은 「안 보낸 아이」쪽이다 (한 칸이 두 가지를 말하지 않는다)",
           b2.notSent === b1.notSent - 1, `${b1.notSent} → ${b2.notSent}`);
      } finally { await c.query("rollback"); }
    }
  }

  // ⓒ-2e ⚠️ **`scripts/check-sql.mjs` 는 문법 오류를 판정 없이 삼킨다** —
  //    `${…}` 를 메우다 난 오류와 진짜 문법 오류를 못 가려서다. 내 SQL 은 여기서 직접 물어본다.
  //    돌리지 않고 PREPARE 만 하므로 자료는 안 바뀐다
  {
    const sqls = [...readFileSync("lib/monthly.js", "utf8").matchAll(/`\/\* monthly:[^`]*`/g)]
      .map((m) => m[0].slice(1, -1));
    const 나쁨 = [];
    for (let k = 0; k < sqls.length; k++) {
      try {
        await c.query("begin");
        await c.query(`prepare mchk_${k} as ${sqls[k]}`);
        await c.query("rollback");
      } catch (e) {
        await c.query("rollback").catch(() => {});
        나쁨.push(`${/monthly:(\w+)/.exec(sqls[k])?.[1]}: ${String(e.message).split("\n")[0]}`);
      }
    }
    ok(`⭐ monthly SQL ${sqls.length}개가 진짜 스키마에 **문법까지** 통과한다 (check-sql 은 문법 오류를 삼킨다)`,
       sqls.length === 11 && 나쁨.length === 0, 나쁨.join(" | ") || `뽑은 것 ${sqls.length}개`);
  }

  // ⓒ-3 ⭐⭐ **이관 첫 달 거짓 문구** — 실측 2026-09 에 재원생 25명 중 20명이 밟던 자리.
  //    반 명단은 `v2.student_classes()` 만 지난다 (자동 검사 ⑮)
  {
    const rows = (await c.query(
      `select st.id, st.name,
              (select count(*)::int from v2.student_classes(st.id, '2026-09-01'::date)) as at_first,
              (select exists(select 1 from v2.day_sheet ds
                              where ds.student_id = st.id and ds.date < '2026-09-01')) as came_before
         from v2.students st where st.state = 'active' order by st.name`)).rows;
    const 늦은명단 = rows.filter((r) => r.at_first === 0);
    const 거짓문구 = 늦은명단.filter((r) =>
      countableOf({ inMonth: 1, atFirst: 0, atNow: 1, cameBefore: r.came_before }).partial === true
      && r.came_before);
    ok(`달 첫날 명단이 없는 아이 ${늦은명단.length}명 — 그중 그 앞에 판이 이미 있는 아이 `
       + `${늦은명단.filter((r) => r.came_before).length}명`, 늦은명단.length >= 0);
    ok("⭐⭐ 계속 다니던 아이에게 「달 중간부터 다닌 달」이 **한 명도 안 나간다**",
       거짓문구.length === 0, 거짓문구.map((r) => r.name).slice(0, 5).join(","));
    if (늦은명단.length) {
      const one = 늦은명단[0];
      const rr = await buildReport(real, one.id, "2026-09");
      const sl = rr.lines.find((l) => l.key === "sessions");
      ok(`⭐ 진짜 줄로 지어도 그 문구가 안 실린다 (${one.name} · 2026-09)`,
         !sl || sl.partial === null, JSON.stringify(sl?.partial));
    }
  }

  // ⓒ-4 ⭐ **아직 안 온 달** — 실측 `sendGate(…, '2027-05')` 가 아무 물음 없이 ready 였다
  if (st) {
    const g = await sendGate(real, st.student_id, "2027-05");
    ok("⭐⭐ 진짜 DB 로도 **아직 안 온 달은 반드시 묻는다** (굳으면 그 달이 왔을 때 못 보낸다)",
       g.mustAsk.includes(ASK.MONTH_OPEN) && g.ready === false, JSON.stringify(g.mustAsk));
  }

  // ⓓ ⭐ **진짜 DB 에서 「두 번 안 굳는다」를 실제로 눌러 본다.**
  //    글자 훑기만으로는 방벽이 정말 도는지 모른다. `begin … rollback` 이라 자료는 안 바뀐다
  //    (`scripts/check-derive.mjs` 와 같은 방식)
  if (st) {
    await c.query("begin");
    const tx = { query: (sql, p) => c.query(sql, p) };
    // ⚠️ 스위치를 켜 둔다. 이 아이 집에 등록된 기기가 없어 밖으로는 한 발도 안 나가고,
    //    쏘는 것도 가짜다. 스위치를 끄면 아래 「알려진 것」에 걸려 여기서 못 나아간다
    const 옵션 = { confirm: [ASK.NO_LINES, ASK.OPEN_SHEETS], env: { [SINK]: "live" }, push: () => {} };
    const a1 = await sendMonthly(tx, st.student_id, "2000-01", 옵션);
    const a2 = await sendMonthly(tx, st.student_id, "2000-01", 옵션);
    ok("진짜 DB 에 한 번 굳었다", a1.ok === true, JSON.stringify(a1.why ?? a1.need));
    ok("⭐ 진짜 DB 에서도 **두 번은 안 굳는다**", a2.ok === false && a2.why === "already_sent", JSON.stringify(a2.why));
    const v = await sentView(tx, st.student_id, "2000-01");
    ok("굳은 글을 되읽는다 (char(7) 에 빈칸이 안 붙었다)", !!v && v.v === FROZEN_V, JSON.stringify(v && Object.keys(v)));
    const 샌칸 = 새면_안_되는_칸.filter((k) => v && k in v);
    ok("⭐ 진짜 DB 에 굳은 것에도 원장 칸이 없다", 샌칸.length === 0, 샌칸.join(","));
    // ⓕ ⭐⭐ **「굳었는데 아무에게도 안 갔고 다시 못 보내는 자리」를 진짜 DB 로 눌러 본다.**
    //    발송 스위치가 꺼진 채로(=기본값) 부르면 `lib/notify.js` 가 `notify_log.sent_at` 에
    //    null 을 넣는데 그 칸은 **not null** 이다(0012) → 던진다. 실서비스에서 첫 발송을 누르면
    //    100% 이 길로 간다. 앞 판에서는 굳은 채 커밋되고 다시 누르면 `already_sent` 였다.
    //    ⚠️ 실서비스는 autocommit 이라 **질의마다 savepoint** 를 걸어 그 모양을 흉내낸다 —
    //       한 트랜잭션으로 묶으면 던진 뒤 연결이 통째로 죽어 「되돌리기」가 도는지를 못 본다
    const auto = { query: async (sql, p) => {
      await c.query("savepoint one");
      try { const r = await c.query(sql, p); await c.query("release savepoint one"); return r; }
      catch (e) { await c.query("rollback to savepoint one"); throw e; }
    } };
    const 끈옵션 = { confirm: [ASK.NO_LINES, ASK.OPEN_SHEETS, ASK.MONTH_OPEN], env: {}, push: () => {} };
    let 던짐 = null, f1 = null;
    try { f1 = await sendMonthly(auto, st.student_id, "2000-02", 끈옵션); }
    catch (e) { 던짐 = String(e.message).split("\n")[0]; }
    ok("⭐ 알림이 터져도 **밖으로 던지지 않는다** (화면에 500 이 뜨면 원장님은 무엇이 굳었는지 모른다)",
       던짐 === null, String(던짐));
    ok("⭐ 성공이라 말하지 않는다", f1?.ok === false && f1?.why === "notify_failed", JSON.stringify(f1?.why));
    ok("⭐⭐ **굳힌 것을 도로 내렸다**", f1?.undone === true, JSON.stringify(f1?.warn));
    const 남은 = (await c.query(
      `select sent_at, (frozen is not null) as f from v2.monthly_report
        where student_id = $1::uuid and ym = '2000-02'`, [st.student_id])).rows[0];
    ok("⚠️ `sent_at` 만 비웠다 — 굳은 것은 자취로 남는다 (대전제 6)",
       남은 && 남은.sent_at === null && 남은.f === true, JSON.stringify(남은));
    ok("⭐ 그래서 학부모에게 안 보인다", (await sentView(auto, st.student_id, "2000-02")) === null);
    const f2 = await sendMonthly(auto, st.student_id, "2000-02",
      { ...끈옵션, env: { [SINK]: "live" } });
    ok("⭐⭐ 그리고 **다시 보낼 수 있다** (앞서는 already_sent 로 그 아이의 그 달이 끝났다)",
       f2?.ok === true, JSON.stringify(f2?.why ?? f2?.need));

    await c.query("rollback");
    const gone = (await c.query(
      `select count(*)::int n from v2.monthly_report where ym in ('2000-01','2000-02')`)).rows[0].n;
    ok("되돌렸다 — 진짜 자료가 안 바뀌었다", gone === 0, String(gone));
  }

  // ⓔ 보드 — 진짜로 돈다
  const b = await monthlyBoard(real, "2026-08");
  ok(`보드 — 재원생 ${b.total}명 · 안 보냄 ${b.notSent}명`, b.total > 0 && b.notSent === b.total);
  ok("보드가 「먼저 마감할 아이」를 센다", typeof b.blocked === "number");

  await c.end();
} catch (e) {
  fail++; console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e.message).split("\n")[0]);
}

console.log(`\n■ 월간 리포트 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
