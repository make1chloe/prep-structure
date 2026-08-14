"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  schoolUrl, scheduleUrl, readNeis, whyFailed, toSchool, toTask, examPeriods, mergeSame, mergeRuns, labelGrades, mockPeriods,
  isNationwide, explainRow, toDate,
} from "@/lib/neis";
import { toText, readSchedule, tabLinks, splitUrls } from "@/lib/schoolSite";
import { classifyExam } from "@/lib/examKind";
import { matchExam, staleAfterImport } from "@/lib/exams";
import { examKind, termLabel } from "@/lib/examList";
import { makeMockBook } from "@/app/prep/actions";
import { schoolKey, looseKey } from "@/lib/schoolName";
import { requireStaff } from "@/lib/guard";
import { needSql } from "@/lib/sqlError";
import { sessionUser } from "@/lib/session";

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
  let total = null;
  for (let page = 1; page <= 20; page += 1) {
    const res = await call(scheduleUrl(key, school, from, to, page), "SchoolSchedule");
    if (res.error) return { rows: all, error: res.error, total };
    if (res.empty) return { rows: all, error: null, empty: all.length === 0, total };
    if (res.total != null) total = Number(res.total);
    all.push(...res.rows);
    // 다 받았거나, 더 줄 게 없으면 그만
    if (!res.total || all.length >= res.total || res.rows.length === 0) break;
  }
  /**
   * **몇 건이라고 했는지도 같이 돌려준다** (2026-08-10). 나이스가 「300건」
   * 이라고 해놓고 우리가 250줄만 받았다면 뒷부분이 조용히 빠진 것이다 —
   * 그러면 화면에는 그냥 일정이 없는 것처럼 보인다.
   */
  return { rows: all, error: null, empty: all.length === 0, total };
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
    // homepage 를 빠뜨려서 「주소를 먼저 넣어주세요」 가 계속 떴다 (2026-08-11).
    // 적어두는 곳과 읽는 곳이 어긋나면 조용히 「없는 것」 이 된다.
    .select(`${COLS}, atpt_name, address, homepage`)
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

  const user = await sessionUser(supabase);

  let added = 0;
  let examAdded = 0;
  let examTidied = 0;
  const exams = [];
  // 모의고사 회차 — 학교마다 같은 것을 적어내므로 다 모은 뒤 한 번에 넣는다
  const mocks = [];
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
    /**
     * toTask 는 **여럿을 돌려줄 수 있다** — 모의고사는 학년마다 한 줄이다
     * (2026-08-08). flat 을 빼면 배열이 통째로 한 줄처럼 들어가서
     * 제목이 「[object Object]」 가 된다.
     */
    /**
     * **차례가 중요하다** (2026-08-09).
     *   합치기(mergeSame) → 이어붙이기(mergeRuns) → 학년 붙이기(labelGrades)
     *
     * 학년을 먼저 붙이면 제목이 달라져 이어붙지 못한다 — 마지막 날만 고3이
     * 보는 시험이 날마다 한 줄이 됐다. 자세한 까닭은 lib/neis 의 labelGrades.
     *
     * 시험 회차는 **학년 꼬리표가 붙기 전** 제목으로 뽑는다. 붙은 뒤에 뽑으면
     * 회차 이름이 「2학기 기말고사 (고3)」 이 되어 시험 이름이 또 제각각이 된다.
     */
    const merged = mergeRuns(mergeSame(
      res.rows.flatMap((r) => toTask(r, school) || []).filter(Boolean)
    ));
    const found = examPeriods(merged, school);
    const tasks = labelGrades(merged);
    exams.push(...found);
    // 시험 기간은 **묻지 않고 다 넣는다.** 필요 없는 것은 화면에서 숨기면 되고,
    // 숨긴 것은 다시 받아와도 숨긴 채로 있다. 매번 고르게 하는 것이 더 일이다.
    const madeExam = await addExamPeriods(found, { school: school.name, from, to });
    if (madeExam.error) failed.push(`${school.name} 시험 — ${madeExam.error}`);
    examAdded += madeExam.added || 0;
    examTidied += madeExam.tidied || 0;

    /**
     * **모의고사도 회차로 만든다** (원장님, 2026-08-08 — 「모의고사는
     * 대비는 안 하지만 시험이니 점수는 있고, 그게 내신의 시험범위가
     * 되어서 연동이 필요한 상황이야」).
     *
     * 내신 시험과 달리 **묻지 않고 넣는다.** 이름이 「2026년 3월 고1
     * 모의고사」 로 완전히 정해져 있어서 고를 것이 없다 — 연도 · 월 ·
     * 학년이면 유일하다. 학교도 「전국」 하나다.
     */
    mocks.push(...mockPeriods(tasks));

    // 전국 공통 줄은 여기서 넣지 않는다. 학교마다 한 번씩 넣으면 설명이
    // 마지막 학교 것으로 덮인다. 다 모은 뒤 마지막에 한 번에 넣는다.
    //
    // **재량휴업일도 같은 자리로 보낸다** (원장님, 2026-08-09 — 「여러 학교가
    // 쉬면 한 줄씩 아니고 일정 하나에 여러 학교 이름 나열해줘」). 전국 공통은
    // 아니지만 「한 줄에 학교를 모은다」 는 다루는 법이 똑같다.
    const mine = [];
    tasks.forEach((t) => {
      if (!t.nationwide && !t.shared) { mine.push(t); return; }
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
    // neisKind · nationwide · grades · level · mock 은 **우리끼리 쓰는
    // 표시**다. 표에 없는 칸이라 그대로 보내면 그 학교가 통째로 거절당한다
    // (2026-08-08 에 grades 를 떼는 것을 빠뜨려 열한 학교가 다 실패했다 —
    //  "Could not find the 'grades' column of 'tasks'").
    const rows = mine.map(({
      neisKind, nationwide, mayDiffer, schoolName, grades, level, mock, ...row
    }) => ({
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
      const {
        neisKind, nationwide, shared, mayDiffer: differs, schoolName, grades, level, mock, ...rest
      } = row;
      // 대체공휴일처럼 학교마다 다를 수 있는 것 — 전부가 아니면 어디가 쉬는지 적는다
      let note = rest.note;
      if (differs && okSchools > 1 && schools.size < okSchools) {
        note = `쉬는 학교 ${schools.size}/${okSchools}곳 — ${[...schools].join(", ")}`;
      }
      /**
       * **재량휴업일은 어느 학교인지가 전부다** (원장님, 2026-08-09).
       * 학교가 저마다 정하는 날이라, 학교 이름이 없으면 그날 누가 비는지
       * 알 수가 없다. 한 곳이든 아홉 곳이든 늘 적는다.
       */
      if (shared) {
        note = `${[...schools].join(" · ")}${okSchools > 1 ? ` (${schools.size}/${okSchools}곳)` : ""}` +
          (rest.note ? ` — ${rest.note}` : "");
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
    notes.push(`한 줄로 모은 일정(수능 · 모의고사 · 공휴일 · 재량휴업일): ${rows.length}건`);
  }

  /**
   * **모의고사 회차** — 성적과 시험범위가 붙을 자리 (2026-08-08).
   *
   * 이름이 「2026년 3월 고1 모의고사」 로 정해져 있어서, 이미 있으면
   * 날짜만 맞춰두고 없으면 만든다. 아홉 학교가 같은 것을 적어내도
   * 회차는 하나다 (mockPeriods 가 이름으로 한 번 걸러 온다).
   */
  if (mocks.length > 0) {
    const seen = new Set();
    const uniq = mocks.filter((m) => (seen.has(m.name) ? false : seen.add(m.name)));
    const { data: had } = await supabase
      .from("exam_periods").select("id, name").eq("school", "전국");
    const byName = new Map((had || []).map((x) => [x.name, x.id]));
    let made = 0;
    for (const m of uniq) {
      const id = byName.get(m.name);
      const row = {
        school: "전국", grade: m.grade || null, name: m.name,
        from_date: m.from_date, to_date: m.to_date, english_on: m.english_on,
        source: "neis",
      };
      // **날짜만 맞춰둔다.** 원장님이 적어두신 등급컷·메모는 안 건드린다
      const { error } = id
        ? await supabase.from("exam_periods")
            .update({ from_date: row.from_date, to_date: row.to_date, english_on: row.english_on })
            .eq("id", id)
        : await supabase.from("exam_periods").insert(row);
      if (error && error.code !== "23505") { failed.push(`모의고사 — ${error.message}`); break; }
      if (!id && !error) made += 1;
    }
    if (made > 0) { examAdded += made; notes.push(`모의고사 회차 ${made}개`); }

    /**
     * **전국 줄도 같은 규칙으로** — 이번에 받아온 목록에 없는 나이스 전국
     * 줄은 치운다 (학년 없는 옛 「전국연합학력평가」, 잘못 만들어졌던
     * 「대학수학능력시험」 회차가 여기서 사라진다).
     *
     * 학교 하나만 받을 때는 안 한다 — 그 학교 달력에 없는 모의고사가
     * 다른 학교 달력에는 있을 수 있어서, 전국 줄의 전부를 보지 못했다.
     */
    if (!schoolId) {
      const wanted = new Set(uniq.map((m) => m.name));
      const { data: nat } = await supabase
        .from("exam_periods")
        .select("id, name, from_date, english_on, note, teacher, teachers, cuts, source")
        .eq("school", "전국")
        .gte("from_date", from)
        .lte("from_date", to);
      const { data: scopeRows2 } = await supabase.from("prep_scopes").select("exam_id");
      const { data: scoreRows2 } = await supabase
        .from("scores").select("exam_id").not("exam_id", "is", null);
      const used = new Set([
        ...(scopeRows2 || []).map((r) => r.exam_id),
        ...(scoreRows2 || []).map((r) => r.exam_id),
      ]);
      /**
       * 전국 줄에서 「손댄 흔적」 은 성적·범위·등급컷·특이사항뿐이다.
       * 영어 시험일은 mockPeriods 가 **기계로 채우는 값**이라(모의고사는
       * 그날이 곧 영어 시험일) 흔적으로 치면 아무것도 못 지운다.
       */
      const stale = (nat || []).filter(
        (x) =>
          (x.source || "") === "neis"
          && !wanted.has(x.name)
          && !used.has(x.id)
          && !(x.note || (x.cuts || []).length)
      );
      if (stale.length) {
        const { error: swErr } = await supabase
          .from("exam_periods").delete().in("id", stale.map((x) => x.id));
        if (!swErr) {
          examTidied += stale.length;
        }
      }
    }

    /**
     * **문항까지 같이 만들어 둔다** (원장님, 2026-08-08 — 「모고는 단원별
     * 아니고 문항별로 시험범위 나온다는 점 고려해줘」).
     *
     * 학교는 내신 범위를 「3월 모의고사 18~24번」 처럼 문항으로 알려준다.
     * 그런데 범위는 교재 단원에서 골라 담게 되어 있어서, 모의고사는 담을
     * 것이 없었다.
     *
     * 그래서 회차 이름으로 교재를 하나 만들고 문항을 단원으로 넣어 둔다.
     * **버튼으로 두지 않는다** — 모의고사는 내신 대비 화면에 아예 안 뜨므로
     * (대비하는 시험이 아니라서) 누를 자리가 마땅치 않고, 범위를 담으려는
     * 순간에 없으면 그때는 이미 늦다.
     */
    const { data: fresh } = await supabase
      .from("exam_periods").select("id, name").eq("school", "전국");
    for (const m of uniq) {
      const row = (fresh || []).find((x) => x.name === m.name);
      if (row?.id) await makeMockBook(row.id).catch(() => {});
    }
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
  //
  // ── 여기서 신정초·신정중이 통째로 지워지고 있었다 (2026-08-08) ──
  //
  // 제목으로 봤다. 그런데 제목은 **「인천신정중학교 개교기념일」** 처럼
  // 학교 이름이 앞에 붙는다. 공휴일 목록에 「신정(新正, 1월 1일)」 이
  // 들어 있어서, **학교 이름에 「신정」 이 들어간다는 이유만으로** 그 학교
  // 일정이 전부 「전국 공통이 학교별로 남은 것」 으로 몰려 지워졌다.
  //
  // 원장님이 「신정초중은 왜 안 받아와지지」 라고 하신 지 하루 만에 다시
  // 나온 그 일이다. 받아오면 33건이 들어오고, 새로고침하면 0건이었다.
  //
  // 이름이 아니라 **행사 이름만** 본다. source_id 는 「학교코드:날짜:행사」 라
  // 세 번째 조각이 학교가 적어낸 행사 이름 그대로다.
  if (okSchools > 0) {
    const { data: leftover } = await supabase
      .from("tasks")
      .select("id, title, source_id")
      .eq("source", "neis")
      .not("source_id", "like", "common:%")
      .gte("due_on", from)
      .lte("due_on", to);
    const eventOf = (sid) => (sid || "").split(":").slice(2).join(":");
    const drop = (leftover || [])
      .filter((r) => isNationwide(eventOf(r.source_id)))
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
  if (examTidied > 0) notes.push(`이번 목록에 없는 옛 시험 줄 ${examTidied}개를 치웠습니다`);
  return { error: null, added, examAdded, examTidied, exams, notes, failed };
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
export async function addExamPeriods(list = [], sweep = null) {
  const rows = (list || []).filter((e) => e?.school && e?.from_date && e?.to_date);
  // 받아온 시험이 하나도 없어도, 치울 것(sweep)이 있으면 계속 간다 —
  // 학교가 시험을 학사일정에서 내렸으면 우리 쪽 나이스 줄도 내려가야 한다
  if (rows.length === 0 && !sweep) return { error: null, added: 0, linked: 0 };

  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const user = await sessionUser(supabase);

  // 내가 이미 들고 있는 시험들 — 겹치면 여기에 붙인다
  let { data: existing } = await supabase
    .from("exam_periods")
    .select("id, school, name, grade, from_date, to_date, source, neis_source_id, neis_name, english_on, note, teacher, teachers, cuts");
  // 0075 전이면 붙일 칸이 없다 — 예전처럼 만들기만 한다
  let canLink = true;
  if (!existing) {
    canLink = false;
    ({ data: existing } = await supabase
      .from("exam_periods").select("id, school, name, grade, from_date, to_date"));
  }
  const pool = existing || [];

  /**
   * **성적·범위가 붙은 줄은 절대 안 지운다.** 지우면 그쪽이 통째로 사라진다.
   */
  const { data: scopeRows } = await supabase.from("prep_scopes").select("exam_id");
  const { data: scoreRows } = await supabase
    .from("scores").select("exam_id").not("exam_id", "is", null);
  const inUse = new Set([
    ...(scopeRows || []).map((r) => r.exam_id),
    ...(scoreRows || []).map((r) => r.exam_id),
  ]);

  const neisPatch = (e) => ({
    neis_source_id: e.source_id || null,
    neis_from: e.from_date,
    neis_to: e.to_date,
    neis_name: e.name || null,
    neis_seen_at: new Date().toISOString(),
  });

  /**
   * **잘못 붙어 있던 것을 떼어낸다** (2026-08-09).
   *
   * 종류를 안 가리던 시절에 모의고사 줄에 내신이 붙었다. 이제는 안 붙지만,
   * **이미 붙어 있는 것은 다시 받아와도 저절로 안 떨어진다** — 그 줄에는
   * 「학교는 「2학기 중간고사」 라고 부릅니다」 가 영영 달려 있게 된다.
   * 붙은 쪽과 붙은 것의 종류가 다르면 참고 자리만 비운다. 회차 자체는
   * 그대로 둔다 — 성적이 붙어 있을 수 있다.
   */
  const wrong = pool.filter(
    (x) => x.neis_source_id && x.neis_name && examKind(x) !== examKind({ name: x.neis_name })
  );
  for (const x of wrong) {
    await supabase
      .from("exam_periods")
      .update({ neis_source_id: null, neis_from: null, neis_to: null, neis_name: null })
      .eq("id", x.id);
    x.neis_source_id = null;
    x.neis_name = null;
  }

  /**
   * **이번 받아오기에 안 나온 나이스 줄은 지운다** (2026-08-09 전면 재검토 —
   * 원장님: 「학사일정이 여전히 제대로 로딩되지 않고 있어. 예외 규칙이 너무
   * 많아진 것 같아」).
   *
   * ── 왜 「고치기」 가 아니라 「비우기」 인가 ───────────────
   *
   * 옛 코드가 만들어 둔 잘못된 줄은 모양이 제각각이다 — 날마다 쪼개진 회차,
   * 「대수능시험 휴업일」 회차, 학교마다 남은 모의고사. 잘못 하나마다 고치는
   * 규칙을 붙이니(흡수 · 옛 줄 치우기 · 다시 만들기) 예외가 끝없이 늘었고,
   * 그 규칙들이 못 보는 모양은 영영 남았다.
   *
   * 나이스가 만든 줄의 주인은 나이스다. 그러니 규칙은 하나다 —
   * **「이번에 받아온 목록이 전부다. 그 학교·그 기간의 나이스 줄 중 거기
   * 없는 것은 치운다.」** 무엇이 어떻게 잘못됐는지는 알 필요가 없다.
   *
   * 단, 아래는 늘 지킨다 —
   *   · 원장님이 손으로 만드신 줄 (source ≠ neis) 은 안 건드린다
   *   · 성적·시험범위가 붙은 줄은 안 지운다
   *   · 영어 시험일 · 등급컷 · 선생님 · 특이사항을 적어두신 줄도 안 지운다
   */
  const touched = new Set();

  let added = 0;
  let linked = 0;
  let tidied = 0;
  for (const e of rows) {
    const hit = canLink ? matchExam(e, pool) : null;

    if (hit) {
      /**
       * **누가 만든 줄인가에 따라 다르게 다룬다** (2026-08-09).
       *
       *   원장님이 적으신 줄   내 것은 안 바꾼다. 학교가 뭐라 하는지만 옆에
       *                        적어두고, 반영은 「내 것에 반영」 을 누르실 때
       *   나이스가 만든 줄     학교 일정이 곧 그 줄의 전부다 — 따라간다
       *
       * 전에는 둘을 안 갈랐다. 그래서 나이스가 만든 줄이 옛 날짜에 그대로
       * 굳어, 사흘짜리 시험이 첫날 하루로 남았다. 그 줄에는 지킬 「내 것」 이
       * 애초에 없었는데도.
       */
      const mine = (hit.source || "") !== "neis";
      const patch = mine
        ? neisPatch(e)
        : { ...neisPatch(e), from_date: e.from_date, to_date: e.to_date, name: e.name || hit.name };
      const { error } = await supabase
        .from("exam_periods").update(patch).eq("id", hit.id);
      if (error && error.code !== "23505") return { error: error.message, added, linked };
      if (!error) {
        linked += 1;
        hit.neis_source_id = e.source_id || null;
        if (!mine) { hit.from_date = e.from_date; hit.to_date = e.to_date; hit.name = patch.name; }
      }
      touched.add(hit.id);
      continue;
    }

    const row = {
      school: e.school,
      name: e.name || "시험",
      from_date: e.from_date,
      to_date: e.to_date,
      /**
       * **한 학년만 보는 시험이면 학년이 적혀 온다** (lib/neis 의 examPeriods).
       * 고3 기말이 다른 주에 따로 있는 학교가 있는데, 학년이 없으면 회차 둘이
       * 똑같이 「2학기 기말」 로 보여서 시험이 하나 더 있는 것처럼 읽힌다.
       */
      grade: e.grade || null,
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
    touched.add(made.id);
  }

  if (canLink && sweep?.school && sweep.from && sweep.to) {
    const stale = staleAfterImport(pool, {
      school: sweep.school, from: sweep.from, to: sweep.to, touched, inUse,
      sameSchool: (a2, b2) => looseKey(a2) === looseKey(b2),
    });
    if (stale.length) {
      const { error: swErr } = await supabase
        .from("exam_periods").delete().in("id", stale.map((x) => x.id));
      if (!swErr) tidied += stale.length;
    }
  }

  revalidatePath("/schedule");
  revalidatePath("/prep");
  return { error: null, added, linked, tidied };
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
 * **받아온 시험 회차를 싹 지우고 다시 만든다** (원장님, 2026-08-09 —
 * 「여전히 한 줄씩 나오거나 모의고사가 내신으로 잡히는데, 진짜 코드 문제
 * 아닌 거 맞아?」).
 *
 * ── 왜 다시 받아와도 안 고쳐졌나 ──────────────────────
 *
 * 코드는 고쳤다. 그런데 **고친 코드는 새로 만드는 것만 바로잡는다.** 옛
 * 코드가 만들어 놓은 줄은 DB 에 그대로 앉아 있고, 다시 받아오기는 그것을
 * 지우지 않는다 — 「기간 안에 온전히 들어앉은 것」 만 흡수하기 때문이다.
 * 옛 줄이 새 줄보다 넓거나(12/11~12/16 안에 12/14~12/16), 이름이 다르거나
 * (「대수능시험 휴업일」), 아예 다른 날에 있으면 영영 남는다.
 *
 * 그래서 **한 번 비우고 다시 만드는 길**을 낸다. 이것이 없으면 원장님이
 * 스무 줄을 손으로 지우셔야 한다.
 *
 * ── 무엇을 지키나 ────────────────────────────────────
 *
 * 지우는 것은 되돌릴 수 없다. 아래 중 **하나라도** 있으면 안 지운다 —
 *   · 성적이나 시험범위가 붙어 있다
 *   · 영어 시험일 · 등급컷 · 출제 선생님 · 특이사항을 적어두셨다
 *   · 원장님이 손으로 만드신 줄이다 (source 가 neis 가 아니다)
 * 지운 뒤에는 **바로 「학사일정 받아오기」 를 누르셔야** 다시 들어온다.
 */
export async function resetNeisExams() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  let { data: rows, error } = await supabase
    .from("exam_periods")
    .select("id, school, name, from_date, to_date, english_on, cuts, teacher, teachers, note, source");
  if (error) {
    // 0073·0076 전이면 없는 칸이 있다 — 한 단계 물러난다
    ({ data: rows, error } = await supabase
      .from("exam_periods").select("id, school, name, from_date, to_date, english_on, note, source"));
  }
  if (error) return { error: error.message };

  const { data: scopeRows } = await supabase.from("prep_scopes").select("exam_id");
  const { data: scoreRows } = await supabase
    .from("scores").select("exam_id").not("exam_id", "is", null);
  const inUse = new Set([
    ...(scopeRows || []).map((r) => r.exam_id),
    ...(scoreRows || []).map((r) => r.exam_id),
  ]);

  const touched = (r) =>
    !!(r.english_on || r.teacher || r.note || (r.teachers || []).length || (r.cuts || []).length);

  const kill = [];
  const keep = [];
  for (const r of rows || []) {
    if ((r.source || "") !== "neis") continue;          // 손으로 만드신 줄
    if (inUse.has(r.id)) { keep.push(`${r.school} ${r.name || ""} (성적·범위)`); continue; }
    if (touched(r)) { keep.push(`${r.school} ${r.name || ""} (적어두신 것)`); continue; }
    kill.push(r.id);
  }

  let removed = 0;
  for (let i = 0; i < kill.length; i += 200) {
    const { error: dErr } = await supabase
      .from("exam_periods").delete().in("id", kill.slice(i, i + 200));
    if (dErr) return { error: dErr.message, removed };
    removed += kill.slice(i, i + 200).length;
  }

  revalidatePath("/schedule");
  revalidatePath("/schools");
  revalidatePath("/prep");
  return {
    error: null,
    removed,
    kept: keep.length,
    keptList: keep.slice(0, 12),
    note:
      `받아온 시험 회차 ${removed}개를 지웠습니다.` +
      (keep.length ? ` ${keep.length}개는 적어두신 것이 있어 남겼습니다.` : "") +
      " 이어서 「학사일정 받아오기」 를 눌러주세요.",
  };
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

/**
 * **학교마다 어느 회차가 있고 없나 — 그리고 없으면 왜 없나** (원장님,
 * 2026-08-09 — 「지금 중학교에서는 은송중하고 신정중만 2학기 중간 시험
 * 일정이 나오는데 이게 맞아? 네가 의도한 거야?」).
 *
 * ── 목록만 봐서는 이 질문에 답할 수 없다 ────────────────
 *
 * 「박문중 2학기 중간」 이 목록에 없을 때, 까닭은 셋 중 하나다 —
 *
 *   1. **그 학교가 정말 안 본다.** 요즘 중학교는 학기당 지필을 한 번만
 *      (기말만) 보는 곳이 많다. 그러면 없는 것이 **맞다.**
 *   2. 학교가 학사일정에 안 올렸다 (나중에 올린다).
 *   3. 우리가 받아왔는데 **시험으로 못 알아봤다** — 「2학기 중간」 처럼
 *      뒷말을 떼고 적었거나, 아직 모르는 표기다. 이건 **우리 잘못**이다.
 *
 * 셋은 화면이 똑같다 — 그냥 없다. 그래서 원장님이 「이게 맞아?」 를 물으실
 * 수밖에 없었다. 이 함수가 셋을 갈라 준다: 회차가 없는 학기에 대해,
 * **그 학교 나이스 일정에 시험처럼 보이는 줄이 있었는지**를 같이 보여준다.
 *
 *   줄이 없다  → 1번이나 2번. 학교에 확인하실 일이지 앱 문제가 아니다
 *   줄이 있다  → 3번. 그 이름을 알려주시면 바로 고칠 수 있다
 */
export async function examCoverage(from, to) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], error: guard.error };

  const { rows: schools, error: sErr } = await listSchools();
  if (sErr) return { rows: [], error: sErr };

  const { data: exams } = await supabase
    .from("exam_periods")
    .select("school, name, from_date, to_date, hidden")
    .gte("from_date", from)
    .lte("from_date", to);

  // 나이스에서 받아온 그 학교 일정 (source_id 가 "학교코드:날짜:행사")
  const { data: tasks } = await supabase
    .from("tasks")
    .select("title, due_on, source_id")
    .eq("source", "neis")
    .gte("due_on", from)
    .lte("due_on", to);

  const mine = (exams || []).filter((e) => !e.hidden && examKind(e) === "school");

  const rows = (schools || [])
    .filter((s) => s.active !== false)
    .map((s) => {
      const has = new Set(
        mine
          .filter((e) => looseKey(e.school) === looseKey(s.name))
          .map((e) => termLabel(e))
          .filter(Boolean)
      );
      /**
       * **학교 일정엔 시험이 있는데 회차가 없는 날.**
       *
       * 이것이 「학교가 안 본다」 와 「우리가 못 만들었다」 를 가르는 자리다.
       * 나이스에서 받아온 그 학교 줄 중 **시험 냄새가 나는데** 그날을 덮는
       * 회차가 하나도 없으면, 학교는 올렸는데 앱에 회차가 없다는 뜻이다 —
       * 「학사일정 받아오기」 를 다시 누르시면 생긴다. 여기 아무것도 안 뜨면
       * 학교가 그 학기에 시험을 안 올린 것이고, 앱이 할 일은 없다.
       */
      const covered = mine.filter((e) => looseKey(e.school) === looseKey(s.name));
      const inSome = (d) =>
        covered.some((e) => String(e.from_date).slice(0, 10) <= d && d <= String(e.to_date).slice(0, 10));
      const missed = (tasks || [])
        .filter((t) => (t.source_id || "").split(":")[0] === s.schul_code)
        .map((t) => ({ due_on: t.due_on, title: (t.title || "").replace(s.name || "", "").trim() }))
        .filter((t) => /(고사|시험|지필|중간|기말)/.test(t.title) && examKind({ name: t.title }) !== "mock"
          && examKind({ name: t.title }) !== "suneung" && examKind({ name: t.title }) !== "assess")
        .filter((t) => !inSome(t.due_on));

      return {
        name: s.name,
        code: s.schul_code || null,
        terms: [...has].sort(),
        missed: missed.slice(0, 6),
        neisRows: (tasks || []).filter(
          (t) => (t.source_id || "").split(":")[0] === s.schul_code
        ).length,
      };
    });

  return { error: null, rows };
}

/**
 * **나이스에 지금 뭐가 들어 있나 — 손대지 않고 그대로 본다** (원장님,
 * 2026-08-09 — 「나이스 일정 페이지를 만들어서 순수하게 나이스에 입력된
 * 일정을 전수 볼 수 있게 해줘. 지금 오류가 난 건지 (학교가) 입력이 안 된
 * 건지 알 수가 없네. 장기적으로도 이 페이지는 필요해 보여」).
 *
 * ── 왜 따로 필요한가 ────────────────────────────────────
 *
 * 지금까지 볼 수 있는 것은 전부 **우리가 바꾼 뒤**의 모습이었다 —
 * 이름을 펴고(1회고사 → 1학기 중간고사), 여러 날을 잇고, 갈래를 나누고,
 * 노이즈를 버린 다음의 것. 그래서 화면에 뭔가 없을 때,
 *
 *   · 나이스에 원래 없었는지 (학교가 안 올렸다)
 *   · 있었는데 우리가 버렸거나 못 알아봤는지 (앱 잘못)
 *
 * 를 **구별할 방법이 없었다.** 원장님이 「오류가 난 건지 입력이 안 된 건지
 * 알 수가 없네」 라고 하신 것이 정확히 이 지점이다.
 *
 * 그래서 나이스에 **그 자리에서 다시 물어보고**, 받은 줄을 하나도 안 버리고
 * 그대로 늘어놓는다. 옆에 **우리가 그 줄을 어떻게 봤는지**를 같이 적는다 —
 * 어디서 어긋났는지가 한 줄에서 보인다.
 *
 * **아무것도 저장하지 않는다.** 보기만 하는 자리다.
 */
export async function peekNeis(from, to, schoolIds = null) {
  if (!from || !to) return { rows: [], error: "기간을 골라주세요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], error: guard.error };

  const key = await neisKey(supabase);
  if (!key) return { rows: [], error: "설정에서 나이스 인증키를 먼저 넣어주세요." };

  const { rows: schools, error: sErr } = await listSchools();
  if (sErr) return { rows: [], error: sErr };
  // **여러 학교를 한 번에** (원장님, 2026-08-09 — 「필터링할 때 학교를 한 개씩
  // 선택하는 게 아니라 다중 선택 가능하게 해줘」). 안 고르시면 전체다
  const want = Array.isArray(schoolIds) ? schoolIds.filter(Boolean) : [];
  const targets = (schools || []).filter(
    (s) => s.active !== false && s.schul_code && (want.length === 0 || want.includes(s.id))
  );
  if (targets.length === 0) return { rows: [], error: "나이스 코드가 있는 학교가 없어요." };

  // 우리 쪽에 지금 들어와 있는 것 — 「나이스엔 있는데 앱엔 없다」 를 짚으려고
  const { data: haveTasks } = await supabase
    .from("tasks").select("source_id").eq("source", "neis")
    .gte("due_on", from).lte("due_on", to);
  const inApp = new Set((haveTasks || []).map((t) => t.source_id));
  const { data: haveExams } = await supabase
    .from("exam_periods").select("school, from_date, to_date, hidden")
    .gte("from_date", from).lte("from_date", to);

  const out = [];
  const notes = [];
  /**
   * **어느 학교에 물어봤는지를 그대로 남긴다** (2026-08-10 — 원장님이 학교
   * 홈페이지와 대조하시면서 「이거랑 나이스 원본에 들어가 있는 게 달라」).
   *
   * 다른 것의 까닭 중 **제일 먼저 확인해야 할 것은 「같은 학교인가」** 다.
   * 같은 이름의 학교가 전국에 여럿 있어서, 학교 코드를 잘못 넣어두면
   * 일정이 통째로 다른데 화면에는 아무 표시도 안 난다. 그래서 코드와 주소를
   * 그대로 보여준다 — 원장님이 학교 홈페이지 주소와 견주실 수 있게.
   *
   * 나이스가 「몇 건」 이라고 했는지도 같이 적는다. 우리가 받은 줄 수와
   * 다르면 뒷부분이 조용히 빠진 것이다.
   */
  const asked = [];
  for (const school of targets) {
    const res = await callAll(key, school, from, to);
    asked.push({
      name: school.name,
      code: school.schul_code,
      atpt: school.atpt_name || school.atpt_code || "",
      address: school.address || "",
      said: res.total ?? null,
      got: res.rows.length,
      /**
       * **나이스에 직접 물어보는 주소** (원장님, 2026-08-10 — 「나이스에 등록된
       * 학사일정 어디서 볼 수 있어? 주소 알려줘」).
       *
       * 앱을 못 믿으실 때 **같은 자료를 원장님 브라우저에서 직접** 여실 수
       * 있어야 한다. 주소는 scheduleUrl 한 곳에서 만든다 — 우리가 부르는 것과
       * 글자 하나까지 같은 주소여야 대조가 뜻이 있다.
       *
       * **인증키는 빼고 준다.** 화면에 뿌리면 키가 남의 눈에 들어간다.
       * 키 없이도 나이스가 조금은 보여주고, 모자라면 주소 끝에 붙이시면 된다.
       */
      link: scheduleUrl(null, school, from, to),
    });
    if (res.error) { notes.push(`${school.name}: ${res.error}`); continue; }
    if (res.empty || res.rows.length === 0) {
      notes.push(`${school.name}: 나이스가 이 기간에 줄 일정이 없다고 합니다.`);
      continue;
    }
    const mine = (haveExams || []).filter(
      (e) => !e.hidden && looseKey(e.school) === looseKey(school.name)
    );
    for (const r of res.rows) {
      /**
       * **판정은 lib/neis 의 explainRow 한 곳에서만** — 이 화면이 제 나름대로
       * 다시 재면 언젠가 실제 받아오기와 다른 말을 하게 되고, 그러면 진단
       * 도구로서 쓸모가 없어진다.
       */
      const x = explainRow(r, school);
      out.push({
        school: school.name,
        ...x,
        /**
         * **앱에 들어와 있나.** 「나이스엔 있는데 앱엔 없다」 가 곧 앱 잘못이다.
         * 전국 줄은 열쇠가 달라 여기서 못 따지므로 null 로 둔다.
         */
        inApp: x.sourceId ? inApp.has(x.sourceId) : null,
        // 시험이면 회차까지 만들어졌나
        hasExam: x.isExam && x.date
          ? mine.some((e) => String(e.from_date).slice(0, 10) <= x.date
              && x.date <= String(e.to_date).slice(0, 10))
          : null,
      });
    }
  }

  /**
   * **이어진 날은 한 줄로** (원장님, 2026-08-09 — 「연속된 일정은 합쳐서
   * 보여 주고」). 나이스는 방학을 하루에 한 줄씩 준다 — 여름방학 하나가
   * 서른 줄이면 다른 일정이 안 보인다.
   *
   * 잇는 규칙은 **받아오기와 똑같은 것**을 쓴다 (lib/neis 의 mergeRuns).
   * 여기서만 따로 이으면 화면과 실제 받아온 결과가 달라지고, 그러면 이
   * 화면은 진단 도구로서 거짓말을 하게 된다. 학교와 원래 이름이 같아야
   * 같은 일정으로 본다.
   */
  const runs = mergeRuns(
    out.map((r) => ({ ...r, due_on: r.date })),
    (r) => `${r.school}\u0000${r.raw}`
  ).map(({ due_on, end_on, ...r }) => ({ ...r, date: due_on, endDate: end_on || null }));

  runs.sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.school.localeCompare(b.school, "ko"));
  out.sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.school.localeCompare(b.school, "ko"));
  // 합친 것과 안 합친 것을 **둘 다** 준다 — 화면에서 켜고 끌 수 있게
  return { error: null, rows: out, runs, notes, asked, schools: targets.map((s) => s.name) };
}

/**
 * **학교 홈페이지에서 학사일정을 읽어온다** (원장님, 2026-08-10 — 「나이스
 * 말고 학교 홈페이지에 등록된 내용으로 기록할 수 없을까? 학교 홈페이지랑
 * 다르다 나이스가」 · 「학교 홈페이지를 넣어놓고 확인해서 긁어오게 할 수는
 * 없어?」).
 *
 * ── 크롬은 안 띄운다 ────────────────────────────────────
 *
 * 학교 홈페이지는 서버가 HTML 을 다 그려 보내주는 옛날식 페이지다. 브라우저를
 * 띄워 자바스크립트를 돌릴 것이 없어서, 주소를 그냥 받아 글자를 읽으면 된다.
 * 브라우저를 띄우면 느리고 배포 환경에서는 아예 안 뜨는 일이 흔하다.
 *
 * ── 자동으로 넣지 않는다 ────────────────────────────────
 *
 * 남의 홈페이지 모양은 언제든 바뀐다. 잘못 읽은 것을 조용히 회차로 만들면
 * 나이스만 볼 때보다 더 나쁘다. **읽은 것을 그대로 보여드리고**, 나이스에
 * 없는 것이 무엇인지 짚어드리고, 고르신 것만 넣는다.
 *
 * 아무것도 저장하지 않는다.
 */
export async function peekSchoolSite(schoolId, from, to, typed = "") {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], error: guard.error };

  const { rows: schools, error: sErr } = await listSchools();
  if (sErr) return { rows: [], error: sErr };
  const school = (schools || []).find((s) => s.id === schoolId);
  if (!school) return { rows: [], error: "학교를 못 찾았어요." };
  /**
   * **화면에 적힌 주소를 그대로 쓴다.** 적어두는 곳(update)과 읽는 곳(select)이
   * 어긋나면 「주소를 먼저 넣어주세요」 가 계속 뜬다 — 실제로 그랬다
   * (listSchools 가 homepage 를 안 골라왔다, 2026-08-11). 화면에 있는 것을
   * 그대로 받으면 저장이 되든 안 되든 읽기는 된다.
   */
  const urls = splitUrls(typed).length ? splitUrls(typed) : splitUrls(school.homepage);
  if (urls.length === 0) return { rows: [], error: "이 학교의 홈페이지 주소를 먼저 넣어주세요." };

  const year = Number((from || "").slice(0, 4)) || null;

  /**
   * **한 화면만 읽으면 한 학기치만 들어온다** (원장님, 2026-08-11 — 「페이지에서
   * 2학기를 눌러야 할 수도 있는데」). 그래서 두 가지를 한다 —
   *   1. 주소를 **여러 개** 적어두실 수 있다 (1학기 화면 · 2학기 화면)
   *   2. 읽은 화면에 「2학기」 같은 단추가 있으면 **한 걸음만 따라간다**
   * 무엇을 읽었는지는 화면에 그대로 내보인다 — 안 그러면 「2학기가 없는
   * 학교」 와 「2학기 화면을 못 읽은 것」 을 구별할 수 없다.
   */
  const MAX_PAGES = 8;
  const read = [];        // 무엇을 읽었나 (화면에 그대로 보여드린다)
  const blocked = [];     // 따라갈 수 없던 단추 이름
  const done = new Set();
  const queue = urls.map((u) => ({ url: u, label: "적어두신 주소", hop: 0 }));
  const rowsAll = [];
  const unread = [];
  const seenRow = new Set();

  while (queue.length > 0 && read.length < MAX_PAGES) {
    const job = queue.shift();
    if (done.has(job.url)) continue;
    done.add(job.url);

    let html = "";
    try {
      const res = await fetch(job.url, {
        cache: "no-store",
        // 학교 홈페이지가 브라우저가 아닌 요청을 막는 일이 있다
        headers: { "user-agent": "Mozilla/5.0 (compatible; ChloeEnglish/1.0)" },
      });
      if (!res.ok) {
        read.push({ url: job.url, label: job.label, error: `${res.status} 로 답했어요` });
        continue;
      }
      html = await res.text();
    } catch (e) {
      read.push({ url: job.url, label: job.label, error: e.message });
      continue;
    }

    const got = readSchedule(toText(html), year);
    let n = 0;
    got.rows.forEach((r) => {
      // 고른 기간 밖은 버린다 (홈페이지는 한 해치를 다 그리기도 한다)
      if ((from && r.date < from) || (to && r.date > to)) return;
      const k = `${r.date}|${r.endDate || ""}|${r.title}`;
      // 여러 화면에 같은 일정이 겹쳐 나온다 — 한 번만 센다
      if (seenRow.has(k)) return;
      seenRow.add(k);
      rowsAll.push(r);
      n += 1;
    });
    got.unread.forEach((u) => { if (!unread.includes(u)) unread.push(u); });
    read.push({ url: job.url, label: job.label, count: n, found: got.rows.length });

    // 단추 따라가기는 **한 걸음만** — 따라간 화면에서 또 따라가면 끝이 없다
    if (job.hop === 0) {
      const t = tabLinks(html, job.url);
      t.go.forEach((l) => {
        if (!done.has(l.url)) queue.push({ url: l.url, label: l.label, hop: 1 });
      });
      t.blocked.forEach((b) => { if (!blocked.includes(b)) blocked.push(b); });
    }
  }

  const truncated = queue.length > 0;

  // 한 화면도 못 불렀으면 그것이 원인이다 — 「일정이 없다」 로 보이면 안 된다
  if (read.length > 0 && read.every((r) => r.error)) {
    return {
      rows: [],
      read,
      error: `학교 홈페이지를 부르지 못했어요 (${read[0].error}). `
        + `아래 「붙여넣기」 로 하시면 이런 일이 없습니다.`,
    };
  }

  const judged = await judgeSiteRows(supabase, school, from, to, rowsAll);
  return {
    error: null,
    school: school.name,
    urls,
    /** 무엇을 읽었나 — 「2학기 화면까지 봤는지」 를 원장님이 눈으로 확인하신다 */
    read,
    /** 따라갈 수 없던 단추 (자바스크립트 단추) */
    blocked,
    truncated,
    unread,
    ...judged,
  };
}

/**
 * **눈에 보이는 것을 그대로 붙여넣는다** (원장님, 2026-08-11 — 「이 방식은
 * 오류가 많을 거 같음」).
 *
 * 맞는 말이다. 주소로 긁어오는 길에는 어긋날 곳이 많다 —
 * 주소가 학기마다 다르고 · 단추가 자바스크립트고 · 로그인을 걸어두기도 하고 ·
 * 우리 서버(Vercel)가 그 학교를 못 부를 수도 있다. 하나라도 어긋나면 빈 화면이다.
 *
 * **브라우저는 이미 그 화면을 다 그려 놓았다.** 그러니 원장님이 학사일정 표를
 * 끌어서 복사해 붙여넣으시면, 위의 어긋날 곳이 **전부 사라진다** — 2학기를
 * 누르셨든 로그인을 하셨든 눈에 보이는 것이 그대로 들어온다.
 *
 * 읽는 규칙(readSchedule)·갈래(classifyExam)·나이스 비교는 **주소로 읽을 때와
 * 똑같은 것 한 벌**을 쓴다. 두 벌이면 반드시 어긋난다.
 */
export async function peekSchoolText(schoolId, from, to, text = "") {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], error: guard.error };

  const { rows: schools, error: sErr } = await listSchools();
  if (sErr) return { rows: [], error: sErr };
  const school = (schools || []).find((s) => s.id === schoolId);
  if (!school) return { rows: [], error: "학교를 못 찾았어요." };
  if (!String(text || "").trim()) return { rows: [], error: "붙여넣은 글이 없어요." };

  const year = Number((from || "").slice(0, 4)) || null;
  // HTML 을 그대로 붙여넣으셔도 되게 — 태그가 있으면 걷어낸다
  const clean = /<[a-z][^>]*>/i.test(text) ? toText(text) : String(text);
  const got = readSchedule(clean, year);

  const judged = await judgeSiteRows(supabase, school, from, to, got.rows);
  return {
    error: null,
    school: school.name,
    read: [{ label: "붙여넣은 글", count: judged.rows.length, found: got.rows.length }],
    blocked: [],
    unread: got.unread,
    ...judged,
  };
}

/**
 * **읽은 줄을 견주어 본다** — 기간 안인가 · 무슨 갈래인가 · 나이스에도 있나 ·
 * 이미 회차가 있나.
 *
 * 주소로 읽을 때와 붙여넣을 때가 **같은 자를 쓰게** 하려고 한곳에 둔다.
 */
async function judgeSiteRows(supabase, school, from, to, rows = []) {
  // 고른 기간 밖은 버린다 (홈페이지는 한 해치를 다 그리기도 한다)
  const inRange = (rows || [])
    .filter((r) => (!from || r.date >= from) && (!to || r.date <= to))
    .sort((a, b) => a.date.localeCompare(b.date));

  /**
   * **나이스에 없는 것이 무엇인가** — 이 화면의 존재 이유다.
   * 같은 날 같은 갈래가 나이스에도 있으면 이미 아는 것이고, 없으면
   * 「홈페이지에만 있는 일정」 이다.
   */
  const key = await neisKey(supabase);
  const seen = new Set();
  if (key && school.schul_code) {
    const got = await callAll(key, school, from, to);
    (got.rows || []).forEach((r) => {
      const d = toDate(r.AA_YMD);
      if (d) seen.add(`${d}|${classifyExam((r.EVENT_NM || "").trim())}`);
    });
  }

  // 이미 우리 회차로 들어와 있나 (그 날을 덮는 시험 회차가 있으면 할 일이 없다)
  const { data: mine } = await supabase
    .from("exam_periods").select("school, from_date, to_date, hidden")
    .gte("from_date", from).lte("from_date", to);
  const covered = (mine || []).filter(
    (e) => !e.hidden && looseKey(e.school) === looseKey(school.name)
  );

  const out = inRange.map((r) => {
    const kind = classifyExam(r.title);
    return {
      ...r,
      kind,
      // 나이스에도 같은 날 같은 갈래가 있나
      inNeis: key && school.schul_code ? seen.has(`${r.date}|${kind}`) : null,
      hasExam: kind === "school"
        ? covered.some((e) => String(e.from_date).slice(0, 10) <= r.date
            && r.date <= String(e.to_date).slice(0, 10))
        : null,
    };
  });

  /** 나이스는 못 물어봤을 수 있다 — 그러면 「비교 안 함」 이라고 말해준다 */
  return { rows: out, comparedToNeis: !!(key && school.schul_code) };
}

/**
 * **홈페이지에서 읽은 것을 시험 회차로 만든다.**
 *
 * `source` 를 "homepage" 로 둔다 — **"neis" 로 두면 다음 받아오기가 지운다**
 * (staleAfterImport 는 나이스가 만든 줄만 치우는데, 나이스에 없는 일정이라
 * 이번 목록에 안 나오기 때문이다). 손으로 만든 것과 같은 자리에 둔다.
 */
export async function addFromSite(schoolName, rows = []) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const want = (rows || []).filter((r) => r?.date && r?.title);
  if (want.length === 0) return { error: null, added: 0 };

  const user = await sessionUser(supabase);

  const { data: had } = await supabase
    .from("exam_periods").select("id, school, from_date, to_date, hidden");
  const mine = (had || []).filter((e) => looseKey(e.school) === looseKey(schoolName));

  let added = 0;
  const skipped = [];
  for (const r of want) {
    const to = r.endDate && r.endDate > r.date ? r.endDate : r.date;
    // 이미 그 날을 덮는 회차가 있으면 새로 만들지 않는다 (두 벌이 된다)
    if (mine.some((e) => String(e.from_date).slice(0, 10) <= to
        && r.date <= String(e.to_date).slice(0, 10))) {
      skipped.push(`${r.date} ${r.title}`);
      continue;
    }
    const row = {
      school: schoolName,
      name: r.title,
      from_date: r.date,
      to_date: to,
      source: "homepage",
      created_by: user?.id || null,
    };
    const { data: made, error } = await supabase
      .from("exam_periods").insert(row).select("id").single();
    if (error) return { error: error.message, added };
    added += 1;
    mine.push({ id: made.id, ...row });
  }

  revalidatePath("/schedule");
  revalidatePath("/schools");
  revalidatePath("/prep");
  return { error: null, added, skipped };
}

/**
 * 학교 홈페이지 주소를 적어둔다 — **여러 개 적을 수 있다**
 * (1학기 화면 · 2학기 화면처럼 한 화면이 한 해를 다 안 보여주는 학교가 많다).
 */
export async function saveHomepage(schoolId, url) {
  if (!schoolId) return { error: "학교를 골라주세요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const clean = splitUrls(url).join("\n");
  if ((url || "").trim() && !clean) {
    return { error: "http:// 나 https:// 로 시작하는 주소를 넣어주세요." };
  }

  const { error } = await supabase
    .from(await schoolTable(supabase))
    .update({ homepage: clean || null })
    .eq("id", schoolId);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    return { error: "설정 → Supabase SQL 에서 0115 를 먼저 실행해주세요." };
  }
  revalidatePath("/schools");
  return { error: error ? error.message : null };
}
