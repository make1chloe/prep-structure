"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { needSql } from "@/lib/sqlError";
import { templateFor, buildSteps, TEMPLATE_AREAS } from "@/lib/routineTemplates";

const NEED = "0035 SQL 을 먼저 실행해주세요.";
/** 이 교재의 루틴 (한 줄 = 한 수업 회차) */
export async function listRoutine(textbookId) {
  if (!textbookId) return { steps: [], ready: true, error: null };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("routine_steps")
    .select("id, sort, label, inclass_items, home_items, note")
    .eq("textbook_id", textbookId)
    .order("sort", { ascending: true });
  if (needSql(error)) return { steps: [], ready: false, error: NEED };
  if (error) return { steps: [], ready: true, error: error.message };
  return { steps: data || [], ready: true, error: null };
}

export async function saveStep(textbookId, step) {
  if (!textbookId) return { error: "교재가 없어요." };
  const supabase = createClient();
  const row = {
    textbook_id: textbookId,
    sort: Number.isFinite(+step?.sort) ? +step.sort : 0,
    label: (step?.label || "").trim() || null,
    inclass_items: step?.inclass_items || [],
    home_items: step?.home_items || [],
    note: (step?.note || "").trim() || null,
  };
  const { error } = step?.id
    ? await supabase.from("routine_steps").update(row).eq("id", step.id)
    : await supabase.from("routine_steps").insert(row);
  if (needSql(error)) return { error: NEED };
  if (error) return { error: error.message };
  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: null };
}

export async function deleteStep(id) {
  if (!id) return { error: null };
  const supabase = createClient();

  /**
   * **이 단계에 서 있는 학생을 먼저 다음 단계로 옮긴다** (0120).
   *
   * 학생은 단계의 id 를 기억하므로(중간 수정에 안전하려고 그렇게 했다),
   * 그 단계가 지워지면 가리킬 곳이 사라진다. 지우기 전에 sort 상 다음
   * 단계로 옮겨준다 — 다음이 없으면 처음으로 (루틴은 돌기 때문이다).
   *
   * **과거 기록은 안 건드린다** — 그날 무엇을 했는지는 리포트에 이미
   * 박제되어 있다. 여기서 옮기는 것은 「다음 수업에 뭘 할까」 뿐이다.
   */
  const { data: gone } = await supabase
    .from("routine_steps")
    .select("id, textbook_id, sort")
    .eq("id", id)
    .maybeSingle();
  if (gone) {
    const { data: list } = await supabase
      .from("routine_steps")
      .select("id, sort")
      .eq("textbook_id", gone.textbook_id)
      .order("sort", { ascending: true });
    const rest = (list || []).filter((x) => x.id !== id);
    const next =
      rest.find((x) => x.sort > gone.sort) || rest[0] || null;   // 다음 → 없으면 처음
    const move = await supabase
      .from("student_textbooks")
      .update({ routine_step_id: next?.id || null })
      .eq("textbook_id", gone.textbook_id)
      .eq("routine_step_id", id);
    // 0120 전이면 칸이 없다 — 옮길 것도 없으니 조용히 지나간다
    if (move.error && move.error.code !== "42703" && move.error.code !== "PGRST204") {
      return { error: move.error.message };
    }
  }

  const { error } = await supabase.from("routine_steps").delete().eq("id", id);
  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

/**
 * **본보기 루틴 넣기** (원장님, 2026-08-11 — 「학습항목이랑 루틴설계해야
 * 하는데 엄두가 안나」).
 *
 * 빈 화면에서 마흔여섯 개 항목을 골라 순서를 짜는 것이 엄두가 안 나는
 * 일이다. 영역에 맞는 순서를 **넣어드리고 고치시게** 한다.
 *
 * **이미 루틴이 있으면 넣지 않는다** — 손으로 짜두신 것을 덮으면
 * 되돌릴 길이 없다. 지우고 다시 넣으시는 것은 원장님 손에 둔다.
 *
 * 학습 항목을 이름으로 잇는다. 없는 이름은 **버리지 않고 알려준다** —
 * 「기본 학습 목록」 을 아직 안 넣으셨을 수 있다.
 */
export async function seedRoutine(textbookId) {
  if (!textbookId) return { error: "교재가 없어요." };
  const supabase = createClient();

  const { data: book, error: bErr } = await supabase
    .from("textbooks").select("id, name, area").eq("id", textbookId).maybeSingle();
  if (bErr) return { error: bErr.message };
  if (!book) return { error: "교재를 못 찾았어요." };

  const steps = templateFor(book.area);
  if (!steps) {
    return {
      error:
        `「${book.area || "영역 없음"}」 는 본보기가 아직 없어요. `
        + `교재의 영역을 ${TEMPLATE_AREAS.join(" · ")} 중 하나로 정해주시면 넣어드립니다.`,
    };
  }

  const { data: had } = await supabase
    .from("routine_steps").select("id").eq("textbook_id", textbookId).limit(1);
  if ((had || []).length > 0) {
    return { error: "이미 루틴이 있어요. 지우고 다시 넣으시거나, 있는 것을 고쳐주세요." };
  }

  const { data: items, error: iErr } = await supabase
    .from("homework_items").select("id, name").eq("active", true);
  if (iErr) return { error: iErr.message };

  const { rows, missing } = buildSteps(steps, items || []);
  /**
   * **하나도 못 이었으면 넣지 않는다** (2026-08-11, 검사판에서 걸렸다).
   * 빈 단계 세 줄이 들어가고 본보기 단추는 사라져서, 원장님은 쓸모없는
   * 줄을 손으로 지우는 것부터 하셔야 했다 — 도우려다 일을 늘린 꼴이다.
   * 「기본 학습 목록」 을 아직 안 넣으셨을 때 그렇게 된다.
   */
  const filled = rows.filter((r) => r.inclass_items.length + r.home_items.length > 0);
  if (filled.length === 0) {
    return {
      error:
        "학습 항목이 아직 없어서 넣을 수가 없어요.\n\n"
        + "숙제 → 학습 항목 → 「노션 기본숙제 가져오기」 를 먼저 누르신 뒤에 다시 해주세요.",
    };
  }

  const { error } = await supabase
    .from("routine_steps")
    .insert(filled.map((r) => ({ ...r, textbook_id: textbookId })));
  if (needSql(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/textbooks");
  revalidatePath("/today");
  return { error: null, added: filled.length, area: book.area, missing };
}
