"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  schoolUrl, scheduleUrl, readNeis, whyFailed, toSchool, toTask, examPeriods,
} from "@/lib/neis";

/**
 * 나이스에서 학사일정을 받아온다.
 *
 * 인증키는 설정에서 직접 넣어 integrations 에 담기고 서버에서만 읽는다.
 * 코드에도 대화에도 없다 (다른 열쇠들과 같은 규칙).
 */

function needSql(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703");
}
const SQL = "0059 SQL 을 먼저 실행해주세요.";

async function requireStaff(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["principal", "instructor", "assistant"].includes(p?.role)) {
    return { error: "선생님만 쓸 수 있어요." };
  }
  return { error: null };
}

async function neisKey(supabase) {
  const { data } = await supabase
    .from("integrations").select("config").eq("id", "neis").maybeSingle();
  return (data?.config?.key || "").trim();
}

/** 한 번 부르고 답을 읽는다 — 왜 안 됐는지를 그대로 돌려준다 */
async function call(url, block) {
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (e) {
    return { rows: [], error: `나이스를 부르지 못했어요: ${e.message}` };
  }
  let json = null;
  try { json = await res.json(); } catch { /* 본문이 JSON 이 아닐 수 있다 */ }
  if (!json) {
    return { rows: [], error: `나이스가 읽을 수 없는 답을 보냈어요 (HTTP ${res.status}).` };
  }

  const { rows, code, message, empty } = readNeis(json, block);
  if (rows.length === 0) {
    // "그 기간에 일정이 없다" 는 잘못이 아니다
    if (empty) return { rows: [], error: null, empty: true, note: whyFailed(code, message) };
    if (code && code !== "INFO-000") return { rows: [], error: whyFailed(code, message) };
  }
  return { rows, error: null };
}

/** 키를 넣는다 */
export async function saveNeisKey(key) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const { error } = await supabase
    .from("integrations")
    .upsert({ id: "neis", enabled: true, config: { key: (key || "").trim() } }, { onConflict: "id" });
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}

/** 키가 들어 있나 (키 자체는 절대 돌려주지 않는다) */
export async function neisReady() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { ready: false };
  return { ready: !!(await neisKey(supabase)) };
}

/** 학교 이름으로 찾는다 — 같은 이름이 여럿이라 주소까지 보여준다 */
export async function searchSchools(name) {
  const q = (name || "").trim();
  if (q.length < 2) return { rows: [], error: "학교 이름을 두 글자 이상 적어주세요." };

  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], error: guard.error };

  const res = await call(schoolUrl(await neisKey(supabase), q), "schoolInfo");
  if (res.error) return { rows: [], error: res.error };
  if (res.empty) return { rows: [], error: `'${q}' 로 찾은 학교가 없어요.` };
  return { rows: res.rows.map(toSchool), error: null };
}

/** 찾은 학교를 내 목록에 넣는다 */
export async function addSchool(s = {}) {
  if (!s.atpt_code || !s.schul_code) return { error: "학교 코드가 없어요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const { error } = await supabase.from("neis_schools").upsert(
    {
      name: s.name,
      atpt_code: s.atpt_code,
      schul_code: s.schul_code,
      kind: s.kind || null,
      active: true,
    },
    { onConflict: "atpt_code,schul_code" }
  );
  if (needSql(error)) return { error: SQL };
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}

export async function removeSchool(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;
  const { error } = await supabase.from("neis_schools").delete().eq("id", id);
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}

export async function listSchools() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("neis_schools")
    .select("id, name, atpt_code, schul_code, kind, active")
    .order("name", { ascending: true });
  if (needSql(error)) return { rows: [], error: SQL };
  return { rows: data || [], error: error ? error.message : null };
}

/**
 * 학사일정을 받아 일정에 넣는다.
 *
 * 몇 번을 다시 받아도 늘어나지 않는다 — 출처(neis)와 고유 이름으로 맞춘다.
 * 손으로 적은 일정은 출처가 비어 있어 건드리지 않는다.
 */
export async function importSchedule(from, to, schoolId = null) {
  if (!from || !to) return { error: "기간을 골라주세요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const key = await neisKey(supabase);
  const { rows: schools, error: sErr } = await listSchools();
  if (sErr) return { error: sErr };
  const targets = (schools || []).filter(
    (s) => s.active !== false && (!schoolId || s.id === schoolId)
  );
  if (targets.length === 0) return { error: "먼저 학교를 등록해주세요." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let added = 0;
  let same = 0;
  const exams = [];
  const notes = [];

  for (const school of targets) {
    const res = await call(scheduleUrl(key, school, from, to), "SchoolSchedule");
    if (res.error) return { error: `${school.name} — ${res.error}` };
    if (res.empty) {
      notes.push(`${school.name}: 그 기간에 일정이 없어요.`);
      continue;
    }

    const tasks = res.rows.map((r) => toTask(r, school)).filter(Boolean);
    exams.push(...examPeriods(tasks, school));

    for (const t of tasks) {
      const { neisKind, ...row } = t;
      const { error } = await supabase
        .from("tasks")
        .upsert({ ...row, created_by: user?.id || null }, { onConflict: "source,source_id" });
      if (needSql(error)) return { error: SQL };
      if (error) {
        // 이미 있는 줄이면 늘리지 않는다
        if (/duplicate|unique/i.test(error.message || "")) { same += 1; continue; }
        return { error: `${school.name} — ${error.message}` };
      }
      added += 1;
    }
    notes.push(`${school.name}: ${tasks.length}건`);
  }

  revalidatePath("/schedule");
  revalidatePath("/tasks");
  revalidatePath("/");
  return { error: null, added, same, exams, notes };
}

/**
 * 받아온 시험 일정을 우리 시험 기간으로 넣는다.
 *
 * 자동으로 넣지 않고 **원장님이 고른 것만** 넣는다. 영어 시험일은 나이스에
 * 없어서 어차피 직접 채우셔야 하고, 학교가 '고사' 라고만 적어둔 것이
 * 우리가 대비할 시험인지는 사람이 봐야 안다.
 */
export async function addExamPeriods(list = []) {
  const rows = (list || []).filter((e) => e?.school && e?.from_date && e?.to_date);
  if (rows.length === 0) return { error: null, added: 0 };

  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let added = 0;
  for (const e of rows) {
    // 같은 학교·같은 기간이 이미 있으면 또 만들지 않는다
    const { data: exist } = await supabase
      .from("exam_periods")
      .select("id")
      .eq("school", e.school)
      .eq("from_date", e.from_date)
      .limit(1);
    if (exist?.length) continue;

    const { error } = await supabase.from("exam_periods").insert({
      school: e.school,
      name: e.name || "시험",
      from_date: e.from_date,
      to_date: e.to_date,
      created_by: user?.id || null,
    });
    if (error) return { error: error.message, added };
    added += 1;
  }

  revalidatePath("/schedule");
  return { error: null, added };
}

/** 받아온 일정만 지운다 (손으로 적은 것은 남는다) */
export async function clearImported(from, to) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  let q = supabase.from("tasks").delete().eq("source", "neis");
  if (from) q = q.gte("due_on", from);
  if (to) q = q.lte("due_on", to);
  const { error } = await q;
  if (needSql(error)) return { error: SQL };
  revalidatePath("/schedule");
  revalidatePath("/tasks");
  return { error: error ? error.message : null };
}
