"use server";

import { revalidatePath } from "next/cache";
import { fetchAll } from "@/lib/fetchAll";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { dueTasks, KINDS, byDate, studentKey, bookKey, nearEnd } from "@/lib/todoRoutine";
import { inUseOn } from "@/lib/bookUse";

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
  let { data, error } = await supabase
    .from("todo_routines")
    .select("id, title, repeat_kind, dows, day_of_month, month, lead_days, lead_units, book_area, todo_category_id, priority, note, checklist, active, sort")
    .order("sort", { ascending: true });
  if (missing(error)) {
    // 0117 전이면 하위목록 칸 없이
    ({ data, error } = await supabase
      .from("todo_routines")
      .select("id, title, repeat_kind, dows, day_of_month, month, lead_days, lead_units, book_area, todo_category_id, priority, note, active, sort")
      .order("sort", { ascending: true }));
  }
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
    lead_units: kind === "book_end" ? (num(patch.lead_units, 0, 99) ?? 0) : 2,
    book_area: kind === "book_end" ? ((patch.book_area || "").trim() || null) : null,
    // 안 쓰는 칸은 비워둔다 — 매주로 바꿔놓고 예전 날짜가 남아 있으면
    // 나중에 다시 매달로 돌렸을 때 엉뚱한 날이 살아난다
    dows: kind === "weekly" ? (patch.dows || []).filter(Boolean) : [],
    day_of_month: kind === "weekly" ? null : num(patch.day_of_month, 1, 31),
    month: kind === "yearly" ? num(patch.month, 1, 12) : null,
    lead_days: num(patch.lead_days, 0, 365) ?? 0,
    todo_category_id: patch.todo_category_id || null,
    priority: num(patch.priority, 0, 2) ?? 0,
    note: (patch.note || "").trim() || null,
    // 하위목록 — 한 줄에 하나. 여기 적으면 생기는 할일마다 그대로 복사된다 (0117)
    checklist:
      (patch.checklist || "").split("\n").map((s) => s.trim()).filter(Boolean).join("\n") || null,
    active: patch.active !== false,
  };
}

export async function saveRoutine(id, patch) {
  const row = clean(patch || {});
  if (!row.title) return { error: "할일 이름을 적어주세요." };
  if (byDate(row.repeat_kind)) {
    if (row.repeat_kind === "weekly" && row.dows.length === 0) {
      return { error: "무슨 요일인지 골라주세요." };
    }
    if (row.repeat_kind !== "weekly" && !row.day_of_month) {
      return { error: "며칠인지 적어주세요 (말일이면 31 로 적으시면 됩니다)." };
    }
    if (row.repeat_kind === "yearly" && !row.month) {
      return { error: "몇 월인지 적어주세요." };
    }
  }

  const supabase = createClient();
  if (id) {
    let { error } = await supabase.from("todo_routines").update(row).eq("id", id);
    if (missing(error)) {
      // 0117 전이면 하위목록 없이 — 표 자체(0082)가 없는 것과는 다른 오류다
      const { checklist: _c, ...noChecklist } = row;
      ({ error } = await supabase.from("todo_routines").update(noChecklist).eq("id", id));
      if (!error && row.checklist) {
        return { error: "하위목록을 적으려면 설정 → Supabase SQL 에서 0117 을 먼저 실행해주세요." };
      }
    }
    if (missing(error)) return { error: SQL };
    if (error) return { error: error.message };
  } else {
    const { data: last } = await supabase
      .from("todo_routines").select("sort").order("sort", { ascending: false }).limit(1);
    let { error } = await supabase
      .from("todo_routines")
      .insert({ ...row, sort: (last?.[0]?.sort ?? 0) + 10 });
    if (missing(error)) {
      const { checklist: _c, ...noChecklist } = row;
      ({ error } = await supabase
        .from("todo_routines")
        .insert({ ...noChecklist, sort: (last?.[0]?.sort ?? 0) + 10 }));
    }
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
  let { data, error } = await supabase
    .from("todo_routines")
    .select("id, title, repeat_kind, dows, day_of_month, month, lead_days, lead_units, book_area, todo_category_id, priority, note, checklist, active, created_at")
    .eq("active", true);
  if (missing(error)) {
    // 0117 전이면 하위목록 칸 없이
    ({ data, error } = await supabase
      .from("todo_routines")
      .select("id, title, repeat_kind, dows, day_of_month, month, lead_days, lead_units, book_area, todo_category_id, priority, note, active, created_at")
      .eq("active", true));
  }
  if (error) return { error: missing(error) ? SQL : error.message, added: 0 };

  const rules = data || [];
  const want = [
    ...dueTasks(rules, todaySeoul()),
    ...(await newStudentTasks(supabase, rules)),
    ...(await bookEndTasks(supabase, rules)),
  ];
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

  let { error: insErr } = await supabase.from("tasks").insert(rows);
  if (missing(insErr)) {
    // 0117 전이면 하위목록 없이 (tasks 에 그 칸이 아직 없다)
    ({ error: insErr } = await supabase
      .from("tasks")
      .insert(rows.map(({ checklist: _c, ...r }) => r)));
  }
  if (insErr) return { error: insErr.message, added: 0 };
  return { error: null, added: rows.length };
}


/**
 * **신규 학생이 들어오면 생기는 할일.**
 *
 * 학생 한 명당 한 번이다 (열쇠에 학생 id 가 들어간다). 이미 만든 것은
 * 건드리지 않으니, 체크해서 지운 할일이 다시 살아나지도 않는다.
 *
 * 마감은 **등원 시작일**로 잡는다. 없으면 오늘 — 새로 들어온 학생 일은
 * 미룰수록 곤란해진다.
 *
 * 예전 학생에게까지 소급해서 만들지 않는다. 규칙을 만든 날보다 **뒤에**
 * 등록된 학생만 본다 — 안 그러면 규칙 하나 만들자마자 할일이 백 개 생긴다.
 */
async function newStudentTasks(supabase, rules) {
  const mine = rules.filter((r) => r.repeat_kind === "student");
  if (mine.length === 0) return [];

  const { data, error } = await supabase
    .from("students")
    .select("id, name, status, created_at, enrolled_on")
    .in("status", ["prospect", "enrolled"]);
  if (error) return [];

  const today = todaySeoul();
  const out = [];
  for (const r of mine) {
    for (const s of data || []) {
      // 규칙보다 먼저 들어온 학생은 넘어간다
      if (r.created_at && s.created_at && s.created_at < r.created_at) continue;
      out.push({
        auto_key: studentKey(r.id, s.id),
        title: `${s.name} — ${r.title}`,
        due_on: s.enrolled_on && s.enrolled_on > today ? s.enrolled_on : today,
        todo_category_id: r.todo_category_id || null,
        priority: r.priority || 0,
        note: r.note || null,
      });
    }
  }
  return out;
}

/**
 * **교재 진도가 끝나갈 때 생기는 할일.**
 *
 * 원장님 (2026-08-05) — 단어 교재가 끝나면 시험지를 뽑고 클래스카드 플래너를
 * 다시 잡아야 한다. 그런데 그건 진도를 보고 있어야 아는 일이라, 끝나고 나서야
 * 「아 뽑아야지」 가 된다.
 *
 * 남은 단원이 lead_units 개 이하가 되면 한 번 만든다. **회독마다 다시** 만든다 —
 * 2회독을 돌면 시험지도 플래너도 다시 해야 하기 때문이다.
 *
 * 마감은 오늘이다. 이미 끝나가는 중이라 미룰 여유가 없다.
 */
async function bookEndTasks(supabase, rules) {
  const mine = rules.filter((r) => r.repeat_kind === "book_end");
  if (mine.length === 0) return [];

  const today = todaySeoul();

  // 배정된 교재 (지금 쓰는 것만)
  let stQ = await supabase
    .from("student_textbooks")
    .select("student_id, textbook_id, status, round, assigned_on, ended_on");
  if (stQ.error) {
    stQ = await supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status");
  }
  if (stQ.error) return [];
  const uses = (stQ.data || []).filter((x) => inUseOn(x, today));
  if (uses.length === 0) return [];

  const bookIds = [...new Set(uses.map((x) => x.textbook_id))];
  const [bq, uq, sq] = await Promise.all([
    supabase.from("textbooks").select("id, name, area").in("id", bookIds),
    fetchAll(() => supabase.from("textbook_units").select("id, textbook_id").in("textbook_id", bookIds).order("id")),
    supabase.from("students").select("id, name, status"),
  ]);
  if (bq.error || uq.error || sq.error) return [];

  const bookById = new Map((bq.data || []).map((b) => [b.id, b]));
  const nameById = new Map((sq.data || [])
    .filter((s) => s.status === "enrolled")
    .map((s) => [s.id, s.name]));

  // 교재별 단원 수, 단원 → 교재
  const unitCount = new Map();
  const bookOfUnit = new Map();
  (uq.data || []).forEach((u) => {
    unitCount.set(u.textbook_id, (unitCount.get(u.textbook_id) || 0) + 1);
    bookOfUnit.set(u.id, u.textbook_id);
  });

  // 학생이 끝낸 단원 — 회독별로 센다. 표 전체라 1000줄을 넘는다 —
  // 잘리면 뒷 학생의 「교재 끝나감」 할일이 영영 안 생긴다 (A5)
  let pq = await fetchAll(() =>
    supabase
      .from("student_unit_progress")
      .select("student_id, textbook_unit_id, status, round")
      .order("student_id").order("textbook_unit_id")
  );
  if (pq.error) {
    pq = await fetchAll(() =>
      supabase
        .from("student_unit_progress")
        .select("student_id, textbook_unit_id, status")
        .order("student_id").order("textbook_unit_id")
    );
  }
  const doneCount = new Map();   // `${student}|${book}|${round}` → 끝낸 수
  (pq.error ? [] : pq.data || []).forEach((x) => {
    if (x.status && x.status !== "done") return;
    const book = bookOfUnit.get(x.textbook_unit_id);
    if (!book) return;
    const k = `${x.student_id}|${book}|${x.round || 1}`;
    doneCount.set(k, (doneCount.get(k) || 0) + 1);
  });

  const out = [];
  for (const r of mine) {
    for (const u of uses) {
      const who = nameById.get(u.student_id);
      if (!who) continue;                              // 퇴원생은 챙길 것이 없다
      const book = bookById.get(u.textbook_id);
      if (!book) continue;
      // 영역을 적어두었으면 그 교재에만 건다 (「단어 교재만」)
      if (r.book_area && (book.area || "") !== r.book_area) continue;
      const round = u.round || 1;
      const total = unitCount.get(u.textbook_id) || 0;
      const done = doneCount.get(`${u.student_id}|${u.textbook_id}|${round}`) || 0;
      if (!nearEnd(total, done, r.lead_units)) continue;
      out.push({
        auto_key: bookKey(r.id, u.student_id, u.textbook_id, round),
        title: `${who} · ${book.name}${round > 1 ? ` ${round}회독` : ""} — ${r.title}`,
        due_on: today,
        todo_category_id: r.todo_category_id || null,
        priority: r.priority || 0,
        note: r.note || null,
      });
    }
  }
  return out;
}
