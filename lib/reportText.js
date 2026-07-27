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
  const d = new Date(`${date}T00:00:00+09:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
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

  const notices = [...(r.notices || [])];
  if (r.report?.notice) notices.push(r.report.notice);
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
