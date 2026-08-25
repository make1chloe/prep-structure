"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { plan } from "@/lib/yearFix";
import { pageAll } from "@/lib/pageAll";
import { sessionUser } from "@/lib/session";

/**
 * **연도 다시 맞추기** — 줄마다 따져서, 하나로 좁혀진 것만.
 *
 * 원장님 (2026-08-06) — 「올해인지 작년인지 재작년인지 모르는데 뭘 돌린다는거야」
 *
 * 범위를 찍어 통째로 미는 방식(「연도 되돌리기」)은 그 안에 진짜 올해 기록이
 * 있으면 그것까지 망가뜨린다. 여기서는 **줄마다** 후보 연도를 세우고,
 * 미래·요일·재원기간으로 지워서 **하나만 남았을 때만** 고친다.
 *
 * 두 걸음으로 나눈다 — **세어보고, 눈으로 보고, 그다음에 고친다.**
 * 날짜를 잘못 옮기면 되돌리기가 더 어렵다.
 */

const TABLES = {
  daily_reports: { label: "수업 기록", date: "date" },
  attendance: { label: "출결 · 보강", date: "date" },
};

async function context(supabase) {
  const today = todaySeoul();

  // 학생별 수업 요일
  const { data: cls } = await supabase.from("classes").select("id, days");
  const dayOfClass = new Map((cls || []).map((c) => [c.id, c.days || []]));
  const { data: mem } = await supabase.from("class_students").select("class_id, student_id");
  const daysOf = new Map();
  (mem || []).forEach((m) => {
    const cur = daysOf.get(m.student_id) || [];
    (dayOfClass.get(m.class_id) || []).forEach((d) => { if (!cur.includes(d)) cur.push(d); });
    daysOf.set(m.student_id, cur);
  });

  // 재원 기간 — 다니기 전·그만둔 뒤의 기록일 수는 없다
  const { data: studs } = await supabase
    .from("students").select("id, name, enrolled_on, ended_on");
  const info = new Map((studs || []).map((s) => [s.id, s]));

  return { today, daysOf, info };
}

async function staffOnly(supabase) {
  const user = await sessionUser(supabase);
  if (!user) return "로그인이 필요해요.";
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  return p?.role === "principal" ? null : "원장님만 할 수 있어요.";
}

/** 무엇이 몇 건인지 따져본다 (아무것도 안 바꾼다) */
export async function planYearFix() {
  const supabase = await createClient();
  const deny = await staffOnly(supabase);
  if (deny) return { error: deny, tables: [] };

  const { today, daysOf, info } = await context(supabase);
  const tables = [];

  for (const [table, meta] of Object.entries(TABLES)) {
    // 1000줄에서 잘리면 뒤쪽 자료는 아예 안 보고 「고칠 것 없음」 이 된다
    const { rows: data, error } = await pageAll((from, to) =>
      supabase.from(table).select(`id, ${meta.date}, student_id`)
        .order(meta.date, { ascending: true }).range(from, to)
    );
    if (error) continue;

    const rows = (data || [])
      .filter((r) => r[meta.date])
      .map((r) => ({ id: r.id, date: r[meta.date], student_id: r.student_id }));

    const res = plan(rows, (r) => {
      const s = info.get(r.student_id);
      return {
        today,
        classDays: daysOf.get(r.student_id) || null,
        startedOn: s?.enrolled_on || null,
        endedOn: s?.ended_on || null,
      };
    });

    tables.push({
      table,
      label: meta.label,
      total: rows.length,
      keep: res.keep,
      shaky: res.shaky,
      fix: res.fix.map((x) => ({
        id: x.id, date: x.date, to: x.to,
        name: info.get(x.student_id)?.name || "",
      })),
      ask: res.ask.map((x) => ({
        id: x.id, date: x.date,
        options: x.options.map((o) => o.date),
        name: info.get(x.student_id)?.name || "",
      })),
      none: res.none.map((x) => ({
        id: x.id, date: x.date,
        name: info.get(x.student_id)?.name || "",
        why: x.all.map((o) => `${o.date}: ${o.why.join(" · ")}`),
      })),
    });
  }

  return { error: null, today, tables };
}

/**
 * **하나로 좁혀진 것만** 고친다.
 *
 * 화면에서 세어본 뒤에만 부른다. 여기서 다시 따져서 넣는다 — 화면이 준
 * 날짜를 그대로 믿으면, 그 사이에 자료가 바뀌었을 때 엉뚱한 곳에 쓴다.
 *
 * `attendance` 와 `daily_reports` 는 (학생, 날짜) 가 열쇠라 **옮긴 자리에
 * 이미 줄이 있으면 부딪힌다.** 그때는 건드리지 않고 남겨서 알려드린다 —
 * 덮어쓰면 원래 있던 기록이 사라진다.
 */
export async function applyYearFix(table) {
  const supabase = await createClient();
  const deny = await staffOnly(supabase);
  if (deny) return { error: deny, moved: 0 };
  const meta = TABLES[table];
  if (!meta) return { error: "모르는 표예요.", moved: 0 };

  const res = await planYearFix();
  if (res.error) return { error: res.error, moved: 0 };
  const t = res.tables.find((x) => x.table === table);
  if (!t || t.fix.length === 0) return { error: null, moved: 0, clashed: [] };

  // 옮길 자리에 이미 있는 줄 (같은 학생·같은 날)
  const { data: exist } = await supabase
    .from(table)
    .select(`id, ${meta.date}, student_id`)
    .in(meta.date, [...new Set(t.fix.map((x) => x.to))]);
  const taken = new Set((exist || []).map((r) => `${r.student_id}|${r[meta.date]}`));

  let moved = 0;
  const clashed = [];
  for (const x of t.fix) {
    const { data: row } = await supabase
      .from(table).select("student_id").eq("id", x.id).maybeSingle();
    if (!row) continue;
    if (taken.has(`${row.student_id}|${x.to}`)) {
      clashed.push(`${x.name} ${x.date} → ${x.to} (그 자리에 이미 기록이 있어요)`);
      continue;
    }
    const { error } = await supabase.from(table).update({ [meta.date]: x.to }).eq("id", x.id);
    if (!error) { moved += 1; taken.add(`${row.student_id}|${x.to}`); }
  }

  revalidatePath("/import");
  revalidatePath("/today");
  revalidatePath("/report");
  return { error: null, moved, clashed };
}
