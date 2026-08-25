"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todaySeoul } from "@/lib/day";
import { resolveStudent } from "@/lib/actAs";
import { pushToStaff } from "@/app/push/actions";

/**
 * **배정된 단원평가의 결과를 아이가 낸다** (0106).
 *
 * 원장님 (2026-08-07) — 「숙제에서 단원평가를 내가 미리 배정 함.
 * 다음 시간에 등원 해서 학생이 결과만 제출 함」
 *
 * ── 아이가 정하지 않는 것 ─────────────────────────────────
 *
 * **단원 이름** — 배정에 붙어 있다. 적게 하면 아이마다 다르게 적어서 같은
 * 단원이 여러 이름으로 쌓이고, 그러면 「관계사에서 세 번 막혔다」 를 셀 수가
 * 없다 (대시보드의 「단원평가에 막힘」 이 그것을 센다).
 *
 * **통과 여부** — 선생님이 정하신 통과선으로 여기서 판단한다. 아이가
 * 「통과했어요」 를 고르게 하면 그건 기록이 아니라 주장이 된다.
 *
 * 점수는 **100점 만점으로 환산**해서 넣는다 — 노션에서 옮겨온 옛 줄도,
 * 수업 중에 선생님이 넣으신 줄도 그렇게 되어 있어서 나란히 놓고 봐야 한다.
 */
export async function submitUnitTest(input) {
  const { reportItemId, itemId, term, correct, total, asId } = input || {};
  const supabase = await createClient();
  const { studentId: sid } = await resolveStudent(supabase, asId);
  if (!sid) return { error: "학생 계정으로 로그인해주세요." };

  const c = Number(correct);
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return { error: "전체 문항 수를 적어주세요." };
  if (!Number.isFinite(c) || c < 0) return { error: "맞은 개수를 적어주세요." };
  if (c > t) return { error: `맞은 개수가 전체보다 많아요 (${c} / ${t}).` };

  const name = (term || "").toString().trim() || "단원평가";
  const today = todaySeoul();

  // 통과선 — 학생마다 따로 정해둔 것이 있으면 그것, 없으면 설정의 기본값
  const [{ data: me }, { data: cfg }] = await Promise.all([
    supabase.from("students").select("name, word_cut_pct").eq("id", sid).maybeSingle(),
    supabase.from("integrations").select("config").eq("id", "warning").maybeSingle(),
  ]);
  const cut = Number(me?.word_cut_pct) > 0
    ? Number(me.word_cut_pct)
    : Number(cfg?.config?.wordPassPct) || 90;

  const pct = Math.round((c / t) * 100);
  const passed = pct >= cut;

  const row = {
    student_id: sid,
    kind: "unit",
    term: name,
    taken_on: today,
    raw_score: pct,
    full_score: 100,
    note: `${passed ? "통과" : "재시험"} · ${t}문제 중 ${t - c}개 틀림`,
    source: "form",
  };

  /**
   * **두 번 내도 한 줄이다.** 아이는 잘못 냈다고 생각하면 또 낸다.
   * 다만 선생님이 이미 매겨두신 줄(source 가 form 이 아닌 것)은 안 건드린다 —
   * 아이가 나중에 낸 것으로 선생님 기록이 덮이면 안 된다.
   */
  const { data: have } = await supabase
    .from("scores")
    .select("id, source")
    .eq("student_id", sid)
    .eq("kind", "unit")
    .eq("term", name)
    .eq("taken_on", today)
    .maybeSingle();

  let error = null;
  if (have?.id && have.source !== "form") {
    return { error: null, note: "선생님이 이미 채점해두셨어요. 그대로 두었습니다." };
  } else if (have?.id) {
    ({ error } = await supabase.from("scores").update(row).eq("id", have.id));
  } else {
    ({ error } = await supabase.from("scores").insert(row));
  }
  if (error) return { error: error.message };

  // 낸 것으로 숙제도 끝난 것으로 표시한다 (따로 「다 했어요」 를 또 누르게 하면
  // 하나는 빠뜨린다)
  if (reportItemId) {
    await supabase
      .from("daily_report_items")
      .update({ student_done_at: new Date().toISOString() })
      .eq("id", reportItemId);
  }

  // **재시험이면 알린다.** 통과한 것까지 울리면 하루에 열 번이 된다
  if (!passed) {
    try {
      await pushToStaff({
        title: `📕 단원평가 재시험 — ${me?.name || "학생"}`,
        body: `${name} · ${pct}점 (${t}문제 중 ${t - c}개 틀림)`,
        url: "/today",
        tag: "unittest",
      });
    } catch { /* 알림이 안 가도 기록은 남았다 */ }
  }

  revalidatePath("/me");
  revalidatePath("/today");
  revalidatePath("/scores");
  return {
    error: null,
    note: passed
      ? `${pct}점 — 통과했어요. 잘했어요!`
      : `${pct}점 — 통과선(${cut}점)에 못 미쳐서 재시험이에요. 선생님이 확인하십니다.`,
  };
}
