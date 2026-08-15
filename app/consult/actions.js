"use server";

import { revalidatePath } from "next/cache";
import { autoCreateLogins } from "@/app/students/accountActions";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { deliver } from "@/lib/send";
import { fill, guideVars, linkVars, FALLBACK } from "@/lib/inquirySms";
import { searchSchools, addSchool, importSchedule } from "@/app/schedule/neisActions";
import { addSchoolByName } from "@/app/schedule/schoolActions";
import { sameSchool } from "@/lib/who";
import { schoolYear } from "@/lib/neis";
import { todaySeoul } from "@/lib/day";
import { sessionUser } from "@/lib/session";

function ok(error) {
  return { error: error ? error.message : null };
}
function clean(fd, key) {
  const v = (fd.get(key) || "").toString().trim();
  return v || null;
}

// 양식 링크용 토큰
function makeToken() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

// 전화로 받은 건에 양식 링크를 만들어 준다 (엄마가 채워 넣도록)
export async function ensureFormLink(id) {
  if (!id) return { error: "id 없음" };
  const supabase = createClient();
  const { data } = await supabase.from("inquiries").select("token").eq("id", id).maybeSingle();
  if (data?.token) return { error: null, token: data.token };
  const token = makeToken();
  const { error } = await supabase.from("inquiries").update({ token }).eq("id", id);
  if (error) return { error: "0018 SQL을 먼저 실행해주세요." };
  /**
   * **여기서 화면을 다시 그리지 않는다** (2026-08-07).
   *
   * 토큰은 화면 어디에도 안 나온다 — 다시 그릴 이유가 없다. 그런데 다시
   * 그리면 **판이 새로 서면서 방금 띄운 글이 사라진다.** 실제로 그랬다:
   * 「① 설문지 링크」 를 누르면 문자 글이 잠깐 떴다가 없어져서, 눌러도
   * 아무 일이 안 일어난 것처럼 보였다 (크롬 검사에서 잡혔다).
   *
   * 부르는 쪽이 필요하면 그쪽에서 다시 그린다.
   */
  return { error: null, token };
}

export async function addInquiry(formData) {
  const name = (formData.get("name") || "").toString().trim();
  if (!name) return;

  const supabase = createClient();
  const user = await sessionUser(supabase);

  await supabase.from("inquiries").insert({
    name,
    phone: clean(formData, "phone"),
    student_phone: clean(formData, "student_phone"),
    school: clean(formData, "school"),
    grade: clean(formData, "grade"),
    source: clean(formData, "source"),
    want_time: clean(formData, "want_time"),
    consult_on: clean(formData, "consult_on"),
    consult_at: clean(formData, "consult_at"),
    memo: clean(formData, "memo"),
    status: clean(formData, "consult_on") ? "scheduled" : "new",
    created_by: user?.id || null,
  });
  revalidatePath("/consult");
}

export async function updateInquiry(id, patch) {
  if (!id) return { error: "id 없음" };
  const row = { updated_at: new Date().toISOString() };
  [
    "name", "phone", "student_phone", "school", "grade", "source", "status",
    "consult_on", "consult_at", "test_on", "test_at", "test_result", "test_note",
    "want_time", "memo",
  ].forEach((k) => {
    if (k in (patch || {})) row[k] = (patch[k] ?? "").toString().trim() || null;
  });
  if ("class_id" in (patch || {})) row.class_id = patch.class_id || null;

  const supabase = createClient();
  const { error } = await supabase.from("inquiries").update(row).eq("id", id);
  revalidatePath("/consult");
  revalidatePath("/report");
  return ok(error);
}

export async function setInquiryStatus(ids, status) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0 || !status) return { error: null };
  const supabase = createClient();
  const { error } = await supabase
    .from("inquiries")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", list);
  revalidatePath("/consult");
  return ok(error);
}

/**
 * **상담 학생의 교재** (원장님, 2026-08-15 — 「신규 상담 정보에 교재 배정이
 * 없음. 아직 등록 안 해도」). 등록 전에 교재를 골라두면 등록하는 순간
 * 배정으로 이어진다 (convertToStudent). 교재 안내를 보낼 때도 여기 적힌다.
 */
export async function setInquiryBooks(id, bookIds) {
  if (!id) return { error: "상담을 찾지 못했어요." };
  const ids = [...new Set((bookIds || []).filter(Boolean))];
  const supabase = createClient();
  const { error } = await supabase
    .from("inquiries")
    .update({ book_ids: ids, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    return { error: "0122 SQL 을 먼저 실행해주세요 (관리자 → 설정 → SQL)." };
  }
  revalidatePath("/consult");
  return ok(error);
}

export async function deleteInquiries(ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length === 0) return { error: null };
  const supabase = createClient();
  const { error } = await supabase.from("inquiries").delete().in("id", list);
  revalidatePath("/consult");
  return ok(error);
}

/**
 * 등록 전환 — 상담 정보를 그대로 학생으로 만든다. (원칙1: 이름·연락처를 다시 안 적는다)
 * 반을 골랐으면 그 반에도 배정하고, 반 교재를 학생에게 깔아준다.
 */
export async function convertToStudent(id, classId) {
  if (!id) return { error: "id 없음" };
  const supabase = createClient();

  const { data: q, error: qErr } = await supabase
    .from("inquiries")
    .select("*")
    .eq("id", id)
    .single();
  if (qErr) return { error: qErr.message };
  if (q.student_id) return { error: "이미 등록된 상담이에요." };

  const { data: student, error: sErr } = await supabase
    .from("students")
    .insert({
      name: q.name,
      school: q.school,
      grade: q.grade,
      parent_phone: q.phone,
      student_phone: q.student_phone,
      note: [q.source && `유입: ${q.source}`, q.memo, q.test_note]
        .filter(Boolean)
        .join("\n"),
      status: "enrolled",
      // 등원 시작일 — 신입생 할일(todo/routineActions)과 목록 정렬이 이 칸을 본다.
      // started_on 은 수강료 일할이 보는 칸 (값-지도 P0-2) — 같이 채운다
      enrolled_on: todaySeoul(),
      started_on: todaySeoul(),
    })
    .select("id")
    .single();
  if (sErr) return { error: sErr.message };

  const cid = classId || q.class_id;
  if (cid) {
    await supabase
      .from("class_students")
      .upsert(
        { class_id: cid, student_id: student.id },
        { onConflict: "class_id,student_id", ignoreDuplicates: true }
      );
    // 교재는 반이 아니라 **학생마다** 붙인다. 재원생 목록에서 그 학생에게 직접 넣는다.
  }

  /**
   * 상담 때 골라둔 교재 → 그대로 배정 (0122, 원칙 1 — 상담에 적은 것을
   * 재원생에서 또 안 고르게). 시작일은 등록한 오늘.
   */
  if ((q.book_ids || []).length > 0) {
    const rows = [...new Set(q.book_ids)].map((bid) => ({
      student_id: student.id, textbook_id: bid,
      status: "active", assigned_on: todaySeoul(), ended_on: null,
    }));
    let { error: bErr } = await supabase.from("student_textbooks").insert(rows);
    if (bErr && (bErr.code === "42703" || bErr.code === "PGRST204")) {
      await supabase.from("student_textbooks")
        .insert(rows.map(({ ended_on: _e, ...r }) => r));
    }
  }

  const { error } = await supabase
    .from("inquiries")
    .update({
      status: "enrolled",
      student_id: student.id,
      class_id: cid || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // **등록까지 와야 학사일정에 붙인다** (아래 attachSchool 의 설명)
  const school = await attachSchool(supabase, q.school).catch(() => null);

  /**
   * **로그인 계정도 같이** (전수검사 A1, 2026-08-15). 직접 등록·엑셀에는
   * 있는데 이 길에만 없어서, 상담으로 들어온 아이는 계정이 영영 없었다 —
   * addStudent 의 「나중에 하기로 하면 그 나중이 안 온다」 가 그대로 적용된다.
   * 실패해도 등록은 그대로다.
   */
  try { await autoCreateLogins([student.id]); } catch { /* 계정은 재원생에서 다시 */ }

  revalidatePath("/consult");
  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/schedule");
  return { error: error ? error.message : null, studentId: student.id, school };
}

/**
 * **등록한 아이의 학교를 학사일정에 붙인다** (원장님, 2026-08-09 —
 * 「설문지 제출 후 등록까지 해야 학사일정에 반영되게 해줘」).
 *
 * ── 왜 등록 때인가 ─────────────────────────────────────
 *
 * 설문지는 **아직 우리 아이가 아니다.** 상담만 하고 안 오시는 분도 있고,
 * 장난으로 넣는 경우도 있다. 설문지가 들어올 때마다 그 학교를 받아오면
 * 학사일정이 안 다니는 학교로 불어나고, 나이스 부르는 횟수도 하루 한도가
 * 있다. 반대로 **등록했는데 학교가 없으면** 그 아이만 시험 일정도 없고
 * 시험범위도 없고 전날 등원도 없다 — 조용히 빠진다.
 *
 * 그래서 딱 등록하는 순간에 붙인다.
 *
 * ── 못 해도 등록은 된다 ────────────────────────────────
 *
 * 나이스가 안 되거나 열쇠가 없어도 **아이 등록은 이미 끝나 있다.** 여기서
 * 터져도 되돌리지 않는다 — 학교를 못 붙인 것보다 등록이 안 된 것이 훨씬
 * 나쁘다. 무슨 일이 있었는지만 돌려준다.
 *
 * @returns { added, name, note } | null
 */
export async function attachSchool(supabase, name) {
  const want = (name || "").trim();
  if (!want) return null;

  // 이미 있나 — 「신정중」 과 「인천신정중학교」 를 같은 곳으로 본다 (lib/who)
  const { data: had } = await supabase.from("schools").select("id, name, schul_code");
  const hit = (had || []).find((r) => sameSchool(r.name, want));
  if (hit) {
    // 이름은 있는데 나이스 코드가 없으면 학사일정이 안 돈다 — 그건 알려야 한다
    if (!hit.schul_code) {
      return { added: false, name: hit.name, note: "학사일정을 받아오려면 학교 화면에서 나이스와 이어주세요." };
    }
    return { added: false, name: hit.name };
  }

  const found = await searchSchools(want);
  const rows = found.rows || [];

  /**
   * **하나로 딱 떨어질 때만 자동으로 넣는다.**
   *
   * 「신정중」 으로 찾으면 인천·서울·부천이 같이 나온다. 그중 하나를 앱이
   * 골라 넣으면 **다른 학교의 시험 일정**이 그 아이에게 붙는다. 그건 학교가
   * 아예 없는 것보다 나쁘다 — 없으면 비어 보이지만, 틀린 것은 맞는 줄 안다.
   */
  if (rows.length !== 1) {
    // 이름만이라도 남겨둔다. 재원생 목록·시험 회차가 이 이름으로 이어진다
    await addSchoolByName(want).catch(() => {});
    return {
      added: true,
      name: want,
      note: rows.length
        ? `나이스에 「${want}」 로 ${rows.length}곳이 나옵니다 — 학교 화면에서 골라주세요.`
        : "나이스에서 못 찾았어요 — 학교 화면에서 직접 이어주세요.",
    };
  }

  const put = await addSchool(rows[0]);
  if (put?.error) return { added: false, name: want, note: put.error };

  // 학사일정까지 받아온다 — 이 학년도치만
  const { from, to } = schoolYear(todaySeoul());
  const { data: made } = await supabase
    .from("schools").select("id")
    .eq("schul_code", rows[0].schul_code).maybeSingle();
  if (made?.id) await importSchedule(from, to, made.id).catch(() => {});

  return { added: true, name: rows[0].name, note: "학사일정까지 받아왔어요." };
}

/**
 * ── 전화 받고 나서 나가는 문자 두 통 (0109) ──────────────────
 *
 * 원장님 (2026-08-07)
 *   「1. 전화옴 / 2. 문자로 설문지 제출할 링크 보내줌
 *    3. 레시간, 상담시간 및 오는 길 안내 문자 보내줘야함」
 *
 * 전에는 화면에 **링크 복사**만 있었다. 복사 → 문자앱 열기 → 번호 찾기 →
 * 붙여넣기 → 인사말 적기. 전화를 끊고 다섯 걸음이라, 그 사이에 다른 전화가
 * 오면 그 집은 링크를 못 받는다. 3번은 자리가 아예 없었다.
 *
 * **문구는 원장님 것이다** — 문자 문구에서 고치시면 그대로 나간다.
 * 발송 방식이 「직접 발송」 이면 안 나가고 **글만 만들어 돌려준다** (화면이
 * 그 글을 문자앱으로 넘긴다). 안 나가는데 「보냈어요」 라고 하지 않는다.
 */

/** 지금 이 앱의 주소 — 문자에 넣을 링크는 절대주소여야 한다 */
function siteUrl() {
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

async function templateBody(supabase, kind) {
  const { data } = await supabase
    .from("message_templates")
    .select("id, body")
    .eq("kind", kind)
    .eq("active", true)
    .order("sort", { ascending: true })
    .limit(1);
  const row = (data || [])[0];
  // 0109 를 아직 안 돌렸어도 문자는 나가야 한다
  return { id: row?.id || null, body: row?.body || FALLBACK[kind] || "" };
}

/**
 * 한 통 보낸다 — 두 문자가 같은 길을 쓴다.
 *
 * @returns { error, text, sent }  sent=false 면 화면이 문자앱으로 넘긴다
 */
async function sendOne(supabase, inq, body, vars, stamp) {
  const text = fill(body, vars);
  if (!text) return { error: "보낼 글이 비었어요." };
  if (!inq.phone) return { error: "전화번호가 없어요. 먼저 적어주세요.", text };

  const settings = await loadSettings(supabase);
  const out = await deliver(settings, [{ to: inq.phone, text, ref: inq.id }], {
    kind: "inquiry",
    audience: "inquiry",
  });
  const r = (out.results || [])[0];
  const sent = out.channel !== "copy" && !!r?.ok;

  // **보낸 것만 적는다.** 「직접 발송」 은 아직 안 나간 것이라 적으면 거짓이 된다
  //
  // 다시 그리는 것도 **보냈을 때만.** 안 보냈는데 다시 그리면 방금 띄운
  // 문자 글이 화면에서 사라진다 (판이 새로 선다)
  if (sent && stamp) {
    await supabase.from("inquiries").update({ [stamp]: new Date().toISOString() }).eq("id", inq.id);
    revalidatePath("/consult");
  }
  return {
    error: sent || out.channel === "copy" ? null : r?.detail || "보내지 못했어요.",
    text,
    sent,
    channel: out.channel,
  };
}

/** ② 설문지 링크 */
export async function sendApplyLink(id) {
  if (!id) return { error: "어느 문의인지 모르겠어요." };
  const supabase = createClient();

  const link = await ensureFormLink(id);
  if (link.error) return { error: link.error };

  const { data: inq } = await supabase
    .from("inquiries").select("id, name, phone").eq("id", id).maybeSingle();
  if (!inq) return { error: "문의를 찾지 못했어요." };

  const settings = await loadSettings(supabase);
  const url = `${siteUrl()}/apply?t=${link.token}`;
  const tpl = await templateBody(supabase, "apply_link");
  return sendOne(supabase, inq, tpl.body, linkVars(inq, settings, url), "link_sent_at");
}

/** ③ 레벨테스트 · 상담 시간 · 오는 길 */
export async function sendVisitInfo(id) {
  if (!id) return { error: "어느 문의인지 모르겠어요." };
  const supabase = createClient();

  const { data: inq } = await supabase
    .from("inquiries")
    .select("id, name, phone, test_on, test_at, consult_on, consult_at, visit_on, visit_at")
    .eq("id", id)
    .maybeSingle();
  if (!inq) return { error: "문의를 찾지 못했어요." };

  const settings = await loadSettings(supabase);
  const vars = guideVars(inq, settings);
  // **빈 문자가 나가는 것보다 안 나가는 편이 낫다**
  if (!vars) return { error: "레벨테스트나 상담 시간을 먼저 정해주세요." };
  if (!vars.주소) return { error: "설정 → 운영 규칙에서 학원 주소를 먼저 적어주세요." };

  const tpl = await templateBody(supabase, "visit_info");
  return sendOne(supabase, inq, tpl.body, vars, "guide_sent_at");
}
