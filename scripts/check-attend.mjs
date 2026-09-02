/** 출결 쓰기 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *
 *  계획 자동 검사 ② 출결 쓰는 길 여덟이 전부 `attendanceWrite` 를 부르는가
 *                ⑪ 저장·삭제가 「몇 줄이 실제로 바뀌었나」를 보고 0줄이면 실패로 되돌리는가
 *  계획 ㉔        결석·지각 예정은 앞날에도 찍힌다
 *  원장님 2026-09-02 **지각에 「얼마나」가 없다** — 아이가 등원을 찍은 그 시각이 곧 도착 시각이다.
 *                 그래서 아래 「지각」 절은 **지운 줄이 아니라 뒤집은 줄**이다 —
 *                 앞서 「반드시 고르게 하는가」를 지키던 자리가 「정말 안 묻는가」를 지킨다.
 *  0047           attend 는 넷(makeup 없음) · 열쇠는 (학생,날짜,반) nulls not distinct
 *
 *  ⚠️ 가짜 DB 는 **Postgres 를 흉내낸다** — 특히 `nulls not distinct` 열쇠와
 *     `on conflict … where` 가 0줄을 돌려주는 자리를. 여기를 대충 만들면 검사가 통과해도 아무 뜻이 없다.
 */
import {
  attendanceWrite, attendanceWriteMany, attendanceClear,
  dayView, countAttend, plannedAttend, lateStayUntil, keyOf, todayOf,
  ATTEND, WRITE_PATHS, LATE_STAY_PRESETS,
} from "../lib/attend.js";
import { Client } from "pg";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let fail = 0, n = 0;
const ok = (t, c, why = "") => {
  n++;
  if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
  else console.log(`   ✅ ${t}`);
};
/** 던지는지 본다 — 던져야 맞는 자리 */
const throws = async (t, fn, part = "") => {
  let msg = null;
  try { await fn(); } catch (e) { msg = String(e?.message ?? e); }
  ok(t, msg !== null && msg.includes(part), msg === null ? "안 던졌다" : `말이 다르다: ${msg}`);
};

// ── 가짜 DB — Postgres 를 흉내낸다 ────────────────────────────────────────────
//
// ⚠️ **넘어온 SQL 글자를 실제로 읽는다.** 「무슨 뜻이었을까」로 흉내내면
//    lib 에서 `and class_id is not distinct from $3` 을 지워도 검사가 통과한다 —
//    실제로 일부러 지워 보고 안 잡히는 것을 봤다. 그래서 열쇠 칸은 **SQL 에서 뽑아 쓴다.**
function fakeDb(seed = {}) {
  const sheets = [];
  const items = seed.items ?? [];        // {sheet_id}
  const makeups = seed.makeups ?? [];    // {student_id, on_date, state}
  const today = seed.today ?? "2026-09-02";
  const blocked = seed.blocked ?? (() => false);   // 접근 규칙 흉내
  const tx = [];
  let id = 0, clock = 0, snap = null;
  const same = (a, b) => (a ?? null) === (b ?? null);     // ⚠️ nulls not distinct
  /** SQL 이 반까지 열쇠로 걸었나 — 안 걸었으면 Postgres 도 반을 안 본다 */
  const byClass = (sql) => /class_id is not distinct from/.test(sql);
  const find = (sql, s, d, c) => sheets.find((x) =>
    x.student_id === s && x.date === d && (!byClass(sql) || same(x.class_id, c)));

  return {
    sheets, items, makeups, tx,
    async query(sql, p = []) {
      if (sql === "begin")    { snap = JSON.stringify(sheets); tx.push("begin"); return { rows: [] }; }
      if (sql === "rollback") { sheets.length = 0; sheets.push(...JSON.parse(snap)); tx.push("rollback"); return { rows: [] }; }
      if (sql === "commit")   { tx.push("commit"); return { rows: [] }; }

      const tag = (sql.match(/\/\* attend:(\w+) \*\//) || [])[1];
      switch (tag) {
        case "today": return { rows: [{ d: p[0] ?? today }] };

        case "upsert": {
          const [s, d, c, a, ifUn] = p;
          if (blocked({ studentId: s, date: d, classId: c ?? null, attend: a })) return { rows: [] };
          // ⚠️ 부딪히는 열쇠는 `on conflict (…)` 에 적힌 그대로다. 반을 빼면 반을 안 본다
          const target = (sql.match(/on conflict \(([^)]*)\)/) || [, ""])[1];
          const cur = sheets.find((x) => x.student_id === s && x.date === d
            && (!target.includes("class_id") || same(x.class_id, c)));
          if (cur) {
            // on conflict do update … where — 안 맞으면 **0줄**이 나온다
            if (ifUn != null && String(cur.updated_at) !== String(ifUn)) return { rows: [] };
            cur.attend = a; cur.updated_at = `t${++clock}`;
            return { rows: [{ ...cur }] };
          }
          const row = { id: `sh${++id}`, student_id: s, date: d, class_id: c ?? null,
                        attend: a, closed_at: null, sent_at: null, updated_at: `t${++clock}` };
          sheets.push(row);
          return { rows: [{ ...row }] };
        }

        case "one": {
          const r = find(sql, p[0], p[1], p[2]);
          return { rows: r ? [{ ...r }] : [] };
        }

        case "day": {
          // 그날 판은 **반으로 안 거른다** — 정규·특강 두 줄을 다 보여야 한다
          const rs = sheets.filter((x) => x.student_id === p[0] && x.date === p[1]
            && (!byClass(sql) || same(x.class_id, p[2])))
            .sort((a, b) => String(a.class_id ?? "").localeCompare(String(b.class_id ?? "")));
          return { rows: rs.map((r) => ({ ...r })) };
        }

        case "ismakeup":
          return { rows: [{ yes: makeups.some((m) => m.student_id === p[0] && m.on_date === p[1] && m.state !== "waived") }] };

        case "count": {
          // ⚠️ `group by` 에 적힌 칸으로만 묶는다 — class_id 를 빼면 반이 뭉개진 채로 나온다
          const gb = (sql.match(/group by ([^\n]*)/) || [, ""])[1];
          const g = new Map();
          for (const x of sheets) {
            if (x.student_id !== p[0] || x.date < p[1] || x.date > p[2]) continue;
            const k = `${gb.includes("class_id") ? (x.class_id ?? "") : ""}|${x.attend}`;
            g.set(k, (g.get(k) ?? 0) + 1);
          }
          return { rows: [...g].map(([k, v]) => ({ class_id: k.split("|")[0] || null, attend: k.split("|")[1], n: v })) };
        }

        case "countmakeup": {
          const s = new Set(makeups.filter((m) => m.student_id === p[0] && m.on_date >= p[1]
            && m.on_date <= p[2] && m.state !== "waived").map((m) => m.on_date));
          return { rows: [{ n: s.size }] };
        }

        case "planned": {
          const rs = sheets.filter((x) => x.date >= p[0] && ["late", "absent"].includes(x.attend)
            && (p[1] == null || x.student_id === p[1]))
            .sort((a, b) => (a.date + a.student_id).localeCompare(b.date + b.student_id));
          return { rows: rs.map((r) => ({ ...r })) };
        }

        case "children": {
          const r = find(sql, p[0], p[1], p[2]);
          return { rows: r ? [{ id: r.id, closed_at: r.closed_at, items: items.filter((i) => i.sheet_id === r.id).length }] : [] };
        }

        case "undo": {
          // ⚠️ 지우지 않는다 — attend 를 되돌린다 (대전제 6). 마감한 판은 안 건드린다
          const r = sheets.find((x) => x.id === p[0] && !x.closed_at);
          if (!r) return { rows: [] };
          r.attend = "present";
          return { rows: [{ id: r.id, attend: r.attend }] };
        }
      }
      throw new Error("가짜 DB 가 모르는 SQL: " + sql.slice(0, 70).replace(/\n/g, " "));
    },
  };
}

const S1 = "st-1", S2 = "st-2";
const CR = "cl-정규", CS = "cl-특강";

// ─────────────────────────────────────────────────────────────────────────────
console.log("■ 읽는 쪽이 보는 것 — 여덟 길이 전부 그것을 만든다 (자동 검사 ②)");
{
  const paths = Object.keys(WRITE_PATHS);
  ok("길이 여덟이다", paths.length === 8, `${paths.length}갈래: ${paths.join(",")}`);

  const missed = [];
  for (const [i, via] of paths.entries()) {
    const db = fakeDb();
    const date = `2026-06-${String(10 + i).padStart(2, "0")}`;
    const one = { via, studentId: S1, date, classId: CR,
                  attend: via === "makeup" ? "present" : "absent" };
    const r = await attendanceWrite(db, one, {});
    const v = await dayView(db, { studentId: S1, date });
    if (!r.ok || !v.has || v.rows[0].attend !== one.attend) missed.push(via);
  }
  ok("여덟 길 **전부** 찍으면 그날 판이 선다", missed.length === 0, missed.join(" "));

  await throws("이름 없는 길은 거절한다 (몰래 늘지 않는다)",
    () => attendanceWrite(fakeDb(), { via: "웹훅", studentId: S1, date: "2026-06-01", classId: null, attend: "present" }),
    "모르는 길");
}

console.log("\n■ 두 축 — 「왔나」와 「보강이냐」는 다르다 (0047)");
{
  ok("attend 는 넷이고 makeup 이 없다",
     ATTEND.length === 4 && !ATTEND.includes("makeup"), ATTEND.join(","));
  await throws("attend:'makeup' 을 거절한다",
    () => attendanceWrite(fakeDb(), { via: "quick", studentId: S1, date: "2026-06-01", classId: null, attend: "makeup" }),
    "'makeup' 은 없다");
  await throws("모르는 출결을 거절한다",
    () => attendanceWrite(fakeDb(), { via: "quick", studentId: S1, date: "2026-06-01", classId: null, attend: "출석" }),
    "모르는 출결");

  const db = fakeDb({ makeups: [{ student_id: S1, on_date: "2026-06-01", state: "set" }] });
  await attendanceWrite(db, { via: "makeup", studentId: S1, date: "2026-06-01", classId: null, attend: "present" });
  const v = await dayView(db, { studentId: S1, date: "2026-06-01" });
  ok("보강 날은 판이 'present' 이고 「보강이다」는 **세어 나온다**",
     v.rows[0].attend === "present" && v.isMakeupDay === true, JSON.stringify([v.rows[0].attend, v.isMakeupDay]));

  const db2 = fakeDb();
  await attendanceWrite(db2, { via: "quick", studentId: S1, date: "2026-06-01", classId: null, attend: "present" });
  const v2 = await dayView(db2, { studentId: S1, date: "2026-06-01" });
  ok("보강 표에 없으면 같은 'present' 라도 보강이 아니다", v2.isMakeupDay === false);
}

console.log("\n■ 복합키 (학생 + 날짜 + 반) — ⚠️ 이미 난 사고 자리");
{
  const db = fakeDb();
  const D = "2026-06-15";
  await attendanceWrite(db, { via: "quick", studentId: S1, date: D, classId: CR, attend: "present" });
  await attendanceWrite(db, { via: "quick", studentId: S1, date: D, classId: CS, attend: "absent" });
  const v = await dayView(db, { studentId: S1, date: D });
  ok("한 아이가 같은 날 정규·특강 **두 줄**에 선다", v.rows.length === 2, `${v.rows.length}줄`);
  const reg = v.rows.find((r) => r.classId === CR), sp = v.rows.find((r) => r.classId === CS);
  ok("특강 결석이 정규로 **안 샌다**", reg.attend === "present" && sp.attend === "absent",
     `정규 ${reg?.attend} · 특강 ${sp?.attend}`);

  const c = await countAttend(db, { studentId: S1, from: "2026-06-01", to: "2026-06-30", today: "2026-06-30" });
  const cr = c.byClass.find((b) => b.classId === CR), cs = c.byClass.find((b) => b.classId === CS);
  ok("세는 자리도 **반별로 갈라 센다**",
     cr.present === 1 && cr.absent === 0 && cs.absent === 1 && cs.present === 0,
     JSON.stringify(c.byClass));

  await throws("classId 를 **빼먹으면** 거절한다 (null 이라고 적어야 한다)",
    () => attendanceWrite(db, { via: "quick", studentId: S1, date: D, attend: "present" }),
    "빼먹었다");
  ok("classId: null 은 받는다", keyOf({ studentId: S1, date: D, classId: null }).classId === null);

  const db2 = fakeDb();
  await attendanceWrite(db2, { via: "quick", studentId: S1, date: D, classId: null, attend: "present" });
  await attendanceWrite(db2, { via: "sheet", studentId: S1, date: D, classId: null, attend: "absent" });
  ok("반이 빈 줄을 두 번 찍으면 **한 줄**이다 (nulls not distinct)",
     db2.sheets.length === 1 && db2.sheets[0].attend === "absent", `${db2.sheets.length}줄`);
}

console.log("\n■ 지각에 「얼마나」는 없다 — 찍은 시각이 곧 도착 시각이다 (원장님 2026-09-02)");
{
  // ⚠️ 아래 열세 줄은 **지운 줄이 아니라 뒤집은 줄**이다. 앞서는 「10·20·30·60분을 반드시 고르는가」를
  //    지켰고, 지금은 **그 요구가 정말 사라졌는가**와 **그 셈이 한 곳뿐인가**를 지킨다.
  //    지우면 되살아나도 아무도 모른다.
  const lib = await import("../lib/attend.js");
  const 출결src = readFileSync(join(ROOT, "lib/attend.js"), "utf8");

  ok("① 지각 단추가 **없다** — 지각용이라 지웠다",
     lib[["LATE", "PRESETS"].join("_")] === undefined);
  ok("② 손으로 「얼마나」를 받던 한 벌이 **없다** — 이제 묻지 않는다",
     lib["late" + "Minutes"] === undefined);

  /* ⚠️⚠️ 「몇 분 늦었나」는 **등원 한 벌(`lib/arrival.js` 의 `lateOf()`) 한 곳**이다.
   *    출결 한 벌은 그 셈을 **안 가진다** — 뺄셈도, 유예 분도, 「몇 분이면 결석인가」도.
   *    양쪽에 있으면 유예를 한쪽만 고치는 날 화면의 지각 표시와 리포트의 지각 횟수가 어긋난다. */
  ok("③ 지각 **정책**(유예 · 「몇 분이면 결석」)이 출결 한 벌에 **없다**",
     !/grace/i.test(출결src) && !/\b600\b/.test(출결src),
     "정책이 두 곳에 있으면 한쪽만 고치는 날이 온다 (원칙 1)");

  const libDir = join(ROOT, "lib");
  const 셈파일 = readdirSync(libDir).filter((f) => /\.js$/.test(f))
    .filter((f) => /export function late(Of|FromStamp|Minutes)\b/.test(readFileSync(join(libDir, f), "utf8")));
  ok(`④ 「몇 분 늦었나」 셈이 lib/ 에 **한 곳**뿐이다 (${셈파일.join(" ") || "없음"})`,
     셈파일.length === 1 && 셈파일[0] === "arrival.js", 셈파일.join(" "));

  // ⑤~⑨ **그 한 곳이 제대로 세는가.** 여기서 다시 세지 않고 그것을 부른다
  const 등원 = join(ROOT, "lib/arrival.js");
  if (existsSync(등원)) {
    const { lateOf } = await import("../lib/arrival.js");
    ok("⑤ 반 시각과 찍은 시각을 견주어 **20분 늦었다고 센다** (원칙 5 — 저장하지 않는다)",
       lateOf({ startTime: "19:00", atHm: "19:20" }).minutes === 20,
       JSON.stringify(lateOf({ startTime: "19:00", atHm: "19:20" })));
    ok("⑥ 그래서 갈래가 'late' 다 — **앱이 센 것이고 아이가 고른 것이 아니다**",
       lateOf({ startTime: "19:00", atHm: "19:20" }).attend === "late");
    ok("⑦ `time` 칸이 주는 'HH:MM:SS' 도 읽는다 (v2.class_schedule.start_time)",
       lateOf({ startTime: "19:00:00", atHm: "19:20" }).minutes === 20);
    const 몰라 = lateOf({ atHm: "19:20" });
    ok("⑧ 반 시각을 모르면 **못 셌다고 말한다** — 정시라고 우기지 않는다",
       몰라.sure === false && 몰라.minutes === null && String(몰라.why).includes("확인 안 됨"),
       JSON.stringify(몰라));
    ok("⑨ 수업 시작보다 일찍 왔으면 **지각이 아니다**",
       lateOf({ startTime: "19:00", atHm: "18:40" }).attend === "present",
       JSON.stringify(lateOf({ startTime: "19:00", atHm: "18:40" })));
  } else {
    console.log("   ⚠️ 확인 안 됨 — lib/arrival.js 가 아직 없어 **그 셈이 도는지 못 봤다** (5줄)");
  }

  await throws("⑩ ⚠️ 지각에 「얼마나」를 **주면 거절한다** — 담을 칸이 없는데 받으면 값이 사라진다",
    () => attendanceWrite(fakeDb(),
      { via: "quick", studentId: S1, date: "2026-06-02", classId: null, attend: "late", late: 20 }),
    "「얼마나」는 없다");
  await throws("⑪ 「도착 시각」 꼴로 넘겨도 마찬가지다 (샛길을 안 둔다)",
    () => attendanceWrite(fakeDb(),
      { via: "quick", studentId: S1, date: "2026-06-02", classId: null, attend: "late",
        late: { arriveAt: "19:20" } }),
    "「얼마나」는 없다");

  const db = fakeDb();
  const r = await attendanceWrite(db,
    { via: "plan", studentId: S1, date: "2026-09-20", classId: CR, attend: "late" });
  const v = await dayView(db, { studentId: S1, date: "2026-09-20" });
  ok("⑫ 「얼마나」 **없이** 지각 판이 선다 (앞서는 여기서 거절당했다)",
     r.ok === true && v.rows[0].attend === "late", JSON.stringify([r.ok, r.why, r.msg]));
  ok("⑬ 「저장 못 했다」는 경고도 **없다** — 요구도 저장도 안 하니 할 말이 없다",
     r.late === undefined && r.lateSaved === undefined && r.warn === undefined,
     JSON.stringify([r.late, r.lateSaved, r.warn]));
}

console.log("\n■ 늦귀가 시간 단추 — **한 곳에 둔다** (원장님 「같게 맞춰」)");
{
  ok("단추는 +20·+40·+60분", LATE_STAY_PRESETS.join(",") === "20,40,60", LATE_STAY_PRESETS.join(","));
  ok("예상 귀가 = 평소 하원 + N분", lateStayUntil("21:00", 40) === "21:40", String(lateStayUntil("21:00", 40)));
  ok("`time` 칸이 주는 'HH:MM:SS' 도 읽는다", lateStayUntil("21:00:00", 20) === "21:20");
  ok("자정을 넘겨도 안 터진다", lateStayUntil("23:30", 60) === "00:30", String(lateStayUntil("23:30", 60)));
  ok("평소 하원을 모르면 **null** — 화면이 단추를 안 만들고 직접 적게 한다",
     lateStayUntil(null, 20) === null && lateStayUntil("", 20) === null);
  let bad = null;
  try { lateStayUntil("21:00", 0); } catch (e) { bad = String(e.message); }
  ok("「+0분」 같은 값은 거절한다 (누르나 마나가 되면 원장님이 눌러 놓고 안 눌린 줄 안다)",
     bad !== null && bad.includes("이상하다"), String(bad));

  const ui = readFileSync(join(ROOT, "app/today/ui.js"), "utf8");
  ok("⚠️ 화면(app/today/ui.js)이 숫자를 **스스로 안 적는다** — lib 을 부른다",
     /LATE_STAY_PRESETS/.test(ui) && /lateStayUntil/.test(ui) && !/\[\s*20\s*,\s*40\s*,\s*60\s*\]/.test(ui));
}

console.log("\n■ 몇 줄이 실제로 바뀌었나 — 0줄이면 실패다 (자동 검사 ⑪)");
{
  const db = fakeDb({ blocked: () => true });        // 접근 규칙이 전부 막는다
  const r = await attendanceWrite(db, { via: "quick", studentId: S1, date: "2026-06-03", classId: null, attend: "present" });
  ok("접근 규칙이 막으면 **성공이라 말하지 않는다**",
     r.ok === false && r.changed === 0 && r.why === "blocked", JSON.stringify(r));
  ok("막힌 판은 서지도 않았다", db.sheets.length === 0);

  const db2 = fakeDb();
  const a = await attendanceWrite(db2, { via: "quick", studentId: S1, date: "2026-06-04", classId: null, attend: "present" });
  const b = await attendanceWrite(db2, { via: "sheet", studentId: S1, date: "2026-06-04", classId: null,
                                         attend: "absent", ifUnchanged: "t-옛날" });
  ok("「내가 읽은 그 줄」이 아니면 저장 안 한다 (폰·PC 덮어쓰기)",
     b.ok === false && b.why === "stale", JSON.stringify(b));
  ok("덮어쓰기를 막은 뒤 값은 그대로다", db2.sheets[0].attend === "present");
  const c = await attendanceWrite(db2, { via: "sheet", studentId: S1, date: "2026-06-04", classId: null,
                                         attend: "absent", ifUnchanged: a.updatedAt });
  ok("맞는 줄이면 저장된다", c.ok === true && db2.sheets[0].attend === "absent");
}

console.log("\n■ 여러 줄 (엑셀 길) — 하나가 막히면 되돌린다");
{
  const list = [
    { via: "excel", studentId: S1, date: "2026-06-05", classId: CR, attend: "present" },
    { via: "excel", studentId: S2, date: "2026-06-05", classId: CR, attend: "absent" },
    { via: "excel", studentId: "st-3", date: "2026-06-05", classId: CR, attend: "present" },
  ];
  const db = fakeDb({ blocked: (x) => x.studentId === S2 });
  const r = await attendanceWriteMany(db, list, { tx: true });
  ok("하나가 막히면 전체가 실패다", r.ok === false && r.bad.length === 1, JSON.stringify(r.bad));
  ok("**되돌린다** — 앞줄도 안 남는다", r.rolledBack === true && db.sheets.length === 0, `${db.sheets.length}줄`);
  ok("되돌린 자취가 남는다", db.tx.join(">") === "begin>rollback", db.tx.join(">"));

  const db2 = fakeDb({ blocked: (x) => x.studentId === S2 });
  const r2 = await attendanceWriteMany(db2, list, {});      // tx 를 안 줬다
  ok("트랜잭션이 아니면 **되돌린 척 안 한다**",
     r2.rolledBack === false && String(r2.warn).includes("되돌리지 못했다"), String(r2.warn));

  const db3 = fakeDb();
  const r3 = await attendanceWriteMany(db3, list, { tx: true });
  ok("다 되면 세 줄이 선다", r3.ok === true && r3.saved === 3 && db3.sheets.length === 3);
  ok("커밋한 자취가 남는다", db3.tx.join(">") === "begin>commit", db3.tx.join(">"));

  const db4 = fakeDb();
  const r4 = await attendanceWriteMany(db4, [{ via: "excel", studentId: S1, date: "2026-06-05", attend: "present" }], { tx: true });
  ok("엑셀 줄에 반이 빠져 있으면 그 줄이 실패로 잡힌다",
     r4.ok === false && String(r4.bad[0].msg).includes("빼먹었다"), JSON.stringify(r4.bad[0]));
}

console.log("\n■ 예정 무르기 — **지우지 않는다. 되돌린다** (대전제 6)");
{
  const db = fakeDb();
  await attendanceWrite(db, { via: "plan", studentId: S1, date: "2026-09-25", classId: CR, attend: "absent" });
  const id = db.sheets[0].id;

  db.items.push({ sheet_id: id });
  const r = await attendanceClear(db, { studentId: S1, date: "2026-09-25", classId: CR });
  ok("딸린 줄이 있어도 **무를 수 있다** — 판을 안 지우므로 기록이 안 날아간다",
     r.ok === true && r.changed === 1, JSON.stringify(r));
  ok("판이 그대로 있다 (지운 것이 아니다)", db.sheets.length === 1);
  ok("결석 예정이 「온다」로 되돌았다", db.sheets[0].attend === "present", db.sheets[0].attend);
  ok("딸린 줄도 그대로다", db.items.length === 1);

  const r3 = await attendanceClear(db, { studentId: S2, date: "2026-09-25", classId: CR });
  ok("없는 줄을 무르면 **0줄이라 실패**다", r3.ok === false && r3.changed === 0 && r3.why === "none", JSON.stringify(r3));

  const db2 = fakeDb();
  await attendanceWrite(db2, { via: "plan", studentId: S1, date: "2026-09-26", classId: CR, attend: "absent" });
  db2.sheets[0].closed_at = "2026-09-26T12:00:00Z";
  const r4 = await attendanceClear(db2, { studentId: S1, date: "2026-09-26", classId: CR });
  ok("마감한 판은 안 건드린다 — 학부모가 이미 봤다", r4.ok === false && r4.why === "closed", JSON.stringify(r4));
  ok("마감한 판의 결석이 그대로다", db2.sheets[0].attend === "absent");
}

console.log("\n■ 앞날에도 찍힌다 · **세는 자리는 「오늘까지」**");
{
  const TODAY = "2026-09-02";
  const db = fakeDb({ today: TODAY, makeups: [
    { student_id: S1, on_date: "2026-09-01", state: "done" },
    { student_id: S1, on_date: "2026-09-01", state: "done" },   // 같은 날 두 줄 → 하루로 센다
    { student_id: S1, on_date: "2026-08-20", state: "waived" }, // 물린 보강은 안 센다
  ] });
  await attendanceWrite(db, { via: "quick",  studentId: S1, date: "2026-09-01", classId: CR, attend: "present" });
  await attendanceWrite(db, { via: "quick",  studentId: S1, date: "2026-09-02", classId: CR, attend: "late" });
  await attendanceWrite(db, { via: "plan",   studentId: S1, date: "2026-09-20", classId: CR, attend: "absent" });
  await attendanceWrite(db, { via: "plan",   studentId: S1, date: "2026-09-25", classId: CS, attend: "late" });

  ok("앞날에도 판이 선다 (결석·지각 예정)", db.sheets.length === 4, `${db.sheets.length}줄`);

  const c = await countAttend(db, { studentId: S1, from: "2026-09-01", to: "2026-09-30", today: TODAY });
  ok("앞날은 **안 센다** — 오늘까지만", c.all.total === 2 && c.upto === TODAY, JSON.stringify(c.all));
  ok("안 셌다고 말한다", c.cut === true && String(c.warn).includes("앞날은 안 셌다"), String(c.warn));
  ok("아직 안 온 결석이 지난 횟수에 안 섞인다", c.all.absent === 0, `결석 ${c.all.absent}`);
  ok("보강 횟수는 v2.makeup 에서 세고 물린 것은 뺀다", c.makeup === 1, `${c.makeup}회`);

  const p = await plannedAttend(db, { today: TODAY });
  ok("앞날 결석·지각이 **예정 묶음**에 선다 (오늘 것 포함)",
     p.rows.length === 3 && p.rows[0].date === TODAY, JSON.stringify(p.rows.map((r) => r.date)));
  ok("정시는 예정 묶음에 안 든다", p.rows.every((r) => r.attend !== "present"));

  const p1 = await plannedAttend(db, { studentId: S2, today: TODAY });
  ok("다른 아이 것은 안 섞인다", p1.rows.length === 0);
  ok("「학원의 오늘」은 DB 한 곳에서 온다", (await todayOf(db)) === TODAY);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n■ 출결 쓰는 길이 하나뿐인가 — 파일을 훑는다 (자동 검사 ②)");
{
  const walk = (d, out = []) => {
    if (!existsSync(d)) return out;
    for (const f of readdirSync(d)) {
      if (["node_modules", ".next", ".git", "backup", "_tmp", "sandbox"].includes(f)) continue;
      const p = join(d, f);
      statSync(p).isDirectory() ? walk(p, out) : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p);
    }
    return out;
  };
  const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib")), ...walk(join(ROOT, "scripts"))];
  const rel = (p) => relative(ROOT, p);

  // ⚠️ 봐 주는 자리는 둘뿐이다: 한 벌 그 자신과, **제 fixture 를 세우는 검사 스크립트**.
  //    그 밖에는 없다 — 크론이든 서버 액션이든 출결을 직접 쓰면 여기서 깨진다.
  const spare = (p) => rel(p) === "lib/attend.js" || /^scripts\/check-[\w-]+\.mjs$/.test(rel(p));

  /**
   * 막는 것은 **출결**이다. 판 줄을 세우거나 지우는 것과 `attend` 칸을 고치는 것.
   * ⚠️ `closed_at`(마감)·`sent_at`(발송)은 다른 한 벌의 칸이라 막지 않는다 —
   *    여기서 같이 막으면 마감 한 벌이 제 일을 못 한다.
   */
  function attendWrites(text) {
    const hit = [];
    if (/insert\s+into\s+v2\.day_sheet/i.test(text)) hit.push("판을 새로 만든다");
    if (/delete\s+from\s+v2\.day_sheet/i.test(text)) hit.push("판을 지운다");
    for (const m of text.matchAll(/update\s+v2\.day_sheet\s+set\s+([\s\S]*?)(\bwhere\b|\breturning\b|;|`)/gi)) {
      if (/\battend\s*=/i.test(m[1])) hit.push("attend 칸을 고친다");
    }
    // ⚠️ 거친 그물 — supabase 어댑터로 쓰는 자리도 잡는다. 한 파일 안에 둘 다 있으면 걸린다
    if (/\.from\(\s*["']day_sheet["']\s*\)/.test(text) && /\.(insert|upsert|update|delete)\s*\(/.test(text))
      hit.push("supabase 어댑터로 day_sheet 를 쓴다");
    return hit;
  }

  const sneaky = files.filter((f) => !spare(f) && attendWrites(readFileSync(f, "utf8")).length);
  ok("출결을 쓰는 자리가 lib/attend.js 밖에 없다", sneaky.length === 0,
     sneaky.map((f) => `${rel(f)}(${attendWrites(readFileSync(f, "utf8")).join("·")})`).join(" "));

  const fixtures = files.filter((f) => spare(f) && rel(f) !== "lib/attend.js" && attendWrites(readFileSync(f, "utf8")).length);
  console.log(`      (검사용 fixture 라 봐 준 파일 ${fixtures.length}개: ${fixtures.map(rel).join(" ") || "없음"})`);

  const others = files.filter((f) => !spare(f) && /v2\.day_sheet/.test(readFileSync(f, "utf8")));
  console.log(`      (판을 **읽기만** 하거나 마감·발송 칸만 만지는 파일 ${others.length}개: ${others.map(rel).join(" ") || "없음"})`);

  // 화면이 부르는 via 가 여덟 안에 있는가 — 길이 늘 때 여기서 잡는다
  const callers = files.filter((f) => rel(f) !== "lib/attend.js" && !rel(f).startsWith("scripts/")
    && /attendanceWrite/.test(readFileSync(f, "utf8")));
  const strange = [];
  const seen = new Set();
  for (const f of callers) {
    // ⚠️ `\w` 를 쓰지 마라 — 한글 이름(via:"웹훅")을 못 잡는다. 일부러 깨 보고 안 잡히는 것을 봤다
    for (const m of readFileSync(f, "utf8").matchAll(/\bvia\s*:\s*["']([^"']+)["']/g)) {
      seen.add(m[1]);
      if (!WRITE_PATHS[m[1]]) strange.push(`${rel(f)}:${m[1]}`);
    }
  }
  ok("화면이 쓰는 via 가 전부 여덟 길 안에 있다", strange.length === 0, strange.join(" "));
  console.log(`      (화면에 붙은 길 ${seen.size}/8${seen.size ? ": " + [...seen].join(" ") : " — 아직 화면이 없다"})`);

  /* ⚠️ **지운 이름이 정말 안 쓰이는가.** 지각 「얼마나」를 없앨 때 부르던 자리를 안 고치면
   *    빌드가 깨진다 — 실제로 app/schedule · app/parent 두 화면이 부르고 있었다.
   *    ⚠️ `scripts/` 는 안 본다: 검사는 「이제 안 쓴다」를 말하느라 그 이름을 적을 수밖에 없다.
   *       대신 검사가 그 이름을 **들여오면** ESM 이 그 자리에서 터진다(없는 export 라서). */
  const 지운이름 = [["LATE", "PRESETS"].join("_"), "late" + "Minutes"];
  const 진짜코드 = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))];
  const 남은 = 진짜코드.filter((f) => {
    const t = readFileSync(f, "utf8");
    return 지운이름.some((w) => new RegExp(`\\b${w}\\b`).test(t));
  });
  ok(`지운 이름(${지운이름.join(" · ")})을 부르는 자리가 app/·lib/ 에 없다`,
     남은.length === 0, 남은.map(rel).join(" "));
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ 가짜 DB 는 **칸 이름이 진짜 있는지는 못 본다.** 지어낸 칸 이름은 화면에서야 터진다.
//    그래서 SQL 을 진짜 v2 에 `prepare` 해 본다 — **한 줄도 쓰지 않는다**(파싱·계획만).
console.log("\n■ SQL 이 진짜 v2 스키마에 맞는가 — DB 에 물어본다 (한 줄도 안 쓴다)");
let skipped = 0;
{
  const TYPES = {   // ⚠️ SQL 을 더하면 여기 타입도 더해야 한다. 안 더하면 이 검사가 깨진다
    today: "(text)", upsert: "(uuid,text,uuid,text,text)", one: "(uuid,text,uuid)",
    day: "(uuid,text)", ismakeup: "(uuid,text)", count: "(uuid,text,text)",
    countmakeup: "(uuid,text,text)", planned: "(text,uuid)", children: "(uuid,text,uuid)",
    undo: "(uuid)",
  };
  const src = readFileSync(join(ROOT, "lib/attend.js"), "utf8");
  const found = [...src.matchAll(/`(\/\* attend:(\w+) \*\/[\s\S]*?)`/g)].map((m) => ({ sql: m[1], tag: m[2] }));

  ok("SQL 문마다 타입이 적혀 있다 (새 문을 몰래 못 더한다)",
     found.every((f) => TYPES[f.tag]), found.filter((f) => !TYPES[f.tag]).map((f) => f.tag).join(" "));
  ok("SQL 안에 ${} 를 끼워 넣지 않았다 (끼우면 기계로 못 본다)",
     found.every((f) => !f.sql.includes("${")), found.filter((f) => f.sql.includes("${")).map((f) => f.tag).join(" "));

  const env = join(ROOT, ".env.local");
  const url = existsSync(env) ? (readFileSync(env, "utf8").match(/DATABASE_URL=(.+)/) || [])[1]?.trim() : null;
  if (!url) {
    skipped = found.length;
    console.log(`   ⚠️ 확인 안 됨 — .env.local 의 DATABASE_URL 이 없어 SQL ${found.length}문을 **못 봤다**`);
  } else {
    const { Client } = await import("pg");
    const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    let up = false;
    for (let i = 1; i <= 3; i++) {
      try { await c.connect(); up = true; break; } catch { await new Promise((r) => setTimeout(r, 3000)); }
    }
    if (!up) {
      skipped = found.length;
      console.log(`   ⚠️ 확인 안 됨 — DB 에 못 붙어 SQL ${found.length}문을 **못 봤다**`);
    } else {
      const bad = [];
      for (const f of found) {
        if (!TYPES[f.tag]) continue;
        try { await c.query(`prepare zz_${f.tag} ${TYPES[f.tag]} as ${f.sql}`); await c.query(`deallocate zz_${f.tag}`); }
        catch (e) { bad.push(`${f.tag}: ${String(e.message).split("\n")[0]}`); }
      }
      ok(`SQL ${found.length}문이 v2 의 진짜 칸 이름으로 서 있다`, bad.length === 0, bad.join(" / "));
      await c.end();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️⚠️ 가짜 DB 는 **죽은 칸도 제약 위반도 못 잡는다.** 진짜 v2 에 한 번은 써 본다.
//    ⚠️ 쓰는 것은 **리허설 학생(`import_batch='fixture'`, zz_시험_)뿐이다.**
//       앞 판에서 `state='active'` 로 진짜 학생을 골라 **장원우의 오늘 판에 52줄**이 굳었다.
//    ⚠️ 트랜잭션 안에서만 쓰고 **끝에 반드시 되돌린다.** 되돌렸는지도 눈으로 센다.
console.log("\n■ 진짜 DB — 리허설 학생에게 쓰고 되돌린다");
{
  const env = join(ROOT, ".env.local");
  const url = existsSync(env) ? (readFileSync(env, "utf8").match(/DATABASE_URL=(.+)/) || [])[1]?.trim() : null;
  let c = null;
  if (!url) {
    skipped += 1;
    console.log("   ⚠️ 확인 안 됨 — .env.local 의 DATABASE_URL 이 없어 **진짜 DB 로 못 돌렸다**");
  } else try {
    c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
    for (let i = 1; ; i++) { try { await c.connect(); break; }
      catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }

    // ⚠️ 진짜 재원생에게 쓰지 마라. 리허설 계정으로만 쓴다
    const stu = (await c.query(
      `select id, name from v2.students where import_batch = 'fixture' order by name limit 1`)).rows[0];
    if (!stu) throw new Error("리허설 학생(zz_시험_)이 없다 — 진짜 학생으로는 안 돌린다");
    // ⚠️ 진짜 자료를 안 스치도록 **아무 판도 없는 앞날**을 쓴다
    const day = (await c.query(`select (v2.today() + 400)::text d`)).rows[0].d;
    const nSheet = async () => (await c.query(
      `select count(*)::int n from v2.day_sheet where student_id=$1 and date=$2::date`, [stu.id, day])).rows[0].n;

    await c.query("begin");
    const db = { query: (q, p) => c.query(q, p) };
    ok("리허설 학생을 찾았고 그 앞날에 판이 하나도 없다",
       !!stu && (await nSheet()) === 0, `${stu?.name} · ${await nSheet()}줄`);

    // ① 「얼마나」 없이 지각이 찍히는가 — 진짜 제약·트리거·규칙을 지난다
    const r = await attendanceWrite(db,
      { via: "quick", studentId: stu.id, date: day, classId: null, attend: "late" });
    ok("⚠️ 진짜 DB 에 **「얼마나」 없이** 지각 판이 선다", r.ok === true && r.changed === 1,
       JSON.stringify([r.ok, r.why, r.msg]));
    const back = (await c.query(
      `select attend from v2.day_sheet where student_id=$1 and date=$2::date`, [stu.id, day])).rows[0];
    ok("판에 'late' 가 그대로 적혔다", back?.attend === "late", JSON.stringify(back));

    // ② ⚠️ 「담을 칸이 없다」는 말이 정말인가 — 칸 이름을 세어 본다
    const cols = (await c.query(
      `select column_name from information_schema.columns
        where table_schema='v2' and table_name='day_sheet'`)).rows.map((x) => x.column_name);
    const 지각칸 = cols.filter((x) => /late|arriv|min/i.test(x));
    ok(`v2.day_sheet 칸 ${cols.length}개에 지각 「몇 분」을 담을 칸이 **없다** (그래서 안 묻는다)`,
       지각칸.length === 0, 지각칸.join(" "));

    // ③ 그래도 넘기면 **한 줄도 안 쓰고** 거절하는가
    const 전 = await nSheet();
    await throws("「얼마나」를 넘기면 진짜 DB 앞에서도 거절한다",
      () => attendanceWrite(db, { via: "quick", studentId: stu.id, date: day, classId: null,
                                  attend: "late", late: 20 }), "「얼마나」는 없다");
    ok("거절당한 뒤 판이 **한 줄도 안 늘었다**", (await nSheet()) === 전, `${전} → ${await nSheet()}`);

    // ④ 진짜 반 시각으로 센다 — 17분 뒤를 **DB 가** 만들고, 몇 분인지는 **lib 이** 센다
    const sch = (await c.query(
      `select start_time::text as st, (start_time + interval '17 minutes')::time::text as stamp
         from v2.class_schedule where start_time < '23:00' order by start_time limit 1`)).rows[0];
    if (sch && existsSync(join(ROOT, "lib/arrival.js"))) {
      // ⚠️ 17분 뒤를 만드는 것은 **DB** 이고, 몇 분인지 세는 것은 **등원 한 벌**이다.
      //    같은 자리에서 두 번 세지 않으므로 서로를 맞춰 보는 뜻이 있다.
      const { lateOf } = await import("../lib/arrival.js");
      const 셈 = lateOf({ startTime: sch.st, atHm: sch.stamp.slice(0, 5) });
      ok(`진짜 반 시각(${sch.st.slice(0, 5)})으로 17분 늦은 것을 **17분이라 센다**`,
         셈.attend === "late" && 셈.minutes === 17, JSON.stringify(셈));
    } else {
      skipped += 1;
      console.log("   ⚠️ 확인 안 됨 — 반 시각이 없거나 등원 한 벌이 아직 없어 **셈을 진짜 값으로 못 봤다**");
    }

    // ⑤ ⚠️ 되돌린다. **되돌렸는지도 센다** — 한 번 실패하면 그대로 굳는다
    await c.query("rollback");
    ok("⚠️ 되돌린 뒤 그 판이 **없다** — 리허설 판에도 자국을 안 남긴다",
       (await nSheet()) === 0, `${await nSheet()}줄`);
  } catch (e) {
    fail++; n++;
    console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e?.message ?? e).split("\n")[0]);
    try { await c?.query("rollback"); } catch { /* 이미 닫혔으면 그만 */ }
  } finally {
    try { await c?.end(); } catch { /* 그만 */ }
  }
}

console.log(`\n■ 출결 쓰기 검사 ${n}건 · 실패 ${fail}${skipped ? ` · ⚠️ 못 봄 ${skipped}` : ""}`);
process.exit(fail ? 1 : 0);
