/**
 * **「그날 오는 학생」(rosterOn)에 특강이 서나** — 진짜 Postgres 왕복 (특강 7단계).
 *
 * createNotice(scope:"all")·applyTaskDelivery·applyTaskNotice 는 셋 다
 * 대상을 rosterOn 하나에서 받는다. 그래서 여기서는 **그 함수 자체**를
 * 실 DB(PostgREST)에 대고 돌려본다 — 복사한 셈을 검사하면 복사본만
 * 검사하는 것이 된다. 화면 배선이 정말 rosterOn 을 쓰는지는 맨 끝에
 * 소스로 못박는다 (check-rpc ⑥ 과 같은 정적 반쪽).
 *
 *   ① 최특강(반 배정 0, 매일 특강)이 그날 명단에 있다 — scope:"all" 공지가
 *      이 학생을 잃지 않는다는 뜻 (검토 T4 의 그 자리)
 *   ② 끝난 특강은 명단에 없다 (meetsOn — 종강 잔존 금지)
 *   ③ 끝난 반 학생도 없다 — 옛 rosterOf 는 기간 칸을 안 읽어서
 *      종강한 반 학생이 공지 대상에 계속 남았다 (7단계 부수 봉합)
 *   ④ 이 특강만 쉬는 날(off_dates)은 명단에서 빠진다
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sign } from "./token.mjs";
import { rosterOn } from "../../lib/roster.js";
import { todaySeoul, addDays, dowOf } from "../../lib/day.js";

const API = process.env.E2E_API || "http://127.0.0.1:55442";
const STAFF = "11111111-1111-1111-1111-111111111111"; // 원장 (seed.sql)
const EXTRA_ONLY = "aaaaaaa1-0000-0000-0000-000000000003"; // 최특강 (씨앗 ②)
const SEEUN = "aaaaaaa1-0000-0000-0000-000000000001";      // 김서은 (씨앗 ①)
const HELPER = "aaaaaaa1-0000-0000-0000-000000000002";     // 박지호 (임시 줄용)

let bad = 0;
const ok = (m) => console.log(`  ${m}`);
const no = (m) => { bad++; console.log(`  ✗ ${m}`); };

const jwt = sign({ sub: STAFF, role: "authenticated" });
const supabase = createClient(API, jwt, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${jwt}` } },
});
// 임시 줄 만들기·치우기는 check-rpc 의 rest 헬퍼 그대로
async function rest(method, path, body) {
  const r = await fetch(`${API}/rest/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, data };
}

console.log("\n== 그날 오는 학생 (rosterOn) ==");

const today = todaySeoul();
const ALLDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const has = (roster, classId, studentId) =>
  roster.some((m) => m.class_id === classId && m.student_id === studentId);

// ① 특강 전용 학생 — scope:"all" 공지의 그 명단
{
  const roster = await rosterOn(supabase, today);
  if (has(roster, "extra:리스닝 특강", EXTRA_ONLY)) {
    ok("최특강(반 배정 0) — 매일 특강으로 그날 명단에 있다 (T4)");
  } else {
    no("최특강이 명단에 없습니다 — scope all 공지가 이 학생을 잃습니다");
  }
  // 씨앗 ①은 월·목만 온다 — 요일이 맞을 때만 있고, 아닐 때는 없어야 한다
  const dow = dowOf(today);
  const expect = dow === "월" || dow === "목";
  if (has(roster, "extra:내신 특강", SEEUN) === expect) {
    ok(`내신 특강(월·목) — 오늘(${dow}) 명단에 ${expect ? "있고" : "없고"}, 그게 맞다`);
  } else {
    no(`내신 특강(월·목)이 오늘(${dow}) 명단과 어긋납니다 (기대: ${expect ? "있음" : "없음"})`);
  }
}

// ② 끝난 특강 — 어제 종강했으면 오늘은 없다
{
  const row = {
    id: "ccccccc1-0000-0000-0000-000000000009", student_id: HELPER,
    label: "끝난 특강", days: ALLDAYS, start_time: "10:00",
    from_date: addDays(today, -30), to_date: addDays(today, -1),
  };
  const c = await rest("POST", "/student_extra_schedules", row);
  if (c.status >= 400) no(`검사용 끝난 특강을 못 만들었습니다 (${c.status})`);
  else {
    const roster = await rosterOn(supabase, today);
    if (!has(roster, "extra:끝난 특강", HELPER)) ok("끝난 특강은 명단에 없다 (종강 잔존 금지)");
    else no("어제 끝난 특강 학생이 오늘 명단에 남았습니다");
    await rest("DELETE", `/student_extra_schedules?id=eq.${row.id}`);
  }
}

// ③ 끝난 반 — 옛 rosterOf 가 놓치던 자리 (기간 칸을 안 읽었다)
{
  const cls = {
    id: "bbbbbbb1-0000-0000-0000-000000000009", name: "끝난 반",
    days: ALLDAYS, start_time: "10:00", ends_on: addDays(today, -1),
  };
  const c = await rest("POST", "/classes", cls);
  if (c.status >= 400) no(`검사용 끝난 반을 못 만들었습니다 (${c.status})`);
  else {
    await rest("POST", "/class_students", { class_id: cls.id, student_id: HELPER });
    const roster = await rosterOn(supabase, today);
    if (!has(roster, cls.id, HELPER)) ok("종강한 반 학생은 명단에 없다 (7단계 봉합)");
    else no("어제 종강한 반 학생이 오늘도 공지 대상에 남았습니다");
    await rest("DELETE", `/class_students?class_id=eq.${cls.id}`);
    await rest("DELETE", `/classes?id=eq.${cls.id}`);
  }
}

// ④ 이 특강만 쉬는 날 — off_dates 에 오늘이 있으면 안 온다
{
  const row = {
    id: "ccccccc1-0000-0000-0000-000000000008", student_id: HELPER,
    label: "오늘 쉬는 특강", days: ALLDAYS, start_time: "10:00",
    from_date: addDays(today, -7), to_date: addDays(today, 7),
    off_dates: [today],
  };
  const c = await rest("POST", "/student_extra_schedules", row);
  if (c.status >= 400) no(`검사용 쉬는 특강을 못 만들었습니다 (${c.status})`);
  else {
    const roster = await rosterOn(supabase, today);
    if (!has(roster, "extra:오늘 쉬는 특강", HELPER)) ok("off_dates 에 든 날은 명단에서 빠진다");
    else no("이 특강만 쉬는 날인데 명단에 남았습니다");
    await rest("DELETE", `/student_extra_schedules?id=eq.${row.id}`);
  }
}

// ⑤ 배선이 정말 rosterOn 인가 (정적 반쪽 — 지역 복사본으로 되돌아가면
//    위 검사가 통과해도 화면은 옛 셈을 쓴다)
{
  const todaySrc = readFileSync("app/today/actions.js", "utf8");
  const tasksSrc = readFileSync("app/tasks/actions.js", "utf8");
  if (todaySrc.includes("rosterOn") && (tasksSrc.match(/rosterOn\(/g) || []).length >= 2) {
    ok("공지 3곳(오늘 수업 · 일정 전달 · 일정 공지)이 lib/roster 를 쓴다");
  } else {
    no("공지 만들기가 lib/roster(rosterOn)를 안 씁니다 — 지역 셈으로 돌아갔습니다");
  }
}

if (bad) { console.log("\n❌ 「그날 오는 학생」 이 계약과 다릅니다"); process.exit(1); }
console.log("\n✅ 그날 오는 학생 통과");
