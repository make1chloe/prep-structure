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

// ── 5) 이름·학부모 전화가 따라가나 (⑥-12 · ⑥-9) ────────────
// 이름은 students.name 과 profiles.name 두 곳에 있고, 형제 묶음(family_id)은
// 학부모 전화가 같은 아이를 묶는다. 고쳐도 안 따라가면 아이는 로그인해서
// 옛 이름을 보고, 형제는 영영 따로 남는다.
{
  const act = read("app/students/actions.js");
  const at = act.indexOf("export async function updateStudent(");
  const body = at < 0 ? "" : act.slice(at, act.indexOf("\nexport async function", at + 1));
  if (!body.includes("syncAccountName(")) {
    bad.push(
      "app/students/actions.js — 이름을 고칠 때 syncAccountName 을 안 부릅니다. " +
        "아이·학부모가 로그인하면 옛 이름이 보입니다 (⑥-12)"
    );
  }
  if (!body.includes("joinFamilyByPhone(")) {
    bad.push(
      "app/students/actions.js — 학부모 전화를 고칠 때 joinFamilyByPhone 을 안 부릅니다. " +
        "번호를 맞춰 넣어도 형제로 안 묶입니다 (⑥-9)"
    );
  }
  const acc = read("app/students/accountActions.js");
  if (!/export async function syncAccountName/.test(acc)) {
    bad.push("app/students/accountActions.js — syncAccountName 이 없습니다 (⑥-12)");
  } else if (!acc.includes('from("profiles").update({ name })')) {
    bad.push("app/students/accountActions.js — syncAccountName 이 profiles.name 을 안 고칩니다 (⑥-12)");
  }
}

// ── 6) 특강만 빠짐 — 적는 자리가 있나 (원장님 확인 2026-08-29) ──
// 0164 가 student_extra_absences 표를 깔면서 「화면·백필은 다음 커밋들」 이라
// 적었는데 그 커밋이 안 왔다 — 읽는 곳 셋(월간·학생·학부모)이 **영영 빈 표**를
// 읽고 있었다. 적는 자리가 사라지면 그 상태로 되돌아간다.
{
  const ex = read("app/students/extraActions.js");
  if (!/export async function setExtraAbsence/.test(ex)) {
    bad.push(
      "app/students/extraActions.js — setExtraAbsence 가 없습니다. " +
        "특강만 빠진 날을 적을 곳이 없어 student_extra_absences 가 영영 빕니다 (①)"
    );
  } else {
    const fn = ex.slice(ex.indexOf("export async function setExtraAbsence"));
    const body = fn.slice(0, fn.indexOf("\nexport async function", 1));
    // attendance 를 건드리면 정규 출결이 특강 때문에 뒤집힌다
    if (/from\("attendance"\)/.test(body)) {
      bad.push(
        "app/students/extraActions.js — setExtraAbsence 가 attendance 를 건드립니다. " +
          "특강 결석은 정규 출결을 바꾸면 안 됩니다 (①)"
      );
    }
    if (!body.includes("student_extra_absences")) {
      bad.push("app/students/extraActions.js — setExtraAbsence 가 student_extra_absences 에 안 씁니다 (①)");
    }
    // 되돌릴 수 없으면 안 눌러보게 된다
    if (!/\.delete\(\)/.test(body)) {
      bad.push("app/students/extraActions.js — setExtraAbsence 로 되돌리기(지우기)가 없습니다 (①)");
    }
  }
  const pg = read("app/today/page.jsx");
  if (!pg.includes("student_extra_absences") || !pg.includes("extraScheduleId")) {
    bad.push(
      "app/today/page.jsx — 특강 줄이 extraScheduleId·오늘 특강 결석을 안 들고 갑니다. " +
        "판에서 「특강만 빠짐」 을 찍을 수 없습니다 (①)"
    );
  }
  const tb = read("app/today/TodayBoard.jsx");
  if (!tb.includes("setExtraAbsence(") || !tb.includes("특강 결석")) {
    bad.push(
      "app/today/TodayBoard.jsx — 「특강 결석」 단추가 없습니다. " +
        "정규 출결과 헷갈리지 않게 글자로 드러나야 합니다 (①)"
    );
  }
  // 정규 반에도 오는 아이의 참조 줄(refOnly)에 단추가 없으면 정작 「정규는
  // 왔는데 특강만 빠짐」 을 못 찍는다 — 이 기능의 이유 그 자체다
  const refAt = tb.indexOf("if (r.refOnly) {");
  const ref = refAt < 0 ? "" : tb.slice(refAt, tb.indexOf("const isOpen =", refAt));
  if (!ref.includes("extraAbsTail(")) {
    bad.push(
      "app/today/TodayBoard.jsx — 참조 줄(refOnly)에 특강 결석 단추가 없습니다. " +
        "「정규는 왔는데 특강만 빠짐」 을 못 찍습니다 (①)"
    );
  }
}

// ── 7) 출결을 찍은 날은 판도 생긴다 (원장님 확정 2026-08-29) ──
// 같은 「오늘 왔나」 가 attendance 와 daily_reports.attendance_kind 두 곳에
// 산다. 월간 수업일수·지각 경고·학부모 3줄·마감 판정은 뒤엣것만 읽는데,
// 앞엣것에 쓰는 갈래가 여덟이다. **한 갈래만 빠져도** 「어떤 날은 세고
// 어떤 날은 안 세는」 병이 그대로 남는다 — 그래서 전수로 훑는다.
{
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (dir, out = []) => {
    for (const f of readdirSync(dir)) {
      if (f === "node_modules" || f === ".next" || f.startsWith(".")) continue;
      const p = `${dir}/${f}`;
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(js|jsx)$/.test(f)) out.push(p);
    }
    return out;
  };

  /**
   * 여기 적힌 자리는 **일부러** 안 부르는 곳이다. 새 자리가 생기면
   * 목록에 없으니 빨개진다 — 그때 「왜 안 불러도 되는지」 를 적고 더한다.
   */
  const EXEMPT = new Map([
    // 판을 통째로 쓰면서 attendance_kind 를 제 손으로 적는다 (두 번 적을 일 없다)
    ["app/today/actions.js:saveStudentDay", "판이 attendance_kind 를 직접 쓴다"],
  ]);

  const files = walk("app").concat(walk("lib"));
  const hits = [];
  for (const p of files) {
    const src = read(p);
    if (!/from\("attendance"\)/.test(src)) continue;
    // 파일을 export 함수 단위로 자른다 (한 함수 안에 쓰기와 부름이 같이 있어야 한다)
    const marks = [...src.matchAll(/export (?:async )?function (\w+)/g)];
    for (let i = 0; i < marks.length; i += 1) {
      const from = marks[i].index;
      const to = i + 1 < marks.length ? marks[i + 1].index : src.length;
      const body = src.slice(from, to);
      // 쓰는 자리인가 — 조회만 하는 곳은 안 본다
      const writes = /from\("attendance"\)[\s\S]{0,200}?\.(upsert|insert|delete)\(/.test(body);
      if (!writes) continue;
      const key = `${p}:${marks[i][1]}`;
      if (EXEMPT.has(key)) continue;
      if (!/mirrorKind\(|clearKind\(/.test(body)) hits.push(key);
    }
  }
  if (hits.length) {
    bad.push(
      "출결을 쓰면서 그날 판을 안 만드는 자리가 있습니다 — 그 날은 월간 수업일수·" +
        "지각 경고·학부모 3줄에서 통째로 빠집니다 (0184 · lib/attendKind): " +
        hits.join(" · ")
    );
  }
  // 여덟 갈래가 실제로 이 한 벌을 지나는가 (위 훑기가 조용히 0건이 되는 것 방지)
  const EIGHT = [
    ["app/today/actions.js", "빠른 출결 찍기·지우기·보강 잡기"],
    ["app/today/arrivalActions.js", "선생님이 대신 찍는 등원"],
    ["app/me/arrivalActions.js", "학생이 스스로 찍는 등원"],
    ["app/plan/actions.js", "결석 예정·보강 화면"],
    ["app/requests/actions.js", "학부모 요청 처리"],
    ["app/tasks/actions.js", "할일 결석 반영"],
    ["app/schedule/actions.js", "시험 기간 결석"],
    ["app/import/actions.js", "엑셀 결석 들여오기"],
  ];
  EIGHT.forEach(([p, what]) => {
    if (!read(p).includes("@/lib/attendKind")) {
      bad.push(`${p} — ${what} 가 lib/attendKind 를 안 지납니다 (0184)`);
    }
  });
  // 한 벌 자체가 판을 만드는가
  const ak = read("lib/attendKind.js");
  if (!ak.includes("mirror_attendance_kind")) {
    bad.push("lib/attendKind.js — 0184 함수를 안 부릅니다");
  }
  // 반대 방향 — 판에서 출결을 지우면 attendance 줄도 지운다
  const ta = read("app/today/actions.js");
  const sv = ta.slice(ta.indexOf("export async function saveStudentDay"));
  if (!/"attendance" in form/.test(sv.slice(0, sv.indexOf("\nexport async function", 1)))) {
    bad.push(
      "app/today/actions.js — 판에서 출결을 지워도 attendance 줄이 남습니다 " +
        "(반대 방향 어긋남 · 2026-08-29)"
    );
  }
  const sp = read("app/today/StudentPanel.jsx");
  if (!/attTouched \|\| arr\.attend \? form\.attendance : row\.status/.test(sp)) {
    bad.push(
      "app/today/StudentPanel.jsx — 판을 저장할 때 줄에 찍힌 출결을 null 로 덮습니다. " +
        "빠르게 찍은 출결이 판 저장 한 번에 지워집니다 (2026-08-29)"
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

// 특강 결석 한 줄이 진짜로 「총 N회」 를 줄이나 (①) — 모양만 봐서는 모른다
{
  const { extraDatesBy } = await import("../lib/extraTerm.js");
  const sched = {
    id: "S1", student_id: "a", label: "여름 특강", days: ["월"],
    from_date: "2026-08-01", to_date: "2026-08-31", off_dates: [],
  };
  const all = extraDatesBy([sched], "2026-08", [], []).get("a") || [];
  const off = extraDatesBy([sched], "2026-08", [],
    [{ schedule_id: "S1", date: all[0], status: "absent" }]).get("a") || [];
  const mk = extraDatesBy([sched], "2026-08", [],
    [{ schedule_id: "S1", date: all[0], status: "makeup" }]).get("a") || [];
  if (all.length === 0) bad.push("lib/extraTerm — 특강 수업일이 하나도 안 나옵니다 (①)");
  if (off.length !== all.length - 1)
    bad.push("lib/extraTerm — 특강 결석을 적어도 「총 N회」 가 안 줄어듭니다 (①)");
  if (mk.length !== all.length)
    bad.push("lib/extraTerm — 특강 보강(makeup)은 수업일로 남아야 합니다 (0164 · ①)");
}

if (bad.length) {
  console.log("❌ 이어져 있어야 하는 자리가 끊어졌습니다:");
  bad.forEach((b) => console.log("   ·", b));
  process.exit(1);
}
console.log("✅ 두 곳에 나뉜 값들이 한 길로 이어져 있습니다");
