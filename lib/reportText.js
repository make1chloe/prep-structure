import { parts } from "./day.js";
import { warningLines } from "./warnings.js";
import { score } from "./wordTest.js";

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
export function withBullets(text) {
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
export function reportParts(r, date) {
  const rep = r?.report || {};
  const prog = [...(r?.progress || [])];
  if (rep.own_progress) prog.push(rep.own_progress);

  const checks = (r?.checks || [])
    .map((c) => `${c.name} ${MARK_LABEL[c.status] || ""}`.trim())
    .join(" / ");

  const next = (r?.next || [])
    .map((n) => {
      const detail = [...(n.units || []), n.note].filter(Boolean).join(", ");
      return detail ? `${n.name} — ${detail}` : n.name;
    })
    .join("\n");

  return {
    "{{출결}}": ATT_LABEL[rep.attendance_kind] || "",
    "{{단어시험}}": rep.word_total ? score(rep.word_correct, rep.word_total) : "",
    "{{문장시험}}": rep.sent_total ? score(rep.sent_correct, rep.sent_total) : "",
    "{{진도}}": prog.join(", "),
    "{{숙제검사}}": checks,
    "{{다음숙제}}": next,
    "{{태도}}": rep.attitude ? ATTITUDE_STAR[rep.attitude] || rep.attitude : "",
    "{{학부모공지}}": (rep.notice || "").trim(),
    "{{하원시각}}": rep.late_until || "",
  };
}

export function buildReportText(r, date, academy = "클로이영어", msg = {}) {
  const rep = r.report || {};
  const L = [];

  L.push(`[${academy}] ${r.student.name} 학생 ${dateLabel(date)} 수업 안내`);
  L.push("");
  if (msg.greeting) {
    L.push(msg.greeting);
    L.push("");
  }

  const att = ATT_LABEL[rep.attendance_kind] || null;
  if (att) L.push(`· 출결: ${att}`);

  // 결석이면 수업 내용이 없으니 보강 안내로 대신한다
  if (rep.attendance_kind === "absent") {
    if (rep.notice) {
      L.push("");
      L.push(withBullets(rep.notice));
    } else {
      L.push("");
      L.push("오늘 수업에 참석하지 못했습니다. 보강 일정은 따로 안내드리겠습니다.");
    }
    if (r.next?.length) {
      L.push("");
      L.push("▶ 다음 수업 숙제");
      r.next.forEach((n) => {
        const detail = [...(n.units || []), n.note].filter(Boolean).join(", ");
        L.push(detail ? `· ${n.name} — ${detail}` : `· ${n.name}`);
      });
    }
    if (msg.closing) {
      L.push("");
      L.push(msg.closing);
    }
    return L.join("\n");
  }

  // 틀린 개수로 적는다 — 채점도 통과선도 그쪽 기준이다
  if (rep.word_total) L.push(`· 단어 테스트: ${score(rep.word_correct, rep.word_total)}`);
  if (rep.sent_total) L.push(`· 문장 테스트: ${score(rep.sent_correct, rep.sent_total)}`);

  if (r.checks?.length) {
    const txt = r.checks
      .map((c) => `${c.name} ${MARK_LABEL[c.status] || ""}`.trim())
      .join(" / ");
    L.push(`· 숙제: ${txt}`);
    // 검사하면서 남긴 한 줄 — ○△✕ 만 보내면 "왜 △ 인가" 를 알 수 없다
    r.checks
      .filter((c) => (c.note || "").trim())
      .forEach((c) => L.push(`  · ${c.name}: ${c.note.trim()}`));
    // 못 한 것을 알리는 데서 끝내지 않는다. 어떻게 할지까지 적는다
    const left = r.checks.filter((c) => c.status === "missing" || c.status === "weak").length;
    if (left > 0) L.push("  (못 한 부분은 다음 수업에서 함께 채우겠습니다)");
  }

  const prog = [...(r.progress || [])];
  if (rep.own_progress) prog.push(rep.own_progress);
  if (prog.length) L.push(`· 진도: ${prog.join(", ")}`);

  if (rep.attitude) L.push(`· 태도: ${ATTITUDE_STAR[rep.attitude] || rep.attitude}`);

  if (r.next?.length) {
    L.push("");
    L.push("▶ 다음 수업 숙제");
    r.next.forEach((n) => {
      const detail = [...(n.units || []), n.note].filter(Boolean).join(", ");
      L.push(detail ? `· ${n.name} — ${detail}` : `· ${n.name}`);
    });
  }

  // 경고 · 반성문 (학부모에게)
  const warn = warningLines(r.warn, r.warn?.rule, true, date);
  if (warn.length) {
    L.push("");
    warn.forEach((x) => L.push(x));
  }

  // 오늘 남아서 한 것
  const stayDone = (r.stay || []).filter((t) => t.status === "done");
  const stayMoved = (r.stay || []).filter((t) => t.status === "moved");
  if (stayDone.length || stayMoved.length) {
    L.push("");
    L.push(`▶ ${STAY_LABEL}`);
    stayDone.forEach((t) => L.push(`· ${t.body} — 마치고 하원`));
    stayMoved.forEach((t) => L.push(`· ${t.body} — 다 못 해 숙제로 넘김`));
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

// 숙제만 담은 짧은 문자 (숙제 문자 / 재발송용)
export function buildHomeworkText(r, date, academy = "클로이영어", msg = {}) {
  const L = [];
  L.push(`[${academy}] ${r.student.name} 학생 ${dateLabel(date)} 숙제 안내`);
  L.push("");

  if (!r.next?.length) {
    L.push("오늘은 따로 나간 숙제가 없습니다.");
  } else {
    r.next.forEach((n) => {
      const detail = [...(n.units || []), n.note].filter(Boolean).join(", ");
      L.push(detail ? `· ${n.name} — ${detail}` : `· ${n.name}`);
    });
  }

  // 지난 숙제 중 미제출·미흡은 함께 알려준다
  const late = (r.checks || []).filter((c) => c.status === "missing" || c.status === "weak");
  if (late.length) {
    L.push("");
    L.push("▶ 보충이 필요한 숙제");
    late.forEach((c) =>
      L.push(`· ${c.name} ${c.status === "missing" ? "미제출" : "미흡"}`)
    );
  }

  // 못 끝내고 숙제로 넘긴 늦귀가 과제
  const moved = (r.stay || []).filter((t) => t.status === "moved");
  if (moved.length) {
    L.push("");
    L.push(`▶ ${STAY_LABEL}에서 넘어온 것`);
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
