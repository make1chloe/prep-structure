import { parts } from "./day.js";
import { warningLines } from "./warnings.js";
import { score } from "./wordTest.js";
import { lateReasons, normalizeTime } from "./lateNotice.js";

/**
 * 남아서 하고 가는 과제의 이름. 화면·문자에 나가는 말은 전부 여기 하나를 본다.
 * 바꾸고 싶으면 이 줄만 고치면 된다.
 */
/**
 * 여러 줄짜리 공지에 줄바꿈 표시를 붙인다.
 *
 * 줄이 바뀌었다는 것은 **내용이 바뀌었다는 뜻**이라, 학부모가 눈으로
 * 알아볼 수 있어야 한다. 그런데 문자는 특수기호가 깨지는 데가 있어서
 * 제일 흔한 붙임표(-) 만 쓴다.
 *
 * 한 줄짜리는 그냥 둔다 — 한 줄에 표시를 붙이면 더 어수선하다.
 */
function withBullets(text) {
  const lines = (text || "")
    .split("\n")
    .map((x) => x.replace(/^[\s*\-–·•※]+/, "").trim())
    .filter(Boolean);
  if (lines.length <= 1) return lines[0] || "";
  return lines.map((x) => `- ${x}`).join("\n");
}

export const STAY_LABEL = "늦귀가 과제";
// 데일리리포트 문구 생성 — 이미 입력한 값만 조합한다 (원칙1: 다시 적지 않는다)

const ATT_LABEL = {
  present: "정시 등원",
  late: "지각",
  absent: "결석",
  makeup: "보강 수업",
  early_leave: "조퇴",
  online: "온라인 수업",
};

// 학부모께 나가는 말. 사실은 그대로 두되 **겁주지 않는 말**로 적는다.
// (선생님 화면은 ○△✕ 그대로다 — 빨리 찍어야 하는 자리라 짧은 게 낫다)
const MARK_LABEL = { done: "완료", weak: "보충 필요", missing: "미완료" };

const ATTITUDE_STAR = {
  Excellent: "⭐⭐⭐⭐⭐",
  Good: "⭐⭐⭐⭐",
  Satisfactory: "⭐⭐⭐",
  "Needs improvement": "⭐⭐",
  "Area of Concern": "🚩",
};

export function dateLabel(date) {
  const { m, d } = parts(date);
  return `${m}월 ${d}일`;
}

/**
 * @param {object} r  { student, report, checks:[{name,status}], next:[{name,units:[],note}],
 *                      progress:[string], notices:[string] }
 */
/**
 * 문자 한 통을 **조각으로** 내어준다.
 *
 * 왜 필요한가 — 알림톡은 승인받은 템플릿의 #{변수} 만 채운다. 원장님 템플릿이
 * 「#{출결} · #{단어} · #{숙제}」 처럼 나뉘어 있으면, 통짜 본문 하나만 있어서는
 * 붙일 데가 없다. 그래서 우리가 문구를 만들 때 쓰는 조각을 **그대로** 꺼내준다.
 *
 * 여기서 새로 계산하지 않는다 — buildReportText 가 쓰는 것과 같은 값이라야
 * 문자로 보낸 것과 알림톡으로 보낸 것이 어긋나지 않는다.
 */
export function reportParts(r, date, rule = {}) {
  const rep = r?.report || {};
  const prog = [...(r?.progress || [])];
  if (rep.own_progress) prog.push(rep.own_progress);

  const checks = (r?.checks || [])
    .map((c) => {
      // 미흡·미제출이면 검사 메모(클카 안 한 세트 등)를 병기한다
      // (원장님, 2026-08-17 — 「안 한 세트가 무엇인지 데일리리포트도」)
      const memo = c.status !== "done" && c.note ? ` (${c.note})` : "";
      return `${c.name} ${MARK_LABEL[c.status] || ""}${memo}`.trim();
    })
    .join(" / ");

  const nextList = (r?.next || []).map((n) => {
    const detail = [...(n.units || []), n.note].filter(Boolean).join(", ");
    return detail ? `${n.name} — ${detail}` : n.name;
  });

  // 보충이 필요한 숙제 — 숙제 문자에서 따로 쓴다
  const behind = (r?.checks || [])
    .filter((c) => c.status === "missing" || c.status === "weak")
    .map((c) => `${c.name} ${c.status === "missing" ? "미제출" : "미흡"}${c.note ? ` (${c.note})` : ""}`)
    .join(", ");

  // 늦게 가는 **사유** — 안 그러면 이 칸에 붙일 값이 없어서
  // 문구 전체({{본문}})를 한 칸에 밀어 넣게 된다
  const auto = lateReasons(r, rule);
  const extra = (rep.late_reason || r?.extraReason || "").trim();
  const lateWhy = [
    ...auto.map((x) => (x.detail ? `${x.label}(${x.detail})` : x.label)),
    extra,
  ].filter(Boolean).join(", ");

  return {
    // ── 데일리리포트 ──
    "{{출결}}": ATT_LABEL[rep.attendance_kind] || "",
    "{{단어시험}}": rep.word_total ? score(rep.word_correct, rep.word_total) : "",
    "{{문장시험}}": rep.sent_total ? score(rep.sent_correct, rep.sent_total) : "",
    "{{진도}}": prog.join(", "),
    "{{숙제검사}}": checks,
    // 「태도」 는 2026-08-11 에 **집중도**로 이름이 바뀌었다 (attitude 칸 그대로).
    // 옛 문구가 {{태도}} 를 쓰고 있을 수 있어 둘 다 채운다 — 같은 값이다.
    "{{집중도}}": rep.attitude ? ATTITUDE_STAR[rep.attitude] || rep.attitude : "",
    "{{태도}}": rep.attitude ? ATTITUDE_STAR[rep.attitude] || rep.attitude : "",
    "{{이해도}}": rep.understanding ? ATTITUDE_STAR[rep.understanding] || rep.understanding : "",
    "{{학부모공지}}": (rep.notice || "").trim(),
    // ── 숙제 문자 ──
    "{{다음숙제}}": nextList.join("\n"),
    "{{숙제한줄}}": nextList.join(", "),      // 한 줄짜리 템플릿 칸에
    "{{보충숙제}}": behind,
    // ── 늦은 귀가 안내 ──
    "{{하원사유}}": lateWhy || "학습 마무리",
    "{{하원시각}}": normalizeTime(rep.late_until || r?.lateUntil || ""),
  };
}

/**
 * **데일리리포트 — 어머니께 가는 「오늘 무슨 일이 있었나」.**
 *
 * 원장님 (2026-08-07) — 「데일리리포트와 숙제문자 양식이 필요해.
 * 중복정보는 가급적 제거하고」
 *
 * ── 두 글의 몫을 갈랐다 ──────────────────────────────────
 *
 * 예전에는 **다음 숙제 목록이 두 글에 다 들어갔다.** 리포트에도 다섯 줄,
 * 숙제 안내에도 같은 다섯 줄. 어머니는 같은 것을 두 번 읽으시고, 그러다
 * 정작 위쪽의 「단어 12/20」 을 놓치신다.
 *
 *   데일리리포트 (어머니)  **결과** — 왔나 · 몇 점 · 어디까지 · 숙제는 해왔나
 *   숙제 안내 (아이)       **할 것** — 무엇을 · 어디까지 · 못 한 것은 무엇
 *
 * 숙제는 아이 앱에 그대로 올라가 있고 어머니 화면에도 「지금 나간 숙제」
 * 칸이 따로 있다. 그러니 리포트에서는 **한 줄로 가리키기만** 한다.
 *
 * 「못 한 부분은 다음 수업에서 채우겠습니다」 같은 말도 뺐다 — 숙제 줄에
 * 이미 「보충 필요」 라고 적혀 있는데 같은 말을 한 번 더 하는 것이다.
 */
export function buildReportText(r, date, academy = "클로이영어", msg = {}) {
  const rep = r.report || {};
  const L = [];

  /**
   * **제목에 학원 이름을 안 붙인다** (원장님, 2026-08-07 — 「[클로이영어]
   * 이런 제목 같은거 불필요」).
   *
   * 문자로 나가던 시절에는 필요했다 — 모르는 번호에서 온 글이라 누가
   * 보냈는지부터 밝혀야 했다. 지금은 **우리 앱 안에서 읽으신다.**
   * 앱 이름이 이미 위에 있는데 한 번 더 적으면 첫 줄을 낭비하는 것이다.
   *
   * 형제가 있는 집이 있으니 이름은 남긴다.
   */
  L.push(`${r.student.name} · ${dateLabel(date)} 수업`);
  L.push("");
  if (msg.greeting) {
    L.push(msg.greeting);
    L.push("");
  }

  const att = ATT_LABEL[rep.attendance_kind] || null;
  if (att) L.push(`· 출결: ${att}`);

  // 결석이면 수업 내용이 없다. 보강 이야기만 하고 끝낸다 —
  // 숙제는 아이 앱에 올라가 있으므로 여기서 늘어놓지 않는다
  if (rep.attendance_kind === "absent") {
    L.push("");
    L.push(
      (rep.notice || "").trim()
        ? withBullets(rep.notice)
        : "오늘 수업에 참석하지 못했습니다. 보강 일정은 따로 안내드리겠습니다."
    );
    if (msg.closing) {
      L.push("");
      L.push(msg.closing);
    }
    return L.join("\n");
  }

  // 틀린 개수로 적는다 — 채점도 통과선도 그쪽 기준이다
  if (rep.word_total) L.push(`· 단어 테스트: ${score(rep.word_correct, rep.word_total)}`);
  if (rep.sent_total) {
    /**
     * 단원명·재시험 여부까지 (값-지도 P1-5, 2026-08-15) — 「문장 테스트
     * 8/10」 만 가고 무슨 단원평가였는지는 월간에서야 나왔다.
     */
    const unitTag = (rep.sent_unit || "").trim();
    const head = unitTag ? `단원평가(${unitTag})` : "문장 테스트";
    const retest = rep.sent_passed === false ? " · 재시험 예정" : "";
    L.push(`· ${head}: ${score(rep.sent_correct, rep.sent_total)}${retest}`);
  }

  const prog = [...(r.progress || [])];
  if (rep.own_progress) prog.push(rep.own_progress);
  if (prog.length) L.push(`· 진도: ${prog.join(", ")}`);

  /**
   * **숙제는 결과만.** 「다 해왔습니다」 한 줄이면 그것으로 끝이고,
   * 못 한 것이 있을 때만 무엇이 남았는지 적는다. 항목마다 「완료」 를
   * 늘어놓으면 정작 「보충 필요」 한 줄이 그 사이에 묻힌다.
   */
  if (r.checks?.length) {
    const left = r.checks.filter((c) => c.status === "missing" || c.status === "weak");
    if (left.length === 0) {
      L.push("· 숙제: 다 해왔습니다");
    } else {
      L.push(
        `· 숙제: ${left
          .map((c) => `${c.name} ${MARK_LABEL[c.status] || ""}`.trim())
          .join(", ")}`
      );
    }
    // 검사하면서 남긴 한 줄 — 「왜 보충인가」 는 사람이 적은 말이라 그대로 간다
    r.checks
      .filter((c) => (c.note || "").trim())
      .forEach((c) => L.push(`  · ${c.name}: ${c.note.trim()}`));
  }

  // 집중도·이해도 — **고른 것만** 적는다 (원장님, 2026-08-11 — 「둘 다
  // 선택하지 않으면 출력되지 않게」). 안 고른 날 빈 별을 보내면 어머니는
  // 「오늘은 왜 평가가 없지」 를 읽게 된다 — 없는 줄이 낫다.
  if (rep.attitude) L.push(`· 집중도: ${ATTITUDE_STAR[rep.attitude] || rep.attitude}`);
  if (rep.understanding) L.push(`· 이해도: ${ATTITUDE_STAR[rep.understanding] || rep.understanding}`);

  // 경고 · 반성문 (학부모에게)
  const warn = warningLines(r.warn, r.warn?.rule, true, date);
  if (warn.length) {
    L.push("");
    warn.forEach((x) => L.push(x));
  }

  /**
   * **남아서 한 것 — 무엇을 했는지 적는다** (원장님, 2026-08-07 —
   * 「1건이라고 하지말고 영역을 쓰는게 어떨까」).
   *
   * 「1건 마치고 하원」 은 아무 말도 안 한 것과 같다. 어머니가 아시고 싶은
   * 것은 **왜 늦게 왔나** 이고, 그 답은 「단어 재시험」 이나 「오답 정리」
   * 같은 이름에 있다. 숫자로는 그게 안 보인다.
   *
   * 길어지면 두 개까지만 적고 나머지는 세어서 붙인다 — 넉 줄이 늘어서면
   * 정작 위쪽 점수가 밀린다.
   */
  const stayDone = (r.stay || []).filter((t) => t.status === "done");
  const stayMoved = (r.stay || []).filter((t) => t.status === "moved");
  const names = (list) => {
    const t = list.map((x) => (x.body || "").trim()).filter(Boolean);
    if (t.length === 0) return "";
    return t.length <= 2 ? t.join(", ") : `${t.slice(0, 2).join(", ")} 외 ${t.length - 2}`;
  };
  if (stayDone.length || stayMoved.length) {
    // **조사를 안 붙인다.** 「오답 정리은」 처럼 은/는이 어긋나면 그 한 글자가
    // 눈에 걸린다. 이름 뒤에 괄호로 붙이면 무엇이 와도 어색하지 않다
    const bits = [];
    if (stayDone.length) bits.push(`${names(stayDone)} (마치고 하원)`);
    if (stayMoved.length) bits.push(`${names(stayMoved)} (숙제로)`);
    L.push(`· ${STAY_LABEL}: ${bits.join(", ")}`);
  }

  const notices = [...(r.notices || [])];
  if (rep.notice) notices.push(rep.notice);
  if (notices.length) {
    L.push("");
    notices.forEach((n) => L.push(withBullets(n)));
  }

  if (msg.closing) {
    L.push("");
    L.push(msg.closing);
  }

  return L.join("\n");
}

/**
 * **숙제 안내 — 아이에게 가는 「할 것」.**
 *
 * 여기에는 **오늘 있었던 일을 안 적는다.** 출결도 점수도 태도도 리포트의
 * 몫이다. 아이가 이 글을 여는 까닭은 하나 — **오늘 뭘 해야 하나.**
 *
 * 못 한 것은 「채워야 할 것」 한 자리에 모은다. 지난 숙제에서 남은 것과
 * 남아서 하다 만 것은 아이에게는 결국 같은 일이다 — 오늘 해야 하는 것이다.
 * 두 칸으로 나눠 적으면 한 칸을 안 본다.
 */
export function buildHomeworkText(r, date, academy = "클로이영어", msg = {}) {
  const L = [];
  // 아이는 자기 화면에서 자기 것만 본다 — 이름을 다시 적을 자리가 아니다
  L.push(`${dateLabel(date)} 숙제`);
  L.push("");

  /**
   * **학생공지는 맨 위에** (값-지도 P0-3, 2026-08-15). 화면이 「숙제 안내
   * 맨 위에 들어갑니다」 라고 약속해 놓고 여기서 안 읽어서, 적어도 아무
   * 데도 안 나가는 칸이었다.
   */
  if ((r.notice_student || "").trim()) {
    L.push(r.notice_student.trim());
    L.push("");
  }

  if (!r.next?.length) {
    L.push("오늘은 따로 나간 숙제가 없습니다.");
  } else {
    r.next.forEach((n) => {
      const detail = [...(n.units || []), n.note].filter(Boolean).join(", ");
      L.push(detail ? `· ${n.name} — ${detail}` : `· ${n.name}`);
    });
  }

  /**
   * **「밀린 것」 — 한 자리에.**
   *
   * 처음에는 「채워야 할 것」 이라고 적었는데 원장님이 「채워야할것은 뭐지?」
   * 라고 물으셨다. **만든 사람이 설명해야 알 수 있는 이름은 틀린 이름이다.**
   * 원장님이 못 알아보시면 아이는 더 못 알아본다.
   *
   * 지난 숙제에서 남은 것(미제출·미흡)과 남아서 하다 만 것은 아이에게는
   * 결국 같은 일이다 — 오늘 해야 하는 것. 두 칸으로 나눠 적으면 한 칸은 안 본다.
   */
  const late = (r.checks || []).filter((c) => c.status === "missing" || c.status === "weak");
  const moved = (r.stay || []).filter((t) => t.status === "moved");
  if (late.length || moved.length) {
    L.push("");
    L.push("▶ 밀린 것");
    late.forEach((c) =>
      L.push(`· ${c.name} ${c.status === "missing" ? "미제출" : "미흡"}`)
    );
    moved.forEach((t) => L.push(`· ${t.body}`));
  }

  // 경고 · 반성문 (학생에게)
  const warn = warningLines(r.warn, r.warn?.rule, false, date);
  if (warn.length) {
    L.push("");
    warn.forEach((x) => L.push(x));
  }

  // 숙제 문자에는 **학생용 공지**만 넣는다 (학부모용은 데일리리포트로 간다)
  const notices = [...(r.studentNotices || [])];
  if (notices.length) {
    L.push("");
    notices.forEach((n) => L.push(withBullets(n)));
  }
  if (msg.closing) {
    L.push("");
    L.push(msg.closing);
  }

  return L.join("\n");
}
