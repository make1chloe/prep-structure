"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDays, dowOf } from "@/lib/day";
import { pushToStaff, pushToFamilies } from "@/app/push/actions";

function ok(error) {
  return { error: error ? error.message : null };
}

const KIND = { absence: "결석", makeup: "보강 요청", info: "전달", question: "문의" };

// 학생·학부모가 직접 넣는 요청 (결석 알림 등)
export async function createRequest(input) {
  const { studentId, kind, fromDate, toDate, body, photos } = input || {};
  if (!studentId) return { error: "학생 정보가 없어요." };
  if (kind === "absence" && !fromDate) return { error: "날짜를 골라주세요." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    student_id: studentId,
    created_by: user?.id || null,
    kind: kind || "absence",
    from_date: fromDate || null,
    to_date: toDate || fromDate || null,
    body: (body || "").trim() || null,
    photos: (photos || []).filter(Boolean),
  };
  let { error } = await supabase.from("requests").insert(row);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0068 전이면 사진 없이 — 글이라도 가야 한다
    const { photos: _p, ...noPhotos } = row;
    ({ error } = await supabase.from("requests").insert(noPhotos));
  }
  if (error) return { error: "0019 SQL을 먼저 실행해주세요." };

  /**
   * **보냈으면 알려야 한다** (2026-08-06, 알림 전체 점검).
   *
   * 여기가 제일 컸다. 결석·문의는 **화면을 안 보고 계실 때** 들어온다.
   * 대시보드에만 쌓이면 그날 저녁에야 보시게 되고, 결석은 이미 지나 있다.
   *
   * 보내기가 안 되더라도 요청 자체는 이미 들어갔다 — 그러니 여기서 나는
   * 문제로 학부모께 오류를 보이지 않는다 (알림은 덤이지 본 일이 아니다).
   */
  try {
    const { data: who } = await supabase
      .from("students").select("name").eq("id", studentId).maybeSingle();
    const name = who?.name || "학생";
    const when = row.from_date
      ? ` (${row.from_date}${row.to_date && row.to_date !== row.from_date ? `~${row.to_date}` : ""})`
      : "";
    await pushToStaff({
      title: `📩 ${KIND[row.kind] || "알림"} — ${name}`,
      body: `${(row.body || "").slice(0, 60) || "확인해주세요."}${when}`,
      url: "/",
    });
  } catch {
    // 알림이 안 가도 요청은 들어갔다
  }

  revalidatePath("/me");
  revalidatePath("/");
  return { error: null };
}

/**
 * 선생님이 확인 — 결석 알림을 받아들이면 그 기간을 결석 예정으로 깐다.
 *
 * **보강까지 여기서 잡는다** (원장님, 2026-08-07 — 「결석알림이 오면
 * 보강을 바로 잡을 수 있게 해줘」). 지금까지는 확인 → 아래 「보강 잡을 것」
 * 에 다시 나타남 → 거기서 또 날짜 고르기, 이렇게 두 번 손이 갔다.
 * 어차피 답장에 「금요일 5시에 오세요」 를 적으시게 되므로 한 번에 끝낸다.
 *
 * @param makeup { on, at } — 없으면 예전 그대로 (결석만 깐다)
 */
export async function handleRequest(id, accept, reply, makeup) {
  if (!id) return { error: "id 없음" };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: req, error } = await supabase
    .from("requests")
    .select("id, student_id, kind, from_date, to_date, body")
    .eq("id", id)
    .single();
  if (error) return { error: error.message };

  if (accept && req.kind === "absence" && req.from_date) {
    // 그 학생이 실제로 수업 있는 날만 결석 예정으로
    const { data: members } = await supabase
      .from("class_students")
      .select("class_id")
      .eq("student_id", req.student_id);
    const classIds = (members || []).map((m) => m.class_id);
    const { data: classes } = classIds.length
      ? await supabase.from("classes").select("id, days").in("id", classIds)
      : { data: [] };
    const myDays = new Set((classes || []).flatMap((c) => c.days || []));

    const DOWN = ["일", "월", "화", "수", "목", "금", "토"];
    const rows = [];
    let d = req.from_date;
    const end = req.to_date || req.from_date;
    while (d <= end) {
      if (myDays.has(dowOf(d))) {
        rows.push({
          student_id: req.student_id,
          date: d,
          status: "absent",
          planned: true,
          reason: req.body || "학부모 사전 연락",
        });
      }
      d = addDays(d, 1);
    }
    if (rows.length > 0) {
      const { error: aErr } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "student_id,date" });
      if (aErr) return { error: aErr.message };
    }

    /**
     * **보강도 그 자리에서.** 원 결석일은 **첫날**로 단다 — 여러 날을
     * 빠져도 보강은 보통 한 번이고, 어느 결석의 보강인지는 하나만 달 수 있다.
     * (보강을 여러 번 잡으실 것이면 아래 「보강 잡을 것」 에서 하시면 된다)
     */
    const on = (makeup?.on || "").trim();
    if (on) {
      const mrow = {
        student_id: req.student_id,
        date: on,
        status: "makeup",
        makeup_of: rows[0]?.date || req.from_date,
        makeup_time: (makeup.at || "").trim() || null,
      };
      let { error: mErr } = await supabase
        .from("attendance")
        .upsert(mrow, { onConflict: "student_id,date" });
      if (mErr && (mErr.code === "PGRST204" || mErr.code === "42703")) {
        // 0046 전이면 시간 칸이 없다 — 날짜라도 잡힌다
        const { makeup_time: _t, ...noTime } = mrow;
        ({ error: mErr } = await supabase
          .from("attendance")
          .upsert(noTime, { onConflict: "student_id,date" }));
      }
      if (mErr) return { error: `결석은 반영했는데 보강을 못 잡았어요: ${mErr.message}` };
    }
  }

  const { error: uErr } = await supabase
    .from("requests")
    .update({
      status: accept ? "accepted" : "declined",
      reply: (reply || "").trim() || null,
      handled_by: user?.id || null,
      handled_at: new Date().toISOString(),
    })
    .eq("id", id);

  // **답을 드렸으면 알려야 한다.** 어머니는 이 화면을 다시 안 여신다 —
  // 알림이 안 가면 「알렸는데 답이 없네」 로 끝난다 (2026-08-06)
  if (!uErr) {
    try {
      await pushToFamilies([req.student_id], {
        title: accept ? "✅ 확인했습니다" : "확인했습니다",
        body:
          (reply || "").trim().slice(0, 60) ||
          `${KIND[req.kind] || "알림"} 확인했습니다.`,
        url: "/me",
      }, "all");
    } catch {
      // 알림이 안 가도 답은 남았다
    }
  }

  revalidatePath("/");
  revalidatePath("/today");
  revalidatePath("/plan");
  return ok(uErr);
}
