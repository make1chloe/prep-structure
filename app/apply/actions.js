"use server";

import { createClient } from "@/lib/supabase/server";
import { SLOTS, SOURCES, sourceText } from "@/lib/applySlots";
import { pushNewInquiry } from "./notify";
import { noColumn } from "@/lib/sqlError";

/**
 * 학부모가 **로그인 없이** 제출하는 상담 신청.
 *
 * 전화로 이름만 받아둔 건이 있으면 token 으로 그 건을 채우고, 없으면 새로 접수한다.
 *
 * ── 무엇을 반드시 받나 (2026-08-06, 원장님) ──────────────
 *
 * 학생 정보는 **전부** 받는다 — 이름 · 학부모 연락처 · **학생 연락처** ·
 * 학교 · 학년. 특히 학생 연락처로 **레벨테스트 아이디를 만든다.**
 * 여기서 안 받으면 테스트 날 그 자리에서 다시 여쭤야 한다.
 *
 * 개인정보 수집·이용 동의는 **동의한 때(timestamp)** 로 남긴다.
 * true/false 로 두면 나중에 「언제 동의하셨나」 에 답할 수 없다.
 */
export async function submitApply(formData) {
  const val = (k) => {
    const v = (formData.get(k) || "").toString().trim();
    return v || null;
  };

  const name = val("name");
  const phone = val("phone");
  const studentPhone = val("student_phone");
  const school = val("school");
  const grade = val("grade");

  // **막는 곳이 화면에만 있으면 안 된다.** required 는 브라우저가 지키는 것이라
  // 꺼두면 그냥 통과한다. 받는 쪽에서도 본다
  if (!name) return { error: "학생 이름을 적어주세요." };
  if (!phone) return { error: "학부모 연락처를 적어주세요." };
  if (!studentPhone) {
    return { error: "학생 연락처를 적어주세요. 레벨테스트 아이디를 그 번호로 만듭니다." };
  }
  if (!school) return { error: "학교를 적어주세요." };
  if (!grade) return { error: "학년을 적어주세요." };
  if (!formData.get("privacy_agree")) {
    return { error: "개인정보 수집·이용에 동의해주셔야 접수할 수 있어요." };
  }

  // 고른 시간표 — **아는 열쇠만** 받는다 (화면 밖에서 아무 글자나 보낼 수 있다)
  const known = new Set(SLOTS.map((s) => s.key));
  const wantSlots = formData
    .getAll("want_slots")
    .map((v) => (v || "").toString().trim())
    .filter((v) => known.has(v));

  const token = (formData.get("token") || "").toString().trim();

  /**
   * **어떻게 아셨나** — 고른 것과 적어주신 것을 한 줄로 합친다.
   * 화면 밖에서 아무 글자나 보낼 수 있으니 **아는 것만** 받는다
   * (덧붙이는 글은 사람이 읽는 것이라 그대로 두되 길이만 자른다).
   */
  const picked = val("source");
  const src = SOURCES.find((s) => s.key === picked) || null;
  const why = src?.why ? (val("source_why") || "").slice(0, 60) : null;

  const row = {
    name,
    phone,
    student_phone: studentPhone,
    school,
    grade,
    source: sourceText(src?.key, why),
    prev_academy: val("prev_academy"),
    goal: val("goal"),
    want_slots: wantSlots,
    test_want_text: val("test_want_text"),
    visit_want_text: val("visit_want_text"),
    privacy_agreed_at: new Date().toISOString(),
    form_submitted_at: new Date().toISOString(),
  };

  const supabase = await createClient();

  /**
   * 0102 전 DB 에서도 접수는 되어야 한다.
   *
   * **접수를 놓치는 것이 제일 나쁘다.** 새 칸이 없어서 실패하면 학부모는
   * 「접수에 실패했어요」 만 보고 떠나신다. 새 칸을 빼고 한 번 더 넣되,
   * 적어주신 내용은 메모에 담아 **한 글자도 잃지 않는다.**
   */
  const legacyOf = (r) => {
    const { want_slots, test_want_text, visit_want_text, privacy_agreed_at, ...rest } = r;
    const extra = [
      wantSlots.length
        ? `희망 시간표: ${wantSlots.map((k) => {
            const s = SLOTS.find((x) => x.key === k);
            return s ? `${s.group} ${s.days} ${s.time}` : k;
          }).join(" · ")}`
        : "",
      test_want_text ? `레벨테스트 가능한 때: ${test_want_text}` : "",
      visit_want_text ? `부모님 방문상담 가능한 때: ${visit_want_text}` : "",
      `개인정보 동의 ${new Date().toISOString().slice(0, 10)}`,
    ].filter(Boolean);
    return { ...rest, memo: [rest.memo, ...extra].filter(Boolean).join("\n") };
  };

    if (token) {
    /**
     * **재제출이 단계를 되돌리면 안 된다** (값-지도 P1-17). 링크는 남아
     * 있어서 학부모가 나중에 고쳐 다시 낼 수 있다 — 자료는 갱신하되,
     * 이미 상담 완료·등록·미등록으로 넘어간 건의 상태는 건드리지 않는다.
     */
    const { data: cur } = await supabase
      .from("inquiries").select("status").eq("token", token).maybeSingle();
    const keep = ["consulted", "tested", "enrolled", "hold", "declined"].includes(cur?.status);
    const patch = {
      ...row,
      ...(keep ? {} : { status: "scheduled" }),
      updated_at: new Date().toISOString(),
    };
    let { error } = await supabase.from("inquiries").update(patch).eq("token", token);
    if (error && noColumn(error)) {
      ({ error } = await supabase
        .from("inquiries")
        .update(legacyOf(patch))
        .eq("token", token));
    }
    if (!error) {
      await notifyStaff(row);
      return { error: null };
    }
    // 링크가 이미 처리됐거나 없으면 새로 접수
  }

  let { error } = await supabase.from("inquiries").insert({ ...row, status: "new" });
  if (error && noColumn(error)) {
    ({ error } = await supabase.from("inquiries").insert({ ...legacyOf(row), status: "new" }));
  }
  if (error) return { error: "접수에 실패했어요. 학원으로 전화 주시면 도와드리겠습니다." };
  await notifyStaff(row);
  return { error: null };
}

/**
 * **접수됐으면 알린다** (원장님, 2026-08-07 — 「접수알림도 해줘」).
 *
 * 상담 신청은 원장님이 화면을 안 보고 계실 때 들어온다. 상담 목록에만
 * 쌓이면 며칠 지나서 보시게 되고, 그 사이 다른 학원에 가신다.
 *
 * **알림이 안 가도 접수는 이미 됐다.** 그러니 여기서 나는 문제로 학부모께
 * 「접수 실패」 를 보이지 않는다 — 알림은 덤이지 본 일이 아니다.
 */
async function notifyStaff(row) {
  try {
    await pushNewInquiry(row);
  } catch {
    /* 알림이 안 가도 접수는 들어갔다 */
  }
}
