"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { deliver } from "@/lib/send";
import { autoValues, buildVariables } from "@/lib/alimtalk";
import { INQUIRY, IN_APP_DETAIL, noticeKindOf, noticeLabel, postAppNotices } from "@/lib/notify";
import { pushToFamilies } from "@/app/push/actions";
import { longLabel, todaySeoul } from "@/lib/day";

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

  // **교재 안내는 아직 안 산 책을 사달라고 보내는 문자다.**
  //   그래서 고르는 목록은 「이 학생에게 배정된 교재」가 아니라 **학원 교재 전체**다.
  //   배정된 것을 고르게 하면 이미 갖고 있는 책을 또 사라고 보내게 된다.
  //   대신 이미 갖고 있는 것은 화면에서 「이미 있음」 으로 알려준다.
  const { data: catalogRaw } = await supabase
    .from("textbooks")
    .select("id, name, area, price, purchase_url, status")
    .order("name", { ascending: true });
  const catalog = (catalogRaw || [])
    .filter((b) => !b.status || b.status === "active")
    .map((b) => ({
      id: b.id, name: b.name, area: b.area || "",
      price: b.price || 0, url: b.purchase_url || "",
    }));

  // 이미 갖고 있는 교재 (그만둔 것은 뺀다) — 다시 사라고 보내지 않으려고
  const { data: st } = await supabase
    .from("student_textbooks")
    .select("student_id, textbook_id, status");
  const bookById = new Map(catalog.map((b) => [b.id, b]));

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
      // **이미 갖고 있는 교재.** 안내에 넣으라는 뜻이 아니라, 또 사라고
      // 보내지 않으려고 화면에서 「이미 있음」 으로 표시하는 데 쓴다.
      books: list.map((b) => b.name),
      has: list.map((b) => b.id),
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
    has: [],
    testOn: q.test_on || "",
    testResult: [q.test_result, q.test_note].filter(Boolean).join(" · "),
  }));

  return {
    students: studentRows,
    inquiries: inquiryRows,
    catalog,
    error: inqErr ? "0017 SQL을 먼저 실행해주세요." : null,
  };
}

// ---------- 발송 ----------
/**
 * 안내 보내기 — 데일리리포트와 달리 리포트에 묶이지 않는다.
 *
 * **받는 사람에 따라 가는 길이 다르다** (원장님, 2026-08-06).
 *   재원생·학부모 → **앱 안 공지 + 알림.** 문자는 한 통도 안 나간다.
 *   신규 상담     → 문자 · 알림톡. 아직 계정이 없어서 앱에 올려봐야 볼 수가 없다.
 *
 * 화면에서 「재원생 / 상담·테스트」 를 이미 갈라 고르시므로, 여기서는 id 앞자리로
 * 그대로 가른다 (s: 재원생, q: 상담).
 *
 * @param items    [{ id, name, phone, body }]
 * @param label    안내 종류 (교재 book · 보강 makeup …)
 * @param templateId 어떤 문구로 보냈는지 — 알림톡 템플릿을 찾는 데 쓴다
 */
export async function sendNotices(items, label, templateId) {
  const list = Array.isArray(items) ? items.filter((x) => x?.body) : [];
  if (list.length === 0) return { error: null, count: 0 };

  const supabase = createClient();
  const settings = await loadSettings(supabase);
  const { data: { user } } = await supabase.auth.getUser();
  const kind = label || "notice";
  const today = todaySeoul();

  const students = list.filter((x) => `${x.id}`.startsWith("s:"));
  const inquiries = list.filter((x) => !`${x.id}`.startsWith("s:"));

  const byRef = new Map();
  let pushed = 0;                 // 실제로 폰에 간 알림 수 (0 이면 아무도 안 켠 것이다)

  // ── 1) 재원생 · 학부모 — 앱 안으로 ────────────────────────────
  if (students.length > 0) {
    const title = noticeLabel(kind);
    const { ok, failed } = await postAppNotices(
      supabase,
      students.map((x) => ({ studentId: x.id.slice(2), title, body: x.body })),
      { date: today, kind, createdBy: user?.id || null }
    );
    const okSet = new Set(ok);
    const whyOf = new Map(failed.map((f) => [f.studentId, f.detail]));
    students.forEach((x) => {
      const sid = x.id.slice(2);
      byRef.set(x.id, okSet.has(sid)
        ? { ok: true, detail: IN_APP_DETAIL }
        : { ok: false, detail: whyOf.get(sid) || "앱에 올리지 못했어요." });
    });

    /**
     * **몇 대에 갔는지 세어 둔다** (원장님, 2026-08-07 — 「학생 학부모
     * 어플에서 전달사항은 알림이 안 와」).
     *
     * 지금까지는 알림 결과를 아무도 안 봤다. 그래서 **켠 기기가 하나도
     * 없어도** 화면에는 「올렸어요」 만 나왔고, 안 갔다는 것을 알 길이
     * 없었다. 공지가 올라간 것과 알림이 간 것은 다른 이야기다.
     */
    // 올린 다음에 알린다. 알림이 먼저 가면 눌렀을 때 아무것도 없다.
    // 알림이 실패해도 공지는 이미 올라가 있다 — 앱을 열면 보인다.
    //
    // **한 명씩 보낸다.** 문구에 {{학생명}} 이 채워져 있어서 사람마다 본문이
    // 다르다. 한 사람 것으로 묶어 보내면 남의 이름이 적힌 알림이 간다.
    const toParent = noticeKindOf(kind) === "notice";
    for (const x of students) {
      const sid = x.id.slice(2);
      if (!okSet.has(sid)) continue;
      try {
        const r = await pushToFamilies(
          [sid],
          {
            title,
            body: firstLine(x.body),
            // 어머니만 보는 안내는 어머니 화면으로 보낸다 — 아이가 눌렀을 때
            // 아무것도 없으면 그다음부터 알림을 안 누른다
            url: toParent ? "/parent" : "/me",
            tag: `notice-${kind}`,
          },
          toParent ? "parent" : "all"
        );
        pushed += r?.sent || 0;
      } catch {
        /* 알림 실패는 무시한다 — 공지는 이미 올라갔다 */
      }
    }
  }

  // ── 2) 신규 상담 — 밖으로 (문자 · 알림톡) ─────────────────────
  let channel = students.length > 0 ? "app" : null;
  if (inquiries.length > 0) {
    let tpl = null;
    if (templateId) {
      const q = await supabase
        .from("message_templates")
        .select("alimtalk_id, alimtalk_vars")
        .eq("id", templateId)
        .maybeSingle();
      if (!q.error) tpl = q.data;
    }
    const dateLabel = longLabel(today);
    const sendable = inquiries.filter((x) => x.phone);
    const out = await deliver(
      settings,
      sendable.map((x) => {
        const msg = { to: x.phone, text: x.body, ref: x.id };
        if (tpl?.alimtalk_id) {
          msg.kakao = {
            templateId: tpl.alimtalk_id,
            variables: buildVariables(tpl.alimtalk_vars, {
              ...autoValues({
                academy: settings.academy?.name,
                name: x.name,
                date: dateLabel,
                body: x.body,
                phone: settings.message?.phone,
                address: settings.message?.address,
              }),
              // 이 문자에서 내가 채운 값들도 그대로 붙일 수 있다
              ...(x.vars || {}),
            }),
          };
        }
        return msg;
      }),
      { kind, audience: INQUIRY }
    );
    out.results.forEach((r) => byRef.set(r.ref, r));
    inquiries.forEach((x) => {
      if (!x.phone) byRef.set(x.id, { ok: false, detail: "번호 없음" });
    });
    channel = students.length > 0 ? "app+sms" : out.channel;
  }

  const failed = list.filter((x) => !byRef.get(x.id)?.ok);
  return {
    error: null,
    channel,
    inApp: students.length,
    pushed,
    count: list.length - failed.length,
    failed: failed.map((x) => ({ name: x.name, detail: byRef.get(x.id)?.detail || "발송 실패" })),
  };
}

/** 알림 본문 — 제목 줄([학원명] …)을 빼고 첫 줄만. 폰 알림에는 한 줄만 보인다 */
function firstLine(body = "") {
  const lines = `${body}`.split("\n").map((s) => s.trim()).filter(Boolean);
  const rest = lines[0]?.startsWith("[") ? lines.slice(1) : lines;
  return (rest[0] || lines[0] || "앱에서 확인해주세요").slice(0, 80);
}

/**
 * 안내한 교재를 **재원생 정보에 배정한다** — 다만 「사용 예정일」부터.
 *
 * 교재 안내는 아직 안 산 책을 사달라고 보내는 문자다. 보내는 순간 배정해
 * 버리면 아직 책이 없는데 오늘 수업 진도·숙제 범위에 그 교재가 뜬다.
 * 그렇다고 안 해두면 책이 온 날 다시 들어와서 손으로 배정해야 한다 —
 * 그러면 빠뜨린다.
 *
 * 그래서 **지금 꽂아두고 날짜로 연다.** assigned_on 이 오면 저절로 보인다.
 * (거르는 규칙은 lib/bookUse 의 inUseOn 한 곳에 있다)
 *
 * 이미 갖고 있는 교재는 **건드리지 않는다.** 다시 배정하면 그 교재의 진도·
 * 회독이 시작일부터 다시 열리는 것처럼 보인다.
 *
 * @param ids     화면이 쓰는 id ("s:uuid" — 상담자 "q:" 는 배정할 데가 없어 건너뛴다)
 * @param bookIds 안내한 교재
 * @param startOn "YYYY-MM-DD" 사용 예정일
 */
export async function assignAnnouncedBooks(ids, bookIds, startOn) {
  const students = (ids || [])
    .filter((x) => typeof x === "string" && x.startsWith("s:"))
    .map((x) => x.slice(2));
  const books = [...new Set((bookIds || []).filter(Boolean))];
  if (students.length === 0 || books.length === 0) return { error: null, added: 0 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startOn || "")) {
    return { error: "사용 예정일을 날짜로 적어주세요." };
  }

  const supabase = createClient();

  // 이미 있는 줄은 그대로 둔다
  const { data: have, error: readErr } = await supabase
    .from("student_textbooks")
    .select("student_id, textbook_id")
    .in("student_id", students)
    .in("textbook_id", books);
  if (readErr) return { error: readErr.message };
  const known = new Set((have || []).map((r) => `${r.student_id}|${r.textbook_id}`));

  const rows = [];
  students.forEach((sid) =>
    books.forEach((bid) => {
      if (known.has(`${sid}|${bid}`)) return;
      rows.push({
        student_id: sid, textbook_id: bid,
        status: "active", assigned_on: startOn, ended_on: null,
      });
    })
  );
  if (rows.length === 0) return { error: null, added: 0, skipped: students.length * books.length };

  const { error } = await supabase.from("student_textbooks").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/students");
  revalidatePath("/today");
  revalidatePath("/plan");
  return { error: null, added: rows.length, skipped: students.length * books.length - rows.length };
}
