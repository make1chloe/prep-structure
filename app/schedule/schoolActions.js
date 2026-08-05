"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 학교 표 — **한 곳에 모인 학교 명단** (0076).
 *
 * 예전에는 학교 이름이 글자로 세 군데에 흩어져 있었다. 「신송중」과
 * 「신송중학교」가 다른 학교가 되면 재원생과 시험 일정이 안 이어진다.
 * 이제는 학교가 한 줄이고, 학생·시험이 그 줄을 가리킨다.
 */

function ok(error) {
  return { error: error ? error.message : null };
}

async function requireStaff(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["principal", "instructor", "assistant"].includes(p?.role)) {
    return { error: "선생님만 쓸 수 있어요." };
  }
  return { error: null };
}

function needSql(error) {
  return error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "42703");
}
const SQL = "0076 SQL 을 먼저 실행해주세요.";

/** 학교 명단 — 학생 수 · 시험 수까지 세어 준다 */
export async function listAllSchools() {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return { rows: [], error: guard.error };

  const { data: schools, error } = await supabase
    .from("schools")
    .select("id, name, kind, atpt_code, schul_code, active")
    .order("name", { ascending: true });
  if (needSql(error)) return { rows: [], error: SQL };
  if (error) return { rows: [], error: error.message };

  const [{ data: stu }, { data: ex }] = await Promise.all([
    supabase.from("students").select("school_id").eq("status", "enrolled"),
    supabase.from("exam_periods").select("school_id"),
  ]);
  const nStu = {};
  (stu || []).forEach((s) => { if (s.school_id) nStu[s.school_id] = (nStu[s.school_id] || 0) + 1; });
  const nEx = {};
  (ex || []).forEach((e) => { if (e.school_id) nEx[e.school_id] = (nEx[e.school_id] || 0) + 1; });

  return {
    rows: (schools || []).map((s) => ({
      ...s,
      students: nStu[s.id] || 0,
      exams: nEx[s.id] || 0,
      linked: !!s.schul_code,
    })),
    error: null,
  };
}

/**
 * 학교 이름을 고친다.
 *
 * 그 학교를 가리키는 **학생과 시험이 저절로 따라온다** (0076 의 방아쇠).
 * 예전에는 학생 목록에서 한 명씩 고쳐야 했고, 시험 쪽은 잊어버리기 쉬웠다.
 */
export async function renameSchool(id, name) {
  const n = (name || "").trim();
  if (!id || !n) return { error: "학교 이름을 적어주세요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const { error } = await supabase.from("schools").update({ name: n }).eq("id", id);
  if (error?.code === "23505") {
    return { error: `「${n}」 는 이미 있는 학교예요. 합치시려면 「합치기」 를 쓰세요.` };
  }
  if (needSql(error)) return { error: SQL };
  revalidatePath("/schedule");
  revalidatePath("/students");
  return ok(error);
}

/**
 * 학교 둘을 **하나로 합친다.**
 *
 * 학생과 시험이 남길 학교로 옮겨가고, 없앨 학교만 지워진다.
 * 이름은 옛 이름을 **별칭으로 남긴다** — 나중에 엑셀에 옛 이름이 적혀 있어도
 * 같은 학교로 알아볼 수 있어야 한다.
 */
export async function mergeSchools(keepId, dropId) {
  if (!keepId || !dropId || keepId === dropId) return { error: null };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const { data: drop } = await supabase
    .from("schools").select("id, name, aliases").eq("id", dropId).maybeSingle();
  if (!drop) return { error: "없앨 학교를 못 찾았어요." };

  // 학생·시험을 먼저 옮긴다. 방아쇠가 school 글자 칸도 같이 고쳐준다.
  //
  // **몇 개를 옮겼는지 세어서 돌려준다.** 예전에는 아무것도 안 돌려줘서,
  // 실패해도 성공해도 화면이 똑같아 보였다 — 「눌러도 아무 일이 없다」 가 그것이다.
  const moved = {};
  for (const t of ["students", "exam_periods"]) {
    const { data, error } = await supabase
      .from(t).update({ school_id: keepId }).eq("school_id", dropId).select("id");
    if (error) return { error: `${t} 를 옮기지 못했어요: ${error.message}` };
    moved[t] = (data || []).length;
  }

  const { data: keep } = await supabase
    .from("schools").select("aliases").eq("id", keepId).maybeSingle();
  const aliases = [...new Set([...(keep?.aliases || []), ...(drop.aliases || []), drop.name])];
  await supabase.from("schools").update({ aliases }).eq("id", keepId);

  // 지운 줄을 **되돌려받아서** 진짜 지워졌는지 본다. RLS 에 막히면 오류 없이
  // 0줄이 지워진다 — 그게 「눌러도 그대로」 의 가장 흔한 모습이다.
  const { data: gone, error } = await supabase
    .from("schools").delete().eq("id", dropId).select("id");
  if (error) return { error: `학교를 지우지 못했어요: ${error.message}` };
  if (!gone || gone.length === 0) {
    return {
      error:
        `「${drop.name}」 를 지우지 못했어요 (막혔습니다). ` +
        `학생 ${moved.students || 0}명 · 시험 ${moved.exam_periods || 0}건은 옮겼습니다. ` +
        `새로고침 뒤 다시 눌러보시고, 그래도 그대로면 알려주세요.`,
    };
  }

  revalidatePath("/schedule");
  revalidatePath("/schools");
  revalidatePath("/students");
  revalidatePath("/prep");
  return {
    error: null,
    students: moved.students || 0,
    exams: moved.exam_periods || 0,
    name: drop.name,
  };
}

/** 학교를 손으로 넣는다 — 나이스에 없는 학교도 있다 (전학 오기 전 학교) */
export async function addSchoolByName(name) {
  const n = (name || "").trim();
  if (!n) return { error: "학교 이름을 적어주세요." };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const { error } = await supabase.from("schools").insert({ name: n });
  if (error?.code === "23505") return { error: `「${n}」 는 이미 있어요.` };
  if (needSql(error)) return { error: SQL };
  revalidatePath("/schedule");
  return ok(error);
}
