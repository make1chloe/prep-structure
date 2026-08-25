"use server";

import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { auditRows, summarize, attendanceAhead } from "@/lib/yearAudit";
import { pageAll } from "@/lib/pageAll";
import { sessionUser } from "@/lib/session";

/**
 * **이미 들어간 자료의 연도를 훑는다** (아무것도 안 바꾼다).
 *
 * 원장님 (2026-08-06) — 「노션자료에서 24,25,26년이 서로 구별되지 않게
 * 적혀서 혼용된 거 없나 싹 확인해줘」
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 *
 * 노션 자료에는 「12/30」 처럼 **연도 없이** 적힌 날짜가 많다. 옮길 때 그런
 * 줄에는 화면의 연도 칸 값을 붙이는데, 그 기본값이 올해다. 그러니까 지난 해
 * 자료를 그냥 올리면 **작년 수업이 통째로 올해가 된다** — 오류도 안 나고
 * 「141줄 옮겼습니다」 라고 멀쩡히 뜬다.
 *
 * 들어간 뒤에는 「이 줄은 짐작이었다」 는 표시가 없다. 그래서 **모양**으로
 * 찾는다 (`lib/yearAudit`). 판단과 고치기는 사람이 한다 — 어느 해가 맞는지는
 * 원장님만 아신다. 고치는 도구는 바로 아래 「연도 되돌리기」 에 있다.
 */

/** 표마다 무엇을 날짜로 볼까 · 미래에 있어도 되는가 */
const TARGETS = [
  { table: "daily_reports", label: "수업 기록", date: "date", dow: true },
  // 보강 예정일·사전 연락 결석은 **앞으로의 날짜가 맞다** — 그것까지 읽는다
  { table: "attendance", label: "출결 · 보강", date: "date", extra: "status, planned", ahead: true },
  { table: "class_attendance", label: "특강 출결", date: "date" },
  { table: "student_notes", label: "상담일지", date: "date" },
  { table: "scores", label: "성장 (내신 · 모의 · 단원)", date: "taken_on" },
  { table: "payments", label: "수납", date: "paid_on" },
  // 일정·할일은 **앞으로 잡아둔 것이 맞다** — 미래를 문제로 보지 않는다
  { table: "tasks", label: "일정 · 할일", date: "due_on", key: "id", future: false },
];

export async function auditYears() {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (!user) return { error: "로그인이 필요해요.", audits: [] };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (p?.role !== "principal") return { error: "원장님만 볼 수 있어요.", audits: [] };

  const today = todaySeoul();

  /**
   * **학생별 수업 요일** — 요일 검사에 쓴다.
   *
   * 한 해가 밀리면 요일이 정확히 하루 밀린다 (365일 = 52주 + 1일). 그래서
   * 월·수반 기록이 화·목에 놓인다. 눈으로는 안 보이지만 셈으로는 뚜렷하다.
   */
  const daysOf = new Map();
  {
    const { data: cls } = await supabase.from("classes").select("id, days");
    const dayOfClass = new Map((cls || []).map((c) => [c.id, c.days || []]));
    const { data: mem } = await supabase.from("class_students").select("class_id, student_id");
    (mem || []).forEach((m) => {
      const cur = daysOf.get(m.student_id) || [];
      (dayOfClass.get(m.class_id) || []).forEach((d) => { if (!cur.includes(d)) cur.push(d); });
      daysOf.set(m.student_id, cur);
    });
  }

  const audits = [];

  for (const t of TARGETS) {
    const cols = [t.date, t.key || "student_id", t.extra].filter(Boolean).join(", ");
    // 아직 없는 표(마이그레이션 전)는 조용히 건너뛴다 — 여기서 멈추면
    // 나머지 표도 못 본다
    // **1000줄에서 잘리면 안 된다** — Supabase 는 한 번에 1000줄까지만 준다.
    // 그러면 「2026년 한 해에 몰려 있습니다」 같은 판단이 앞의 1000줄만 보고
    // 나온 거짓말이 된다 (2026-08-06 원장님 화면에서 실제로 그랬다)
    const { rows: data, error } = await pageAll((from, to) =>
      supabase.from(t.table).select(cols).not(t.date, "is", null)
        .order(t.date, { ascending: true }).range(from, to)
    );
    if (error) continue;

    audits.push(
      auditRows(t.label, data || [], today, {
        dateOf: (r) => r[t.date],
        keyOf: (r) => r[t.key || "student_id"],
        future: t.future,
        // 요일은 **수업 기록에만** 견준다. 보강·상담·수납은 수업 요일이 아니다
        daysOf: t.dow ? daysOf : null,
        okAhead: t.ahead ? attendanceAhead : null,
      })
    );
  }

  return { error: null, today, audits, sum: summarize(audits) };
}
