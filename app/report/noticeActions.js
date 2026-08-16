"use server";

import { revalidatePath } from "next/cache";
import { fetchAll } from "@/lib/fetchAll";
import { createClient } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/settings";
import { deliver } from "@/lib/send";
import { autoValues, buildVariables } from "@/lib/alimtalk";
import { INQUIRY, IN_APP_DETAIL, noticeKindOf, noticeLabel, postAppNotices } from "@/lib/notify";
import { pushToFamilies } from "@/app/push/actions";
import { longLabel, todaySeoul } from "@/lib/day";
import { sessionUser } from "@/lib/session";
import { planDatedAssign } from "@/lib/bookAssign";
import { notYet } from "@/lib/bookUse";

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
    .select("id, name, school, grade, parent_phone, status, enrolled_on")
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

  // 이미 갖고 있는 교재 (그만둔 것은 뺀다) — 다시 사라고 보내지 않으려고.
  // 표 전체라 fetchAll (A5). **보유 판정은 전체 교재로** (전수검사 A9) —
  // 활성 지도로 찾으면 절판된 보유 책이 「없음」 이 되어 또 사라고 보낸다.
  let { data: st, error: stErr } = await fetchAll(() =>
    supabase
      .from("student_textbooks")
      .select("student_id, textbook_id, status, assigned_on, ended_on, notified_on")
      .order("student_id").order("textbook_id")
  );
  if (stErr) {
    // 0125 전이면 안내 나간 날 칸이 없다 — 미안내 목록 없이 그대로 간다
    ({ data: st } = await fetchAll(() =>
      supabase
        .from("student_textbooks")
        .select("student_id, textbook_id, status, assigned_on, ended_on")
        .order("student_id").order("textbook_id")
    ));
  }
  const bookById = new Map(
    (catalogRaw || []).map((b) => [
      b.id,
      { id: b.id, name: b.name, area: b.area || "", price: b.price || 0, url: b.purchase_url || "" },
    ])
  );

  const booksOf = new Map();
  // **사용 예정(아직 시작 전) 교재** — 안내에 자동으로 채울 거리이자,
  // notified_on 이 비면 「안내 안 나간 것」 (0125). 판정은 lib/bookUse 한 곳.
  const today = todaySeoul();
  const pendingOf = new Map();
  (st || []).forEach((x) => {
    if (x.status === "dropped") return;
    const b = bookById.get(x.textbook_id);
    if (!b) return;
    if (!booksOf.has(x.student_id)) booksOf.set(x.student_id, []);
    booksOf.get(x.student_id).push(b);
    if (notYet(x, today)) {
      if (!pendingOf.has(x.student_id)) pendingOf.set(x.student_id, []);
      pendingOf.get(x.student_id).push({
        id: b.id, name: b.name, notified: !!x.notified_on,
      });
    }
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
      // 사용 예정 교재 — 고르면 자동으로 안내 목록에 채워진다.
      // notified 가 false 면 「안내 안 나간 것」 확인 줄에 선다 (0125)
      pending: pendingOf.get(s.id) || [],
      // 첫 등원 전 — 이 집엔 앱 공지 대신 **문자**가 간다 (2026-08-16)
      firstComing: !!(s.enrolled_on && s.enrolled_on > today),
      testResult: "",
    };
  });

  // 상담자 (레벨테스트 안내 대상)
  let { data: inq, error: inqErr } = await supabase
    .from("inquiries")
    .select("id, name, school, grade, phone, test_on, test_result, test_note, status, book_ids")
    .not("status", "in", '("enrolled","declined")')
    .order("created_at", { ascending: false });
  if (inqErr) {
    // 0122 전이면 상담 교재 칸이 없다
    ({ data: inq, error: inqErr } = await supabase
      .from("inquiries")
      .select("id, name, school, grade, phone, test_on, test_result, test_note, status")
      .not("status", "in", '("enrolled","declined")')
      .order("created_at", { ascending: false }));
  }

  const inquiryRows = (inq || []).map((q) => ({
    id: `q:${q.id}`,
    kind: "inquiry",
    name: q.name,
    who: [q.school, q.grade].filter(Boolean).join(" "),
    phone: q.phone || "",
    books: [],
    has: [],
    // 상담 때 정해둔 교재(0122) — 등록 안내 문자에 자동으로 채워진다
    // (원장님, 2026-08-15 — 「신규생은 등록안내문자 보낼때 교재내용이 들어가야해」)
    pending: (q.book_ids || [])
      .filter((id) => bookById.has(id))
      .map((id) => ({ id, name: bookById.get(id).name, notified: false })),
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
export async function sendNotices(items, label, templateId, supa = null) {
  const list = Array.isArray(items) ? items.filter((x) => x?.body) : [];
  if (list.length === 0) return { error: null, count: 0 };

  // supa — 예약 발송(외부 크론)의 서버 열쇠 클라이언트 (0126)
  const supabase = supa || createClient();
  const settings = await loadSettings(supabase);
  const user = await sessionUser(supabase);
  const kind = label || "notice";
  const today = todaySeoul();

  const students = list.filter((x) => `${x.id}`.startsWith("s:"));
  const inquiries = list.filter((x) => !`${x.id}`.startsWith("s:"));

  /**
   * **첫 등원 전인 신입생에게는 문자로** (원장님, 2026-08-16 — 「(재원생은)
   * 앱알림으로만 할거야 / 신규생 대상은 전부 문자」). 등록돼서 재원생
   * 목록에 있어도 아직 한 번도 안 온 집은 앱을 깔았을 리가 없다 — 앱
   * 공지만 올리면 등록·교재 안내를 못 본다. 첫 등원(등원시작일)이 지나면
   * 재원생 규칙(앱으로만)으로 돌아간다.
   */
  let appOnes = students;
  let smsOnes = [];
  if (students.length > 0) {
    const { data: stRows } = await supabase
      .from("students")
      .select("id, enrolled_on")
      .in("id", students.map((x) => x.id.slice(2)));
    const coming = new Set(
      (stRows || [])
        .filter((r) => r.enrolled_on && r.enrolled_on > today)
        .map((r) => r.id)
    );
    appOnes = students.filter((x) => !coming.has(x.id.slice(2)));
    smsOnes = students.filter((x) => coming.has(x.id.slice(2)));
  }

  const byRef = new Map();
  let pushed = 0;                 // 실제로 폰에 간 알림 수 (0 이면 아무도 안 켠 것이다)

  // ── 1) 재원생 · 학부모 — 앱 안으로 ────────────────────────────
  if (appOnes.length > 0) {
    const title = noticeLabel(kind);
    const { ok, failed } = await postAppNotices(
      supabase,
      appOnes.map((x) => ({ studentId: x.id.slice(2), title, body: x.body })),
      { date: today, kind, createdBy: user?.id || null }
    );
    const okSet = new Set(ok);
    const whyOf = new Map(failed.map((f) => [f.studentId, f.detail]));
    appOnes.forEach((x) => {
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
    const toParent = noticeKindOf(kind) === "alert_parent";
    /**
     * **한 가족에는 알림 한 번** (값-지도 P1-7, 2026-08-15). 문구에
     * {{학생명}} 이 있어 공지는 아이마다 따로 올리지만, 알림까지 아이마다
     * 울리면 형제 있는 집 어머니 폰이 같은 안내로 두 번 운다.
     * 공지는 둘 다 올라가 있으니 알림은 가족당 한 번이면 된다.
     */
    const sids2 = appOnes.map((x) => x.id.slice(2));
    const { data: famLinks } = await supabase
      .from("parent_student")
      .select("parent_profile_id, student_id")
      .in("student_id", sids2);
    const parentsOf = new Map();
    (famLinks || []).forEach((l) => {
      if (!parentsOf.has(l.student_id)) parentsOf.set(l.student_id, []);
      parentsOf.get(l.student_id).push(l.parent_profile_id);
    });
    const rangParents = new Set();
    for (const x of appOnes) {
      const sid = x.id.slice(2);
      if (!okSet.has(sid)) continue;
      const fam = parentsOf.get(sid) || [];
      if (fam.length > 0 && fam.every((pid) => rangParents.has(pid))) continue;
      fam.forEach((pid) => rangParents.add(pid));
      try {
        /**
         * 알림 대상은 공지 종류가 정한다 (전수검사 A17) — 오늘 수업 길과
         * 같은 계약: 학생 공지는 **학생 기기만**, 학부모 공지는 부모만,
         * 그 밖은 가족 전부. 전에는 이 길만 학생 공지도 부모 폰을 울렸다.
         */
        const kindOf = noticeKindOf(kind);
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
          toParent ? "parent" : kindOf === "alert_student" ? "student" : "all",
          supa
        );
        pushed += r?.sent || 0;
      } catch {
        /* 알림 실패는 무시한다 — 공지는 이미 올라갔다 */
      }
    }
  }

  // ── 2) 신규 상담 + 첫 등원 전 신입생 — 밖으로 (문자 · 알림톡) ────
  let channel = appOnes.length > 0 ? "app" : null;
  const outward = [...inquiries, ...smsOnes];
  if (outward.length > 0) {
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
    const sendable = outward.filter((x) => x.phone);
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
    outward.forEach((x) => {
      if (!x.phone) byRef.set(x.id, { ok: false, detail: "번호 없음" });
    });
    channel = appOnes.length > 0 ? "app+sms" : out.channel;
  }

  const failed = list.filter((x) => !byRef.get(x.id)?.ok);
  return {
    error: null,
    channel,
    inApp: appOnes.length,
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
export async function assignAnnouncedBooks(ids, bookIds, startOn, supaIn = null) {
  const students = (ids || [])
    .filter((x) => typeof x === "string" && x.startsWith("s:"))
    .map((x) => x.slice(2));
  const books = [...new Set((bookIds || []).filter(Boolean))];
  /**
   * **상담자(q:)에게 안내한 교재는 상담 정보에 적힌다** (0122, 원장님
   * 2026-08-15 — 「신규 상담 정보에 교재 배정이 없음」). 아직 학생이
   * 아니라 배정할 데는 없지만, 등록하는 순간 이 목록이 배정으로 이어진다
   * (convertToStudent). 0122 전 DB 면 조용히 넘어간다 — 안내 발송이
   * 이것 때문에 멈추면 안 된다.
   */
  const inquiries = (ids || [])
    .filter((x) => typeof x === "string" && x.startsWith("q:"))
    .map((x) => x.slice(2));
  if (inquiries.length > 0 && books.length > 0) {
    try {
      const supa = supaIn || createClient();
      const { data: qs } = await supa
        .from("inquiries").select("id, book_ids").in("id", inquiries);
      for (const q of qs || []) {
        const merged = [...new Set([...(q.book_ids || []), ...books])];
        let { error: upErr } = await supa.from("inquiries")
          .update({
            book_ids: merged,
            // 안내에 적은 사용 예정일도 남긴다 (0128, A13) — 등록 전환이
            // 이 날짜로 배정한다. 문자에 적힌 날짜와 어긋나면 안 된다
            book_start_on: startOn || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", q.id);
        if (upErr && (upErr.code === "42703" || upErr.code === "PGRST204")) {
          // 0128 전 — 예정일 없이 목록만
          await supa.from("inquiries")
            .update({ book_ids: merged, updated_at: new Date().toISOString() })
            .eq("id", q.id);
        }
      }
      revalidatePath("/consult");
    } catch { /* 0122 전 — 넘어간다 */ }
  }
  if (students.length === 0 || books.length === 0) return { error: null, added: 0 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startOn || "")) {
    return { error: "사용 예정일을 날짜로 적어주세요." };
  }

  const supabase = supaIn || createClient();

  // 이미 있는 줄은 그대로 둔다
  const { data: have, error: readErr } = await supabase
    .from("student_textbooks")
    .select("student_id, textbook_id")
    .in("student_id", students)
    .in("textbook_id", books);
  if (readErr) return { error: readErr.message };
  const known = new Set((have || []).map((r) => `${r.student_id}|${r.textbook_id}`));

  // 넣고 싶은 짝(학생×교재, 다 같은 날짜) 중 이미 있는 것은 뺀다 —
  // 판단은 lib/bookAssign 한 곳(교재안내 기록 이관과 같은 규칙)
  const wants = [];
  students.forEach((sid) => books.forEach((bid) =>
    wants.push({ studentId: sid, textbookId: bid, date: startOn })
  ));
  const toKeep = planDatedAssign(known, wants);
  const notifiedOn = todaySeoul();
  const rows = toKeep.map((w) => ({
    student_id: w.studentId, textbook_id: w.textbookId,
    status: "active", assigned_on: w.date, ended_on: null,
    notified_on: notifiedOn,   // 이 길은 안내를 보내면서 배정한다 (0125)
  }));

  // 이미 배정돼 있던(예: 상담 등록 자동 배정) 짝도 지금 안내가 나갔다
  try {
    await supabase.from("student_textbooks")
      .update({ notified_on: notifiedOn })
      .in("student_id", students).in("textbook_id", books);
  } catch { /* 0125 전 */ }

  if (rows.length === 0) return { error: null, added: 0, skipped: students.length * books.length };

  let { error } = await supabase.from("student_textbooks").insert(rows);
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // 0125 전이면 안내 나간 날 없이
    ({ error } = await supabase.from("student_textbooks")
      .insert(rows.map(({ notified_on: _n, ...r }) => r)));
  }
  if (error) return { error: error.message };

  revalidatePath("/students");
  revalidatePath("/today");
  revalidatePath("/plan");
  return { error: null, added: rows.length, skipped: students.length * books.length - rows.length };
}
