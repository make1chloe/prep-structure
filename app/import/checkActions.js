"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";

/**
 * 이관이 제대로 됐는지 본다.
 *
 * "다 올라갔나요?" 는 눈으로는 확인할 수 없다. 월별로 세어보면 바로 보인다 —
 * 수업이 있었는데 리포트가 0인 달, 학생 명단에 없어서 통째로 빠진 이름 같은 것들.
 */
export async function checkImport(ym) {
  const supabase = createClient();
  const from = ym ? `${ym}-01-01` : "1900-01-01";
  const to = ym ? `${ym}-12-31` : "2999-12-31";

  const { data: students } = await supabase.from("students").select("id, name, status");
  const nameOf = new Map((students || []).map((s) => [s.id, s.name]));

  // 한 해치 전체 — 1000줄을 훌쩍 넘는다. 이 화면의 일이 「다 들어갔나」
  // 세는 것인데 세는 쪽이 잘리면 화면이 거짓말을 한다 (A5)
  const { data: reports } = await fetchAll(() =>
    supabase
      .from("daily_reports")
      .select("id, student_id, date")
      .gte("date", from)
      .lte("date", to)
      .order("id")
  );

  const ids = (reports || []).map((r) => r.id);
  // 검사한 숙제 · 배정한 숙제가 같이 넘어왔는지
  // id 를 500개씩 잘라도 **줄 수**는 안 잘린다 (id 하나에 숙제 대여섯 줄)
  // — 묶음마다 fetchAll 로 끝까지 받는다
  let items = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await fetchAll(() =>
      supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", ids.slice(i, i + 500))
        .order("daily_report_id")
    );
    items = items.concat(data || []);
  }
  const withItems = new Set(items.map((x) => x.daily_report_id));

  const { data: att } = await fetchAll(() =>
    supabase
      .from("attendance")
      .select("student_id, date, status")
      .gte("date", from)
      .lte("date", to)
      .order("date").order("student_id")
  );

  // 월별로 센다
  const byMonth = new Map();
  const touch = (m) => {
    if (!byMonth.has(m)) {
      byMonth.set(m, { ym: m, reports: 0, withItems: 0, assigned: 0, absence: 0, makeup: 0 });
    }
    return byMonth.get(m);
  };
  (reports || []).forEach((r) => {
    const m = touch(r.date.slice(0, 7));
    m.reports += 1;
    if (withItems.has(r.id)) m.withItems += 1;
  });
  const assignedIds = new Set(
    items.filter((x) => x.status === "assigned").map((x) => x.daily_report_id)
  );
  (reports || []).forEach((r) => {
    if (assignedIds.has(r.id)) touch(r.date.slice(0, 7)).assigned += 1;
  });
  (att || []).forEach((a) => {
    const m = touch(a.date.slice(0, 7));
    if (a.status === "absent") m.absence += 1;
    if (a.status === "makeup") m.makeup += 1;
  });

  // 학생별로 센다 — 0건인 재원생이 있으면 이름이 안 맞았을 가능성이 크다
  const perStudent = new Map();
  (reports || []).forEach((r) => {
    perStudent.set(r.student_id, (perStudent.get(r.student_id) || 0) + 1);
  });
  const enrolled = (students || []).filter((s) => !s.status || s.status === "enrolled");
  const zero = enrolled
    .filter((s) => !perStudent.get(s.id))
    .map((s) => s.name)
    .sort((a, b) => a.localeCompare(b, "ko"));

  const dates = (reports || []).map((r) => r.date).sort();

  return {
    months: [...byMonth.values()].sort((a, b) => a.ym.localeCompare(b.ym)),
    totals: {
      reports: (reports || []).length,
      withItems: withItems.size,
      students: perStudent.size,
      absence: (att || []).filter((a) => a.status === "absent").length,
      makeup: (att || []).filter((a) => a.status === "makeup").length,
      first: dates[0] || null,
      last: dates[dates.length - 1] || null,
    },
    zero,
    enrolled: enrolled.length,
  };
}
