/**
 * **진도 판이 받는 교재 한 줄의 모양** — 한 곳에서만 만든다.
 *
 * `components/BookProgress` 와 `app/progress/StudentBooksProgress` 는
 * 교재 하나를 `{ id, name, area, dead, bookPages, curPage, skipActs,
 * pause, round, doing }` 모양으로 받는다. 이 모양을 화면마다 따로 적으면
 * — 진도 화면 한 벌, 대시보드 팝오버 한 벌 — **언젠가 한쪽만 고친다.**
 * 실제로 절판 표시(dead)·멈춤(pause)·건너뛸 활동(skipActs)은 뒤늦게
 * 붙은 칸이라, 두 벌이었으면 한쪽에서만 안 보였을 것들이다.
 *
 * 조회는 화면마다 다르다(전교생 파도 · 한 학생 단건) — **모양만** 한 벌이다.
 */

/** 절판·중단된 교재인가 — 배정이 살아 있으면 보여주되 표시는 한다 */
export function deadBook(b) {
  return !!(b?.status && b.status !== "active");
}

/**
 * @param r   student_textbooks 한 줄 (status·current_page·round·skip_acts·pause)
 * @param b   textbooks 한 줄 (name·area·status·total_pages)
 * @param doing 이 학생·이 교재·이 회독에서 ◐ 인 단원 이름들
 */
export function bookPanelRow(r, b, doing = []) {
  return {
    id: b.id,
    name: b.name,
    area: b.area || "",
    dead: deadBook(b),
    bookPages: b.total_pages || 0,
    curPage: r.current_page ?? "",
    skipActs: r.skip_acts || "",
    // 멈춤 (0149) — 진도 판(BookProgress)이 태그·토글로 보여준다
    pause: r.pause || null,
    round: r.round || 1,
    doing,
  };
}

/** 교재 고르는 목록 — 살아 있는 교재만, 필요한 세 칸만 */
export function pickableBooks(rows = []) {
  return (rows || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({ id: b.id, name: b.name, area: b.area || "" }));
}
