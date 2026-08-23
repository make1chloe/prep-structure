import { phoneOf } from "./importInquiry.js";

/**
 * **형제 묶기 규칙 한 벌** (원장님 2026-08-23 — 「재원생 형제인 경우
 * 학부모가 동일하다는 것 고려해서 묶어야 해」).
 *
 * 묶는 자리가 셋이다 — 손으로 고르기(재원생 목록), 직접 추가, 상담 → 등록.
 * 규칙이 셋으로 갈라지면 한 곳만 고쳐지므로 여기 한 곳에 둔다.
 */

/**
 * 고른 아이들을 **한 집으로** 합친다.
 *
 * 이미 묶인 집이 있으면 **그 집으로 합친다** — 새 집을 만들면 형이 쓰던
 * 묶음이 깨져서, 형에게 연결된 다른 형제가 떨어져 나간다.
 */
export async function mergeFamily(supabase, ids = []) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (list.length < 2) return { error: null, count: 0 };

  const { data: rows, error: readErr } = await supabase
    .from("students")
    .select("id, family_id")
    .in("id", list);
  if (readErr) {
    if (readErr.code === "42703" || readErr.code === "PGRST204") {
      return { error: "설정 → Supabase SQL 에서 0071 을 먼저 실행해주세요.", count: 0 };
    }
    return { error: readErr.message, count: 0 };
  }

  const existing = [...new Set((rows || []).map((r) => r.family_id).filter(Boolean))];
  const family = existing[0] || crypto.randomUUID();

  // 여러 집이 섞여 있으면 전부 한 집으로 (한 집인 게 맞으니 고른 것이다)
  const also = existing.length > 1
    ? (await supabase.from("students").select("id").in("family_id", existing)).data || []
    : [];
  const targets = [...new Set([...list, ...also.map((r) => r.id)])];

  const { error } = await supabase
    .from("students")
    .update({ family_id: family })
    .in("id", targets);
  return { error: error ? error.message : null, count: targets.length };
}

/**
 * **학부모 번호가 같은 아이를 찾아 그 집에 넣는다.**
 *
 * 새로 등록하는 순간에 부른다. 손으로 묶기를 기다리면 그 사이에 학부모
 * 계정이 둘로 생기고, 어머니는 아이마다 따로 로그인해야 한다.
 * 퇴원생은 안 본다 — 형이 그만둔 집에 동생을 묶을 이유가 없다.
 *
 * @returns 묶인 형제 수 (0 이면 아무 일도 안 했다)
 */
export async function joinFamilyByPhone(supabase, studentId, parentPhone) {
  const tel = phoneOf(parentPhone);
  if (!studentId || !tel) return 0;
  try {
    const { data: kin } = await supabase
      .from("students")
      .select("id, parent_phone, status")
      .neq("id", studentId);
    const same = (kin || [])
      .filter((k) => k.status !== "quit")
      .filter((k) => phoneOf(k.parent_phone) === tel)
      .map((k) => k.id);
    if (same.length === 0) return 0;
    const r = await mergeFamily(supabase, [studentId, ...same]);
    return r?.error ? 0 : same.length;
  } catch {
    return 0;   // 묶기는 덤 — 등록이 먼저다
  }
}
