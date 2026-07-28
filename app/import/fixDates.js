"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";

/**
 * 미래로 들어간 수업 기록을 1년 앞으로 되돌린다.
 *
 * 노션에서 연도 없는 "12/30" 을 가져오면서 올해(2026)로 붙였다.
 * 그래서 작년 12월 기록이 **2026-12-30** 이 되었고, 지난주에 수업하고도
 * "최근 수업 12월 30일" 이 떴다.
 *
 * 들여오기는 고쳤지만 **이미 들어간 것은 고쳐지지 않는다.** 여기서 되돌린다.
 * 수업 기록은 미래일 수 없으므로, 오늘보다 뒤에 있는 것은 전부 잘못이다.
 *
 * 먼저 세어만 보고(preview), 확인한 뒤에 고친다.
 */

const TABLES = [
  { name: "daily_reports", label: "데일리리포트" },
  { name: "attendance", label: "출결" },
  { name: "class_attendance", label: "특강 출결" },
];

function backOneYear(date) {
  const [y, m, d] = date.split("-");
  return `${Number(y) - 1}-${m}-${d}`;
}

/** 몇 개나 미래에 있나 — 고치기 전에 보여준다 */
export async function countFutureRows() {
  const supabase = createClient();
  const today = todaySeoul();
  const out = [];

  for (const t of TABLES) {
    const { data, error } = await supabase
      .from(t.name)
      .select("id, date")
      .gt("date", today)
      .order("date", { ascending: true })
      .limit(2000);
    if (error) continue;                       // 아직 없는 표는 건너뛴다
    if (!data?.length) {
      out.push({ ...t, count: 0, from: null, to: null });
      continue;
    }
    out.push({
      ...t,
      count: data.length,
      from: data[0].date,
      to: data[data.length - 1].date,
    });
  }
  return { error: null, today, tables: out };
}

/** 미래에 있는 것을 1년 앞으로 되돌린다 */
export async function fixFutureRows() {
  const supabase = createClient();
  const today = todaySeoul();
  const done = [];

  for (const t of TABLES) {
    const { data, error } = await supabase
      .from(t.name)
      .select("id, date")
      .gt("date", today)
      .limit(2000);
    if (error || !data?.length) continue;

    let ok = 0;
    let skipped = 0;
    for (const row of data) {
      const next = backOneYear(row.date);
      const { error: upErr } = await supabase
        .from(t.name)
        .update({ date: next })
        .eq("id", row.id);
      // 같은 (학생, 날짜) 가 이미 있으면 못 옮긴다 — 그건 그대로 둔다
      if (upErr) skipped += 1;
      else ok += 1;
    }
    done.push({ ...t, fixed: ok, skipped });
  }

  revalidatePath("/import");
  revalidatePath("/me");
  revalidatePath("/today");
  return { error: null, done };
}
