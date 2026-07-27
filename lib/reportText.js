import { parts } from "./day.js";
import { warningLines } from "./warnings.js";

/**
 * 늦귀가과제의 이름. 화면·문자에 나가는 말은 전부 여기 하나를 본다.
 * 바꾸고 싶으면 이 줄만 고치면 된다. ("클리닉", "남은 과제" 등)
 */
export const STAY_LABEL = "오늘 마무리";
// 데일리리포트 문구 생성 — 이미 입력한 값만 조합한다 (원칙1: 다시 적지 않는다)

const ATT_LABEL = {
  present: "정시 등원",
  late: "지각",
  absent: "결석",
  makeup: "보강 수업",
  early_leave: "조퇴",
  online: "온라인 수업",
};

const MARK_LABEL = { done: "완료", weak: "미흡", missing: "미제출" };

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
      L.push(rep.notice);
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

  if (rep.word_total) L.push(`· 단어 테스트: ${rep.word_correct ?? 0}/${rep.word_total}`);
  if (rep.sent_total) L.push(`· 문장 테스트: ${rep.sent_correct ?? 0}/${rep.sent_total}`);

  if (r.checks?.length) {
    const txt = r.checks
      .map((c) => `${c.name} ${MARK_LABEL[c.status] || ""}`.trim())
      .join(" / ");
    L.push(`· 숙제: ${txt}`);
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

  // 오늘 남아서 한 것 (오늘 마무리)
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
    notices.forEach((n) => L.push(`※ ${n}`));
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

  // 못 끝내고 숙제로 넘긴 오늘 마무리
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
    notices.forEach((n) => L.push(`※ ${n}`));
  }
  if (msg.closing) {
    L.push("");
    L.push(msg.closing);
  }

  return L.join("\n");
}
