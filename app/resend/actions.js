"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { IN_APP_DETAIL, noticeLabel, postAppNotices } from "@/lib/notify";
import { pushToFamilies } from "@/app/push/actions";
import { todaySeoul } from "@/lib/day";
import { noColumn } from "@/lib/sqlError";

const NEED_SQL = "0013 SQL을 먼저 실행해주세요.";

// 문자 종류 → 어느 칸에 담기는가
//   report   데일리리포트   report_text   / sent_at
//   homework 숙제 문자      homework_text / homework_sent_at
//   late     하원 안내      late_text     / late_sent_at
const KINDS = {
  report: { text: "report_text", sent: "sent_at" },
  homework: { text: "homework_text", sent: "homework_sent_at" },
  late: { text: "late_text", sent: "late_sent_at" },
};
const kindOf = (k) => KINDS[k] || KINDS.report;

// 고친 문구 저장 — kind 에 따라 리포트/숙제/하원 문자를 나눠 담는다
export async function saveText(reportId, kind, text) {
  if (!reportId) return { error: "리포트가 없어요." };
  const col = kindOf(kind).text;
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ [col]: (text || "").trim() || null })
    .eq("id", reportId);
  if (noColumn(error)) return { error: NEED_SQL };
  revalidatePath("/resend");
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

export async function resetText(reportId, kind) {
  if (!reportId) return { error: null };
  const col = kindOf(kind).text;
  const supabase = createClient();
  const { error } = await supabase
    .from("daily_reports")
    .update({ [col]: null })
    .eq("id", reportId);
  if (noColumn(error)) return { error: NEED_SQL };
  revalidatePath("/resend");
  revalidatePath("/report");
  return { error: error ? error.message : null };
}

/**
 * 보내기 — **앱 안으로 간다** (원장님, 2026-08-06).
 *
 * 데일리리포트 · 숙제 · 늦은 귀가 안내는 전부 재원생 학부모께 가던 것이라
 * 문자·알림톡을 쓰지 않는다. 세 가지는 **이미 앱에 그대로 있다** —
 * 수업 내용은 학부모 화면의 「최근 수업」, 숙제는 학생 화면에 뜬다.
 * 그러니 여기서 할 일은 두 가지다.
 *   1) **보냈다고 남긴다** (sent_at · report_sends) — 안 보낸 것과 갈라야 한다
 *   2) **집으로 알린다** — 올려두기만 하면 안 본다
 *
 * 늦은 귀가 안내만 앱에 자기 자리가 없어서 **공지로 한 줄 올린다.**
 * 그날 저녁에만 쓰는 말이라 수업 기록에 묻히면 아무도 못 본다.
 *
 * items: [{ id, body }]
 */
export async function resend(items, kind) {
  const list = Array.isArray(items) ? items.filter((x) => x?.id) : [];
  if (list.length === 0) return { error: null, count: 0 };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const k = KINDS[kind] ? kind : "report";
  const channel = "app";
  const byRef = new Map();

  // **누구 것인지는 우리가 찾는다.** 부르는 화면이 세 군데인데, 거기서
  // 학생 id 를 같이 넘겨달라고 하면 언젠가 한 군데가 빠뜨린다 —
  // 그러면 그 화면에서 보낸 것만 조용히 알림이 안 간다.
  const owner = new Map();
  {
    const { data } = await supabase
      .from("daily_reports")
      .select("id, student_id, date")
      .in("id", list.map((x) => x.id));
    (data || []).forEach((r) => owner.set(r.id, r));
  }
  const studentOf = (x) => owner.get(x.id)?.student_id || null;

  // 늦은 귀가 안내만 앱에 자기 자리가 없다 — 공지로 올린다
  if (k === "late") {
    const rows = list
      .filter((x) => studentOf(x))
      .map((x) => ({ studentId: studentOf(x), title: noticeLabel("late"), body: x.body || "" }));
    const { ok, failed } = await postAppNotices(supabase, rows, {
      date: owner.get(list[0]?.id)?.date || list[0]?.date || todaySeoul(),
      kind: "late",
      createdBy: user?.id || null,
    });
    const okSet = new Set(ok);
    const whyOf = new Map(failed.map((f) => [f.studentId, f.detail]));
    list.forEach((x) => {
      const sid = studentOf(x);
      if (!sid) {
        // 어느 학생인지 모르면 올릴 데가 없다. 조용히 성공으로 두면 안 된다
        byRef.set(x.id, { ok: false, detail: "어느 학생의 기록인지 찾지 못해 앱에 올리지 못했어요." });
        return;
      }
      byRef.set(x.id, okSet.has(sid)
        ? { ok: true, detail: IN_APP_DETAIL }
        : { ok: false, detail: whyOf.get(sid) || "앱에 올리지 못했어요." });
    });
  } else {
    // 수업 내용·숙제는 이미 앱에 있다. 보냈다고 남기기만 하면 된다
    list.forEach((x) => byRef.set(x.id, { ok: true, detail: IN_APP_DETAIL }));
  }

  const sentIds = list.filter((x) => byRef.get(x.id)?.ok).map((x) => x.id);

  // 올린 뒤에 알린다 — 알림을 먼저 보내면 눌렀을 때 아직 아무것도 없다
  const pushIds = [...new Set(
    list.filter((x) => byRef.get(x.id)?.ok).map((x) => studentOf(x)).filter(Boolean)
  )];
  if (pushIds.length > 0) {
    // 숙제는 **아이가 할 일**이라 집 전체로, 수업 내용·늦은 귀가는
    // 어머니께 드리던 말이라 어머니 폰으로만 간다 (아이 화면에는 안 뜬다)
    const forStudent = k === "homework";
    try {
      await pushToFamilies(
        pushIds,
        {
          title: noticeLabel(k),
          body: forStudent
            ? "이번에 해올 숙제가 올라왔어요."
            : k === "late"
            ? "오늘 늦게 하원합니다. 앱에서 확인해주세요."
            : "오늘 수업 내용이 올라왔어요.",
          url: forStudent ? "/me" : "/parent",
          tag: `send-${k}`,
        },
        forStudent ? "all" : "parent"
      );
    } catch {
      /* 알림이 안 가도 올라간 것은 그대로다 */
    }
  }

  const now = new Date().toISOString();
  const col = kindOf(k).sent;

  if (sentIds.length > 0) {
    const { error } = await supabase
      .from("daily_reports")
      .update({ [col]: now })
      .in("id", sentIds);
    if (noColumn(error)) return { error: NEED_SQL, count: 0 };
    if (error) return { error: error.message, count: 0 };
  }

  // 이력은 없으면 없는 대로 넘어간다 (기능이 막히지 않도록)
  const rows = list.map((x) => {
    const r = byRef.get(x.id) || {};
    return {
      daily_report_id: x.id,
      kind: k,
      body: x.body || "",
      sent_by: user?.id || null,
      channel,
      ok: !!r.ok,
      detail: r.detail || null,
      // 앱으로 나가므로 전화번호는 남기지 않는다 — 안 쓴 값을 남기면
      // 나중에 「문자로 나갔나 보다」 로 잘못 읽힌다
      to_phone: null,
    };
  });
  let { error: logErr } = await supabase.from("report_sends").insert(rows);
  if (noColumn(logErr)) {
    await supabase.from("report_sends").insert(
      rows.map(({ channel, ok, detail, to_phone, ...rest }) => rest)
    );
  }

  const failed = list.filter((x) => !byRef.get(x.id)?.ok);
  revalidatePath("/resend");
  revalidatePath("/report");
  return {
    error: null,
    channel,
    count: sentIds.length,
    failed: failed.map((x) => ({
      name: x.name || "",
      detail: byRef.get(x.id)?.detail || "발송 실패",
    })),
  };
}

// 한 학생의 발송 이력 보기
export async function listSends(reportId) {
  if (!reportId) return { sends: [], error: null };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("report_sends")
    .select("id, kind, body, sent_at")
    .eq("daily_report_id", reportId)
    .order("sent_at", { ascending: false });
  if (error) return { sends: [], error: NEED_SQL };
  return { sends: data || [], error: null };
}
