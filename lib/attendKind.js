/**
 * **출결 한 벌** — attendance 에 쓴 것을 그날 판에 그대로 옮긴다 (0184).
 *
 * 원장님 확정 2026-08-29: 「판을 안 열고 출결만 빠르게 찍은 날도 월간리포트
 * 수업일수에 **센다**」. (2026-08-27 의 「출결 찍힌 판만 수업으로 센다」 를
 * 바꾸신 것 — 세는 규칙은 그대로 두고, **출결을 찍으면 판이 생기게** 한다.)
 *
 * 같은 「오늘 왔나」 가 두 곳에 산다 — public.attendance 와
 * daily_reports.attendance_kind. 월간 수업일수·지각 경고·학부모 3줄·마감
 * 판정은 뒤엣것만 읽는다. 앞엣것에 쓰는 갈래가 **여덟**이라, 그 여덟이
 * 저마다 판을 만들면 그 순간 판단이 여덟 벌이 된다 (원칙 1). 그래서
 * 갈래들은 전부 여기 하나를 지난다.
 *
 * 지키는 검사: scripts/check-links.mjs ⑦ 절 — attendance 에 쓰는 자리를
 * 전수로 훑어 이 함수를 안 부르는 곳이 있으면 빨개진다.
 */

/**
 * @param rows [{ student_id, date, status }]
 *             status 가 null·빈값이면 **지운다** (판은 안 만든다 — 그 판에
 *             붙은 검사·배정까지 없앨 일이 아니다).
 * @returns { error } — 실패해도 출결 자체는 이미 저장돼 있다. 부르는 쪽은
 *          이 오류로 손짓을 되돌리지 않는다 (조용히 넘어간다).
 */
export async function mirrorKind(supabase, rows = []) {
  // 같은 (학생, 날짜)가 두 번 들어오면 마지막 것 하나로 — 배치 갈래
  // (결석 예정 여러 날·엑셀 들여오기)에서 실제로 겹쳐 온다
  const one = new Map();
  (rows || []).forEach((r) => {
    if (!r || !r.student_id || !r.date) return;
    one.set(`${r.student_id}|${r.date}`, {
      s: r.student_id,
      d: r.date,
      k: r.status || null,
    });
  });
  if (one.size === 0) return { error: null };

  const { error } = await supabase.rpc("mirror_attendance_kind", {
    p_rows: [...one.values()],
  });
  // 0184 전 DB — 함수가 없으면 예전 그대로 (출결만 남는다). 화면에 빨간
  // 글씨를 띄울 일이 아니다. 설정 → SQL 의 attend_mirror_on() 이 말해준다.
  if (error && (error.code === "42883" || error.code === "PGRST202")) {
    return { error: null };
  }
  return { error: error?.message || null };
}

/** 지우는 쪽 — mirrorKind 와 **같은 한 벌**을 지나게 하는 얇은 이름 */
export const clearKind = (supabase, keys = []) =>
  mirrorKind(supabase, (keys || []).map((k) => ({ ...k, status: null })));
