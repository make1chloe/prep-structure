"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pageAll } from "@/lib/pageAll";
import { sessionUser } from "@/lib/session";

/**
 * **노션에서 옮긴 것만 골라 지운다.**
 *
 * 원장님 (2026-08-06) — 「그냥 여태 노션 올린 자료를 웹앱에서 싹 지우고
 * 너가 다운받은 걸 다시 올려줘」
 *
 * ── 「싹」 이 무서운 이유 ─────────────────────────────────
 *
 * 통째로 지우면 **원장님이 손으로 쓰신 기록까지 사라진다.** 이관한 것과
 * 직접 쓰신 것이 같은 표에 섞여 있기 때문이다. 그래서 **가려낼 수 있는
 * 만큼만** 지운다.
 *
 * 가르는 기준은 **들어온 날(created_at)** 이다.
 *   · 직접 쓰신 기록은 **수업한 날에** 만들어진다 (수업날짜 ≈ 들어온 날)
 *   · 옮겨온 기록은 **옮긴 날에 한꺼번에** 만들어진다 (수업날짜 ≠ 들어온 날)
 *
 * 그래서 「들어온 날짜별 건수」 를 먼저 보여드린다. 하루에 수백 건이 몰려
 * 있으면 그날이 이관한 날이다 — 눈으로 확인하고 그날만 고르신다.
 *
 * **세어보고 → 눈으로 보고 → 지운다.** 지우기는 되돌릴 수 없다.
 */

const TABLES = {
  daily_reports: { label: "수업 기록", date: "date" },
  attendance: { label: "출결 · 보강", date: "date" },
};

async function principalOnly(supabase) {
  const user = await sessionUser(supabase);
  if (!user) return "로그인이 필요해요.";
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  return p?.role === "principal" ? null : "원장님만 할 수 있어요.";
}

/**
 * **들어온 날짜별로 세어본다** (아무것도 안 지운다).
 *
 * `sameDay` 는 「수업한 날에 들어온 것」 = 직접 쓰셨을 가능성이 높은 것이다.
 * 그 수가 크면 그날은 이관한 날이 아니다.
 */
export async function countImported() {
  const supabase = createClient();
  const deny = await principalOnly(supabase);
  if (deny) return { error: deny, tables: [] };

  const tables = [];
  for (const [table, meta] of Object.entries(TABLES)) {
    // 1000줄에서 잘리면 「이관한 날」 건수가 실제보다 적게 나온다
    const { rows: data, error } = await pageAll((from, to) =>
      supabase.from(table).select(`id, ${meta.date}, created_at`)
        .order("created_at", { ascending: true }).range(from, to)
    );
    if (error) continue;

    const bag = new Map();
    (data || []).forEach((r) => {
      const day = (r.created_at || "").slice(0, 10);
      if (!day) return;
      if (!bag.has(day)) bag.set(day, { day, total: 0, sameDay: 0, from: null, to: null });
      const b = bag.get(day);
      b.total += 1;
      if (r[meta.date] === day) b.sameDay += 1;
      const d = r[meta.date];
      if (d) {
        if (!b.from || d < b.from) b.from = d;
        if (!b.to || d > b.to) b.to = d;
      }
    });

    tables.push({
      table,
      label: meta.label,
      total: data.length,
      days: [...bag.values()].sort((a, b) => b.day.localeCompare(a.day)),
    });
  }
  return { error: null, tables };
}

/**
 * 그날 들어온 것을 지운다.
 *
 * **수업한 날에 들어온 줄은 남긴다** (`keepSameDay`). 이관한 날에 원장님이
 * 그날 수업을 직접 적으셨다면 그것까지 지우면 안 되기 때문이다.
 * 이관분만 지우는 것이 목적이지, 그날 것을 다 지우는 것이 아니다.
 */
export async function wipeImported(table, day, keepSameDay = true) {
  const supabase = createClient();
  const deny = await principalOnly(supabase);
  if (deny) return { error: deny, removed: 0 };
  const meta = TABLES[table];
  if (!meta || !day) return { error: "무엇을 지울지 모르겠어요.", removed: 0 };

  // 1000줄씩 잘리면 한 번 눌러서 1000건만 지워진다 — 끝까지 읽는다
  const { rows: data, error } = await pageAll((from, to) =>
    supabase.from(table).select(`id, ${meta.date}, created_at`)
      .gte("created_at", `${day}T00:00:00Z`)
      .lt("created_at", `${day}T23:59:59.999Z`)
      .order("created_at", { ascending: true }).range(from, to)
  );
  if (error) return { error: error.message, removed: 0 };

  const ids = (data || [])
    .filter((r) => !(keepSameDay && r[meta.date] === day))
    .map((r) => r.id);
  if (ids.length === 0) return { error: null, removed: 0 };

  // 한 번에 너무 많이 보내면 주소가 길어져 거절당한다 — 나눠서 지운다
  let removed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error: delErr } = await supabase.from(table).delete().in("id", chunk);
    if (delErr) return { error: delErr.message, removed };
    removed += chunk.length;
  }

  revalidatePath("/import");
  revalidatePath("/today");
  revalidatePath("/report");
  return { error: null, removed };
}
