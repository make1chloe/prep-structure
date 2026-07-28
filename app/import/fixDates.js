"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";

/**
 * 연도가 1년 밀린 기록을 되돌린다.
 *
 * 노션에서 연도 없이 "12/30" 만 있는 날짜를 가져오면서 올해(2026)로 붙였다.
 * 그래서 **작년 기록이 통째로 올해로** 들어갔다.
 *   · 8~12월 것은 미래 날짜가 됐다 (2026-12-30) → 눈에 띈다
 *   · 1~7월 것은 미래가 아니라 그냥 올해로 보인다 → 눈에 안 띈다
 * 그래서 "미래인 것만" 고치면 절반만 고쳐진다.
 *
 * 어느 것이 가져온 것인지는 **들어온 시각(created_at)** 으로 안다.
 *   · 직접 쓴 기록은 수업한 날에 만들어진다 (수업날짜 ≈ 들어온 날)
 *   · 가져온 기록은 전부 가져오기 한 날에 만들어진다 (수업날짜 ≠ 들어온 날)
 *
 * 다만 자동으로 판단해서 통째로 옮기지는 않는다. **범위를 직접 고르고,
 * 무엇이 몇 개 바뀌는지 눈으로 보고 나서** 옮긴다. 날짜를 잘못 옮기면
 * 되돌리기가 더 어렵다.
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

/**
 * 무엇이 몇 개인지 세어본다 (아무것도 안 바꾼다).
 *
 * @param from       "2026-01-01"  이 날짜부터
 * @param to         "2026-12-31"  이 날짜까지
 * @param importedOn "2026-07-28"  이 날 우리 DB 에 들어온 것만 (비우면 전부)
 */
export async function countRows({ from, to, importedOn } = {}) {
  const supabase = createClient();
  const today = todaySeoul();
  const out = [];

  for (const t of TABLES) {
    let q = supabase.from(t.name).select("id, date, created_at, student_id");
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (importedOn) {
      q = q.gte("created_at", `${importedOn}T00:00:00Z`).lt("created_at", `${importedOn}T23:59:59Z`);
    }
    const { data, error } = await q.order("date", { ascending: true }).limit(5000);
    if (error) continue;                        // 아직 없는 표는 건너뛴다

    const rows = data || [];
    out.push({
      ...t,
      count: rows.length,
      first: rows[0]?.date || null,
      last: rows[rows.length - 1]?.date || null,
      future: rows.filter((r) => r.date > today).length,
      // 언제 들어온 것들인지 — 가져오기 한 날을 찾는 실마리
      days: [...new Set(rows.map((r) => (r.created_at || "").slice(0, 10)).filter(Boolean))]
        .sort()
        .slice(0, 6),
      sample: rows.slice(0, 3).map((r) => ({
        date: r.date,
        made: (r.created_at || "").slice(0, 10),
      })),
    });
  }
  return { error: null, today, tables: out };
}

/** 고른 범위를 1년 앞으로 되돌린다 */
export async function shiftBackOneYear({ from, to, importedOn } = {}) {
  if (!from || !to) return { error: "기간을 골라주세요.", done: [] };

  const supabase = createClient();
  const done = [];

  for (const t of TABLES) {
    let q = supabase.from(t.name).select("id, date");
    q = q.gte("date", from).lte("date", to);
    if (importedOn) {
      q = q.gte("created_at", `${importedOn}T00:00:00Z`).lt("created_at", `${importedOn}T23:59:59Z`);
    }
    const { data, error } = await q.limit(5000);
    if (error || !data?.length) continue;

    // 뒤쪽부터 옮긴다 — 같은 표 안에서 자리가 겹치는 것을 줄인다
    const rows = [...data].sort((a, b) => b.date.localeCompare(a.date));

    let ok = 0;
    let skipped = 0;
    for (const row of rows) {
      const { error: upErr } = await supabase
        .from(t.name)
        .update({ date: backOneYear(row.date) })
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
