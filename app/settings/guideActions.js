"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 수업 가이드 링크 (0089).
 *
 * 원장님 (2026-08-06) — 「수업 가이드 링크를 설정에서 넣고 학생 화면에 띄워줘」
 *
 * 카톡으로 보내던 링크(단어 외우는 법 영상 · 수업 규칙 · 교재 사는 곳)를
 * 앱에 붙여둔다. 카톡은 하루 만에 밀려 올라가고, 새로 온 아이에게는 아예 안 간다.
 */

const NEED = "0089 SQL 을 먼저 실행해주세요.";

function missing(error) {
  // 표가 없거나 칸이 없을 때 — 「알 수 없는 오류」 대신 무엇을 하면 되는지 말한다
  return error && ["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code);
}

async function requireStaff(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };
  const { data: p } = await supabase
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["principal", "instructor"].includes(p?.role)) {
    return { error: "선생님 계정에서만 바꿀 수 있어요." };
  }
  return { error: null, user };
}

/**
 * 주소를 사람이 적은 대로 받아준다.
 *
 * 「youtube.com/watch?v=…」 처럼 http 를 빼고 적으시는 일이 흔하다. 그대로
 * 두면 링크가 **우리 앱 안 주소**로 잡혀서 눌러도 아무 데도 안 간다
 * (/settings/youtube.com/... 이 된다). 그래서 앞에 https:// 를 붙여준다.
 */
function tidyUrl(v) {
  const s = (v || "").toString().trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  // mailto:·tel: 같은 것은 건드리지 않는다
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  return `https://${s}`;
}

/** 선생님 화면에서 관리할 목록 — 꺼둔 것도 함께 온다 */
export async function listGuides() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("class_guides")
    .select("id, title, url, note, sort, active")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  if (missing(error)) return { rows: [], error: NEED };
  if (error) return { rows: [], error: error.message };
  return { rows: data || [], error: null };
}

export async function saveGuide(id, patch = {}) {
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const title = (patch.title || "").trim();
  const url = tidyUrl(patch.url);
  if (!title) return { error: "무엇에 대한 안내인지 이름을 적어주세요." };
  if (!url) return { error: "주소를 적어주세요." };

  const row = {
    title,
    url,
    note: (patch.note || "").trim() || null,
    sort: Number.isFinite(Number(patch.sort)) ? Number(patch.sort) : 100,
    active: patch.active === undefined ? true : !!patch.active,
    updated_at: new Date().toISOString(),
  };

  const { error } = id
    ? await supabase.from("class_guides").update(row).eq("id", id)
    : await supabase.from("class_guides").insert({ ...row, created_by: guard.user.id });
  if (missing(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/me");
  revalidatePath("/parent");
  return { error: null };
}

/**
 * 지운다 — **정말 지운다.**
 *
 * 문자 문구는 지우지 않고 감추기만 한다 (지난 발송 기록이 그 문구를 가리키기
 * 때문이다). 링크는 가리키는 것이 없어서 남겨둘 이유가 없다. 대신 잠깐 내리고
 * 싶을 때를 위해 「꺼두기」 를 따로 둔다 (active).
 */
export async function deleteGuide(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const guard = await requireStaff(supabase);
  if (guard.error) return guard;

  const { error } = await supabase.from("class_guides").delete().eq("id", id);
  if (missing(error)) return { error: NEED };
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/me");
  revalidatePath("/parent");
  return { error: null };
}
