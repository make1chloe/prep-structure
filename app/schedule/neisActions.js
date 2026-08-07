"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  schoolUrl, scheduleUrl, readNeis, whyFailed, toSchool, toTask, examPeriods, mergeSame, mergeRuns,
  isNationwide,
} from "@/lib/neis";
import { matchExam } from "@/lib/exams";
import { schoolKey, looseKey } from "@/lib/schoolName";

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

/**
 * 0076 에서 neis_schools 를 schools 로 넓혔다 (나이스에 없는 학교도 담기게).
 * 아직 0076 을 안 돌린 DB 가 있을 수 있어, 없으면 옛 이름으로 물러난다.
 *
 * 모듈에 담아두지 않는다 — 서버 하나가 여러 사람의 요청을 받으므로,
 * 한 번 물러난 값이 다른 사람 요청에까지 남으면 안 된다.
 */
async function schoolTable(supabase) {
  const { error } = await supabase.from("schools").select("id").limit(1);
  return error && (error.code === "42P01" || error.code === "PGRST205")
    ? "neis_schools"
    : "schools";
}

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
  // ── upsert 를 쓰지 않는다 ────────────────────────────────
  //
  // 0076 에서 (지역코드, 학교코드) 유일 인덱스가 **부분 인덱스**가 됐다
  // (코드가 둘 다 있을 때만 겹치지 않게 — 손으로 넣은 학교는 코드가 없으니까).
  // 부분 인덱스는 ON CONFLICT 가 못 가리킨다. 그래서 upsert 가
  // `there is no unique or exclusion constraint matching the ON CONFLICT
  // specification` 로 터졌다. 실제로 그랬다.
  //
  // 찾아보고 있으면 고치고, 없으면 넣는다. 이름이 겹쳐서 막히면(0076 의
  // school_key 유일 인덱스) **그 줄에 코드를 붙여준다** — 손으로 넣어둔
  // 학교에 나이스 코드가 생기는 것이라, 새 줄을 만드는 것보다 낫다.
  const T = await schoolTable(supabase);
  let attachedTo = null;   // 이미 있던 줄에 코드를 붙였으면 그 이름

  const put = async (r) => {
    // 1) 같은 코드가 이미 있으면 그 줄을 고친다
    const found = await supabase
      .from(T).select("id")
      .eq("atpt_code", r.atpt_code).eq("schul_code", r.schul_code).maybeSingle();
    if (found.data?.id) return supabase.from(T).update(r).eq("id", found.data.id);

    const ins = await supabase.from(T).insert(r);
    if (ins.error?.code !== "23505") return ins;

    // 2) **이름이 겹쳐서 막힌 것이다** (0076 의 school_key 유일 인덱스).
    //
    //    「박문중」 을 손으로 넣어두고 나이스에서 「박문중학교」 를 넣으면
    //    열쇠가 둘 다 `박문중` 이라 막힌다. 이름은 다르니 이름으로 찾으면 못 찾는다 —
    //    그래서 **열쇠로** 찾아 그 줄에 코드를 붙인다.
    //
    //    이름은 원장님이 쓰시던 것을 그대로 둔다. 이름을 바꾸는 것은 학생·시험까지
    //    따라 바뀌는 일이라, 넣기 한 번에 조용히 일어나면 안 된다.
    const all = await supabase.from(T).select("id, name");
    if (all.error) return ins;
    const rows = all.data || [];
    // 엄격한 열쇠로 먼저, 없으면 지역 이름까지 뗀 열쇠로 (인천박문초 ↔ 박문초)
    const hit =
      rows.find((x) => schoolKey(x.name) === schoolKey(r.name)) ||
      rows.find((x) => looseKey(x.name) === looseKey(r.name));

    if (!hit) {
      // 막혔는데 누가 막았는지 못 찾았다. **그냥 오류를 던지면 손쓸 방법이 없다** —
      // 비슷해 보이는 것을 짚어드리고, 목록에서 이름을 고치시게 한다.
      const near = rows
        .filter((x) => looseKey(x.name).includes(looseKey(r.name).slice(0, 2)))
        .map((x) => x.name);
      return {
        error: {
          message:
            `「${r.name}」 는 이미 있는 학교와 겹칩니다.\n` +
            (near.length
              ? `목록의 이것들 중 하나일 거예요: ${near.join(", ")}\n`
              : "") +
            "그 줄의 이름을 고치시거나, 그 줄을 지우고 다시 넣어주세요.",
        },
      };
    }

    attachedTo = hit.name;
    const { name: _drop, ...codes } = r;      // 이름은 건드리지 않는다
    return supabase.from(T).update(codes).eq("id", hit.id);
  };

  let { error } = await put(row);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0069 전이면 지역·주소 없이
    const { atpt_name: _a, address: _b, ...bare } = row;
    ({ error } = await put(bare));
  }
  if (needSql(error)) return { error: SQL };
  revalidatePath("/schedule");
  revalidatePath("/schools");
  return { error: error ? error.message : null, attachedTo, name: row.name };
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
      .from(await schoolTable(supabase)).select("schul_code").eq("id", id).maybeSingle();
    if (s?.schul_code) {
      const r = await clearSchoolImports(s.schul_code);
      if (r.error) return r;
      removed = r.removed || 0;
    }
  }

  const { error } = await supabase.from(await schoolTable(supabase)).delete().eq("id", id);
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
    .from(await schoolTable(supabase))
    .select(`${COLS}, atpt_name, address`)
    .order("name", { ascending: true });
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data, error } = await supabase
      .from(await schoolTable(supabase))
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
  //   대체공휴일은 **안 쉬는 학교가 가끔 있다.** 그래서 어느 학교가 적어냈는지
  //   모아두었다가, 전부가 아니면 설명에 적어준다 ("9곳 중 3곳").
  const commonRows = new Map();   // source_id → { row, schools:Set }
  let okSchools = 0;

  /**
   * **전국 공통은 비공개로 들어온다** (원장님, 2026-08-06).
   *
   *   「전국공통은 오히려 나만보기야. 안 그러면 학생 학부모가 중요한 일정을
   *    인식을 못 해」
   *
   * 수능일 · 모의고사 · 공휴일은 아홉 학교에 다 걸리니 한 해에 수십 줄이다.
   * 그런데 중2 아이에게 수능일은 아무 상관이 없다. 그것들이 달력을 채우면
   * **정작 봐야 할 우리 학교 시험이 그 사이에 묻힌다.** 많이 보여주는 것과
   * 알게 하는 것은 다른 일이다.
   *
   * 그래서 기본은 비공개다. 원장님이 **일부러 「전체」 로 열어둔 것**만
   * 다시 받아와도 열린 채로 남는다 (고3 수능일처럼 정말 알려야 하는 것).
   */
  const keepCommonOpen = new Set();
  {
    let q = await supabase
      .from("tasks")
      .select("source_id, private, deliver_scope")
      .eq("source", "neis")
      .like("source_id", "common:%")
      .gte("due_on", from)
      .lte("due_on", to);
    if (q.error) {
      // 0092 전이면 「누가 보나」 칸이 없다 — 그때는 잠가둔 것만 지킨다
      q = await supabase
        .from("tasks")
        .select("source_id, private")
        .eq("source", "neis")
        .like("source_id", "common:%")
        .gte("due_on", from)
        .lte("due_on", to);
    }
    if (!q.error) {
      (q.data || []).forEach((r) => {
        if (r.private === false && r.deliver_scope === "all") keepCommonOpen.add(r.source_id);
      });
    }
  }

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

    // 전국 공통 줄은 여기서 넣지 않는다. 학교마다 한 번씩 넣으면 설명이
    // 마지막 학교 것으로 덮인다. 다 모은 뒤 마지막에 한 번에 넣는다.
    const mine = [];
    tasks.forEach((t) => {
      if (!t.nationwide) { mine.push(t); return; }
      const had = commonRows.get(t.source_id);
      if (had) { had.schools.add(t.schoolName || school.name); return; }
      commonRows.set(t.source_id, { row: t, schools: new Set([t.schoolName || school.name]) });
    });
    okSchools += 1;

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
    const rows = mine.map(({ neisKind, nationwide, mayDiffer, schoolName, ...row }) => ({
      ...row,
      // **이 일정은 이 학교 아이들 것이다** (0091). 안 붙여두면 신송중
      // 학사일정이 다른 학교 아이 달력에도 뜬다 — 달력이 남의 일로 차면
      // 자기 것도 안 보게 된다. 전국 공통 줄(mine 에 없다)은 안 붙인다.
      deliver_school_id: school.id || null,
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
        // 0077 전이면 '어느 학교 것인가' 칸이 없다
        ({ error } = await supabase
          .from("tasks")
          .upsert(chunk.map(({ deliver_school_id: _s, ...r }) => r), { onConflict: "source,source_id" }));
      }
      if (error && (error.code === "42703" || error.code === "PGRST204")) {
        // 0066 전이면 '나만 보기' 없이
        ({ error } = await supabase
          .from("tasks")
          .upsert(chunk.map(({ private: _p, deliver_school_id: _s, ...r }) => r), { onConflict: "source,source_id" }));
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
      const now = new Set(mine.map((t) => t.source_id));
      const stale = [...oldIds.entries()].filter(([sid]) => !now.has(sid)).map(([, id]) => id);
      for (let i = 0; i < stale.length; i += 200) {
        await supabase.from("tasks").delete().in("id", stale.slice(i, i + 200));
      }
      if (stale.length) notes.push(`${school.name}: 옛 줄 ${stale.length}건 정리`);
    }
    // 붙여둔 시험이 있으면 **학교가 지금 뭐라고 하는지**만 새로 적어둔다 (0075).
    //   내 기간·이름·영어시험일·등급컷은 손대지 않는다. 달라졌으면 화면이
    //   "학교 일정이 바뀌었어요 [반영]" 으로 알려주고, 누르는 것은 원장님이다.
    //   여기서 조용히 고쳐버리면 시험 사흘 전에 자료 일정이 어긋나 있어도 모른다.
    {
      const bySid = new Map(mine.map((t) => [t.source_id, t]));
      const { data: linked } = await supabase
        .from("exam_periods")
        .select("id, neis_source_id, neis_from, neis_to, neis_name")
        .in("neis_source_id", [...bySid.keys()].slice(0, 300));
      let moved = 0;
      for (const ex of linked || []) {
        const t = bySid.get(ex.neis_source_id);
        if (!t) continue;
        const from = t.due_on || null;
        const to = t.end_on || t.due_on || null;
        if (ex.neis_from === from && ex.neis_to === to && ex.neis_name === t.title) continue;
        await supabase
          .from("exam_periods")
          .update({
            neis_from: from, neis_to: to, neis_name: t.title,
            neis_seen_at: new Date().toISOString(),
          })
          .eq("id", ex.id);
        moved += 1;
      }
      if (moved) notes.push(`${school.name}: 학교 시험 일정 ${moved}건이 바뀌었어요 — 학사일정에서 확인해주세요`);
    }

    added += rows.length;
    notes.push(`${school.name}: ${mine.length}건`);
  }

  // ---- 전국 공통 (수능 · 모의고사 · 공휴일) — 한 번에 한 줄씩 ----
  if (commonRows.size > 0) {
    const rows = [...commonRows.values()].map(({ row, schools }) => {
      const { neisKind, nationwide, mayDiffer: differs, schoolName, ...rest } = row;
      // 대체공휴일처럼 학교마다 다를 수 있는 것 — 전부가 아니면 어디가 쉬는지 적는다
      let note = rest.note;
      if (differs && okSchools > 1 && schools.size < okSchools) {
        note = `쉬는 학교 ${schools.size}/${okSchools}곳 — ${[...schools].join(", ")}`;
      }
      const open = keepCommonOpen.has(rest.source_id);
      return {
        ...rest,
        note,
        // 기본은 비공개. 원장님이 일부러 「전체」 로 열어둔 것만 열린 채로
        private: !open,
        deliver_scope: open ? "all" : null,
        created_by: user?.id || null,
      };
    });
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      let { error } = await supabase
        .from("tasks")
        .upsert(chunk, { onConflict: "source,source_id" });
      if (error && (error.code === "42703" || error.code === "PGRST204")) {
        // 0092 전이면 「누가 보나」 칸이 없다
        ({ error } = await supabase
          .from("tasks")
          .upsert(chunk.map(({ deliver_scope: _s, ...x }) => x), { onConflict: "source,source_id" }));
      }
      if (error && (error.code === "42703" || error.code === "PGRST204")) {
        // 0066 전이면 비공개 칸도 없다
        ({ error } = await supabase
          .from("tasks")
          .upsert(chunk.map(({ deliver_scope: _s, private: _p, ...x }) => x), { onConflict: "source,source_id" }));
      }
      if (error) failed.push(`전국 공통 — ${error.message}`);
    }
    added += rows.length;
    notes.push(`전국 공통(수능 · 모의고사 · 공휴일): ${rows.length}건`);
  }

  /**
   * 전국 공통(수능·모의고사) 중 이번에 안 온 것 정리.
   * 한 곳이라도 제대로 받아온 뒤에만 한다 — 다 실패했는데 지우면 멀쩡한 것이 사라진다.
   *
   * **학교 하나만 받을 때는 안 한다.** 전국 공통 줄은 아홉 학교가 적어낸 것을
   * 모아 만든다. 한 학교만 다시 부르면 이번에 모인 것은 그 학교 것뿐이라,
   * 나머지 여덟 곳이 만들어둔 수능·모의고사·공휴일이 **「이번에 안 왔다」 로
   * 몰려 통째로 지워진다.** 화면에는 「1건 받았어요」 만 뜨고, 달력에서
   * 수능일이 사라진 것은 아무도 모른다.
   */
  if (okSchools > 0 && !schoolId) {
    const { data: old } = await supabase
      .from("tasks")
      .select("id, source_id")
      .eq("source", "neis")
      .like("source_id", "common:%")
      .gte("due_on", from)
      .lte("due_on", to);
    const stale = (old || []).filter((r) => !commonRows.has(r.source_id)).map((r) => r.id);
    for (let i = 0; i < stale.length; i += 200) {
      await supabase.from("tasks").delete().in("id", stale.slice(i, i + 200));
    }
  }

  // ── 학교별로 남아 있던 전국 공통 일정을 걷어낸다 ──────────────
  //
  // 전국연합학력평가 · 수능 · 모의고사는 **전국이 같은 날**이라 학교마다
  // 표시하지 않기로 했다. 지금은 받아올 때 한 줄로 합쳐 넣지만, 그 규칙이
  // 생기기 **전에** 받아온 줄들은 학교 이름을 달고 그대로 남아 있다.
  //
  // 학교별 정리는 그 학교를 다시 받아와야만 도는데, 원장님은 「반영이 안 됐다」
  // 는 것만 보이지 어느 학교를 다시 받아와야 하는지는 알 수가 없다.
  // 그래서 **받아올 때마다 전부 훑어서** 걷어낸다.
  if (okSchools > 0) {
    const { data: leftover } = await supabase
      .from("tasks")
      .select("id, title, source_id")
      .eq("source", "neis")
      .not("source_id", "like", "common:%")
      .gte("due_on", from)
      .lte("due_on", to);
    const drop = (leftover || [])
      .filter((r) => isNationwide(r.title || ""))
      .map((r) => r.id);
    for (let i = 0; i < drop.length; i += 200) {
      await supabase.from("tasks").delete().in("id", drop.slice(i, i + 200));
    }
    if (drop.length) {
      notes.push(`학교별로 남아 있던 전국 공통 일정 ${drop.length}건을 정리했어요`);
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
 * 받아온 시험 일정으로 **내 시험을 만들거나, 이미 있는 내 시험에 붙인다** (0075).
 *
 * 방향이 중요하다. 나이스 일정이 주인이 아니라 **내 시험이 주인**이고,
 * 학교 일정은 거기 붙는 참고다. 그래서
 *   · 겹치는 내 시험이 이미 있으면 → **새로 만들지 않고 붙이기만** 한다.
 *     내가 적어둔 이름·영어 시험일·등급컷·출제 선생님이 그대로 남는다.
 *   · 없으면 → 내 시험을 새로 만들고, 거기에 학교 일정을 붙인다.
 *
 * 자동으로 넣지 않고 **원장님이 고른 것만** 넣는다. 영어 시험일은 나이스에
 * 없어서 어차피 직접 채우셔야 하고, 학교가 '고사' 라고만 적어둔 것이
 * 우리가 대비할 시험인지는 사람이 봐야 안다.
 */
export async function addExamPeriods(list = []) {
  const rows = (list || []).filter((e) => e?.school && e?.from_date && e?.to_date);
  if (rows.length === 0) return { error: null, added: 0, linked: 0 };

  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 내가 이미 들고 있는 시험들 — 겹치면 여기에 붙인다
  let { data: existing } = await supabase
    .from("exam_periods")
    .select("id, school, from_date, to_date, neis_source_id");
  // 0075 전이면 붙일 칸이 없다 — 예전처럼 만들기만 한다
  let canLink = true;
  if (!existing) {
    canLink = false;
    ({ data: existing } = await supabase
      .from("exam_periods").select("id, school, from_date, to_date"));
  }
  const pool = existing || [];

  const neisPatch = (e) => ({
    neis_source_id: e.source_id || null,
    neis_from: e.from_date,
    neis_to: e.to_date,
    neis_name: e.name || null,
    neis_seen_at: new Date().toISOString(),
  });

  let added = 0;
  let linked = 0;
  for (const e of rows) {
    const hit = canLink ? matchExam(e, pool) : null;

    if (hit) {
      // **내 것은 안 바꾼다.** 학교가 뭐라고 하는지만 옆에 적어둔다.
      // 날짜가 다르면 화면에서 "학교 일정이 바뀌었어요" 로 뜬다.
      const { error } = await supabase
        .from("exam_periods").update(neisPatch(e)).eq("id", hit.id);
      if (error && error.code !== "23505") return { error: error.message, added, linked };
      if (!error) { linked += 1; hit.neis_source_id = e.source_id || null; }
      continue;
    }

    const row = {
      school: e.school,
      name: e.name || "시험",
      from_date: e.from_date,
      to_date: e.to_date,
      source: "neis",
      created_by: user?.id || null,
    };
    let { data: made, error } = await supabase
      .from("exam_periods").insert(canLink ? { ...row, ...neisPatch(e) } : row).select("id").single();
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      ({ data: made, error } = await supabase
        .from("exam_periods").insert(row).select("id").single());
    }
    if (error) return { error: error.message, added, linked };
    added += 1;
    pool.push({ id: made.id, ...row, neis_source_id: e.source_id || null });
  }

  revalidatePath("/schedule");
  revalidatePath("/prep");
  return { error: null, added, linked };
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

  // **받아온 것이 0건인 학교도 보여준다.**
  //
  // 예전에는 일정이 들어온 학교만 나왔다. 그러면 「박문중을 넣었는데 목록에
  // 박문중이 없다」 가 되고, 안 넣어진 건지 · 일정이 없는 건지 · 못 받은 건지
  // 구별할 방법이 없다. 0건도 한 줄로 보여야 그다음을 판단할 수 있다.
  (schools || []).forEach((s) => {
    if (!s.schul_code) return;              // 코드가 없으면 애초에 못 받는다
    if (by.has(s.schul_code)) return;
    by.set(s.schul_code, { code: s.schul_code, count: 0, from: null, to: null });
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
