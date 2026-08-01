"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  schoolUrl, scheduleUrl, readNeis, whyFailed, toSchool, toTask, examPeriods, mergeSame, mergeRuns,
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

  const { rows, total, code, message, empty } = readNeis(json, block);
  if (rows.length === 0) {
    // "그 기간에 일정이 없다" 는 잘못이 아니다
    if (empty) return { rows: [], error: null, empty: true, note: whyFailed(code, message) };
    if (code && code !== "INFO-000") return { rows: [], error: whyFailed(code, message) };
  }
  return { rows, total, error: null };
}

/**
 * 한 해치를 받는다 — **한 번에 다 오지 않을 수 있다.**
 *
 * 나이스는 한 번에 주는 줄 수에 한계가 있다. 한 달치면 한 번으로 끝나지만
 * 한 해치는 넘칠 수 있고, 그러면 **뒷부분이 조용히 빠진다.** 몇 건인지
 * (list_total_count) 를 같이 주므로, 다 받을 때까지 이어서 부른다.
 */
async function callAll(key, school, from, to) {
  const all = [];
  for (let page = 1; page <= 20; page += 1) {
    const res = await call(scheduleUrl(key, school, from, to, page), "SchoolSchedule");
    if (res.error) return { rows: all, error: res.error };
    if (res.empty) return { rows: all, error: null, empty: all.length === 0 };
    all.push(...res.rows);
    // 다 받았거나, 더 줄 게 없으면 그만
    if (!res.total || all.length >= res.total || res.rows.length === 0) break;
  }
  return { rows: all, error: null, empty: all.length === 0 };
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

  const row = {
    name: s.name,
    atpt_code: s.atpt_code,
    schul_code: s.schul_code,
    kind: s.kind || null,
    atpt_name: s.atpt_name || null,
    address: s.address || null,
    active: true,
  };
  let { error } = await supabase
    .from("neis_schools")
    .upsert(row, { onConflict: "atpt_code,schul_code" });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0069 전이면 지역·주소 없이
    const { atpt_name: _a, address: _b, ...bare } = row;
    ({ error } = await supabase
      .from("neis_schools")
      .upsert(bare, { onConflict: "atpt_code,schul_code" }));
  }
  if (needSql(error)) return { error: SQL };
  revalidatePath("/schedule");
  return { error: error ? error.message : null };
}

/**
 * 학교를 목록에서 뺀다.
 *
 * **받아온 일정은 학교를 빼도 남는다.** 이게 조용한 함정이었다 —
 * 엉뚱한 학교를 넣었다가 빼도, 그 학교 일정은 그대로 달력에 남아 있다.
 * 그래서 같이 지울지 물어보고, 원하면 그 학교 것만 지운다.
 */
export async function removeSchool(id, alsoTasks = false) {
  if (!id) return { error: null };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  let removed = 0;
  if (alsoTasks) {
    const { data: s } = await supabase
      .from("neis_schools").select("schul_code").eq("id", id).maybeSingle();
    if (s?.schul_code) {
      const r = await clearSchoolImports(s.schul_code);
      if (r.error) return r;
      removed = r.removed || 0;
    }
  }

  const { error } = await supabase.from("neis_schools").delete().eq("id", id);
  revalidatePath("/schedule");
  revalidatePath("/tasks");
  return { error: error ? error.message : null, removed };
}

/** 그 학교에서 받아온 일정만 지운다 (손으로 적은 일정은 건드리지 않는다) */
export async function clearSchoolImports(schulCode) {
  const code = (schulCode || "").trim();
  if (!code) return { error: "학교 코드가 없어요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  // source_id 는 "학교코드:날짜:행사" 라 앞부분으로 가른다
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("source", "neis")
    .like("source_id", `${code}:%`)
    .select("id");
  if (needSql(error)) return { error: SQL };
  revalidatePath("/schedule");
  revalidatePath("/tasks");
  revalidatePath("/");
  return { error: error ? error.message : null, removed: (data || []).length };
}

export async function listSchools() {
  const supabase = createClient();
  const COLS = "id, name, atpt_code, schul_code, kind, active";
  let { data, error } = await supabase
    .from("neis_schools")
    .select(`${COLS}, atpt_name, address`)
    .order("name", { ascending: true });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data, error } = await supabase
      .from("neis_schools")
      .select(COLS)
      .order("name", { ascending: true }));
  }
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
  let examAdded = 0;
  const exams = [];
  const notes = [];
  // 수능·모의고사는 학교에 안 매인 한 줄로 들어간다 (source_id 가 common: 으로 시작).
  // 어느 학교의 정리에도 안 걸리므로, 이번에 받은 것을 모아 두었다가 마지막에 본다.
  const commonSeen = new Set();
  let sawHigh = false;

  const failed = [];
  for (const school of targets) {
    const res = await callAll(key, school, from, to);
    // 한 학교가 막혀도 **나머지는 받는다.** 아홉 곳 중 하나 때문에 전부 못 받으면
    // 어디가 문제인지도 모르고 다시 눌러야 한다.
    if (res.error) { failed.push(`${school.name} — ${res.error}`); continue; }
    if (res.empty) {
      notes.push(`${school.name}: 그 기간에 일정이 없어요.`);
      continue;
    }

    // 학교는 같은 날 같은 행사를 학년마다 한 줄씩 주기도 한다. 먼저 하나로 합친다.
    // 그리고 방학처럼 **여러 날 이어지는 것은 한 줄로 잇는다** — 나이스는 하루에
    // 한 줄씩 주므로, 그대로 넣으면 여름방학 하나가 30줄이 된다.
    const tasks = mergeRuns(mergeSame(res.rows.map((r) => toTask(r, school)).filter(Boolean)));
    const found = examPeriods(tasks, school);
    exams.push(...found);
    // 시험 기간은 **묻지 않고 다 넣는다.** 필요 없는 것은 화면에서 숨기면 되고,
    // 숨긴 것은 다시 받아와도 숨긴 채로 있다. 매번 고르게 하는 것이 더 일이다.
    const madeExam = await addExamPeriods(found);
    if (madeExam.error) failed.push(`${school.name} 시험 — ${madeExam.error}`);
    examAdded += madeExam.added || 0;

    tasks.forEach((t) => { if (t.nationwide) { commonSeen.add(t.source_id); sawHigh = true; } });

    // 이 학교의 이 기간에 지금 들어 있는 것 — 뒤에서 **없어진 것을 지우려고** 먼저 읽는다.
    // (하루씩 들어와 있던 옛 줄이 한 줄로 합쳐지면 나머지 날들은 사라져야 한다)
    let keepPrivate = new Map();
    let oldIds = new Map();
    {
      let q = await supabase
        .from("tasks")
        .select("id, source_id, private")
        .eq("source", "neis")
        .like("source_id", `${school.schul_code}:%`)
        .gte("due_on", from)
        .lte("due_on", to);
      if (q.error && (q.error.code === "42703" || q.error.code === "PGRST204")) {
        // 0066 전이면 '나만 보기' 없이
        q = await supabase
          .from("tasks")
          .select("id, source_id")
          .eq("source", "neis")
          .like("source_id", `${school.schul_code}:%`)
          .gte("due_on", from)
          .lte("due_on", to);
      }
      (q.data || []).forEach((r) => {
        oldIds.set(r.source_id, r.id);
        if (r.private) keepPrivate.set(r.source_id, true);
      });
    }

    // **한 줄씩 넣지 않는다.** 한 해치면 학교 하나에 수백 줄이라, 한 줄에 한 번씩
    // 오가면 화면이 기다리다 끊긴다. 한 번에 묶어 보낸다.
    // neisKind · nationwide 는 우리끼리 쓰는 표시다. **표에 없는 칸이라 그대로
    // 보내면 통째로 거절당한다.** 여기서 떼어낸다.
    const rows = tasks.map(({ neisKind, nationwide, ...row }) => ({
      ...row,
      // 원장님이 「나만 보기」로 잠가둔 일정은 다시 받아와도 잠긴 채로 (0066)
      private: keepPrivate.has(row.source_id) ? true : undefined,
      created_by: user?.id || null,
    }));
    let bad = null;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => {
        if (r.private === undefined) { const { private: _p, ...rest } = r; return rest; }
        return r;
      });
      let { error } = await supabase
        .from("tasks")
        .upsert(chunk, { onConflict: "source,source_id" });
      if (error && (error.code === "42703" || error.code === "PGRST204")) {
        // 0066 전이면 '나만 보기' 없이
        ({ error } = await supabase
          .from("tasks")
          .upsert(chunk.map(({ private: _p, ...r }) => r), { onConflict: "source,source_id" }));
      }
      if (needSql(error)) return { error: SQL };
      if (error) { bad = error.message; break; }
    }
    if (bad) { failed.push(`${school.name} — ${bad}`); continue; }

    // 이번에 안 온 옛 줄은 지운다.
    //   · 하루씩 들어와 있던 방학이 한 줄로 합쳐지면 나머지 날들
    //   · 학교가 취소한 행사
    // 손으로 적은 일정은 source 가 비어 있어 여기 걸리지 않는다.
    {
      const now = new Set(tasks.map((t) => t.source_id));
      const stale = [...oldIds.entries()].filter(([sid]) => !now.has(sid)).map(([, id]) => id);
      for (let i = 0; i < stale.length; i += 200) {
        await supabase.from("tasks").delete().in("id", stale.slice(i, i + 200));
      }
      if (stale.length) notes.push(`${school.name}: 옛 줄 ${stale.length}건 정리`);
    }
    added += rows.length;
    notes.push(`${school.name}: ${tasks.length}건`);
  }

  // 전국 공통(수능·모의고사) 중 이번에 안 온 것 정리.
  // 한 곳이라도 제대로 받아온 뒤에만 한다 — 다 실패했는데 지우면 멀쩡한 것이 사라진다.
  if (sawHigh) {
    const { data: old } = await supabase
      .from("tasks")
      .select("id, source_id")
      .eq("source", "neis")
      .like("source_id", "common:%")
      .gte("due_on", from)
      .lte("due_on", to);
    const stale = (old || []).filter((r) => !commonSeen.has(r.source_id)).map((r) => r.id);
    for (let i = 0; i < stale.length; i += 200) {
      await supabase.from("tasks").delete().in("id", stale.slice(i, i + 200));
    }
  }

  revalidatePath("/schedule");
  revalidatePath("/tasks");
  revalidatePath("/");
  // 다 막혔으면 오류로, 일부만 막혔으면 받은 것은 살리고 막힌 것만 알려준다
  if (failed.length && added === 0) return { error: failed.join("\n") };
  return { error: null, added, examAdded, exams, notes, failed };
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

/**
 * 지금 들어와 있는 것 — **학교별로 몇 건, 언제부터 언제까지.**
 *
 * "받아왔나?" 를 기억에 의존하게 하면 안 된다. 받고 나서 화면을 옮기면
 * 결과 상자는 사라지고, 다시 눌러야 하나 망설이게 된다.
 * 화면을 열 때마다 **지금 상태**가 그대로 보여야 한다.
 */
export async function importedSummary() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], total: 0 };

  const { data, error } = await supabase
    .from("tasks")
    .select("source_id, due_on")
    .eq("source", "neis")
    .order("due_on", { ascending: true });
  if (error) return { rows: [], total: 0, error: null };   // 0059 전이면 조용히 없음

  const { rows: schools } = await listSchools();
  const nameOf = new Map((schools || []).map((s) => [s.schul_code, s.name]));

  // source_id 는 "학교코드:날짜:행사" 라 앞부분으로 학교를 가른다
  const by = new Map();
  (data || []).forEach((t) => {
    const code = (t.source_id || "").split(":")[0];
    const cur = by.get(code) || { code, count: 0, from: null, to: null };
    cur.count += 1;
    if (!cur.from || t.due_on < cur.from) cur.from = t.due_on;
    if (!cur.to || t.due_on > cur.to) cur.to = t.due_on;
    by.set(code, cur);
  });

  return {
    total: (data || []).length,
    rows: [...by.values()]
      .map((r) => ({
        ...r,
        name: r.code === "common" ? "전국 공통 (수능 · 모의고사)" : nameOf.get(r.code) || r.code,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
  };
}

/**
 * **무엇이 실제로 들어 있나** — 틀렸다고 느낄 때 눈으로 확인하는 자리.
 *
 * "내용이 틀리고 중복이 많다" 는 말을 들었을 때, 코드를 다시 읽는 것보다
 * **들어 있는 것을 그대로 보여주는 것**이 빠르다. 대개 원인은 셋 중 하나다.
 *
 *   1. 학교를 잘못 넣었다 — 나이스 학교 찾기는 **부분 일치**라, '신송' 으로
 *      찾으면 신송초·신송중·신송고가 같이 나온다. 지역까지 다르면 남의 학교다
 *   2. 같은 학교를 **두 번** 넣었다 (코드가 다르면 같은 날 같은 행사가 두 줄)
 *   3. 학교를 뺐는데 **그 학교 일정이 남아 있다** — 목록에는 없고 달력에는 있다
 *
 * 셋 다 여기서 바로 보인다. 등록 안 된 코드는 ⚠ 로 뜬다.
 */
export async function diagnose() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], error: guard.error };

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_on, source_id, note")
    .eq("source", "neis")
    .order("due_on", { ascending: true });
  if (error) return { rows: [], error: needSql(error) ? SQL : error.message };

  const { rows: schools } = await listSchools();
  const byCode = new Map((schools || []).map((s) => [s.schul_code, s]));

  const groups = new Map();
  (data || []).forEach((t) => {
    const code = (t.source_id || "").split(":")[0];
    const g = groups.get(code) || { code, count: 0, from: null, to: null, items: [] };
    g.count += 1;
    if (!g.from || t.due_on < g.from) g.from = t.due_on;
    if (!g.to || t.due_on > g.to) g.to = t.due_on;
    g.items.push(t);
    groups.set(code, g);
  });

  // 같은 날 · 같은 제목인데 줄이 둘 이상 — 학교를 두 번 넣었을 때 이렇게 난다.
  // (source_id 가 같은 것은 DB 가 막으므로, 여기 걸리면 **코드가 다른 것**이다)
  const seen = new Map();
  (data || []).forEach((t) => {
    const k = `${t.due_on}|${t.title}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  const dupes = [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([k, n]) => {
      const [due_on, title] = k.split("|");
      return { due_on, title, n };
    })
    .sort((a, b) => b.n - a.n || a.due_on.localeCompare(b.due_on))
    .slice(0, 30);

  const rows = [...groups.values()]
    .map((g) => {
      const s = byCode.get(g.code);
      // 수능·모의고사는 학교에 안 매인 줄이다. '목록에 없는 학교' 로 보면 안 된다
      if (g.code === "common") {
        return {
          code: g.code,
          name: "전국 공통 (수능 · 모의고사)",
          where: "교육청 · 평가원이 정하는 날이라 학교와 상관없이 한 줄입니다",
          kind: null,
          registered: true,
          count: g.count,
          from: g.from,
          to: g.to,
          sample: g.items.slice(0, 6).map((t) => `${t.due_on.slice(5)} ${t.title}`),
        };
      }
      return {
        code: g.code,
        name: s?.name || null,
        where: [s?.atpt_name, s?.address].filter(Boolean).join(" · "),
        kind: s?.kind || null,
        registered: !!s,
        count: g.count,
        from: g.from,
        to: g.to,
        // 무엇이 들어 있는지 몇 줄만 — 남의 학교 것이면 여기서 바로 티가 난다
        sample: g.items.slice(0, 6).map((t) => `${t.due_on.slice(5)} ${t.title}`),
      };
    })
    .sort((a, b) => Number(a.registered) - Number(b.registered) || b.count - a.count);

  return { rows, dupes, total: (data || []).length, error: null };
}
