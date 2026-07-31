"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettings, loadMessageParts } from "@/lib/settings";
import { summarize, buildMonthlyText, monthLabel } from "@/lib/monthly";
import { deliver } from "@/lib/send";
import { autoValues, buildVariables } from "@/lib/alimtalk";
import { endOfMonth } from "@/lib/day";

/** "2026-07" → "2026-06" */
function prevYm(ym) {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

const NEED = "0031 SQL 을 먼저 실행해주세요.";

function unavailable(error) {
  return error && (error.code === "42P01" || error.code === "42703" || error.code === "PGRST205");
}

/**
 * 한 달치를 학생별로 모은다.
 * 새로 입력받는 것은 없다 — 그 달 데일리리포트를 다시 세는 것뿐이다.
 */
export async function loadMonth(ym) {
  const supabase = createClient();
  const from = `${ym}-01`;
  const to = endOfMonth(ym);

  const settings = await loadSettings(supabase);
  const parts = await loadMessageParts(supabase, settings.message);
  const msg = parts.monthly || settings.message;

  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, parent_phone, status")
    .order("name", { ascending: true });
  const enrolled = (students || []).filter((s) => !s.status || s.status === "enrolled");

  // 지난달까지 같이 읽는다 — 한 줄 평은 **변화**를 말할 때 제일 와닿는다
  const pym = prevYm(ym);
  const { data: all } = await supabase
    .from("daily_reports")
    .select("id, student_id, date, attendance_kind, word_correct, word_total")
    .gte("date", `${pym}-01`)
    .lte("date", to);
  const reports = (all || []).filter((r) => r.date >= from);
  const prevReports = (all || []).filter((r) => r.date < from);

  const ids = (all || []).map((r) => r.id);
  const { data: items } = ids.length
    ? await supabase
        .from("daily_report_items")
        .select("daily_report_id, status")
        .in("daily_report_id", ids)
        .in("status", ["done", "weak", "missing"])
    : { data: [] };
  const itemsOf = new Map();
  (items || []).forEach((x) => {
    if (!itemsOf.has(x.daily_report_id)) itemsOf.set(x.daily_report_id, []);
    itemsOf.get(x.daily_report_id).push({ status: x.status });
  });

  // 단원평가 (0031 전이면 없는 것으로 본다)
  const eq = await supabase
    .from("unit_exams")
    .select("student_id, date, name, score, total")
    .gte("date", from)
    .lte("date", to);
  const examsOf = new Map();
  (eq.error ? [] : eq.data || []).forEach((e) => {
    if (!examsOf.has(e.student_id)) examsOf.set(e.student_id, []);
    examsOf.get(e.student_id).push(e);
  });

  // 이미 만들어 둔 것 (고친 문구 · 보낸 시각)
  const mq = await supabase
    .from("monthly_reports")
    .select("id, student_id, text, note, sent_at")
    .eq("ym", ym);
  const ready = !mq.error;
  const mine = new Map((ready ? mq.data || [] : []).map((r) => [r.student_id, r]));

  const rows = enrolled
    .map((s) => {
      const mineReports = (reports || [])
        .filter((r) => r.student_id === s.id)
        .map((r) => ({ ...r, items: itemsOf.get(r.id) || [] }))
        .sort((a, b) => a.date.localeCompare(b.date));
      const sum = summarize(mineReports, examsOf.get(s.id) || []);

      // 지난달 — 한 줄 평에서 견주기만 한다 (문구에 지난달 숫자를 늘어놓지는 않는다)
      const before = prevReports
        .filter((r) => r.student_id === s.id)
        .map((r) => ({ ...r, items: itemsOf.get(r.id) || [] }));
      const prev = before.length >= 3 ? summarize(before, []) : null;

      const saved = mine.get(s.id);
      const data = { student: s, ym, sum, prev, note: saved?.note || "" };
      const auto = buildMonthlyText(data, settings.academy.name, msg);
      return {
        studentId: s.id,
        name: s.name,
        who: [s.school, s.grade].filter(Boolean).join(" "),
        phone: s.parent_phone || "",
        sum,
        note: saved?.note || "",
        edited: !!saved?.text,
        text: saved?.text || auto,
        auto,
        sentAt: saved?.sent_at || null,
      };
    })
    .filter((r) => r.sum.days > 0);

  return { rows, ready, mode: settings.mode };
}

/** 문구를 고쳐 저장하거나, 한마디를 덧붙인다 */
export async function saveMonthly(studentId, ym, patch = {}) {
  if (!studentId || !ym) return { error: "값이 부족해요." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = { student_id: studentId, ym, created_by: user?.id || null };
  if ("text" in patch) row.text = (patch.text || "").trim() || null;
  if ("note" in patch) row.note = (patch.note || "").trim() || null;

  const { error } = await supabase
    .from("monthly_reports")
    .upsert(row, { onConflict: "student_id,ym" });
  if (unavailable(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/monthly");
  return { error: null };
}

/** 보낸다 */
export async function sendMonthly(items, ym) {
  const list = (items || []).filter((x) => x?.studentId);
  if (list.length === 0) return { error: null, count: 0 };

  const supabase = createClient();
  const settings = await loadSettings(supabase);

  const tq = await supabase
    .from("message_templates")
    .select("alimtalk_id, alimtalk_vars")
    .eq("key", "monthly")
    .maybeSingle();
  const tpl = tq.error ? null : tq.data;

  const sendable = list.filter((x) => x.phone);
  const { channel, results } = await deliver(
    settings,
    sendable.map((x) => {
      const m = { to: x.phone, text: x.body || "", ref: x.studentId };
      if (tpl?.alimtalk_id) {
        m.kakao = {
          templateId: tpl.alimtalk_id,
          variables: buildVariables(
            tpl.alimtalk_vars,
            autoValues({
              academy: settings.academy?.name,
              name: x.name,
              date: monthLabel(ym),
              body: x.body || "",
              phone: settings.message?.phone,
              address: settings.message?.address,
            })
          ),
        };
      }
      return m;
    }),
    { kind: "monthly" }
  );
  const byRef = new Map(results.map((r) => [r.ref, r]));
  list.forEach((x) => {
    if (!x.phone) byRef.set(x.studentId, { ok: false, detail: "학부모 번호 없음" });
  });

  const okIds = list.filter((x) => byRef.get(x.studentId)?.ok).map((x) => x.studentId);
  if (okIds.length > 0) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("monthly_reports").upsert(
      okIds.map((id) => ({ student_id: id, ym, sent_at: now })),
      { onConflict: "student_id,ym" }
    );
    if (unavailable(error)) return { error: NEED, count: 0 };
  }

  const failed = list.filter((x) => !byRef.get(x.studentId)?.ok);
  revalidatePath("/monthly");
  return {
    error: null,
    channel,
    count: okIds.length,
    failed: failed.map((x) => ({
      name: x.name,
      detail: byRef.get(x.studentId)?.detail || "발송 실패",
    })),
  };
}

/** 보낸 표시 되돌리기 */
export async function unsendMonthly(studentId, ym) {
  const supabase = createClient();
  const { error } = await supabase
    .from("monthly_reports")
    .update({ sent_at: null })
    .eq("student_id", studentId)
    .eq("ym", ym);
  revalidatePath("/monthly");
  return { error: error ? error.message : null };
}
