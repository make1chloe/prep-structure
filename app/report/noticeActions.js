"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { deliver } from "@/lib/send";

function ok(error) {
  return { error: error ? error.message : null };
}

// ---------- 템플릿 ----------
export async function listTemplates() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("id, name, kind, body, sort, active, key")
    .eq("active", true)
    .order("sort", { ascending: true });
  if (error) {
    // 0029 전이면 key 없이
    const fb = await supabase
      .from("message_templates")
      .select("id, name, kind, body, sort, active")
      .eq("active", true)
      .order("sort", { ascending: true });
    if (fb.error) return { templates: [], error: "0017 SQL을 먼저 실행해주세요." };
    return { templates: fb.data || [], error: null };
  }
  return { templates: data || [], error: null };
}

export async function saveTemplate(id, patch) {
  const supabase = createClient();
  if (id) {
    const { error } = await supabase
      .from("message_templates")
      .update({
        name: (patch.name || "").trim(),
        body: (patch.body || "").trim(),
        kind: patch.kind || "general",
      })
      .eq("id", id);
    revalidatePath("/report");
    return ok(error);
  }
  const { error } = await supabase.from("message_templates").insert({
    name: (patch.name || "새 문자").trim(),
    body: (patch.body || "").trim(),
    kind: patch.kind || "general",
    sort: 100,
  });
  revalidatePath("/report");
  return ok(error);
}

export async function deleteTemplate(id) {
  if (!id) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("message_templates").update({ active: false }).eq("id", id);
  revalidatePath("/report");
  return ok(error);
}

// ---------- 받는 사람 ----------
/**
 * 재원생 + 상담자(레벨테스트 대상)를 함께 내려준다.
 * 교재 구매 안내에 쓸 교재 목록·교재비·구매링크도 학생별로 채워둔다. (원칙1)
 */
export async function listRecipients() {
  const supabase = createClient();

  const { data: students } = await supabase
    .from("students")
    .select("id, name, school, grade, parent_phone, status")
    .eq("status", "enrolled")
    .order("name", { ascending: true });

  // 학생별 배정 교재 → 이름·가격·구매링크
  const { data: st } = await supabase
    .from("student_textbooks")
    .select("student_id, textbook_id, status");
  const bookIds = [...new Set((st || []).map((x) => x.textbook_id))];
  const { data: books } = bookIds.length
    ? await supabase.from("textbooks").select("id, name, price, purchase_url").in("id", bookIds)
    : { data: [] };
  const bookById = new Map((books || []).map((b) => [b.id, b]));

  const booksOf = new Map();
  (st || []).forEach((x) => {
    if (x.status === "dropped") return;
    const b = bookById.get(x.textbook_id);
    if (!b) return;
    if (!booksOf.has(x.student_id)) booksOf.set(x.student_id, []);
    booksOf.get(x.student_id).push(b);
  });

  const studentRows = (students || []).map((s) => {
    const list = booksOf.get(s.id) || [];
    return {
      id: `s:${s.id}`,
      kind: "student",
      name: s.name,
      who: [s.school, s.grade].filter(Boolean).join(" "),
      phone: s.parent_phone || "",
      books: list.map((b) => b.name),
      bookPrice: list.reduce((a, b) => a + (b.price || 0), 0),
      bookUrls: list.map((b) => b.purchase_url).filter(Boolean),
      testResult: "",
    };
  });

  // 상담자 (레벨테스트 안내 대상)
  const { data: inq, error: inqErr } = await supabase
    .from("inquiries")
    .select("id, name, school, grade, phone, test_on, test_result, test_note, status")
    .not("status", "in", '("enrolled","declined")')
    .order("created_at", { ascending: false });

  const inquiryRows = (inq || []).map((q) => ({
    id: `q:${q.id}`,
    kind: "inquiry",
    name: q.name,
    who: [q.school, q.grade].filter(Boolean).join(" "),
    phone: q.phone || "",
    books: [],
    bookPrice: 0,
    bookUrls: [],
    testOn: q.test_on || "",
    testResult: [q.test_result, q.test_note].filter(Boolean).join(" · "),
  }));

  return {
    students: studentRows,
    inquiries: inquiryRows,
    error: inqErr ? "0017 SQL을 먼저 실행해주세요." : null,
  };
}

// ---------- 발송 ----------
/**
 * 안내 문자 보내기 — 데일리리포트와 달리 리포트에 묶이지 않는다.
 * @param items [{ id, name, phone, body }]
 */
export async function sendNotices(items, label) {
  const list = Array.isArray(items) ? items.filter((x) => x?.body) : [];
  if (list.length === 0) return { error: null, count: 0 };

  const supabase = createClient();
  const settings = await loadSettings(supabase);

  const sendable = list.filter((x) => x.phone);
  const { channel, results } = await deliver(
    settings,
    sendable.map((x) => ({ to: x.phone, text: x.body, ref: x.id })),
    { kind: label || "notice" }
  );
  const byRef = new Map(results.map((r) => [r.ref, r]));
  list.forEach((x) => {
    if (!x.phone) byRef.set(x.id, { ref: x.id, ok: false, detail: "번호 없음" });
  });

  const failed = list.filter((x) => !byRef.get(x.id)?.ok);
  return {
    error: null,
    channel,
    count: list.length - failed.length,
    failed: failed.map((x) => ({ name: x.name, detail: byRef.get(x.id)?.detail || "발송 실패" })),
  };
}
