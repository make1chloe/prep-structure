import { readFileSync } from "node:fs";

/**
 * **이어져 있어야 하는데 끊어진 자리**를 다시 끊기지 않게 지킨다.
 *
 * 2026-08-28 감사(⑥ 안 이어진 것)에서 「같은 사실이 두 곳에 저장되는데
 * 한쪽을 고쳐도 다른 쪽이 안 따라가는」 자리가 나왔다. 하나씩 이어 붙였고,
 * 이 검사가 **다시 끊어지면 빨개진다.**
 *
 * 검사는 코드 모양을 본다 — 「이 함수를 부르고 있는가」. 실제로 이어지는지는
 * 코드를 읽어야 알지만, 리팩터링하다 그 부름을 지우는 것이 실제로 일어난
 * 사고였다. 그것을 잡는 것이 목적이다.
 */
const bad = [];
const read = (p) => readFileSync(p, "utf8");

// ── 1) 로그인 아이디 (⑥-8) ────────────────────────────────
// 표의 글자(students.login_id)만 고치면 진짜 계정은 그대로라 그 아이디로
// 못 들어온다. 고치는 길은 renameStudentLogin 한 곳이어야 한다.
{
  const act = read("app/students/actions.js");
  const upd = act.slice(act.indexOf("export async function updateStudent"));
  const body = upd.slice(0, upd.indexOf("\nexport async function", 1));

  // allow 목록에 login_id 가 다시 들어오면 계정을 안 거치고 글자만 바뀐다
  const allow = body.slice(body.indexOf("const allow = ["), body.indexOf("];", body.indexOf("const allow = [")));
  if (/["']login_id["']/.test(allow)) {
    bad.push(
      "app/students/actions.js — updateStudent 의 고칠 수 있는 칸 목록에 login_id 가 있습니다. " +
        "아이디는 renameStudentLogin 으로 보내야 진짜 계정까지 같이 바뀝니다 (⑥-8)"
    );
  }
  if (!body.includes("renameStudentLogin(")) {
    bad.push(
      "app/students/actions.js — updateStudent 가 renameStudentLogin 을 안 부릅니다. " +
        "아이디를 고쳐도 그 아이디로 로그인이 안 됩니다 (⑥-8)"
    );
  }

  const acc = read("app/students/accountActions.js");
  if (!/export async function renameStudentLogin/.test(acc)) {
    bad.push("app/students/accountActions.js — renameStudentLogin 이 없습니다 (⑥-8)");
  } else {
    const fn = acc.slice(acc.indexOf("export async function renameStudentLogin"));
    const body2 = fn.slice(0, fn.indexOf("\nexport async function", 1));
    // 진짜 계정의 이메일을 안 바꾸면 이름만 바꾼 셈이다
    if (!/admin\(key, `\/users\/\$\{s\.profile_id\}`, "PUT"/.test(body2) || !body2.includes("emailOf(next)")) {
      bad.push(
        "app/students/accountActions.js — renameStudentLogin 이 진짜 계정 이메일(emailOf)을 " +
          "안 바꿉니다. 표만 바뀌면 그 아이디로 못 들어옵니다 (⑥-8)"
      );
    }
  }
}

// ── 2) 퇴원일 (⑥-7) ──────────────────────────────────────
// 상태만 바꾸고 퇴원일(ended_on)이 안 들어가면 그 달 수강료가 일할되지 않는다.
// 낱개로 바꾸든 여럿을 골라 바꾸든 afterStatusChange 한 벌을 지나야 한다.
{
  const act = read("app/students/actions.js");
  if (!/async function afterStatusChange\(/.test(act)) {
    bad.push("app/students/actions.js — afterStatusChange 가 없습니다 (⑥-7)");
  }
  for (const [fn, what] of [
    ["updateStudent", "표에서 한 명의 상태를 바꿀 때"],
    ["updateStudentsStatus", "여럿을 골라 상태를 바꿀 때"],
  ]) {
    const at = act.indexOf(`export async function ${fn}(`);
    if (at < 0) { bad.push(`app/students/actions.js — ${fn} 이 없습니다`); continue; }
    const body = act.slice(at, act.indexOf("\nexport async function", at + 1));
    if (!body.includes("afterStatusChange(")) {
      bad.push(
        `app/students/actions.js — ${fn} 이 afterStatusChange 를 안 부릅니다. ` +
          `${what} 퇴원일이 안 들어가 그 달 수강료가 일할되지 않습니다 (⑥-7)`
      );
    }
  }
  // 퇴원일을 여기 말고 딴 데서 몰래 채우면 또 두 벌이 된다
  const fnAt = act.indexOf("async function afterStatusChange(");
  const fnBody = fnAt < 0 ? "" : act.slice(fnAt, act.indexOf("\n}", fnAt));
  if (fnAt >= 0 && !/ended_on: todaySeoul\(\)/.test(fnBody)) {
    bad.push("app/students/actions.js — afterStatusChange 가 퇴원일을 오늘로 안 채웁니다 (⑥-7)");
  }
}

// ── 3) 결석 요청 수락 → 출결 (⑥-5) ────────────────────────
// 「그 아이가 언제 오나」 를 여기서 따로 세면 특강만 다니는 아이가 빠진다.
// lib/roster 의 comingDates 한 곳을 지나야 한다.
{
  const req = read("app/requests/actions.js");
  if (!req.includes("comingDates(")) {
    bad.push(
      "app/requests/actions.js — 결석 요청을 수락할 때 comingDates 를 안 부릅니다. " +
        "특강만 다니는 아이는 수락해도 출결이 한 줄도 안 생깁니다 (⑥-5)"
    );
  }
  // 반 요일을 여기서 직접 세면 그 순간 판단이 두 벌이 된다
  if (/from\("class_students"\)/.test(req)) {
    bad.push(
      "app/requests/actions.js — 반 배정을 직접 읽고 있습니다. " +
        "「그 아이가 언제 오나」 는 lib/roster 한 곳입니다 (⑥-5)"
    );
  }
  const ros = read("lib/roster.js");
  if (!/export async function comingDates/.test(ros)) {
    bad.push("lib/roster.js — comingDates 가 없습니다 (⑥-5)");
  } else if (!ros.includes("student_extra_schedules")) {
    bad.push("lib/roster.js — comingDates 가 특강(student_extra_schedules)을 안 봅니다 (⑥-5)");
  }
}

// ── 4) 아이가 낸 단원평가 (⑥-3) ────────────────────────────
// 아이는 판을 못 쓰니 scores 에만 들어간다. sent_* 만 보면 냈는데도
// 배지가 안 꺼지고 월간리포트 문구에도 안 실린다.
{
  const bg = read("lib/menuBadges.js");
  if (!bg.includes("unitScored(")) {
    bad.push(
      "lib/menuBadges.js — 「단원평가 점수 안 적힘」 이 unitScored 를 안 씁니다. " +
        "아이가 냈는데도 배지가 안 꺼집니다 (⑥-3)"
    );
  }
  const mo = read("app/monthly/actions.js");
  if (!mo.includes("isStudentUnit") || !mo.includes("toExamShape")) {
    bad.push(
      "app/monthly/actions.js — 월간리포트가 아이가 낸 단원평가(scores·source='form')를 " +
        "안 모읍니다 (⑥-3)"
    );
  }
}

// 판단 자체가 맞게 도는지 — 모양만 보는 검사는 이름만 남기고 속을 비울 수 있다
{
  const { madeKeys, unitScored, isStudentUnit, unitExamName, toExamShape } =
    await import("../lib/unitScore.js");
  const made = madeKeys([
    { student_id: "a", taken_on: "2026-08-29", kind: "unit", source: "form" },
    { student_id: "b", taken_on: "2026-08-29", kind: "unit", source: "class" },
  ]);
  const t = (got, want, what) => { if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`lib/unitScore — ${what} (나온 것 ${JSON.stringify(got)})`); };
  t(unitScored({ student_id: "a", date: "2026-08-29" }, made), true, "아이가 낸 것을 적힌 것으로 세야 합니다");
  t(unitScored({ student_id: "b", date: "2026-08-29" }, made), false, "선생님 사본(class)은 아이가 낸 것이 아닙니다");
  t(unitScored({ student_id: "c", date: "2026-08-29", sent_unit: "Day 3" }, made), true, "판에 적힌 것도 적힌 것입니다");
  t(unitScored({ student_id: "c", date: "2026-08-29" }, made), false, "아무 데도 없으면 안 적힌 것입니다");
  t(isStudentUnit({ kind: "school", source: "form" }), false, "학교 시험은 단원평가가 아닙니다");
  t(unitExamName({ term: "Day 3", note: "재시험 · 10문제 중 3개 틀림" }), "Day 3 (재시험)", "판과 같은 이름이어야 합니다");
  t(toExamShape({ student_id: "a", taken_on: "2026-08-29", term: "Day 3", note: "통과", raw_score: 90, full_score: 100 }),
    { student_id: "a", date: "2026-08-29", name: "Day 3", score: 90, total: 100 }, "월간 모양으로 바꿔야 합니다");
}

if (bad.length) {
  console.log("❌ 이어져 있어야 하는 자리가 끊어졌습니다:");
  bad.forEach((b) => console.log("   ·", b));
  process.exit(1);
}
console.log("✅ 두 곳에 나뉜 값들이 한 길로 이어져 있습니다");
