/**
 * 시험 — **내 것이 주인이고, 나이스는 붙는 것.**
 *
 * 학교가 언제 시험을 보는지는 학교가 정한다. 하지만 내가 대비하는 시험이
 * 무엇인지 · 언제까지 자료를 만들어야 하는지 · 그 시험을 뭐라고 부를지는
 * 내가 정한다. 그래서 두 벌을 따로 들고 있는다.
 *
 *   from_date · to_date · name   내가 정한 것 — 화면과 계산은 전부 이것을 본다
 *   neis_from · neis_to · neis_name   나이스가 마지막으로 말한 것 (참고)
 *
 * 다시 받아와도 **내 것은 안 바뀐다.** 달라진 것이 있으면 알려만 주고,
 * 반영할지는 내가 누른다. 조용히 바뀌면 시험 3일 전에 자료 일정이
 * 어긋나 있어도 모른다.
 */

const d = (v) => (v ? String(v).slice(0, 10) : null);

/**
 * 출제 선생님 — **여러 명일 수 있다** (0076).
 * 학년별로 나눠 내거나 공동 출제인 경우가 흔하다.
 * "김선생, 박선생" 처럼 적으면 나눠 담는다. 아무도 없으면 null.
 */
export function toTeachers(v) {
  const list = Array.isArray(v) ? v : (v || "").toString().split(/[,·/]+/);
  const out = [...new Set(list.map((t) => t.trim()).filter(Boolean))];
  return out.length ? out : null;
}

/** 화면에 적는 말 — "김선생 · 박선생 출제" */
export function teacherText(exam) {
  const list = exam?.teachers?.length ? exam.teachers : (exam?.teacher ? [exam.teacher] : []);
  return list.length ? `${list.join(" · ")} 출제` : "";
}

/**
 * 나이스가 말하는 것과 내 것이 어떻게 다른가.
 * @returns null (붙은 게 없거나 같다) | { from, to, name, any }
 */
export function neisDiff(exam) {
  if (!exam?.neis_source_id) return null;
  const from = d(exam.neis_from) && d(exam.neis_from) !== d(exam.from_date)
    ? { was: d(exam.from_date), now: d(exam.neis_from) } : null;
  const to = d(exam.neis_to) && d(exam.neis_to) !== d(exam.to_date)
    ? { was: d(exam.to_date), now: d(exam.neis_to) } : null;
  // 이름은 달라도 **문제가 아니다.** 학교는 「1회고사」, 나는 「1학기 중간」 이라
  // 부른다. 알려주되 고치라고 하지는 않는다.
  const name = (exam.neis_name || "") && exam.neis_name !== exam.name
    ? { was: exam.name || "", now: exam.neis_name } : null;
  if (!from && !to && !name) return null;
  return { from, to, name, any: !!(from || to) };
}

/** 사람이 읽는 한 줄 — "학교 일정이 7/1~7/3 → 7/2~7/4 로 바뀌었어요" */
export function diffText(diff) {
  if (!diff) return "";
  const short = (v) => (v ? `${Number(v.slice(5, 7))}/${Number(v.slice(8, 10))}` : "?");
  const parts = [];
  if (diff.from || diff.to) {
    const wasF = short(diff.from?.was ?? diff.to?.was);
    const nowF = short(diff.from?.now ?? diff.from?.was);
    const wasT = short(diff.to?.was);
    const nowT = short(diff.to?.now ?? diff.to?.was);
    parts.push(
      `학교 일정이 ${diff.from ? `${short(diff.from.was)}` : wasF}~${wasT} → ` +
      `${diff.from ? short(diff.from.now) : nowF}~${nowT} 로 바뀌었어요`
    );
  }
  if (diff.name) parts.push(`학교는 「${diff.name.now}」 라고 부릅니다`);
  return parts.join(" · ");
}

/**
 * 나이스 일정 하나가 **어느 내 시험에 붙을 만한가.**
 *
 * 같은 학교이고 기간이 겹치면 같은 시험으로 본다. 학교가 부르는 이름
 * (1회고사 · 1차고사 · 중간고사)은 제각각이라 이름으로는 못 맞춘다.
 */
export function matchExam(neisRow, exams = []) {
  if (!neisRow?.school || !neisRow?.from_date) return null;
  const norm = (v) => (v || "").toString().replace(/\s/g, "");
  const nf = d(neisRow.from_date);
  const nt = d(neisRow.to_date) || nf;
  return (
    exams.find((e) => {
      if (norm(e.school) !== norm(neisRow.school)) return false;
      if (e.neis_source_id && e.neis_source_id !== neisRow.source_id) return false;
      // 기간이 하루라도 겹치면 같은 시험
      return d(e.from_date) <= nt && nf <= d(e.to_date);
    }) || null
  );
}

/**
 * 시험이 지금 어떤 상태인가 — 목록에서 한눈에 보이게.
 *   mine    내가 만든 것 (나이스에 아직 없음)
 *   linked  나이스가 붙어 있고 내 것과 같다
 *   changed 나이스가 붙어 있는데 학교가 날짜를 바꿨다
 */
export function examState(exam) {
  if (!exam?.neis_source_id) return "mine";
  return neisDiff(exam)?.any ? "changed" : "linked";
}

export const STATE_LABEL = {
  mine: "내가 적음",
  linked: "학교 일정과 같음",
  changed: "학교 일정이 바뀜",
};
export const STATE_CLS = {
  mine: "tag-muted",
  linked: "tag-mint",
  changed: "tag-amber",
};
