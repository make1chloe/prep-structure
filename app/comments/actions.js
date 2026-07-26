"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function unavailable(error) {
  // 0023 SQL 전이면 테이블이 없다
  return error && (error.code === "42P01" || /report_comments/.test(error.message || ""));
}

/** 한 리포트의 댓글 */
export async function listComments(reportId) {
  if (!reportId) return { comments: [], ready: true };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("report_comments")
    .select("id, body, author_id, author_role, read_at, created_at")
    .eq("daily_report_id", reportId)
    .order("created_at", { ascending: true });
  if (unavailable(error)) return { comments: [], ready: false };
  if (error) return { comments: [], ready: true, error: error.message };

  // 이름은 따로 붙인다 (profiles 는 학생도 자기 것만 읽을 수 있어서 조인하면 비어 보인다)
  const ids = [...new Set((data || []).map((c) => c.author_id).filter(Boolean))];
  const names = new Map();
  if (ids.length > 0) {
    const { data: ps } = await supabase.from("profiles").select("id, name").in("id", ids);
    (ps || []).forEach((p) => names.set(p.id, p.name));
  }
  return {
    ready: true,
    comments: (data || []).map((c) => ({ ...c, author_name: names.get(c.author_id) || null })),
  };
}

/** 댓글 쓰기 — 누가 쓰는지는 서버에서 정한다 (역할을 위조할 수 없게) */
export async function addComment(reportId, studentId, body) {
  const text = (body || "").trim();
  if (!reportId || !studentId) return { error: "어느 리포트인지 알 수 없어요." };
  if (!text) return { error: "내용을 적어주세요." };
  if (text.length > 2000) return { error: "너무 깁니다. 2000자 안으로 적어주세요." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요해요." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role;
  const author_role =
    role === "student" ? "student" : role === "parent" ? "parent" : "staff";

  const { error } = await supabase.from("report_comments").insert({
    daily_report_id: reportId,
    student_id: studentId,
    author_id: user.id,
    author_role,
    body: text,
    // 선생님이 쓴 것은 읽은 것으로 본다 (안 읽은 댓글 세기에 안 걸리도록)
    read_at: author_role === "staff" ? new Date().toISOString() : null,
  });
  if (unavailable(error)) {
    return { error: "댓글을 쓰려면 Supabase에서 0023 SQL을 먼저 실행해주세요." };
  }
  if (error) return { error: error.message };

  revalidatePath("/me");
  revalidatePath("/today");
  revalidatePath("/");
  return { error: null };
}

export async function deleteComment(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("report_comments").delete().eq("id", id);
  revalidatePath("/me");
  revalidatePath("/today");
  return { error: error ? error.message : null };
}

/** 선생님이 읽음 처리 */
export async function markRead(reportId) {
  if (!reportId) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("report_comments")
    .update({ read_at: new Date().toISOString() })
    .eq("daily_report_id", reportId)
    .is("read_at", null);
  if (unavailable(error)) return { error: null };
  revalidatePath("/today");
  revalidatePath("/");
  return { error: error ? error.message : null };
}
