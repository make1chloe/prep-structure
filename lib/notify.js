/**
 * **알림은 앱 안에서 한다. 밖으로 나가는 것은 신규 상담뿐이다.**
 *
 * 원장님 (2026-08-06)
 *   「교재 안내 · 늦은 귀가 안내 · 보강 안내 등등등 기존에 알림톡으로 알리던 것을
 *    전부 어플 안에서 해결하게 해줘. 재원생이 아닌 신규 상담 문의 관련만
 *    알림톡으로 보내게 해줘」
 *
 * 왜 이렇게 가르나
 *   · 재원생·학부모는 **이미 앱을 갖고 계신다.** 앱이 있는 분께 문자를 또
 *     보내면 같은 말이 두 군데에 남고, 두 군데는 반드시 어긋난다 (원칙1).
 *   · 알림톡은 건당 돈이 나가고, 템플릿 승인을 받아야 하고, 막히면 문자로
 *     떨어진다. 세 가지가 다 「보냈는데 안 갔다」 로 끝난다.
 *   · **신규 상담은 다르다.** 아직 계정이 없다. 앱에 올려봐야 볼 사람이 없으니
 *     그쪽만 밖으로 내보낸다.
 *
 * 가르는 곳은 **여기 한 군데**다. 보내는 자리마다 「이건 문자였나 앱이었나」 를
 * 적으면 언젠가 하나를 빠뜨리고, 빠뜨린 그 하나가 학부모 폰으로 나간다.
 */

/** 받는 사람이 누구인가 */
export const INQUIRY = "inquiry";    // 재원생 · 그 학부모 (앱을 갖고 계신다)
/**
 * 원장님이 **직접 적은 번호로 한 통 보내보는 것** (설정 → 연결 확인).
 * 받는 사람이 원장님 자신이라 재원생 규칙과 상관이 없다. 이것까지 막으면
 * 솔라피가 연결됐는지 확인할 길이 없어진다 — 상담 문자가 나가는 길이니
 * 확인은 되어야 한다.
 */
export const TEST = "test";

/** 문자·알림톡으로 내보내도 되는가 */
export function outboundAllowed(audience) {
  return audience === INQUIRY || audience === TEST;
}

/** 앱으로 보냈을 때 발송 기록에 남길 말 */
export const IN_APP_DETAIL = "앱 안 알림으로 보냈습니다";

/**
 * 실수로 재원생에게 문자를 보내려 할 때 돌려주는 말.
 * **조용히 넘기지 않는다** — 조용히 넘기면 안 나간 것을 나간 줄 알고 지나간다.
 */
export const BLOCKED_DETAIL =
  "재원생에게는 문자·알림톡을 보내지 않습니다 (앱 안 알림으로 나갑니다).";

/**
 * 안내 종류 → 앱에서 부를 이름.
 *
 * 알림 제목에 그대로 쓴다. 「안내가 왔어요」 만 오면 무엇인지 몰라서
 * 결국 앱을 열어봐야 하고, 그럴 바에는 알림이 없는 것과 같다.
 */
const LABEL = {
  book: "교재 안내",
  schedule: "일정 안내",
  makeup: "보강 안내",
  exam: "시험 안내",
  late_in: "지각 안내",
  late: "늦은 귀가 안내",
  report: "수업 안내",
  homework: "숙제 안내",
  monthly: "월간 리포트",
  // 원장님 (2026-08-07) — 「그냥 공지사항 전달사항」
  notice: "공지사항",
  deliver: "전달사항",
  general: "공지사항",
};

/**
 * **잠금화면에 적을 말** (원장님, 2026-08-07 — 「미리보기에서 내용 알 수
 * 없게 해줘. 그냥 공지사항 전달사항. 눌러서 어플 들어와야 알 수 있게」).
 *
 * 알림 미리보기는 폰을 안 열어도 보인다 — 옆 사람에게도 보이고, 형제 폰에
 * 어머니가 로그인해 두신 집에서는 아이가 보게 된다. 무엇이 왔는지만 말하고
 * 내용은 앱을 열어야 보이게 한다.
 */
export const OPEN_TO_SEE = "앱에서 확인해주세요.";

export function noticeLabel(kind) {
  return LABEL[kind] || "공지사항";
}

/**
 * 이 안내는 **학부모 자리**에 붙나, **학생 자리**에 붙나.
 *
 * 교재·보강·늦은 귀가·수업/월간 리포트는 **어머니께 드리던 말**이다.
 * 시험·지각처럼 아이도 알아야 하는 것은 아이 자리로 둔다.
 * (양쪽 다 알림은 집 전체로 간다 — 폰이 어느 쪽에 있는지는 집마다 다르다)
 *
 * ── 「알림」 갈래로 바꿨다 (2026-08-07) ──────────────────
 *
 * 여기는 **발송 화면의 「안내」** 다 — 누르는 순간 이미 알림이 나간다.
 * 그런데 예전에는 `deliver` 로 적혀서, 그날 숙제 안내 문자에 **한 번 더**
 * 실려 나갔다. 어머니는 같은 말을 두 번 받으셨다.
 *
 * 이제 「학생 알림」 · 「학부모 알림」 으로 적는다 (lib/notices). 이 둘은
 * 이미 나갔다는 뜻이라 리포트·숙제 문자에 다시 안 실린다.
 */
const TO_PARENT = new Set(["book", "makeup", "late", "report", "monthly", "notice", "general", "schedule"]);

export function noticeKindOf(kind) {
  return TO_PARENT.has(kind) ? "alert_parent" : "alert_student";
}

/**
 * 앱 안 공지로 올린다 — 알림톡 대신 여기에 쌓인다.
 *
 * 한 사람에 한 줄로 만든다. 문구에 {{학생명}} 이 채워져 있어서 사람마다
 * 본문이 다르기 때문이다. 묶어서 한 줄로 두면 누구 것인지 알 수 없게 된다.
 *
 * @param rows [{ studentId, title, body }]
 * @returns { ok: [studentId], failed: [{ studentId, detail }] }
 */
export async function postAppNotices(supabase, rows = [], { date, kind, createdBy } = {}) {
  const ok = [];
  const failed = [];
  const noticeKind = noticeKindOf(kind);

  for (const r of rows) {
    if (!r?.studentId) continue;
    const base = {
      date,
      kind: noticeKind,
      scope: "student",
      body: (r.body || r.title || "").trim(),
      title: r.title || null,
      created_by: createdBy || null,
    };
    if (!base.body) {
      failed.push({ studentId: r.studentId, detail: "내용이 비어 있어요." });
      continue;
    }

    let { data: notice, error } = await supabase
      .from("notices").insert(base).select("id").single();
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      // 0064 전이면 제목 칸이 없다
      const { title: _t, ...noTitle } = base;
      ({ data: notice, error } = await supabase
        .from("notices").insert(noTitle).select("id").single());
    }
    if (error) {
      failed.push({ studentId: r.studentId, detail: error.message });
      continue;
    }

    const { error: rErr } = await supabase
      .from("notice_receipts")
      .insert({ notice_id: notice.id, student_id: r.studentId });
    if (rErr) {
      // 받는 사람이 안 붙으면 아무도 못 본다 — 공지도 같이 치운다.
      // 아무도 못 보는 줄이 목록에 쌓이면 「보냈는데요」 의 근거가 되어버린다.
      await supabase.from("notices").delete().eq("id", notice.id);
      failed.push({ studentId: r.studentId, detail: rErr.message });
      continue;
    }
    ok.push(r.studentId);
  }

  return { ok, failed };
}
