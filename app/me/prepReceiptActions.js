"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { pickIp, sameNet } from "@/lib/clientIp";
import { resolveStudent } from "@/lib/actAs";

/**
 * 내신 자료를 **아이가 받았다고 누른다** (0178).
 *
 * 원장님 (8/27 밤) — 「내신자료를 배정하면, 그 자료를 실제로 받았는지 학생이 체크」
 *
 * ── 종이는 학원 안에서만 ──────────────────────────────
 * 「받았다」의 실물이 자료마다 다르다. 종이 유인물은 학원에서 손에 받고,
 * 파일·클래스카드는 집에서도 받는다. 그래서 **종이인 것만** 학원 와이파이를
 * 본다 (등원 체크와 같은 한 벌 — academy_net + lib/clientIp).
 *
 * **화면에서만 막으면 안 된다.** 단추를 잠가도 앱이 쓰는 통로로 직접
 * 물어보면 그대로 들어간다. 그래서 여기서 한 번 더 본다 — 등원 체크가
 * 정확히 그렇게 한다.
 *
 * ── 되돌리기는 줄을 안 지운다 ─────────────────────────
 * received_at 만 비운다. 지우면 「눌렀다가 되돌렸다」는 자취가 사라진다.
 * 잠금도 그렇게 서 있다 — 아이에게 지우기는 안 준다 (0178).
 */
async function setReceipt(materialId, on) {
  if (!materialId) return { error: "자료가 없어요." };
  const supabase = await createClient();
  const { studentId, error: whoErr } = await resolveStudent(supabase);
  if (!studentId) return { error: whoErr || "학생 계정으로 로그인해주세요." };

  /**
   * 종이인지 파일인지는 **DB 에 물어본다** — 화면이 보낸 말을 믿으면
   * 「파일이에요」라고 말하며 집에서 종이를 찍을 수 있다.
   * 학생 세션에서는 준비가 끝난 내 자료만 읽히므로, 안 읽히면 그 자체가
   * 「아직 누를 수 없는 자료」라는 답이다.
   */
  const { data: m, error: mErr } = await supabase
    .from("prep_materials")
    .select("id, give_kind")
    .eq("id", materialId)
    .maybeSingle();
  if (mErr) return { error: mErr.message };
  if (!m) return { error: "아직 받을 수 있는 자료가 아니에요." };

  if (on && m.give_kind !== "file") {
    const nq = await supabase.from("academy_net").select("ip");
    const allowed = (nq.error ? [] : nq.data || []).map((x) => x.ip);
    if (allowed.length > 0 && !sameNet(pickIp(await headers()), allowed)) {
      return { error: "학원에서 받을 때 눌러주세요." };
    }
  }

  const { error } = await supabase.from("prep_receipts").upsert(
    {
      material_id: materialId,
      student_id: studentId,
      received_at: on ? new Date().toISOString() : null,
      by_staff: false,
    },
    { onConflict: "material_id,student_id" }
  );
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { error: "선생님이 SQL 을 먼저 실행해야 해요." };
    }
    return { error: error.message };
  }

  revalidatePath("/me");
  revalidatePath("/today");
  revalidatePath("/prep");
  return { error: null };
}

export async function receiveMaterial(materialId) {
  return setReceipt(materialId, true);
}

export async function undoReceive(materialId) {
  return setReceipt(materialId, false);
}
