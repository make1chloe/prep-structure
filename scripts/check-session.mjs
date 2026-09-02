/** 회차 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *  가짜 DB 를 끼워 lib/session.js 를 부르고 결과를 센다.
 *
 *  계획 자동 검사 ⑮ `class_roster` 밖에서 반 명단을 직접 조회하는 자리가 없는가
 *       0단계 6번  지나간 것을 세는 자리는 「오늘까지」로 자르는가
 *       오류 대장 83 회차는 청구액이 아니라 「8회 채우기」인가
 *       조심할 자리 ③ 반을 옮긴 아이의 회차가 두 반 요일을 합쳐 부풀지 않는가
 */
import { MIN_SESSIONS, ymd, monthRange, eachDate, countDates,
         classSessions, studentSessions, makeupTargets, monthBoard } from "../lib/session.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };

// ── 판 ─────────────────────────────────────────────────────────
// 월수반(C1) · 화목반(C2) · 특강(C3). 2026-10 은 월 5·12·19·26 · 수 7·14·21·28 = 8회
const C1 = "c1", C2 = "c2", C3 = "c3", S1 = "s1", S2 = "s2", S3 = "s3";

const base = () => ({
  today: "2026-10-31",
  classes: [{ id: C1, kind: "regular" }, { id: C2, kind: "regular" }, { id: C3, kind: "special" }],
  schedule: [
    { class_id: C1, from_date: "2026-01-01", to_date: null, weekdays: [1, 3] },   // 월·수
    { class_id: C2, from_date: "2026-01-01", to_date: null, weekdays: [2, 4] },   // 화·목
    { class_id: C3, from_date: "2026-10-01", to_date: "2026-10-31", weekdays: [6] }, // 토 특강
  ],
  holiday: [],
  member: [{ class_id: C1, student_id: S1, from_date: "2026-01-01", to_date: null }],
  makeup: [],
});

/** 아무도 안 시킨 질의 — **던지지 않고 모은다.**
 *  ⚠️ 던지면 검사가 중간에 죽어 「■ … N건 · 실패 N」 줄이 안 나온다.
 *     그러면 무엇이 몇 개 깨졌는지 아무도 모른다. 끝까지 돌고 ❌ 로 센다. */
const UNKNOWN = [];

/** 이 검사가 부른 **모든** 가짜 DB 가 본 질의. ⑮ 와 「출결 안 읽는다」를 전수로 본다 */
const ALL_SQL = [];

/** 가짜 DB — pg 가 하는 일을 흉내만 낸다. **무엇을 물었는지도 적어 둔다** */
function fakeDb(fx) {
  const sqls = [];
  ALL_SQL.push(sqls);
  const cover = (r, d) => ymd(r.from_date) <= d && (r.to_date == null || ymd(r.to_date) >= d);
  return { sqls, fx, async query(sql, p) {
    sqls.push(sql);
    if (sql.includes("v2.today()")) return { rows: [{ d: fx.today }] };
    if (sql.includes("from v2.class_schedule"))
      return { rows: fx.schedule.filter((r) => r.class_id === p[0]
        && ymd(r.from_date) <= p[2] && (r.to_date == null || ymd(r.to_date) >= p[1])) };
    if (sql.includes("from v2.holiday"))
      return { rows: fx.holiday.filter((h) => ymd(h.date) >= p[1] && ymd(h.date) <= p[2]
        && (h.class_id == null || h.class_id === p[0])) };
    if (sql.includes("v2.class_roster")) {            // (class, dates[]) → {date, student_id}
      const out = [];
      for (const d of p[1]) for (const m of fx.member)
        if (m.class_id === p[0] && cover(m, ymd(d))) out.push({ date: ymd(d), student_id: m.student_id });
      return { rows: out };
    }
    if (sql.includes("v2.student_classes")) {          // (student, first, last) → {date, class_id}
      const out = [];
      for (const { date } of eachDate(p[1], p[2])) for (const m of fx.member)
        if (m.student_id === p[0] && cover(m, date)) out.push({ date, class_id: m.class_id });
      return { rows: out };
    }
    if (sql.includes("from v2.makeup"))
      return { rows: fx.makeup.filter((m) => p[0].includes(m.student_id) && m.on_date
        && ymd(m.on_date) >= p[1] && ymd(m.on_date) <= p[2] && m.state !== "waived") };
    if (sql.includes("from v2.classes")) return { rows: fx.classes };
    UNKNOWN.push(sql.replace(/\s+/g, " ").trim().slice(0, 90));
    return { rows: [] };
  } };
}
const everySql = () => ALL_SQL.flat();

// ── ① 날짜 다루기 ───────────────────────────────────────────────
console.log("■ 날짜 — 여기서 하루가 밀리면 회차가 통째로 틀린다");
ok("달 범위 — 2026-10 은 1~31일", JSON.stringify(monthRange("2026-10")) === JSON.stringify({ first: "2026-10-01", last: "2026-10-31" }));
ok("달 범위 — 2026-02 는 28일 (윤년 아님)", monthRange("2026-02").last === "2026-02-28");
ok("달 범위 — 2028-02 는 29일 (윤년)", monthRange("2028-02").last === "2028-02-29");
{ let threw = false; try { monthRange("2026-13"); } catch { threw = true; }
  ok("없는 달은 조용히 0회를 내지 않고 던진다", threw); }
{ let threw = false; try { monthRange("202610"); } catch { threw = true; }
  ok("모양이 틀린 달도 던진다", threw); }
// ⚠️ 여기가 진짜 함정 — pg 는 date 를 「그 기계 시간대의 자정」 Date 로 준다
ok("Date(지역 자정)를 넣어도 그날이 그대로 나온다 (toISOString 이면 하루 밀린다)",
   ymd(new Date(2026, 9, 7)) === "2026-10-07", ymd(new Date(2026, 9, 7)));
ok("한 달 날 수를 정확히 편다", eachDate("2026-10-01", "2026-10-31").length === 31);
ok("요일이 맞다 — 2026-10-05 는 월요일(1)", eachDate("2026-10-05", "2026-10-05")[0].dow === 1);

// ── ② 회차 셈 ──────────────────────────────────────────────────
console.log("\n■ 회차 — 반 요일 + 달력 − 휴강");
{ const db = fakeDb(base());
  const c = await classSessions(db, C1, "2026-10");
  ok("월·수반 2026-10 은 8회", c.total === 8, `${c.total}회 · ${c.dates.join(" ")}`);
  ok("8회를 채웠으므로 모자람 0", c.short === 0 && c.enough === true);
  ok("8 은 모든 반 공통 (원장님 확정)", c.min === MIN_SESSIONS && MIN_SESSIONS === 8); }

{ const fx = base(); fx.holiday = [{ date: "2026-10-07", class_id: C1 }];
  const c = await classSessions(fakeDb(fx), C1, "2026-10");
  ok("휴강 하루는 빠진다 — 7회", c.total === 7, `${c.total}회`);
  ok("8회를 못 채워 「보강 잡을 것」이 선다", c.enough === false && c.short === 1); }

{ const fx = base(); fx.holiday = [{ date: new Date(2026, 9, 7), class_id: null }];  // 학원 전체 휴강
  const c = await classSessions(fakeDb(fx), C1, "2026-10");
  ok("반을 안 적은 휴강(전체 휴강)도 빠진다", c.total === 7, `${c.total}회`);
  ok("휴강 날이 Date 로 와도 그날이 빠진다 (하루 밀리면 8이 그대로 나온다)",
     !c.dates.includes("2026-10-07")); }

{ const fx = base(); fx.holiday = [{ date: "2026-10-07", class_id: C2 }];  // 남의 반 휴강
  const c = await classSessions(fakeDb(fx), C1, "2026-10");
  ok("남의 반 휴강은 내 회차를 안 깎는다", c.total === 8, `${c.total}회`); }

// ⚠️ 결석은 안 빠진다 — 이 파일이 출결을 **한 번도 안 읽는지**로 본다
{ const db = fakeDb(base());
  await classSessions(db, C1, "2026-10");
  await studentSessions(db, S1, "2026-10");
  const touched = db.sqls.filter((s) => /day_sheet|attend/i.test(s));
  ok("결석은 안 빠진다 — 출결(day_sheet)을 한 번도 안 읽는다", touched.length === 0, touched.join(" | ")); }

// ── ③ 오늘 상한 (계획 0단계 6번) ────────────────────────────────
console.log("\n■ 오늘 상한 — 지나간 것은 「오늘까지」로 자른다");
{ const fx = base(); fx.today = "2026-10-14";
  const c = await classSessions(fakeDb(fx), C1, "2026-10");
  ok("10/14 에 지나간 것은 4회 (5·7·12·14)", c.done === 4, `${c.done}회 · ${c.dates.filter(d=>d<="2026-10-14").join(" ")}`);
  ok("앞날 예정은 따로 나온다 — 4회", c.planned === 4, `${c.planned}회`);
  ok("지나간 것 + 앞날 = 그 달 전체", c.done + c.planned === c.total);
  // ⚠️ 8회 판정을 done 으로 하면 매달 1일에 모든 반이 빨갛게 뜬다
  ok("8회 판정은 그 달 전체로 한다 (done 으로 하면 헛보강)", c.enough === true && c.short === 0); }

{ const fx = base(); fx.today = "2026-10-01";
  const c = await classSessions(fakeDb(fx), C1, "2026-10");
  ok("달 첫날엔 지나간 것이 0회", c.done === 0);
  ok("그래도 「모자람」은 안 뜬다", c.enough === true); }

{ const db = fakeDb(base());
  await classSessions(db, C1, "2026-10");
  ok("오늘은 DB(v2.today · 서울)에서 받는다 — new Date() 를 안 쓴다",
     db.sqls.some((s) => s.includes("v2.today()"))); }

// ── ④ 요일 이력 (요일을 옮겨도 지난달이 안 바뀐다) ────────────────
console.log("\n■ 요일 이력 — 옮겨도 지난달이 소급해 안 바뀐다");
{ const fx = base();
  fx.schedule = [
    { class_id: C1, from_date: "2026-01-01", to_date: "2026-10-15", weekdays: [1, 3] },  // 10/15 까지 월·수
    { class_id: C1, from_date: "2026-10-16", to_date: null, weekdays: [2, 4] },          // 그 뒤 화·목
  ];
  const c = await classSessions(fakeDb(fx), C1, "2026-10");
  // 월수 5·7·12·14 (4) + 화목 20·22·27·29 (4) = 8
  ok("달 가운데 요일을 옮겨도 앞뒤가 각자 센다 — 8회", c.total === 8, `${c.total}회 · ${c.dates.join(" ")}`);
  ok("옮기기 전 요일은 옮긴 뒤 날에 안 걸린다", !c.dates.includes("2026-10-19"), c.dates.join(" "));
  const sep = await classSessions(fakeDb(fx), C1, "2026-09");
  ok("지난달(9월)은 옛 요일 그대로 — 소급해 안 바뀐다", sep.total === 9, `${sep.total}회`); }

{ const fx = base();  // ⚠️ 닫는 날을 안 적고 새 줄을 넣은 자리 — 겹친다
  fx.schedule = [
    { class_id: C1, from_date: "2026-01-01", to_date: null, weekdays: [1, 3] },
    { class_id: C1, from_date: "2026-10-01", to_date: null, weekdays: [1, 3] },
  ];
  const c = await classSessions(fakeDb(fx), C1, "2026-10");
  ok("요일 이력 두 줄이 겹쳐도 하루를 두 번 안 센다", c.total === 8, `${c.total}회 (16이면 두 번 셌다)`); }

{ const fx = base();
  fx.schedule = [{ class_id: C1, from_date: "2026-01-01", to_date: null, weekdays: ["1", "3"] }];
  const c = await classSessions(fakeDb(fx), C1, "2026-10");
  ok("요일이 글자로 와도 센다 ('3' !== 3 이면 그 반이 0회가 된다)", c.total === 8, `${c.total}회`); }

// ── ⑤ 반 명단 · 소속 기간 (조심할 자리 ③) ──────────────────────
console.log("\n■ 소속 — 반을 옮긴 아이의 회차가 부풀지 않는다");
{ const fx = base();
  fx.member = [
    { class_id: C1, student_id: S1, from_date: "2026-01-01", to_date: "2026-10-15" },  // 월수반
    { class_id: C2, student_id: S1, from_date: "2026-10-16", to_date: null },          // 화목반으로 이동
  ];
  const r = await studentSessions(fakeDb(fx), S1, "2026-10");
  const c1 = r.byClass.find((x) => x.classId === C1), c2 = r.byClass.find((x) => x.classId === C2);
  ok("옮기기 전 반은 15일까지만 — 4회", c1?.total === 4, `${c1?.total}회 · ${c1?.dates?.join(" ")}`);
  ok("옮긴 뒤 반은 16일부터만 — 4회", c2?.total === 4, `${c2?.total}회 · ${c2?.dates?.join(" ")}`);
  ok("두 반 요일을 합쳐 부풀지 않는다 (16이 아니라 8)", (c1?.total ?? 0) + (c2?.total ?? 0) === 8); }

{ const fx = base();
  fx.member = [
    { class_id: C1, student_id: S1, from_date: "2026-01-01", to_date: null },
    { class_id: C3, student_id: S1, from_date: "2026-10-01", to_date: null },   // 토요일 특강도 같이
  ];
  const r = await studentSessions(fakeDb(fx), S1, "2026-10");
  ok("한 아이가 정규·특강 두 반에 설 수 있다", r.byClass.length === 2);
  ok("반마다 따로 센다 — 정규 8 · 특강 5",
     r.byClass.find((x) => x.classId === C1)?.total === 8 && r.byClass.find((x) => x.classId === C3)?.total === 5);
  // ⚠️ 합쳐서 한 숫자로 주면 정규가 모자란 것이 특강에 가려진다
  const fx2 = base();
  fx2.holiday = [{ date: "2026-10-05", class_id: C1 }, { date: "2026-10-07", class_id: C1 }];
  fx2.member = fx.member;
  const r2 = await studentSessions(fakeDb(fx2), S1, "2026-10");
  ok("정규가 모자라면 특강 회차에 안 가려진다 (합계 11회여도 정규가 뜬다)",
     r2.total === 11 && r2.shortClasses.some((x) => x.classId === C1),
     `${r2.total}회 · ${JSON.stringify(r2.shortClasses.map((x) => x.classId))}`);
  // ⚠️ **확인 안 됨** — 5회짜리 특강도 「3회 모자람」으로 뜬다.
  //    원장님 확정 문장(「8회가 모든 반의 기준이다」) 그대로 걸어 둔 것이고, 아니면 opts.min 으로 덮는다
  ok("⚠️ 확인 안 됨 — 특강(5회)도 지금은 8회 기준에 걸린다",
     r2.shortClasses.some((x) => x.classId === C3), JSON.stringify(r2.shortClasses.map((x) => x.classId)));
  const r3 = await studentSessions(fakeDb(fx2), S1, "2026-10", { min: 5 });
  ok("opts.min 으로 기준을 덮을 수 있다 (특강 5회는 안 걸린다)",
     !r3.shortClasses.some((x) => x.classId === C3)); }

{ const fx = base(); fx.member = [{ class_id: C1, student_id: S1, from_date: "2026-10-20", to_date: null }];
  const r = await studentSessions(fakeDb(fx), S1, "2026-10");
  ok("달 중간에 들어온 아이는 들어온 뒤만 센다 — 3회 (21·26·28)",
     r.byClass[0]?.total === 3, `${r.byClass[0]?.total}회 · ${r.byClass[0]?.dates?.join(" ")}`); }

// ── ⑥ 보강 잡을 것 ─────────────────────────────────────────────
console.log("\n■ 8회 미만이면 「보강 잡을 것」 — 아이마다");
{ const fx = base();
  fx.holiday = [{ date: "2026-10-07", class_id: C1 }, { date: "2026-10-14", class_id: C1 }];
  fx.member = [
    { class_id: C1, student_id: S1, from_date: "2026-01-01", to_date: null },
    { class_id: C1, student_id: S2, from_date: "2026-01-01", to_date: null },
  ];
  const m = await makeupTargets(fakeDb(fx), C1, "2026-10");
  ok("휴강 둘이면 반은 6회", m.class.total === 6, `${m.class.total}회`);
  ok("명단의 두 아이 모두 「2회 모자람」", m.students.length === 2 && m.students.every((s) => s.short === 2),
     JSON.stringify(m.students.map((s) => [s.studentId, s.short])));

  // 이미 보강을 잡아 둔 아이는 그만큼 빠진다 — 안 빼면 같은 보강을 또 잡는다
  fx.makeup = [{ student_id: S1, on_date: "2026-10-10", state: "set" },
               { student_id: S1, on_date: "2026-10-17", state: "done" }];
  const m2 = await makeupTargets(fakeDb(fx), C1, "2026-10");
  ok("보강을 두 번 잡아 둔 아이는 목록에서 빠진다",
     !m2.students.some((s) => s.studentId === S1), JSON.stringify(m2.students.map((s) => s.studentId)));
  ok("아직 안 잡은 아이는 남는다", m2.students.length === 1 && m2.students[0]?.studentId === S2);

  // 면제(waived)·날짜 미정(todo)은 안 센다
  fx.makeup = [{ student_id: S2, on_date: "2026-10-10", state: "waived" },
               { student_id: S2, on_date: null, state: "todo" }];
  const m3 = await makeupTargets(fakeDb(fx), C1, "2026-10");
  ok("면제·날짜 미정 보강은 회차로 안 센다",
     m3.students.find((s) => s.studentId === S2)?.short === 2); }

{ const fx = base();
  fx.member = [{ class_id: C1, student_id: S1, from_date: "2026-01-01", to_date: null }];
  const m = await makeupTargets(fakeDb(fx), C1, "2026-10");
  ok("8회를 채운 반은 보강 목록이 비어 있다", m.students.length === 0 && m.class.enough); }

{ const fx = base();
  fx.holiday = [{ date: "2026-10-07", class_id: C1 }];
  fx.member = [{ class_id: C1, student_id: S1, from_date: "2026-01-01", to_date: null },
               { class_id: C1, student_id: S3, from_date: "2026-10-20", to_date: null }];
  const m = await makeupTargets(fakeDb(fx), C1, "2026-10");
  const s3 = m.students.find((s) => s.studentId === S3);
  ok("달 중간에 들어온 아이는 자기 회차(3회)로 센다", s3 && s3.count === 3, JSON.stringify(s3));
  ok("모자람이 큰 아이가 앞에 선다", m.students[0]?.studentId === S3, JSON.stringify(m.students.map((x) => x.studentId))); }

// 보강이 원래 수업 날과 겹치면 안 더한다
{ const fx = base();
  fx.holiday = [{ date: "2026-10-07", class_id: C1 }];
  fx.makeup = [{ student_id: S1, on_date: "2026-10-05", state: "set" }];   // 원래 수업 있는 날
  const r = await studentSessions(fakeDb(fx), S1, "2026-10");
  ok("보강이 원래 수업 날과 겹치면 회차를 두 번 안 센다", r.total === 7, `${r.total}회`);
  fx.makeup = [{ student_id: S1, on_date: "2026-10-10", state: "set" }];   // 토요일 보강
  const r2 = await studentSessions(fakeDb(fx), S1, "2026-10");
  ok("다른 날 보강은 회차에 더해진다", r2.total === 8, `${r2.total}회`); }

// ── ⑦ 일정 화면 맨 위 ──────────────────────────────────────────
console.log("\n■ 일정 화면 — 반마다 「이 달 몇 회」");
{ const fx = base(); fx.holiday = [{ date: "2026-10-06", class_id: C2 }];
  const b = await monthBoard(fakeDb(fx), "2026-10");
  ok("반 셋이 다 선다", b.length === 3);
  ok("월수 8 · 화목 8 (10/6 휴강이면 8) · 특강 5",
     b[0]?.total === 8 && b[1]?.total === 8 && b[2]?.total === 5, b.map((x) => x.total).join(" "));
  ok("8회 미만인 반만 빨갛다 (enough:false)", b.filter((x) => !x.enough).length === 1
     && b.find((x) => !x.enough)?.classId === C3); }

// ── ⑧ 회차는 청구액이 아니다 (오류 대장 83) ─────────────────────
console.log("\n■ 회차는 청구액이 아니다 — 돈을 안 만진다");
{ const db = fakeDb(base());
  await classSessions(db, C1, "2026-10");
  await studentSessions(db, S1, "2026-10");
  await makeupTargets(db, C1, "2026-10");
  const money = db.sqls.filter((s) => /fee_rule|payment|amount/i.test(s));
  ok("수강료·납부 표를 한 번도 안 읽는다", money.length === 0, money.join(" | "));
  // 주석을 걷어낸 **코드만** 본다 — 머리말에는 「회차 × 단가 = 청구액이 아니다」가 적혀 있다
  const code = readFileSync("lib/session.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  ok("코드에 단가·금액을 만지는 자리가 없다",
     !/단가|amount|price|fee|payment|청구/i.test(code),
     (code.match(/.*(단가|amount|price|fee|payment|청구).*/i) || [""])[0].trim()); }

// ── ⑨ 자동 검사 ⑮ — 반 명단을 직접 조회하지 않는가 ───────────────
console.log("\n■ 자동 검사 ⑮ — 반 명단은 class_roster 로만");
{ const db = fakeDb(base());
  const fx2 = base();
  fx2.holiday = [{ date: "2026-10-07", class_id: C1 }];
  fx2.member = [{ class_id: C1, student_id: S1, from_date: "2026-01-01", to_date: null }];
  const d2 = fakeDb(fx2);
  await makeupTargets(d2, C1, "2026-10");
  ok("명단을 물을 때 v2.class_roster 를 지나간다", d2.sqls.some((s) => s.includes("v2.class_roster")));
  await studentSessions(db, S1, "2026-10");
  ok("아이의 반을 물을 때 v2.student_classes 를 지나간다", db.sqls.some((s) => s.includes("v2.student_classes")));
  // 이 검사가 돌면서 **한 번이라도** 명단 표를 직접 물었으면 여기서 걸린다
  // ⚠️ **막는 것은 「읽기」다. 「쓰기」는 명단이 생기는 유일한 길이다.**
  //    등록 전환이 `insert into v2.class_member … from_date` 로 소속을 만든다 —
  //    그것까지 잡으면 반에 아이를 넣을 방법이 없어지고, 담당자는 규칙이 아니라 **검사를 끈다.**
  //    ⑮가 지키려는 것은 「명단을 **세는** 자리가 두 벌이 되는 것」이다(회차가 부풀어 수강료가 틀린다).
  const 쓰기 = (q) => /\b(insert\s+into|update|delete\s+from)\s+v2\.class_member\b/i.test(q);
  const direct = everySql().filter((s) => /v2\.class_member/i.test(s) && !쓰기(s));
  ok("v2.class_member 를 직접 조회하지 않는다 (전수)", direct.length === 0,
     [...new Set(direct.map((s) => s.replace(/\s+/g, " ").trim().slice(0, 70)))].join(" | ")); }

// 파일도 훑는다 — 나중에 누가 화면에서 직접 읽으면 여기서 걸린다
// ⚠️ scripts/ 는 뺀다. check-v2-rls.mjs 는 **접근 규칙을 시험하려고** 일부러 직접 읽는다
const walk = (d, out = []) => { for (const f of readdirSync(d)) {
  if (["node_modules", ".next", ".git", "backup", "_tmp", "sandbox"].includes(f)) continue;
  const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
    : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
const files = [...walk("lib"), ...walk("app")];
// ⚠️ **주석을 먼저 지운다.** 안 지우면 「`v2.class_member` 를 직접 읽지 마라」고 적어 둔
//    주석 자체가 위반으로 잡힌다 — 규칙을 적은 사람이 잡히는 꼴이고, 실제로 셋 중 하나가 그랬다.
// ⚠️ 그리고 **쓰기와 「표 이름을 늘어놓은 목록」은 뺀다** — `unnest(array['…','class_member'])` 는
//    권한을 물어보는 목록이지 명단을 세는 자리가 아니다. `from('class_member'` 만 진짜 조회다.
const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const 읽나 = (t) => {
  if (/from\(["'`]class_member["'`]/.test(t)) return true;              // supabase-js 조회
  const 자리 = [...t.matchAll(/v2\.class_member\b/gi)];
  return 자리.some((m) => {
    const 앞 = t.slice(Math.max(0, m.index - 60), m.index);
    return !/\b(insert\s+into|update|delete\s+from)\s+$/i.test(앞);   // 쓰기가 아니면 읽기다
  });
};
const peekers = files.filter((f) => 읽나(코드만(readFileSync(f, "utf8"))));
ok("lib·app 어디서도 반 명단 표를 직접 안 읽는다", peekers.length === 0, peekers.join(" "));

// ── ⑩ 순수 함수도 따로 ──────────────────────────────────────────
console.log("\n■ 순수 셈 — DB 없이도 같은 답");
{ const r = countDates({
    schedules: [{ from_date: "2026-10-01", to_date: null, weekdays: [1, 3] }],
    holidays: [{ date: "2026-10-05" }], first: "2026-10-01", last: "2026-10-31", today: "2026-10-31" });
  ok("휴강 하나 뺀 7회", r.dates.length === 7, `${r.dates.length}회`);
  ok("오늘이 달 끝이면 앞날 예정 0", r.future.length === 0); }
{ const r = countDates({ schedules: [], holidays: [], first: "2026-10-01", last: "2026-10-31", today: "2026-10-31" });
  ok("요일 이력이 없으면 0회 (지어내지 않는다)", r.dates.length === 0); }

// ── ⑪ 마지막으로 전수 ────────────────────────────────────────────
console.log("\n■ 전수 — 이 검사가 도는 동안 부른 질의 전부를 본다");
{ const attend = everySql().filter((s) => /day_sheet|\battend\b/i.test(s));
  ok("결석은 안 빠진다 — 출결을 한 번도 안 읽었다 (전수)", attend.length === 0,
     [...new Set(attend.map((s) => s.replace(/\s+/g, " ").trim().slice(0, 70)))].join(" | ")); }
ok("가짜 DB 가 모르는 질의가 없다 (lib 이 새 표를 읽기 시작하면 여기서 걸린다)",
   UNKNOWN.length === 0, [...new Set(UNKNOWN)].join(" | "));

console.log(`\n■ 회차 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
