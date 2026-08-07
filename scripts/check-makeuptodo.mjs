/**
 * **보강 잡을 것** 의 셈 — 대시보드와 출결 화면이 같은 것을 본다 (2026-08-07).
 *
 * 출결을 한 화면으로 모으면서 이 셈을 lib/makeupTodo.js 로 뺐다. 옮기다
 * 한 줄이라도 달라지면 **두 화면이 다른 숫자를 말하게 된다** — 대시보드는
 * 「보강 잡을 것 3건」 인데 출결에는 2건만 있는 식이다. 그러면 어느 쪽을
 * 믿어야 하는지 알 수 없고, 결국 둘 다 안 믿게 된다.
 */
import { buildMakeupRows } from "../lib/makeupTodo.js";

let bad = 0;
const t = (ok, what) => { if (!ok) { console.log(`  ❌ ${what}`); bad = 1; } };

const nameOf = new Map([["s1", "서은"], ["s2", "지호"], ["s9", ""]]);
const daysOfStudent = new Map([["s1", new Set(["월", "수"])]]);
const TODAY = "2026-08-07";

console.log("== 보강이 잡힌 결석은 빠진다 ==");
{
  const rows = buildMakeupRows({
    absences: [
      { student_id: "s1", date: "2026-08-03" },
      { student_id: "s1", date: "2026-08-05" },
    ],
    makeups: [{ student_id: "s1", makeup_of: "2026-08-03" }],
    nameOf, daysOfStudent, today: TODAY,
  });
  t(rows.length === 1, "보강이 잡힌 결석은 목록에서 내려간다");
  t(rows[0]?.date === "2026-08-05", "안 잡힌 것만 남는다");
}

console.log("== 「보강 없음」 으로 내린 것도 빠진다 ==");
{
  const rows = buildMakeupRows({
    absences: [{ student_id: "s1", date: "2026-08-05", makeup_waived: true }],
    makeups: [], nameOf, daysOfStudent, today: TODAY,
  });
  t(rows.length === 0, "makeup_waived 는 목록에서 내려간다 (0103)");
}

console.log("== 아직 안 온 날은 「결석」 이 아니라 「예정」 ==");
{
  const rows = buildMakeupRows({
    absences: [
      { student_id: "s1", date: "2026-08-10" },
      { student_id: "s1", date: "2026-08-01" },
    ],
    makeups: [], nameOf, daysOfStudent, today: TODAY,
  });
  const future = rows.find((r) => r.date === "2026-08-10");
  const past = rows.find((r) => r.date === "2026-08-01");
  t(future?.future === true, "오늘 뒤는 예정");
  t(past?.future === false, "오늘 앞은 결석");
  t(rows[0].date === "2026-08-01", "오래된 것이 위로 (급한 순서)");
}

console.log("== 오늘은 「예정」 이 아니다 ==");
{
  const rows = buildMakeupRows({
    absences: [{ student_id: "s1", date: TODAY }],
    makeups: [], nameOf, daysOfStudent, today: TODAY,
  });
  t(rows[0]?.future === false, "오늘 결석은 이미 일어난 일로 본다");
}

/**
 * **이름이 없으면 안 보여준다.** 퇴원했거나 명단에 없는 아이의 옛 결석이
 * 「(빈칸) 8/3 결석」 으로 뜨면, 누구 것인지 알 수 없는 줄이 영원히 남는다.
 */
console.log("== 명단에 없는 아이는 안 뜬다 ==");
{
  const rows = buildMakeupRows({
    absences: [{ student_id: "s9", date: "2026-08-01" }, { student_id: "없는아이", date: "2026-08-01" }],
    makeups: [], nameOf, daysOfStudent, today: TODAY,
  });
  t(rows.length === 0, "이름이 빈 줄은 목록에 안 올린다");
}

console.log("== 그 아이 수업 요일이 따라온다 ==");
{
  const rows = buildMakeupRows({
    absences: [{ student_id: "s1", date: "2026-08-01" }],
    makeups: [], nameOf, daysOfStudent, today: TODAY,
  });
  t(rows[0].classDays.join("") === "월수", "보강 날짜를 고를 때 이게 있어야 한다");
}

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 보강 잡을 것 통과");
