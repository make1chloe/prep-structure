"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { dueTasks, KINDS } from "@/lib/todoRoutine";

const SQL = "supabase/migrations/0082_todo_routines.sql 을 먼저 실행해주세요.";

function missing(error) {
  return (
    error &&
    (error.code === "42P01" || error.code === "PGRST205" ||
     error.code === "42703" || error.code === "PGRST204")
  );
}

export async function listRoutines() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("todo_routines")
    .select("id, title, repeat_kind, dows, day_of_month, month, lead_days, todo_category_id, priority, note, active, sort")
    .order("sort", { ascending: true });
  if (missing(error)) return { rows: [], error: SQL };
  if (error) return { rows: [], error: error.message };
  return { rows: data || [], error: null };
}

function clean(patch) {
  const kind = KINDS.some((k) => k.key === patch.repeat_kind) ? patch.repeat_kind : "monthly";
  const num = (v, lo, hi) => {
    const n = parseInt((v ?? "").toString().replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(n) || n < lo || n > hi) return null;
    return n;
  };
  return {
    title: (patch.title || "").trim(),
    repeat_kind: kind,
    // 안 쓰는 칸은 비워둔다 — 매주로 바꿔놓고 예전 날짜가 남아 있으면
    // 나중에 다시 매달로 돌렸을 때 엉뚱한 날이 살아난다
    dows: kind === "weekly" ? (patch.dows || []).filter(Boolean) : [],
    day_of_month: kind === "weekly" ? null : num(patch.day_of_month, 1, 31),
    month: kind === "yearly" ? num(patch.month, 1, 12) : null,
    lead_days: num(patch.lead_days, 0, 365) ?? 0,
    todo_category_id: patch.todo_category_id || null,
    priority: num(patch.priority, 0, 2) ?? 0,
    note: (patch.note || "").trim() || null,
    active: patch.active !== false,
  };
}

export async function saveRoutine(id, patch) {
  const row = clean(patch || {});
  if (!row.title) return { error: "할일 이름을 적어주세요." };
  if (row.repeat_kind === "weekly" && row.dows.length === 0) {
    return { error: "무슨 요일인지 골라주세요." };
  }
  if (row.repeat_kind !== "weekly" && !row.day_of_month) {
    return { error: "며칠인지 적어주세요 (말일이면 31 로 적으시면 됩니다)." };
  }
  if (row.repeat_kind === "yearly" && !row.month) {
    return { error: "몇 월인지 적어주세요." };
  }

  const supabase = createClient();
  if (id) {
    const { error } = await supabase.from("todo_routines").update(row).eq("id", id);
    if (missing(error)) return { error: SQL };
    if (error) return { error: error.message };
  } else {
    const { data: last } = await supabase
      .from("todo_routines").select("sort").order("sort", { ascending: false }).limit(1);
    const { error } = await supabase
      .from("todo_routines")
      .insert({ ...row, sort: (last?.[0]?.sort ?? 0) + 10 });
    if (missing(error)) return { error: SQL };
    if (error) return { error: error.message };
  }
  revalidatePath("/tasks");
  return { error: null };
}

/**
 * 규칙을 지운다.
 *
 * **이미 만들어진 할일은 건드리지 않는다.** 규칙을 그만 쓰겠다는 것이지
 * 지난 기록을 없애겠다는 것이 아니다. 아직 안 한 것이 남아 있으면 그건
 * 여느 할일처럼 손으로 지우시면 된다.
 */
export async function deleteRoutine(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("todo_routines").delete().eq("id", id);
  if (missing(error)) return { error: SQL };
  revalidatePath("/tasks");
  return { error: error ? error.message : null };
}

/**
 * 규칙대로 **할일을 만들어 둔다.**
 *
 * 할일 화면을 열 때마다 돈다. 이미 만든 것은 auto_key 가 막아주므로
 * (0028·0061 의 유일 인덱스) 몇 번을 열어도 하나만 생긴다.
 *
 * 체크·미루기·메모는 여느 할일과 똑같이 한다. 「이번 달 했나」 를 규칙 쪽에
 * 따로 적어두지 않는다 — 두 군데가 되면 반드시 어긋난다.
 */
export async function syncRoutines() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("todo_routines")
    .select("id, title, repeat_kind, dows, day_of_month, month, lead_days, todo_category_id, priority, note, active")
    .eq("active", true);
  if (error) return { error: missing(error) ? SQL : error.message, added: 0 };

  const want = dueTasks(data || [], todaySeoul());
  if (want.length === 0) return { error: null, added: 0 };

  // 이미 있는 것은 건드리지 않는다 — 원장님이 날짜를 미뤄두셨을 수 있다
  const { data: have } = await supabase
    .from("tasks")
    .select("auto_key")
    .in("auto_key", want.map((w) => w.auto_key));
  const known = new Set((have || []).map((r) => r.auto_key));
  const rows = want
    .filter((w) => !known.has(w.auto_key))
    .map((w) => ({ ...w, kind: "todo", status: "open" }));
  if (rows.length === 0) return { error: null, added: 0 };

  const { error: insErr } = await supabase.from("tasks").insert(rows);
  if (insErr) return { error: insErr.message, added: 0 };
  return { error: null, added: rows.length };
}
