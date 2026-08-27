// 테스트가 node 로 그냥 부를 수 있게 상대경로로 (다른 lib 도 같은 규칙)
import { todaySeoul, addDays } from "./day.js";

/**
 * **보강 필요** — 결석은 있는데 보강 줄이 없는 것.
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
 * 표에서 직접 읽어 「보강 필요」 을 만든다 — 대시보드를 통째로 부르지 않고.
 *
 * 대시보드 셈은 무겁다 (수강료·회차까지 돈다). 출결 화면은 그중 이 하나만
 * 필요해서, 필요한 것만 묻는다.
 */
export async function loadMakeupTodo(supabase, today = todaySeoul()) {
  /**
   * **기간 제한 없이 무조건 누적** (원장님, 2026-08-21 — 「할지 말지 결정
   * 안 한 건 다 보여줘. 무조건 누적」). 전에는 화면마다 창이 달라서
   * (대시보드 30/7 · 출결 35/14) 오래된 미결정 결석이 조용히 목록에서
   * 내려갔다 — 결정(보강 잡기 / 보강 없음)이 있어야만 내려간다.
   * 아래 한계는 출결 관리 시작(2026-08) 전 이관 자료를 안 캐는 것뿐.
   */
  const monthAgo = "2026-08-01";
  const weekEnd = addDays(today, 30);

  // 결석 조회가 파도 **앞에** 혼자 서 있으면 이 함수가 늘 2단이다 — 같은
  // 파도에 태운다 (성능수리 v3 §2-3-2). 0103 사다리는 그대로: 실패했을
  // 때만 그 자리에서 칸 없이 한 번 더 (성공 경로는 여전히 1단)
  const absP = (async () => {
    let q = await supabase
      .from("attendance")
      .select("student_id, date, status, planned, reason, note, makeup_waived")
      .eq("status", "absent")
      .gte("date", monthAgo)
      .lte("date", weekEnd);
    if (q.error) {
      // 0103 전 DB 에는 makeup_waived 칸이 없다 — 그 칸이 없다고 목록이
      // 통째로 비면, 보강이 필요한 아이가 조용히 사라진다
      q = await supabase
        .from("attendance")
        .select("student_id, date, status, planned, reason")
        .eq("status", "absent")
        .gte("date", monthAgo)
        .lte("date", weekEnd);
    }
    return q;
  })();
  // 아래 배열을 만드는 도중 딴 조회가 동기로 던지면(검사의 가짜 DB) absP 가
  // 고아 거부로 남아 프로세스째 죽는다 — 빈 손잡이를 미리 달아둔다.
  // 진짜 결과는 그대로 아래 await absP 가 받는다
  absP.catch(() => {});

  const [mkQ, stQ, clQ, memQ, exQ] = await Promise.all([
    supabase.from("attendance").select("student_id, makeup_of").eq("status", "makeup").not("makeup_of", "is", null),
    supabase.from("students").select("id, name").eq("status", "enrolled"),
    supabase.from("classes").select("id, days"),
    supabase.from("class_students").select("class_id, student_id"),
    // 특강(0164)도 그 아이가 오는 요일이다 — 0164 전 DB 면 error → 빈 배열
    supabase.from("student_extra_schedules").select("student_id, days, from_date, to_date"),
  ]);
  const absQ = await absP;

  const nameOf = new Map((stQ.data || []).map((s) => [s.id, s.name]));
  const daysOfClass = new Map((clQ.data || []).map((c) => [c.id, c.days || []]));
  const daysOfStudent = new Map();
  (memQ.data || []).forEach((m) => {
    const cur = daysOfStudent.get(m.student_id) || new Set();
    (daysOfClass.get(m.class_id) || []).forEach((d) => cur.add(d));
    daysOfStudent.set(m.student_id, cur);
  });
  ((exQ.error ? [] : exQ.data) || []).forEach((x) => {
    if (x.to_date < today) return;              // 끝난 특강 요일은 보강 후보가 아니다
    const cur = daysOfStudent.get(x.student_id) || new Set();
    (x.days || []).forEach((d) => cur.add(d));
    daysOfStudent.set(x.student_id, cur);
  });

  return buildMakeupRows({
    absences: absQ.data || [],
    makeups: mkQ.data || [],
    nameOf,
    daysOfStudent,
    today,
  });
}

/** 「8/1, 8/5」 — 보강 필요 줄의 날짜 나열 (makeupTask 에서 옮겨 옴) */
export function datesLabel(dates = []) {
  return dates.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join(", ");
}
