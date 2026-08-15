// **첫 등원은 베끼지 않는다** — students 의 등원시작일(enrolled_on)이 원본이고,
// 달력·대시보드는 그 값을 그 자리에서 읽어 그린다 (원칙 1 — 한 번 입력한
// 값은 쓰는 곳에서 다 보여야 한다).
//
// 예전에는 등록하는 순간 tasks 에 한 줄 복사했다. 그러니 ① 기능이 생기기
// 전에 등록한 학생은 영영 안 뜨고 (2026-08-15 원장님 「신규생 첫등원은
// 달력에 안떠」), ② 등원시작일을 고치면 일정을 따라 옮겨줘야 하는 두 벌
// 관리가 됐다. 원본에서 그때그때 읽으면 둘 다 없는 문제다.

/** 첫 등원 날 — 등원시작일이 원본, 없으면 수강료가 보는 시작일로 */
export function firstDayOf(s) {
  return s?.enrolled_on || s?.started_on || null;
}

export function firstDayTitle(name) {
  return `🌱 ${name} 첫 등원`;
}

/**
 * from~to 사이에 첫 등원이 있는 학생들 — 달력·일정에 얹을 거리.
 * 넘어오는 명단이 이미 재원생이라야 한다 (퇴원생 시작일은 역사다).
 */
export function firstDayEvents(students, from, to) {
  return (students || [])
    .map((s) => ({ s, d: firstDayOf(s) }))
    .filter(({ d }) => d && d >= from && d <= to)
    .map(({ s, d }) => ({
      studentId: s.id,
      name: s.name,
      date: d,
      title: firstDayTitle(s.name),
    }));
}
