// 이 결석을 **뭐라고 부를까** — 한 곳에서만 정한다.
//
// 원장님 (2026-08-13): 「지나간 결석이 결석예정으로 되어있어. 이건 결석처리를
// 안해서 그런가?」 — **아니다. 화면이 날짜를 안 보고 있었다.**
//
// `attendance.planned` 는 「미리 넣어둔 것」이라는 표시다. 그날이 지나도
// 이 표시는 지워지지 않는다 — 지울 이유도 없다. 언제 넣었는지는 기록이니까.
//
// 그런데 화면이 이 표시만 보고 「예정」을 붙이면, **지난 달 결석도 예정**이라고
// 적힌다. 앞일로 보이니 「아직 안 지나갔나」 하고 한 번 더 보시게 되고,
// 달력을 뒤로 넘길 때마다 그 말이 계속 나온다.
//
// 「예정」은 **아직 안 온 날**에만 쓰는 말이다. 지나간 날은 그냥 「결석」이다.
// 실제로 결석했는지는 status 가 이미 말하고 있다 (planned 는 그것과 무관하다).

/**
 * @param row   attendance 한 줄 { status, planned, date }
 * @param today "YYYY-MM-DD" — 오늘 (todaySeoul())
 * @returns "결석 예정" | "결석" | "보강"
 */
export function absenceLabel(row, today) {
  if (!row) return "";
  if (row.status === "makeup") return "보강";
  return isUpcoming(row, today) ? "결석 예정" : "결석";
}

/**
 * **아직 안 온 결석인가** — 「예정」이라 부를 수 있는가.
 *
 * 오늘 것도 예정으로 본다. 아침에 「오늘 못 간다」 연락이 오고 저녁에
 * 「그냥 보낼게요」 가 오는 일이 실제로 있다 (app/plan/page.jsx 와 같은 기준).
 */
function isUpcoming(row, today) {
  if (!row?.planned) return false;
  if (!row.date || !today) return !!row.planned;
  return row.date >= today;
}
