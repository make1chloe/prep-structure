// 결석하면 **내 수업이 늘어난다.**
//
// 원장님 말씀 (2026-08-05)
//   · 학생 결석 · 학교 일정 — 그건 **일정**이다. 그날 그런 일이 있다는 사실이다.
//   · 보강처럼 **내가 수업을 한 번 더 해야 하는 것** — 그건 **할 일**이다.
//
// 둘을 한 칸에 섞어두면 「오늘 뭘 해야 하나」 를 볼 때마다 일정을 걸러내야 한다.
// 그래서 결석은 달력의 일정 쪽에 그대로 두고, **거기서 생긴 보강**만 할 일로 뽑는다.
//
// 새 표를 만들지 않는다. 결석과 보강은 이미 attendance 에 있고, 여기서는
// **아직 보강이 안 잡힌 결석**을 세기만 한다 — 두 군데에 적으면 어긋난다.

/**
 * 결석 한 건에 보강이 잡혔나.
 *
 * 잡혔다 = 그 학생에게 **그 결석 이후** 보강(status='makeup')이 하나라도 있다.
 * 날짜를 하나하나 짝지어 세지 않는다 — 원장님은 「3일 결석했으니 2회 보강」
 * 처럼 묶어서 잡으시고, 그걸 억지로 1:1 로 맞추면 늘 어긋난 채로 뜬다.
 *
 * @param absences [{ student_id, date, reason }]
 * @param makeups  [{ student_id, date }]
 * @returns [{ student_id, dates:[…], reasons:[…], done }] 학생별로 묶은 것
 */
export function makeupNeeded(absences = [], makeups = []) {
  const byStudent = new Map();
  absences.forEach((a) => {
    if (!a?.student_id || !a?.date) return;
    if (!byStudent.has(a.student_id)) {
      byStudent.set(a.student_id, { student_id: a.student_id, dates: [], reasons: [] });
    }
    const row = byStudent.get(a.student_id);
    row.dates.push(a.date);
    if (a.reason) row.reasons.push(a.reason);
  });

  const madeAfter = new Map();          // student_id → 가장 늦은 보강 날짜
  makeups.forEach((m) => {
    if (!m?.student_id || !m?.date) return;
    const cur = madeAfter.get(m.student_id);
    if (!cur || m.date > cur) madeAfter.set(m.student_id, m.date);
  });

  return [...byStudent.values()]
    .map((r) => {
      r.dates.sort();
      const last = r.dates[r.dates.length - 1];
      const made = madeAfter.get(r.student_id) || null;
      // 마지막 결석보다 뒤에 보강이 있으면 챙긴 것으로 본다
      return { ...r, made, done: !!(made && made >= last) };
    })
    .filter((r) => !r.done)
    .sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
}

/** 「8/4, 8/6 결석」 */
export function datesLabel(dates = []) {
  return dates.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join(", ");
}
