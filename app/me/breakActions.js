"use server";

import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { pushToStaff } from "@/app/push/actions";
import { notable, minutesSince, breakLine } from "@/lib/breaks";

const SQL = "설정 → Supabase 에서 0106 을 먼저 실행해주세요.";
const missing = (e) => e && (e.code === "42P01" || e.code === "42703" || e.code === "PGRST204");

/** 지금 쉬는 중인가 (안 끝난 줄) + 오늘 쉼 */
export async function myBreaks() {
  const supabase = createClient();
  const { data: sid } = await supabase.rpc("my_student_id");
  if (!sid) return { ready: true, open: null, rows: [] };

  const { data, error } = await supabase
    .from("study_breaks")
    .select("id, started_at, ended_at, minutes")
    .eq("student_id", sid)
    .eq("date", todaySeoul())
    .order("started_at", { ascending: true });
  if (missing(error)) return { ready: false, open: null, rows: [] };
  const rows = data || [];
  return { ready: true, open: rows.find((r) => !r.ended_at) || null, rows };
}

/** 쉬러 간다 */
export async function startBreak() {
  const supabase = createClient();
  const { data: sid } = await supabase.rpc("my_student_id");
  if (!sid) return { error: "학생 계정이 연결되어 있지 않아요." };

  // 이미 열려 있으면 그것을 쓴다 — 두 번 눌러서 두 줄이 되면 셈이 어긋난다
  const { data: open } = await supabase
    .from("study_breaks")
    .select("id")
    .eq("student_id", sid)
    .is("ended_at", null)
    .maybeSingle();
  if (open?.id) return { error: null };

  const { error } = await supabase
    .from("study_breaks")
    .insert({ student_id: sid, date: todaySeoul() });
  if (missing(error)) return { error: SQL };
  return { error: error ? error.message : null };
}

/**
 * 돌아왔다.
 *
 * **여기서만 알린다.** 몇 분 쉬었는지는 돌아와야 알 수 있고, 나가 있는
 * 동안 계속 세면서 알릴 방법도 없다 (서버가 혼자 도는 것이 없다).
 * 다만 규칙에 걸리는지는 **오늘 전체**를 보고 정한다 — 오늘 세 번째
 * 5분이면 그때 알려야 뜻이 있다.
 */
export async function endBreak() {
  const supabase = createClient();
  const { data: sid } = await supabase.rpc("my_student_id");
  if (!sid) return { error: "학생 계정이 연결되어 있지 않아요." };

  const { data: open } = await supabase
    .from("study_breaks")
    .select("id, started_at")
    .eq("student_id", sid)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .maybeSingle();
  if (!open?.id) return { error: null };

  const mins = minutesSince(open.started_at);
  const { error } = await supabase
    .from("study_breaks")
    .update({ ended_at: new Date().toISOString(), minutes: mins })
    .eq("id", open.id);
  if (missing(error)) return { error: SQL };
  if (error) return { error: error.message };

  // 오늘 것을 통째로 다시 보고, 눈에 띌 때만 알린다
  try {
    const { data: rows } = await supabase
      .from("study_breaks")
      .select("started_at, ended_at, minutes")
      .eq("student_id", sid)
      .eq("date", todaySeoul());
    const hit = notable(rows || []);
    if (hit) {
      const { data: me } = await supabase
        .from("students").select("name").eq("id", sid).maybeSingle();
      await pushToStaff({
        title: `☕ 쉬는 시간이 깁니다 — ${me?.name || "학생"}`,
        body: `${hit.why} · 오늘 ${breakLine(rows || [])}`,
        url: "/today",
        tag: "break",
      });
    }
  } catch {
    /* 알림이 안 가도 기록은 남았다 */
  }
  return { error: null, minutes: mins };
}
