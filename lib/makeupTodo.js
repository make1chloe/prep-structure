// 테스트가 node 로 그냥 부를 수 있게 상대경로로 (다른 lib 도 같은 규칙)
import { todaySeoul, addDays } from "./day.js";

/**
 * **보강 잡을 것** — 결석은 있는데 보강 줄이 없는 것.
 *
 * 원래 대시보드 안에 파묻혀 있던 셈이다. 출결 화면으로 옮기면서
 * **똑같은 셈을 두 벌 만들지 않으려고** 여기로 뺐다 — 두 벌이 되면
 * 언젠가 한쪽만 고치게 되고, 두 화면이 다른 숫자를 말하게 된다.
 *
 * 여기 뜨는 결석은 원장님이 직접 넣으신 것만이 아니다. 세 갈래로 들어온다 —
 *   · 시험 기간 결석 예정을 반 단위로 한꺼번에 넣은 것 (`markExamAbsence`)
 *   · 학부모가 낸 결석 요청을 받아준 것 (`/requests`)
 *   · 옛 자료에서 옮겨온 결석 (`/import`)
 *
 * 그래서 **어디서 온 것인지**를 같이 넘긴다. 안 그러면 「이게 왜 여기
 * 있지」 로 끝나고, 치울 수도 없어서 목록이 점점 무거워진다.
 * 보강을 안 하기로 한 것은 `makeup_waived` 로 내린다 (0103).
 */
export function buildMakeupRows({
  absences = [],
  makeups = [],
  nameOf = new Map(),
  daysOfStudent = new Map(),
  today = todaySeoul(),
} = {}) {
  const done = new Set(makeups.map((m) => `${m.student_id}|${m.makeup_of}`));
  return absences
    .filter((a) => !done.has(`${a.student_id}|${a.date}`))
    .filter((a) => !a.makeup_waived)
    .map((a) => ({
      studentId: a.student_id,
      name: (nameOf.get ? nameOf.get(a.student_id) : nameOf[a.student_id]) || "",
      date: a.date,
      planned: !!a.planned,
      reason: a.reason || "",
      note: a.note || "",
      // **아직 오지 않은 날인가** — 결석 「예정」 이지 결석이 아니다
      future: a.date > today,
      classDays: [...(daysOfStudent.get(a.student_id) || [])],
    }))
    .filter((a) => a.name)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 표에서 직접 읽어 「보강 잡을 것」 을 만든다 — 대시보드를 통째로 부르지 않고.
 *
 * 대시보드 셈은 무겁다 (수강료·회차까지 돈다). 출결 화면은 그중 이 하나만
 * 필요해서, 필요한 것만 묻는다.
 */
export async function loadMakeupTodo(supabase, today = todaySeoul()) {
  const monthAgo = addDays(today, -35);
  const weekEnd = addDays(today, 14);

  let absQ = await supabase
    .from("attendance")
    .select("student_id, date, status, planned, reason, note, makeup_waived")
    .eq("status", "absent")
    .gte("date", monthAgo)
    .lte("date", weekEnd);
  if (absQ.error) {
    // 0103 전 DB 에는 makeup_waived 칸이 없다 — 그 칸이 없다고 목록이
    // 통째로 비면, 보강이 필요한 아이가 조용히 사라진다
    absQ = await supabase
      .from("attendance")
      .select("student_id, date, status, planned, reason")
      .eq("status", "absent")
      .gte("date", monthAgo)
      .lte("date", weekEnd);
  }

  const [mkQ, stQ, clQ, memQ] = await Promise.all([
    supabase.from("attendance").select("student_id, makeup_of").eq("status", "makeup").not("makeup_of", "is", null),
    supabase.from("students").select("id, name").eq("status", "enrolled"),
    supabase.from("classes").select("id, days"),
    supabase.from("class_students").select("class_id, student_id"),
  ]);

  const nameOf = new Map((stQ.data || []).map((s) => [s.id, s.name]));
  const daysOfClass = new Map((clQ.data || []).map((c) => [c.id, c.days || []]));
  const daysOfStudent = new Map();
  (memQ.data || []).forEach((m) => {
    const cur = daysOfStudent.get(m.student_id) || new Set();
    (daysOfClass.get(m.class_id) || []).forEach((d) => cur.add(d));
    daysOfStudent.set(m.student_id, cur);
  });

  return buildMakeupRows({
    absences: absQ.data || [],
    makeups: mkQ.data || [],
    nameOf,
    daysOfStudent,
    today,
  });
}
