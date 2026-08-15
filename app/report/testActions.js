"use server";

import { createClient } from "@/lib/supabase/server";
import { loadSettings, loadMessageParts } from "@/lib/settings";
import { deliver, normalizePhone } from "@/lib/send";
import { buildReportText, buildHomeworkText } from "@/lib/reportText";
import { buildLateText } from "@/lib/lateNotice";
import { autoValues, buildVariables } from "@/lib/alimtalk";
import { TEST } from "@/lib/notify";
import { pushToAll } from "@/lib/push";
import { sampleRow } from "@/lib/sampleReport";
import { longLabel, todaySeoul } from "@/lib/day";
import { requireStaff } from "@/lib/guard";

/** 그 학생의 진짜 오늘 기록이 있으면 그것으로, 없으면 실제와 같은 모양의 한 판으로 */
async function rowFor(supabase, studentId, date) {
  const { data: st } = await supabase
    .from("students")
    .select("id, name, school, grade, parent_phone, student_phone")
    .eq("id", studentId)
    .maybeSingle();
  if (!st) return { error: "학생을 찾지 못했어요." };

  const base = sampleRow(st.name);
  base.student = { name: st.name, school: st.school || "", grade: st.grade || "" };

  const { data: rep } = await supabase
    .from("daily_reports")
    .select("*")
    .eq("student_id", studentId)
    .eq("date", date)
    .maybeSingle();

  // 진짜 기록이 있으면 그 값으로 덮는다. 없으면 가짜 한 판 그대로 —
  // 빈 문자를 보내면 줄바꿈도 길이도 확인할 수가 없다.
  const real = !!rep;
  if (rep) base.report = { ...base.report, ...rep };

  return { error: null, student: st, row: base, real };
}

/** 무엇이 나가는지 먼저 보여준다 — 보내기 전에 눈으로 읽는다 */
export async function previewTest(studentId, kind, date) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const d = date || todaySeoul();
  const got = await rowFor(supabase, studentId, d);
  if (got.error) return got;

  const settings = await loadSettings(supabase);
  const parts = await loadMessageParts(supabase, settings.message);
  const academy = settings.academy?.name || "클로이영어";

  let text = "";
  let to = "";
  if (kind === "report") {
    text = buildReportText(got.row, d, academy, parts.report);
    to = got.student.parent_phone || "";
  } else if (kind === "homework") {
    text = buildHomeworkText(got.row, d, academy, parts.homework);
    // 실제 숙제 발송(reportData:327)은 부모 번호로 나간다 — 테스트가 다른
    // 번호로 가면 시험해 본 것과 실제가 다르다 (값-지도 P0-5)
    to = got.student.parent_phone || got.student.student_phone || "";
  } else if (kind === "late") {
    text = buildLateText(got.row, d, academy, parts.late, settings.warning || {});
    to = got.student.parent_phone || "";
  } else if (kind === "notice") {
    text =
      `[${academy}] ${got.student.name} 학생 학부모님께\n\n` +
      "시험 삼아 보내는 안내 문자입니다. 줄바꿈과 길이를 확인해 주세요.\n\n" +
      (settings.message?.phone ? `문의: ${settings.message.phone}` : "");
    to = got.student.parent_phone || "";
  } else if (kind === "push") {
    text = `[${academy}] 알림 시험 — 이 알림이 보이면 앱 알림이 켜져 있습니다.`;
    to = "앱 알림 (번호가 아니라 기기로 갑니다)";
  } else {
    return { error: "무엇을 보낼지 골라주세요." };
  }

  return {
    error: null,
    text,
    to,
    real: got.real,
    mode: settings.mode,
    name: got.student.name,
  };
}

/**
 * 진짜로 보낸다 — 기록은 남기지 않는다.
 * @param to 비우면 학생에게 등록된 번호로. 적으면 그 번호로 (원장님 본인 번호 등)
 */
export async function sendTest(studentId, kind, date, to) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const pre = await previewTest(studentId, kind, date);
  if (pre.error) return pre;

  const settings = await loadSettings(supabase);

  // ---- 앱 알림은 통로가 다르다 ----
  if (kind === "push") {
    const { data: keyRow } = await supabase
      .from("integrations").select("config").eq("id", "push").maybeSingle();
    const keys = keyRow?.config || {};
    if (!keys.publicKey || !keys.privateKey) {
      return { error: "알림 키가 없어요. 설정 → 발송·연동에서 먼저 만들어주세요." };
    }
    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("student_id", studentId);
    if (subErr) return { error: "0016 SQL 을 먼저 실행해주세요." };
    if ((subs || []).length === 0) {
      return { error: `${pre.name} 학생 기기에 알림이 켜져 있지 않아요. 학생 화면에서 '알림 받기' 를 먼저 눌러야 합니다.` };
    }
    const res = await pushToAll(keys, subs, {
      title: settings.academy?.name || "클로이영어",
      body: pre.text,
      url: "/me",
      tag: "test",
    });
    if (res.error) return { error: res.error };
    return { error: null, channel: "push", ok: res.sent > 0, detail: `기기 ${res.sent}대로 보냈어요.` };
  }

  // ---- 문자 ----
  const phone = normalizePhone((to || "").trim() || pre.to);
  if (!phone) {
    return { error: "받을 번호가 없어요. 받는 번호를 직접 적어주세요." };
  }

  const { channel, results } = await deliver(
    settings,
    [{ to: phone, text: pre.text, ref: "test" }],
    // 이력에 남지 않지만, 웹훅 쪽에서는 시험인 걸 알아야 한다.
    // audience 를 test 로 둔다 — 원장님이 적은 번호로 한 통 보내보는 것이라
    // 「재원생에게는 문자 안 보냄」 규칙과 상관이 없다 (lib/notify)
    { kind: `test-${kind}`, audience: TEST }
  );
  const r = results?.[0] || { ok: false, detail: "결과가 없어요." };

  return {
    error: null,
    channel,
    ok: !!r.ok,
    detail:
      r.detail ||
      (channel === "copy"
        ? "지금은 '직접 발송' 모드라 실제로 나가지 않았어요. 설정에서 문자 발송을 켜야 진짜로 갑니다."
        : "보냈어요."),
    to: phone,
  };
}

/** 알림톡 문구가 붙은 문구로 한 번 보내본다 */
export async function sendTestAlimtalk(studentId, templateId, to) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const { data: st } = await supabase
    .from("students").select("name, parent_phone").eq("id", studentId).maybeSingle();
  if (!st) return { error: "학생을 찾지 못했어요." };

  const { data: tpl, error: tErr } = await supabase
    .from("message_templates")
    .select("name, body, alimtalk_id, alimtalk_vars")
    .eq("id", templateId)
    .maybeSingle();
  if (tErr || !tpl) return { error: "문구를 찾지 못했어요." };
  if (!tpl.alimtalk_id) return { error: "이 문구에는 알림톡 템플릿이 연결되어 있지 않아요." };

  const settings = await loadSettings(supabase);
  if (!settings.solapi?.pfId) {
    return { error: "카카오 채널(pfId)이 설정에 없어요. 설정 → 발송·연동에서 넣어주세요." };
  }

  const phone = normalizePhone((to || "").trim() || st.parent_phone || "");
  if (!phone) return { error: "받을 번호가 없어요." };

  const { channel, results } = await deliver(
    settings,
    [
      {
        to: phone,
        text: tpl.body || "",
        ref: "test",
        kakao: {
          templateId: tpl.alimtalk_id,
          variables: buildVariables(
            tpl.alimtalk_vars,
            autoValues({
              academy: settings.academy?.name,
              name: st.name,
              date: longLabel(todaySeoul()),
              body: tpl.body || "",
              phone: settings.message?.phone,
              address: settings.message?.address,
            })
          ),
        },
      },
    ],
    { kind: "test-alimtalk", audience: TEST }
  );
  const r = results?.[0] || { ok: false, detail: "결과가 없어요." };
  return { error: null, channel, ok: !!r.ok, detail: r.detail || "보냈어요.", to: phone };
}
