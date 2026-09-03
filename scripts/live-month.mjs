/**
 * **한 달을 통째로 살아본다** — 진짜 Postgres 에, 진짜 화면 코드로.
 *
 * 원장님 (2026-08-06)
 *   「완료되면 없는 데이터는 더미데이터 만들어서 가상으로 원장용 학생용
 *    학부모용 실제로 네가 1달 수업 동안 써봐. 학사일정 고려해서 가상의
 *    데이터 다 넣어가면서! 검토하고 문제점 찾아서 개선해줘」
 *
 * ── 계산만 돌려보는 것과 무엇이 다른가 ──────────────────────
 *
 * 옛 시뮬레이션들(simulate-*.mjs, 2026-08-28 정리)은 **계산만** 돌려봤다
 * (lib 함수에 값을 넣어본다). 그것으로는 못 잡는 것이 있다 —
 *
 *   · 읽기 규칙(RLS) 때문에 **학부모 화면이 통째로 비는 것** (실제로 몇 주
 *     그랬다. 원장님 미리보기는 선생님 권한이라 다 보여서 아무도 몰랐다)
 *   · 한 달 치가 쌓였을 때만 보이는 것 (재시험 반복 · 회차 · 진도)
 *
 * 그래서 여기서는 **진짜 Postgres 에 SETUP_ALL 을 올리고**, 9월 한 달을 하루씩
 * 살면서 실제로 넣고, **원장·학생·학부모 셋의 눈으로 각각 읽어서**(RLS 를
 * 그대로 타고) 화면이 쓰는 lib 함수에 먹인다.
 *
 * 쓰는 법:  node scripts/live-month.mjs
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { summarize } from "../lib/monthly.js";
import { isClosed, maskRows } from "../lib/closeGate.js";
import { oneRound, stack, points } from "../lib/report.js";
import { analyze, advice } from "../lib/examAnalysis.js";
import { consultText } from "../lib/consultText.js";
import { volumeLabel } from "../lib/unitTree.js";
import { unitProgress, stuckAcross } from "../lib/unitStreak.js";

/* ⚠️⚠️ **postgres 가 어디 있는지 여기서 정하지 않는다** (2026-09-03).
 *   앞판은 `/usr/lib/postgresql/16/bin` 을 박아 두고 거기 initdb 가 없으면 도커라고 봤다.
 *   맥에 postgresql@16 을 깔아도 그 자리가 아니라(keg-only) **늘 도커로 갈리고,
 *   도커도 없으니 「한 달 살아보기」가 계속 건너뛰었다.**
 *   → 띄우는 법은 `scripts/pg-boot.sh` **한 곳**에 산다. 여기서는 물어보기만 한다(원칙 1). */
const askBoot = (...a) => {
  try { return execFileSync("bash", ["scripts/pg-boot.sh", ...a], { encoding: "utf8" }).trim(); }
  catch { return ""; }
};
const PGBIN = askBoot("--bin");
const DATA = "/var/tmp/pgmonth";
const PORT = "55437";
const DB = "chloe";
const ENV = { ...process.env, PATH: `${PGBIN}:${process.env.PATH}` };

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts });

/**
 * **맥에도 진짜 Postgres 를 준다** (2026-08-28).
 *
 * 이 검사는 `initdb` 가 없으면 「건너뜁니다」 하고 rc=0 으로 끝났다. 맥에는
 * 없으니 **한 번도 안 돌았는데** check-pages 는 「✅ 전부 통과」 라고 적었다.
 * (게다가 check-pages 쪽은 파이프로 성패를 삼키고 있어서, 죽어도 통과였다.)
 * 그래서 initdb 가 없으면 도커의 postgres:16 으로 돌린다 — 셸 검사 다섯이
 * 쓰는 scripts/pg-boot.sh 와 같은 방식이다.
 */
// 도커로 띄울 때 컨테이너 이름. 이 검사는 시작할 때 같은 이름을 **지우고**
// 새로 띄우므로, 여러 갈래를 나란히 돌릴 때는 LIVE_PG_NAME 으로 갈라 준다
// (남의 컨테이너를 지워버리면 그쪽 검사가 조용히 죽는다)
const CT = process.env.LIVE_PG_NAME || "pgmonth";
const DOCKER = !(PGBIN && existsSync(`${PGBIN}/initdb`));
const runPsql = (args, opts = {}) =>
  DOCKER
    ? sh("docker", ["exec", "-i", CT, "psql", "-U", "postgres", ...args], opts)
    : sh(`${PGBIN}/psql`, ["-h", "/var/tmp", "-p", PORT, "-U", "postgres", ...args],
         { env: ENV, ...opts });
const psql = (sql) => runPsql(["-d", DB, "-q", "-tA", "-c", sql]);
// NOTICE 는 안 본다 — 「이미 있어서 건너뜀」 이 수백 줄이라 진짜 오류가 묻힌다
const psqlFile = (path) => {
  if (DOCKER) {
    // 컨테이너 안에서 -f 로 읽게 넣어준다 (SETUP_ALL 도, /tmp 에 찍은 씨앗도)
    sh("docker", ["cp", path, `${CT}:/work/run.sql`], { stdio: "ignore" });
    return sh("docker", ["exec", "-i", "-e", "PGOPTIONS=-c client_min_messages=warning", CT,
      "psql", "-U", "postgres", "-d", DB, "-q", "-v", "ON_ERROR_STOP=1", "-f", "/work/run.sql"]);
  }
  return sh("sh", ["-c",
    `PGOPTIONS='-c client_min_messages=warning' ${PGBIN}/psql -h /var/tmp -p ${PORT} -U postgres -d ${DB} -q -v ON_ERROR_STOP=1 -f ${path}`],
    { env: ENV });
};

/**
 * psql 이 뱉은 것을 JSON 으로.
 *
 * **json_agg 는 줄을 바꿔서 뱉는다** (`[{...}, \n {...}]`). 처음에 마지막
 * 줄만 읽었더니 85건이 0건으로 보였다 — 자료는 멀쩡한데 화면이 빈 것처럼
 * 보이는, 이 앱에서 여러 번 겪은 바로 그 모양이다.
 * 그래서 **첫 `[` 부터 끝까지** 통째로 읽는다.
 */
function jsonOf(out) {
  const t = (out || "").trim();
  const at = t.indexOf("[");
  if (at < 0) return [];
  try { return JSON.parse(t.slice(at)); } catch { return []; }
}
const rows = (sql) => jsonOf(psql(`select coalesce(json_agg(t), '[]') from (${sql}) t;`));
const one = (sql) => psql(sql).trim().split("\n").filter(Boolean).pop() || "";

// 진짜로 못 돌렸을 때 — **통과라고 말하지 않는다** (pg-boot.sh 의 pg_skip 과 같은 말)
function skipNoPg() {
  console.log("⚠️  건너뜀 (통과가 아닙니다) — 한 달 살아보기: 진짜 Postgres 가 없습니다");
  console.log("   리눅스면 postgresql-16, 맥이면 도커를 켜고 한 번만:  docker pull postgres:16");
  if (process.env.PGSKIP_FILE)
    try { appendFileSync(process.env.PGSKIP_FILE, "한 달 살아보기 (원장·학생·학부모 셋의 눈)\n"); } catch {}
  process.exit(0);
}

function startPg() {
  if (DOCKER) {
    try {
      sh("docker", ["info"], { stdio: "ignore" });
      sh("docker", ["image", "inspect", "postgres:16"], { stdio: "ignore" });
    } catch { skipNoPg(); }
    try { sh("docker", ["rm", "-f", CT], { stdio: "ignore" }); } catch {}
    sh("docker", ["run", "-d", "--name", CT,
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-e", "POSTGRES_PASSWORD=chloe",
      "postgres:16"], { stdio: "ignore" });
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try { sh("docker", ["exec", CT, "pg_isready", "-U", "postgres"], { stdio: "ignore" }); up = true; }
      catch { sh("sleep", ["1"]); }
    }
    if (!up) { stopPg(); skipNoPg(); }
    sh("docker", ["exec", CT, "mkdir", "-p", "/work"], { stdio: "ignore" });
    runPsql(["-q", "-c", `create database ${DB};`]);
    // Supabase 가 만들어주는 것들 — 우리 SQL 은 이것이 있다고 보고 쓴다
    runPsql(["-q", "-c", "create role anon; create role authenticated; create role service_role;"]);
  } else {
    /* ⚠️ 띄우는 법을 여기 다시 적지 않는다 — `pg-boot.sh --start` 한 곳이다(원칙 1).
     *    맥·리눅스 갈래도, LC_ALL 도, 「진짜 떴는지 물어보기」도 전부 저기 있다. */
    askBoot("--stop", "native", CT, DATA);
    if (!askBoot("--start", CT, PORT, DATA).includes("PGMODE=")) skipNoPg();
    runPsql(["-q", "-c", `create database ${DB};`]);
    // Supabase 가 만들어주는 것들 — 우리 SQL 은 이것이 있다고 보고 쓴다
    runPsql(["-q", "-c", "create role anon; create role authenticated; create role service_role;"]);
  }
  psql(`create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;`);
}
function stopPg() {
  if (DOCKER) { try { sh("docker", ["rm", "-f", CT], { stdio: "ignore" }); } catch {} return; }
  askBoot("--stop", "native", CT, DATA);   // 치우는 법도 pg-boot.sh 한 곳이다
}

/* ════════════════════════════════════════════════════════════
   가상 학원 — 2026년 9월
   ════════════════════════════════════════════════════════════ */

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const dow = (d) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const addDays = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const MONTH = "2026-09";
const DAYS = Array.from({ length: 30 }, (_, i) => addDays("2026-09-01", i));

// 되풀이 가능한 난수 — 돌릴 때마다 달라지면 견줄 수가 없다
let seed = 20260901;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const U = (n) => `${String(n).padStart(8, "0")}-0000-0000-0000-000000000000`;
const PROF = (n) => `9${String(n).padStart(7, "0")}-0000-0000-0000-000000000000`;
const q = (v) => (v == null || v === "" ? "null" : `'${String(v).replaceAll("'", "''")}'`);

const CLASSES = [
  { id: U(11), name: "월수 5시", days: ["월", "수"], start: "17:00", end: "19:30" },
  { id: U(12), name: "화목 5시", days: ["화", "목"], start: "17:00", end: "19:30" },
  { id: U(13), name: "월수 7시반", days: ["월", "수"], start: "19:30", end: "22:00" },
];
/**
 * 학교는 **SETUP_ALL 이 이미 심어둔다** (인천 연수구 학교들).
 * 새로 만들면 `schools_key_uniq` 에 걸린다 — 그래서 **있는 것을 찾아 쓴다.**
 * 이것 자체가 확인이다: 앱을 새로 깔면 학교는 이미 들어 있어야 한다.
 */
const SCHOOLS = [{ name: "신송중" }, { name: "연송중" }, { name: "박문여고" }];
function resolveSchools() {
  SCHOOLS.forEach((s) => {
    const got = one(`select id from public.schools where public.school_key(name) = public.school_key(${q(s.name)}) limit 1;`);
    if (got) { s.id = got; return; }
    // 없으면 만든다 (SETUP_ALL 의 목록에 없는 학교일 수 있다)
    s.id = one(`insert into public.schools (name) values (${q(s.name)}) returning id;`);
  });
  STUDENTS.forEach((st) => { st.school = SCHOOLS[st.schoolAt].id; });
}
const STUDENTS = [
  { id: U(31), name: "김서은", schoolAt: 0, grade: "중2", cls: U(11) },
  { id: U(32), name: "공시연", schoolAt: 0, grade: "중2", cls: U(11) },
  { id: U(33), name: "왕희연", schoolAt: 0, grade: "중2", cls: U(11) },
  { id: U(34), name: "박윤찬", schoolAt: 0, grade: "중2", cls: U(11) },
  { id: U(35), name: "서한결", schoolAt: 1, grade: "중3", cls: U(12) },
  { id: U(36), name: "구도은", schoolAt: 1, grade: "중3", cls: U(12) },
  { id: U(37), name: "양정호", schoolAt: 1, grade: "중3", cls: U(12) },
  { id: U(38), name: "노주하", schoolAt: 2, grade: "고1", cls: U(13) },
  { id: U(39), name: "계유담", schoolAt: 2, grade: "고1", cls: U(13) },
  { id: U(40), name: "박주하", schoolAt: 2, grade: "고2", cls: U(13) },
];

// 학사일정 — 추석과 신송중 중간고사가 한 달에 같이 온다 (9월이 실제로 그렇다)
const HOLIDAYS = [{ date: "2026-09-24", name: "추석 연휴" }, { date: "2026-09-25", name: "추석 연휴" }];
const EXAM = {
  id: U(51), school: "신송중", grade: "중2", name: "2학기 중간고사",
  from: "2026-09-14", to: "2026-09-17", english: "2026-09-16", cuts: [92, 86, 78, 70],
};

const BOOKS = [{ id: U(61), name: "중2 문법 워크북", area: "문법" }];
const UNIT_NAMES = ["문장 형식 고르기", "명사·관사", "대명사", "시제", "조동사", "수동태",
  "형용사", "부사", "비교급", "접속사", "전치사", "부정사"];
const UNITS = UNIT_NAMES.map((s, i) => ({
  id: U(70 + i), book: U(61), name: `Unit ${String(i + 1).padStart(2, "0")}`,
  page: i + 1, qcount: 25, summary: s,
}));
const HW = [
  { id: U(91), name: "단어 외우기", cat: "어휘" },
  { id: U(92), name: "문법 문제풀기", cat: "문법" },
  { id: U(93), name: "독해 지문 정리", cat: "독해" },
];

function seedSql() {
  const L = [];
  L.push(`create table if not exists public._who (id uuid);
grant select on public._who to authenticated, anon;
create or replace function auth.uid() returns uuid language sql stable as
  $$ select id from public._who limit 1 $$;`);

  const users = [U(1), ...STUDENTS.map((_, i) => PROF(i + 1)), ...STUDENTS.map((_, i) => PROF(100 + i + 1))];
  L.push(`insert into auth.users (id) values ${users.map((x) => `(${q(x)})`).join(",")};`);
  // auth.users 에 넣으면 방아쇠가 profiles 를 자동으로 만든다 (SETUP_ALL 의
  // on_auth_user_created). 그래서 넣기가 아니라 **덮어쓰기**로 한다
  L.push(`insert into public.profiles (id, role, name) values
    (${q(U(1))}, 'principal', '원장'),
    ${STUDENTS.map((s, i) => `(${q(PROF(i + 1))}, 'student', ${q(s.name)})`).join(",")},
    ${STUDENTS.map((s, i) => `(${q(PROF(100 + i + 1))}, 'parent', ${q(s.name + " 어머니")})`).join(",")}
  on conflict (id) do update set role = excluded.role, name = excluded.name;`);
  L.push(`insert into public.classes (id, name, days, start_time, end_time, tuition) values ${
    CLASSES.map((c) => `(${q(c.id)}, ${q(c.name)}, array[${c.days.map(q).join(",")}], ${q(c.start)}, ${q(c.end)}, 300000)`).join(",")};`);
  L.push(`insert into public.students (id, name, school, school_id, grade, status, profile_id, parent_phone, word_test_count) values ${
    STUDENTS.map((s, i) => {
      return `(${q(s.id)}, ${q(s.name)}, ${q(SCHOOLS[s.schoolAt].name)}, ${q(s.school)}, ${q(s.grade)}, 'enrolled', ${q(PROF(i + 1))}, ${q("010-1000-" + (1000 + i))}, 30)`;
    }).join(",")};`);
  L.push(`insert into public.parent_student (parent_profile_id, student_id) values ${
    STUDENTS.map((s, i) => `(${q(PROF(100 + i + 1))}, ${q(s.id)})`).join(",")};`);
  L.push(`insert into public.class_students (class_id, student_id) values ${
    STUDENTS.map((s) => `(${q(s.cls)}, ${q(s.id)})`).join(",")};`);
  L.push(`insert into public.holidays (date, name, scope) values ${
    HOLIDAYS.map((h) => `(${q(h.date)}, ${q(h.name)}, 'all')`).join(",")};`);
  L.push(`insert into public.exam_periods (id, school, grade, name, from_date, to_date, english_on, cuts) values
    (${q(EXAM.id)}, ${q(EXAM.school)}, ${q(EXAM.grade)}, ${q(EXAM.name)}, ${q(EXAM.from)}, ${q(EXAM.to)}, ${q(EXAM.english)},
     array[${EXAM.cuts.join(",")}]::numeric[]);`);
  L.push(`insert into public.tasks (id, title, kind, due_on, private, deliver_scope, deliver_school_id, deliver_grade, deliver_student_ids) values
    (${q(U(41))}, '신송중 2학기 중간고사', 'schedule', ${q(EXAM.from)}, false, 'grade', ${q(SCHOOLS[0].id)}, '중2', '{}'),
    (${q(U(42))}, '추석 휴강', 'schedule', '2026-09-24', false, 'all', null, null, '{}'),
    (${q(U(43))}, '[전국] 9월 모의고사', 'schedule', '2026-09-02', true, null, null, null, '{}'),
    (${q(U(44))}, '교재 주문 확인', 'todo', '2026-09-05', false, null, null, null, '{}');`);
  L.push(`insert into public.textbooks (id, name, area, status) values ${
    BOOKS.map((b) => `(${q(b.id)}, ${q(b.name)}, ${q(b.area)}, 'active')`).join(",")};`);
  L.push(`insert into public.textbook_units (id, textbook_id, name, page_start, page_end, total_pages, sort, question_count, question_range, summary) values ${
    UNITS.map((u, i) => `(${q(u.id)}, ${q(u.book)}, ${q(u.name)}, ${u.page}, ${u.page}, 1, ${i + 1}, ${u.qcount}, '1-25', ${q(u.summary)})`).join(",")};`);
  L.push(`insert into public.student_textbooks (student_id, textbook_id, assigned_on) values ${
    STUDENTS.map((s) => `(${q(s.id)}, ${q(U(61))}, '2026-09-01')`).join(",")};`);
  L.push(`insert into public.homework_items (id, name, category) values ${
    HW.map((h) => `(${q(h.id)}, ${q(h.name)}, ${q(h.cat)})`).join(",")};`);
  return L.join("\n");
}

const stats = {};
function livingSql() {
  const L = [];
  const off = new Set(HOLIDAYS.map((h) => h.date));
  const unitAt = new Map(STUDENTS.map((s) => [s.id, 0]));
  const retest = new Map();
  const tries = new Map();       // 학생|단원 → 몇 번째 보는가
  const absences = [];
  let classDays = 0;
  let rid = 0;

  DAYS.forEach((d) => {
    const w = dow(d);
    if (off.has(d)) return;
    CLASSES.forEach((c) => {
      if (!c.days.includes(w)) return;
      classDays += 1;
      // 시험 주간에는 정규 진도를 안 나간다 (내신 대비)
      const examWeek = d >= EXAM.from && d <= EXAM.to;
      STUDENTS.filter((s) => s.cls === c.id).forEach((s) => {
        const reportId = U(1000 + rid++);
        const absent = chance(0.05);
        L.push(`insert into public.attendance (student_id, date, status) values (${q(s.id)}, ${q(d)}, ${q(absent ? "absent" : "present")}) on conflict do nothing;`);
        if (absent) { absences.push({ s: s.id, d }); return; }

        const wt = 30;
        const wc = Math.max(18, Math.round(wt * (0.75 + rnd() * 0.25)));
        let unitName = null, passed = null, st = null, sc = null;
        if (!examWeek) {
          const waiting = retest.get(s.id);
          const idx = waiting != null ? waiting : unitAt.get(s.id);
          unitName = UNITS[Math.min(idx, UNITS.length - 1)].summary;
          st = 25;
          // **한 명은 정말 막히게 한다.** 어느 학원에나 한 명은 있고,
          // 그 아이를 화면이 잡아내는지가 이 시뮬레이션의 요점 중 하나다.
          // 왕희연은 **네 번째에야** 넘는다 (실제 노션 자료의 그 아이처럼)
          const tkey = `${s.id}|${idx}`;
          const nth = (tries.get(tkey) || 0) + 1;
          tries.set(tkey, nth);
          const struggler = s.id === U(33);
          const wrong = struggler
            ? (nth < 4 ? 6 + Math.floor(rnd() * 4) : 2)
            : waiting != null ? Math.floor(rnd() * 4) : Math.floor(rnd() * 8);
          sc = st - wrong;
          passed = sc / st >= 0.8;
          if (passed) { retest.delete(s.id); unitAt.set(s.id, Math.min(idx + 1, UNITS.length - 1)); }
          else retest.set(s.id, idx);
        }
        /**
         * **판을 닫는다** (`report_written = true`).
         *
         * 아래에서 이 판의 숙제를 전부 검사 상태(done·weak·missing)로 넣는다.
         * 진짜 앱은 그 경우 판을 **자동으로 닫는다** —
         * `app/today/actions.js:194` 의 `report_written: complete` 이고
         * `complete = 안 검사한 것이 없다` 다. 그런데 여기 씨앗만 이 칸을
         * 안 적어서 기본값 false 로 들어갔고, 앱이 만들 수 없는 상태
         * (「검사는 다 됐는데 판은 안 닫힌 판」)를 한 달 내내 쌓고 있었다.
         *
         * 그 상태는 0169 마감 게이트에 그대로 걸린다 — 검사 3상태는 마감
         * 뒤에만 아이/학부모에게 보인다. 그래서 아이가 자기 검사줄을
         * **한 줄도** 못 읽었고, summarize 의 숙제 성취도가 null 이 되어
         * 「이번 달 현황」의 숙제 줄이 통째로 사라졌다. 없는 값은 줄을
         * 조용히 빼는 규칙(lib/parentView threeLines)이라 오류도 안 났다.
         * `supabase/seed/더미데이터.sql:169` 의 지난 수업 씨앗도 true 다.
         */
        L.push(`insert into public.daily_reports (id, student_id, date, attendance_kind, word_correct, word_total, sent_correct, sent_total, sent_unit, sent_passed, own_progress, report_written)
          values (${q(reportId)}, ${q(s.id)}, ${q(d)}, ${q(chance(0.08) ? "지각" : "정시출석")}, ${wc}, ${wt},
                  ${sc == null ? "null" : sc}, ${st == null ? "null" : st}, ${q(unitName)},
                  ${passed == null ? "null" : passed}, ${q(examWeek ? "내신 대비" : unitName + " 진도")}, true)
          on conflict (student_id, date) do nothing;`);
        if (unitName) {
          L.push(`insert into public.scores (student_id, kind, term, taken_on, raw_score, full_score, note, source)
            values (${q(s.id)}, 'unit', ${q(unitName)}, ${q(d)}, ${Math.round((sc / st) * 100)}, 100,
                    ${q((passed ? "통과" : "재시험") + " · " + st + "문제 중 " + (st - sc) + "개 틀림")}, 'class');`);
        }
        HW.forEach((h) => {
          const r = rnd();
          const stt = r < 0.7 ? "done" : r < 0.9 ? "weak" : "missing";
          L.push(`insert into public.daily_report_items (daily_report_id, homework_item_id, status)
            values (${q(reportId)}, ${q(h.id)}, ${q(stt)}) on conflict do nothing;`);
        });
      });
    });
  });

  /**
   * **마지막 판 하나는 아직 적는 중으로 둔다** (`report_written = false`).
   *
   * 판을 전부 닫아버리면 0169 마감 게이트가 **한 번도 안 걸리는** 씨앗이
   * 된다 — 게이트를 통째로 없애도 이 검사는 초록이다. 다른 검사도 이
   * 게이트를 안 본다 (check-parent 의 숙제줄은 'assigned' 라 늘 보이는
   * 화이트리스트다). 그래서 마지막 수업 판만 열어둔다 — 원장님이 오늘 판을
   * 아직 안 닫은, 매일 실제로 생기는 그 모양 그대로다. 아래 5)에서
   * 「그 판의 검사 결과는 안 보이고, 마감한 날들의 성취도는 나온다」 를
   * 둘 다 확인한다.
   */
  L.push(`update public.daily_reports r set report_written = false
     where r.date = (select max(d2.date) from public.daily_reports d2 where d2.student_id = r.student_id);`);

  absences.forEach(({ s, d }) => {
    const mk = addDays(d, 7);
    if (mk > "2026-09-30") return;
    L.push(`insert into public.attendance (student_id, date, status, makeup_of) values (${q(s)}, ${q(mk)}, 'makeup', ${q(d)}) on conflict do nothing;`);
  });
  stats.classDays = classDays;
  stats.absences = absences.length;
  return L.join("\n");
}

function examSql() {
  const L = [];
  const SRC = ["교과서","교과서","교과서","교과서","교과서","교과서","부교재","부교재","부교재",
    "모의고사 변형","모의고사 변형","외부지문","교과서","교과서","부교재","교과서","모의고사 변형",
    "교과서","외부지문","교과서"];
  const UNIT = ["5과","5과","5과","6과","6과","6과","5과","6과","7과","","","","7과","7과","7과","5과","","6과","","7과"];
  const PTS = [3,3,4,3,3,4,3,3,5,5,5,8,3,4,5,5,5,4,8,5];
  L.push(`insert into public.exam_questions (exam_id, no, area, topic, detail, unit, source, points) values ${
    SRC.map((src, i) => `(${q(EXAM.id)}, ${i + 1}, '독해', '독해', ${q((i + 1) + "번")}, ${q(UNIT[i])}, ${q(src)}, ${PTS[i]})`).join(",")};`);

  STUDENTS.filter((s) => s.grade === "중2").forEach((s, i) => {
    const scoreId = U(200 + i);
    const wrongs = [];
    SRC.forEach((_, j) => {
      if (chance(UNIT[j] === "7과" ? 0.7 : SRC[j] === "외부지문" ? 0.6 : 0.15)) wrongs.push(j + 1);
    });
    const lost = wrongs.reduce((a, no) => a + PTS[no - 1], 0);
    L.push(`insert into public.scores (id, student_id, kind, term, taken_on, raw_score, full_score, school, exam_id, source, self_note)
      values (${q(scoreId)}, ${q(s.id)}, 'school', ${q(EXAM.name)}, ${q(EXAM.english)}, ${100 - lost}, 100, '신송중', ${q(EXAM.id)}, 'form',
              ${q("잘한 점: 시간배분을 잘했어요")});`);
    if (wrongs.length) {
      L.push(`insert into public.score_items (score_id, no, wrong, reason) values ${
        wrongs.map((no) => `(${q(scoreId)}, ${no}, true, ${q(pick(["단어를 몰랐어요","해석을 못했어요","어법을 몰랐어요","실수했어요"]))})`).join(",")};`);
    }
  });

  STUDENTS.filter((s) => s.grade.startsWith("고")).forEach((s, i) => {
    const scoreId = U(300 + i);
    const wrongs = [];
    for (let no = 1; no <= 45; no++) {
      const hard = no >= 31 && no <= 34;
      if (chance(hard ? 0.7 : no <= 17 ? 0.05 : 0.22)) wrongs.push(no);
    }
    L.push(`insert into public.scores (id, student_id, kind, term, taken_on, raw_score, full_score, source)
      values (${q(scoreId)}, ${q(s.id)}, 'mock', '26년 9월 모의고사', '2026-09-02', ${Math.max(20, 100 - wrongs.length * 2)}, 100, 'form');`);
    if (wrongs.length) {
      L.push(`insert into public.score_items (score_id, no, wrong, reason) values ${
        wrongs.map((no) => `(${q(scoreId)}, ${no}, true, ${q(pick(["해석을 못했어요","단어를 몰랐어요","실수했어요"]))})`).join(",")};`);
    }
  });
  return L.join("\n");
}

/* ════════════════════════════════════════════════════════════
   세 사람의 눈
   ════════════════════════════════════════════════════════════ */

const problems = [];
const problem = (where, what, why) => problems.push({ where, what, why });

const asWho = (id) => psql(`delete from public._who; insert into public._who values (${q(id)});`);
function seeAs(id, sql) {
  asWho(id);
  return jsonOf(psql(`set role authenticated; select coalesce(json_agg(t), '[]') from (${sql}) t;`));
}

function run() {
  console.log("한 달 살아보기 — 2026년 9월 · 학생 10명 · 반 3개\n");
  startPg();
  try {
    console.log("== 1) 앱을 설치한다 ==");
    psqlFile("supabase/SETUP_ALL.sql");
    psql(`grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;`);
    console.log("  SETUP_ALL 올라감\n");

    console.log("== 2) 학원을 차린다 ==");
    resolveSchools();
    console.log(`  학교 — ${SCHOOLS.map((x) => x.name).join(" · ")} (SETUP_ALL 이 심어둔 것을 씁니다)`);
    writeFileSync("/tmp/.seed.sql", seedSql());
    psqlFile("/tmp/.seed.sql");
    console.log(`  학생 ${STUDENTS.length} · 반 ${CLASSES.length} · 학교 ${SCHOOLS.length} · 단원 ${UNITS.length}`);
    console.log(`  학사일정 — ${EXAM.school} ${EXAM.name} ${EXAM.from}~${EXAM.to} (영어 ${EXAM.english}) · 추석 휴강 2일\n`);

    console.log("== 3) 한 달을 산다 ==");
    writeFileSync("/tmp/.living.sql", livingSql());
    psqlFile("/tmp/.living.sql");
    writeFileSync("/tmp/.exam.sql", examSql());
    psqlFile("/tmp/.exam.sql");
    const cnt = (t) => Number(one(`select count(*) from public.${t};`));
    console.log(`  수업일 ${stats.classDays}회(반별 합) · 결석 ${stats.absences}건`);
    console.log(`  수업 기록 ${cnt("daily_reports")} · 숙제 검사 ${cnt("daily_report_items")}`);
    console.log(`  성적 ${cnt("scores")} · 문항별 오답 ${cnt("score_items")} · 시험지 문항 ${cnt("exam_questions")}\n`);

    check();
  } finally {
    stopPg();
  }

  console.log("\n════════════════════════════════════════");
  if (problems.length === 0) { console.log("✅ 걸리는 곳이 없었습니다"); return; }
  console.log(`⚠️  걸린 곳 ${problems.length}가지\n`);
  problems.forEach((p, i) => {
    console.log(`${i + 1}. [${p.where}] ${p.what}`);
    console.log(`   ${p.why}\n`);
  });
}

function check() {
  const BOSS = U(1);
  const kid = STUDENTS[0];        // 김서은 (중2 신송중)
  const kidP = PROF(1);
  const momP = PROF(101);
  const hi = STUDENTS[7];         // 노주하 (고1)

  console.log("== 4) 원장님으로 열어본다 ==");
  asWho(BOSS);
  const byKind = {};
  rows(`select kind from public.scores`).forEach((s) => (byKind[s.kind] = (byKind[s.kind] || 0) + 1));
  console.log(`  성적 화면 — ${JSON.stringify(byKind)}`);

  const qs = rows(`select no, area, topic, detail, unit, source, points from public.exam_questions where exam_id = ${q(EXAM.id)} order by no`);
  const sc = rows(`select id, student_id, kind, term, taken_on, raw_score, full_score from public.scores where exam_id = ${q(EXAM.id)}`);
  const its = rows(`select score_id, no, wrong, reason from public.score_items where score_id in (select id from public.scores where exam_id = ${q(EXAM.id)})`);
  const studs = rows(`select id, name from public.students`);
  const a = analyze(qs, sc, its, studs);
  console.log(`  출제분석 — ${a.n}명 · ${a.questionCount}문항 · ${a.totalPoints}점`);
  console.log(`    출처: ${a.bySource.map((x) => `${x.key} ${x.pct}%`).join(" · ")}`);
  console.log(`    몰려 틀린 단원: ${a.weakUnits.slice(0, 3).map((x) => `${x.unit} ${x.wrongPct}%`).join(" · ") || "없음"}`);
  advice(a, EXAM.name).forEach((n) => console.log(`    [${n.head}] ${n.body.replaceAll("**", "").slice(0, 100)}`));
  if (a.weakUnits[0] && a.weakUnits[0].unit !== "7과") {
    problem("출제분석", "일부러 어렵게 만든 7과가 1위가 아니다", `1위가 ${a.weakUnits[0].unit} 입니다.`);
  }

  rows(`select name, page_start, page_end, total_pages, question_count, question_range, summary, minutes from public.textbook_units order by sort limit 2`)
    .forEach((u) => {
      const v = volumeLabel({
        pages: `p.${u.page_start}`, amount: `${u.total_pages}p`,
        questionCount: u.question_count, questionRange: u.question_range, minutes: u.minutes,
      });
      console.log(`  오늘 수업 단원 — ${u.name}: ${v} · ${u.summary}`);
    });

  console.log("\n== 5) 김서은(중2)으로 열어본다 ==");
  const mine = seeAs(kidP, `select * from public.daily_reports where student_id = ${q(kid.id)} order by date`);
  console.log(`  내 수업 기록 ${mine.length}건`);
  if (mine.length === 0) problem("학생 화면", "아이가 자기 수업 기록을 못 읽는다", "화면이 통째로 빕니다.");

  const myItems = seeAs(kidP,
    `select dri.daily_report_id, dri.homework_item_id, dri.status from public.daily_report_items dri
      join public.daily_reports r on r.id = dri.daily_report_id where r.student_id = ${q(kid.id)}`);
  /**
   * **마감 게이트(0169)** — 아직 적는 중인 판의 검사 결과는 아이에게 안 보여야
   * 한다. 「안 보인다」만 보면 게이트가 아니라 **아무것도 안 보이는 것**과
   * 구별이 안 된다 (실제로 그 구별을 못 해서, 아이가 자기 검사줄을 한 줄도
   * 못 읽는 것을 한동안 못 잡았다). 그래서 두 쪽을 같이 본다.
   */
  const openIds = new Set(
    rows(`select id from public.daily_reports where student_id = ${q(kid.id)} and report_written = false`).map((r) => r.id)
  );
  const openHas = rows(`select 1 as x from public.daily_report_items
      where daily_report_id in (select id from public.daily_reports
        where student_id = ${q(kid.id)} and report_written = false)
        and status in ('done','weak','missing')`).length;
  const openSeen = myItems.filter((i) => openIds.has(i.daily_report_id)).length;
  const closedSeen = myItems.length - openSeen;
  console.log(`  마감 게이트 — 마감한 판의 검사 ${closedSeen}줄 보임 · 적는 중인 판 ${openSeen}줄 보임(0이어야)`);
  if (openHas > 0 && openSeen > 0)
    problem("학생 화면 · 마감 게이트", "아직 적는 중인 판의 검사 결과가 아이에게 보인다", "0169 student_self_items 를 확인하세요.");
  if (closedSeen === 0)
    problem("학생 화면 · 마감 게이트", "마감한 판의 검사 결과까지 아이가 못 읽는다", "게이트가 너무 넓게 막고 있습니다.");

  /**
   * **점수도 안 보이는가** (원장 확정 2026-08-28 — 「무조건 마감된 것만
   * 학생·학부모에게 공개한다」. 8/27 의 「점수는 공개」 를 뒤집은 것).
   *
   * 8/27 판에서는 검사 3상태만 막았다. 단어·문법 점수와 진도는 판 **칸**이라
   * RLS 가 못 가려서, 「적는 중」 인 판의 단어 89% · 문법 87% 가 아이 화면에
   * 그대로 떴다 — 정정하기 전의 잠정 점수를 아이와 어머니가 먼저 본 것이다.
   *
   * 여기서는 화면이 읽는 그대로를 흉내 낸다: RLS 를 탄 행을 lib/closeGate 의
   * maskRows 에 먹인다 (lib/homeworkView loadReports 가 하는 일). 부르는
   * 자리가 안 빠졌는지는 static 검사(scripts/check-preview.mjs)가 본다.
   */
  const seen = maskRows(mine);
  const openScored = seen.filter((r) => !isClosed(r))
    .filter((r) => r.word_total || r.sent_total || r.own_progress).length;
  const closedScored = seen.filter(isClosed).filter((r) => r.word_total).length;
  console.log(`  마감 게이트 · 점수 — 마감한 판 ${closedScored}건 점수 보임 · 적는 중인 판 ${openScored}건 보임(0이어야)`);
  if (openScored > 0)
    problem("학생 화면 · 마감 게이트", "적는 중인 판의 점수·진도가 아이에게 보인다",
      "lib/closeGate maskUnclosed 를 확인하세요 (원장 확정 8/28).");
  if (closedScored === 0)
    problem("학생 화면 · 마감 게이트", "마감한 판의 점수까지 아이가 못 본다", "게이트가 너무 넓게 막고 있습니다.");

  // summarize(reports, exams) — 리포트마다 items 를 물려서 준다 (화면이 그렇게 한다)
  const sum = summarize(
    mine.map((r) => ({ ...r, items: myItems.filter((i) => i.daily_report_id === r.id) })), []
  );
  console.log(`  이번 달 현황 — 수업 ${sum.days}일 · 출결 ${JSON.stringify(sum.att)} · ` +
    `숙제 ${sum.homework?.rate}% · 단어 ${sum.word?.rate}% · 문법 ${sum.sent?.rate}%`);
  if (sum.homework?.rate == null) problem("학생 화면 · 이번 달 현황", "숙제 비율이 안 나온다", "summarize 결과 모양을 확인하세요.");
  if (sum.word?.rate == null) problem("학생 화면 · 이번 달 현황", "단어 비율이 안 나온다", "");
  if (sum.sent?.rate == null) problem("학생 화면 · 이번 달 현황", "문법 비율이 안 나온다", "");

  const myScores = seeAs(kidP, `select * from public.scores where student_id = ${q(kid.id)} order by taken_on`);
  const myUnit = myScores.filter((s) => s.kind === "unit");
  console.log(`  내 성적 ${myScores.length}건 — 단원평가 ${myUnit.length}(재시험 ${myUnit.filter((s) => (s.note || "").includes("재시험")).length}) · 내신 ${myScores.filter((s) => s.kind === "school").length}`);
  if (myUnit.length === 0) problem("학생 화면 · 성적", "오늘 수업에서 적은 단원평가가 아이에게 안 보인다", "");

  const myTasks = seeAs(kidP, `select * from public.tasks`);
  console.log(`  내 일정 ${myTasks.length}건 — ${myTasks.map((t) => t.title).join(" · ") || "없음"}`);
  ["신송중 2학기 중간고사", "추석 휴강"].forEach((t) => {
    if (!myTasks.some((x) => x.title === t)) problem("학생 달력", `「${t}」 가 안 보인다`, "대상을 골랐는데 안 보입니다.");
  });
  if (myTasks.some((t) => t.title.includes("[전국]"))) problem("학생 달력", "전국 공통 일정이 새어 나간다", "");
  if (myTasks.some((t) => t.kind === "todo")) problem("학생 달력", "선생님 할일이 아이에게 보인다", "");

  console.log("\n== 6) 김서은 어머니로 열어본다 ==");
  const pRep = seeAs(momP, `select * from public.daily_reports where student_id = ${q(kid.id)}`);
  const pSco = seeAs(momP, `select * from public.scores where student_id = ${q(kid.id)}`);
  const pOther = seeAs(momP, `select * from public.daily_reports where student_id = ${q(STUDENTS[1].id)}`);
  console.log(`  우리 아이 수업 기록 ${pRep.length} · 성적 ${pSco.length} · 남의 아이 ${pOther.length}`);
  if (pRep.length === 0) problem("학부모 화면", "우리 아이 수업 기록이 안 보인다", "화면이 통째로 빕니다.");
  if (pSco.length === 0) problem("학부모 화면", "우리 아이 성적이 안 보인다", "");
  if (pOther.length > 0) problem("학부모 화면", "남의 아이 것이 보인다", `${pOther.length}건`);

  /**
   * **월간 숫자 = 학부모 숫자 = 아이 숫자** (원장 확정 2026-08-28).
   *
   * 월간리포트(/monthly)는 **원장 눈(is_staff)** 으로 읽는다 — RLS 가 아무것도
   * 안 막으니 마감 안 한 판까지 그대로 세었다. 어머니 화면은 RLS 가 검사줄을
   * 막아 마감된 것만 세고 있었고, 그래서 같은 달 숙제 성취도가 문자와 앱에서
   * 서로 다른 숫자로 나갔다. 집에서 나란히 놓고 보시면 그때부터 둘 다 못 믿게
   * 된다 — 셋이 같아야 한다 (셈은 lib/monthly summarize 한 곳이 게이트를 탄다).
   *
   * 원장 눈은 여기서 psql 을 그냥 쓴다(슈퍼유저 = RLS 통과) — /monthly 가
   * loadMonth 에서 하는 것과 같은 자리다.
   */
  const momItems = seeAs(momP,
    `select dri.daily_report_id, dri.status from public.daily_report_items dri
      join public.daily_reports r on r.id = dri.daily_report_id where r.student_id = ${q(kid.id)}`);
  const momSum = summarize(
    pRep.map((r) => ({ ...r, items: momItems.filter((i) => i.daily_report_id === r.id) })), []);
  const bossReps = rows(`select * from public.daily_reports where student_id = ${q(kid.id)}`);
  const bossItems = rows(`select dri.daily_report_id, dri.status from public.daily_report_items dri
      join public.daily_reports r on r.id = dri.daily_report_id where r.student_id = ${q(kid.id)}`);
  const monthlySum = summarize(
    bossReps.map((r) => ({ ...r, items: bossItems.filter((i) => i.daily_report_id === r.id) })), []);
  const shape = (s) => `수업 ${s.days}일 · 숙제 ${s.homework?.rate} · 단어 ${s.word?.rate} · 문법 ${s.sent?.rate}`;
  console.log(`  이번 달 — 아이 [${shape(sum)}]`);
  console.log(`           어머니 [${shape(momSum)}]`);
  console.log(`           월간리포트 [${shape(monthlySum)}]`);
  if (shape(sum) !== shape(momSum))
    problem("이번 달 현황", "아이가 보는 숫자와 어머니가 보시는 숫자가 다르다",
      `아이 [${shape(sum)}] · 어머니 [${shape(momSum)}]`);
  if (shape(momSum) !== shape(monthlySum))
    problem("월간리포트", "문자로 나가는 숫자가 어머니 화면과 다르다",
      `어머니 [${shape(momSum)}] · 월간 [${shape(monthlySum)}] — ` +
      "월간은 원장 눈이라 마감 안 한 판까지 셉니다 (lib/monthly summarize 의 게이트를 확인하세요).");

  const pItems = seeAs(momP, `select score_id, no, wrong, reason from public.score_items where score_id in (select id from public.scores where student_id = ${q(kid.id)})`);
  const rounds = pSco.filter((s) => s.kind === "school")
    .sort((x, y) => (x.taken_on || "").localeCompare(y.taken_on || ""))
    .map((s) => oneRound(s, pItems.filter((i) => i.score_id === s.id), qs, []));
  if (rounds.length > 0) {
    const st = stack(rounds);
    console.log(`  성장 카드(내신) — 최근 ${st.last}점 · ${st.n}회 · 영역 ${st.topics.length}개`);
    const txt = consultText(st, kid.name, points(st, kid.name), { kindLabel: "내신" });
    console.log(`  상담 문구 ${txt.split("\n").length}줄`);
    const bad = txt.split("\n").find((l) => /undefined|NaN|\bnull\b/.test(l));
    if (bad) problem("상담 문구", "글에 undefined·NaN 이 섞였다", bad);
  } else {
    problem("학부모 화면", "내신 성장 카드가 안 만들어진다", "");
  }

  asWho(BOSS);
  psql(`update public.students set score_share = 'none' where id = ${q(kid.id)};`);
  const hid = seeAs(momP, `select * from public.scores where student_id = ${q(kid.id)}`);
  const hidKid = seeAs(kidP, `select * from public.scores where student_id = ${q(kid.id)}`);
  console.log(`  비공개로 두면 — 어머니 ${hid.length}건 · 아이 ${hidKid.length}건(자기가 낸 것만)`);
  if (hid.length > 0) problem("성적 공개 대상", "비공개인데 어머니께 보인다", `${hid.length}건`);
  if (hidKid.some((s) => s.source !== "form")) problem("성적 공개 대상", "비공개인데 선생님이 매긴 성적이 아이에게 보인다", "");
  asWho(BOSS);
  psql(`update public.students set score_share = 'both' where id = ${q(kid.id)};`);

  console.log("\n== 7) 노주하(고1)로 열어본다 — 모의고사 ==");
  const hiS = seeAs(PROF(8), `select * from public.scores where student_id = ${q(hi.id)} and kind='mock' order by taken_on`);
  const hiI = seeAs(PROF(8), `select score_id, no, wrong, reason from public.score_items where score_id in (select id from public.scores where student_id = ${q(hi.id)})`);
  if (hiS.length > 0) {
    const st = stack(hiS.map((s) => oneRound(s, hiI.filter((i) => i.score_id === s.id), [], [])));
    console.log(`  ${st.n}회 · 최근 ${st.last}점 · 듣기 ${st.listen ? Math.round(st.listen.rate * 100) : "?"}% · 독해 ${st.read ? Math.round(st.read.rate * 100) : "?"}%`);
    console.log(`  영역별 — ${st.topics.map((t) => `${t.topic} ${Math.round(t.rate * 100)}%`).join(" · ")}`);
    const weak = st.topics.filter((t) => t.total >= 3).sort((x, y) => x.rate - y.rate)[0];
    console.log(`  제일 약한 곳 — ${weak?.topic}`);
    if (!st.listen || !st.read) problem("모의고사 리포트", "듣기·독해가 안 나뉜다", "표준 문항표를 못 쓰고 있습니다.");
    if (weak && weak.topic !== "빈칸추론") problem("모의고사 리포트", "일부러 어렵게 만든 빈칸추론이 1위가 아니다", `${weak.topic} 로 나왔습니다.`);
  } else problem("모의고사 리포트", "고1 아이 모의고사가 안 읽힌다", "");

  console.log("\n== 7-2) 단원평가 흐름 — 아이·어머니가 볼 수 있나 ==");
  const uScores = seeAs(kidP, `select * from public.scores where student_id = ${q(kid.id)} and kind='unit'`);
  const up = unitProgress(uScores);
  console.log(`  ${kid.name} — 단원 ${up.total}개 · 통과 ${up.passed} · 재시험 ${up.retests}번 · 지금 「${up.now?.unit || "없음"}」`);
  if (up.total === 0) problem("학생 화면 · 단원평가", "아이가 자기 단원평가를 못 읽는다", "");
  if (up.stuck.length) console.log(`  막힌 단원 — ${up.stuck.map((u) => `${u.unit} ${u.tries}번`).join(" · ")}`);

  // **어머니 쪽도 따로 본다.** 같은 카드(components/UnitCard)를 /me 와 /parent
  // 두 군데에 걸어두었는데, 아이 것만 확인하고 어머니 것은 안 본 채로 넘어갔었다.
  // 읽기 규칙이 다르므로(아이는 profile_id, 어머니는 parent_student) 아이가
  // 보인다고 어머니도 보이는 것이 아니다 — 실제로 학부모 화면이 통째로 비어
  // 있던 적이 있다
  const momUnit = seeAs(momP, `select * from public.scores where student_id = ${q(kid.id)} and kind='unit'`);
  const mp = unitProgress(momUnit);
  console.log(`  어머니가 보시는 것 — 단원 ${mp.total}개 · 통과 ${mp.passed} · 재시험 ${mp.retests}번`);
  if (mp.total === 0) problem("학부모 화면 · 단원평가", "어머니께 아이 단원평가 카드가 안 뜬다", "카드가 통째로 사라집니다.");
  else if (mp.total !== up.total || mp.passed !== up.passed) {
    problem("학부모 화면 · 단원평가", "아이가 보는 것과 어머니가 보시는 것이 다르다",
      `아이 ${up.total}개/통과 ${up.passed} · 어머니 ${mp.total}개/통과 ${mp.passed}`);
  }

  console.log("\n== 8) 한 달 뒤 ==");
  asWho(BOSS);
  const unitTotal = Number(one(`select count(*) from public.scores where kind='unit';`));
  const retest = Number(one(`select count(*) from public.scores where kind='unit' and note like '%재시험%';`));
  console.log(`  단원평가 ${unitTotal}건 중 재시험 ${retest}건 (${Math.round((retest / unitTotal) * 100)}%)`);
  // **원장님 대시보드가 막힌 아이를 잡아내나** (2026-08-06 에 없어서 만든 것)
  const all = rows(`select student_id, kind, term, taken_on, raw_score, full_score, note from public.scores where kind='unit'`);
  const byStudent = STUDENTS.map((st) => ({
    student: st, scores: all.filter((x) => x.student_id === st.id),
  }));
  const sa = stuckAcross(byStudent);
  console.log(`  대시보드 「단원평가 막힘」 — ${sa.people.length}명 · 같은 단원에 셋 이상 ${sa.units.length}개`);
  sa.people.slice(0, 5).forEach((p) => console.log(`    ${p.student.name} — ${p.unit} ${p.tries}번째`));
  sa.units.forEach((u) => console.log(`    ${u.unit} 에 ${u.n}명 막힘 — ${u.names.join(" · ")}`));

  // 세 번 이상 재시험한 아이가 있는데 잡아내지 못하면 그것이 문제다
  const raw = rows(`select s.name, sc.term, count(*)::int c from public.scores sc
      join public.students s on s.id = sc.student_id
     where sc.kind='unit' and sc.note like '%재시험%'
     group by s.name, sc.term having count(*) >= 2 order by c desc`);
  if (raw.length > 0 && sa.people.length === 0) {
    problem("대시보드", "재시험을 거듭한 아이를 안 잡아낸다",
      `${raw.map((x) => `${x.name} ${x.term} ${x.c}번`).join(" · ")} 인데 경고가 안 올라옵니다.`);
  }
  const noExam = Number(one(`select count(*) from public.scores where kind='school' and exam_id is null;`));
  if (noExam > 0) problem("출제분석", "내신 성적에 시험 회차가 안 박힌 것이 있다", `${noExam}건 — 날짜로 추측해서 묶습니다.`);

  const days = Number(one(`select count(*) from public.attendance where student_id = ${q(kid.id)};`));
  console.log(`  김서은 9월 출결 ${days}일`);
}

run();
