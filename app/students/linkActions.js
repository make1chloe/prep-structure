"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { noTable } from "@/lib/sqlError";

/**
 * 학생 계정 연결 코드.
 *
 * 학생 계정을 원장님이 대신 만들어 주려면 Supabase 관리자 키가 있어야 하고,
 * 그 키는 앱에 두면 안 된다. 그래서 반대로 간다 —
 * 학생이 스스로 가입하고, 원장님이 준 코드로 자기 계정을 학생에 붙인다.
 *
 * 코드는 6자리, 하루짜리, 한 번 쓰면 죽는다.
 * 헷갈리는 글자(0/O, 1/I)는 빼고 만든다 — 아이들이 받아 적는다.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** 이 학생의 연결 코드를 새로 뽑는다 (이전 코드는 못 쓰게 된다) */
export async function makeLinkCode(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();

  // 아직 안 쓴 옛 코드는 만료시킨다 — 살아 있는 코드가 둘이면 헷갈린다
  await supabase
    .from("student_link_codes")
    .update({ expires_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .is("used_at", null);

  const code = newCode();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("student_link_codes")
    .insert({ code, student_id: studentId, expires_at: expires });
  if (noTable(error)) return { error: "0043 SQL 을 먼저 실행해주세요." };
  if (error) return { error: error.message };

  revalidatePath("/students");
  return { error: null, code, expires };
}

/** 연결을 끊는다 (계정을 잘못 붙였을 때) */
export async function unlinkStudent(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ profile_id: null })
    .eq("id", studentId);
  revalidatePath("/students");
  return { error: error ? error.message : null };
}

/** 지금 살아 있는 코드 + 연결 상태 */
export async function linkStatus(studentId) {
  if (!studentId) return { error: "학생이 없어요." };
  const supabase = await createClient();

  const { data: s } = await supabase
    .from("students")
    .select("profile_id")
    .eq("id", studentId)
    .maybeSingle();

  const { data: rows, error } = await supabase
    .from("student_link_codes")
    .select("code, expires_at, used_at")
    .eq("student_id", studentId)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (noTable(error)) return { error: "0043 SQL 을 먼저 실행해주세요." };

  return { error: null, linked: !!s?.profile_id, code: rows?.[0] || null };
}
