// 늦은 귀가 안내
//
// 남아서 재시험을 보거나 숙제를 마저 하고 가면 평소보다 늦게 나간다.
// 데리러 오시는 학부모께는 **수업 중에** 알려드려야 한다.
//
// 사유는 이미 입력한 것에서 **자동으로 잡는다.** (원칙1: 두 번 적지 않는다)
// 원장님이 더할 것은 **하원 예상 시간** 하나뿐이다.

import { passed, score } from "./wordTest.js";
import { dateLabel, STAY_LABEL } from "./reportText.js";

/** 수업이 늦게 끝나는 시간대 — 자주 쓰는 것부터 */
export const TIME_PRESETS = ["21:00", "21:30", "22:00", "22:30"];

/** "2130" · "9:30" 같은 입력을 "21:30" 으로 */
export function normalizeTime(v) {
  const s = (v || "").toString().trim();
  if (!s) return "";
  const d = s.replace(/[^\d]/g, "");
  if (d.length === 3) return `0${d[0]}:${d.slice(1)}`;
  if (d.length === 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  const m = s.match(/^(\d{1,2})\s*[:시]\s*(\d{1,2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}`;
  if (d.length <= 2) return `${d.padStart(2, "0")}:00`;
  return s;
}

/**
 * 오늘 입력한 것에서 늦게 가는 사유를 뽑는다.
 *
 * @param r    { report, checks:[{name,status}], stay:[{body,status}] }
 * @param rule { wordPassPct }
 * @returns [{ key, label, detail }]
 */
export function lateReasons(r = {}, rule = {}) {
  const rep = r.report || {};
  const out = [];

  // 단어시험을 통과 못 하면 그날 다시 본다
  if (rep.word_total > 0) {
    const ok = passed(rep.word_correct, rep.word_total, rule.wordPassPct ?? 90);
    if (ok === false) {
      out.push({
        key: "retest",
        label: "단어 재시험",
        detail: score(rep.word_correct, rep.word_total),
      });
    }
  }

  // 남아서 채우고 갈 것 (늦귀가 과제에 아직 todo 로 남은 것)
  const todo = (r.stay || []).filter((t) => t.status === "todo");
  if (todo.length > 0) {
    out.push({
      key: "stay",
      label: `${STAY_LABEL}`,
      detail: todo.map((t) => t.body).join(", "),
    });
  } else {
    // 늦귀가 과제로 아직 안 올렸어도, 미제출·미흡이 있으면 늦어질 수 있다
    const late = (r.checks || []).filter((c) => c.status === "missing" || c.status === "weak");
    if (late.length > 0) {
      out.push({
        key: "homework",
        label: "숙제 마무리",
        detail: late.map((c) => c.name).join(", "),
      });
    }
  }

  return out;
}

/**
 * 학부모께 나가는 하원 안내 문구.
 *
 * @param r     { student, report, checks, stay, extraReason }
 * @param until "21:30"
 */
export function buildLateText(r, date, academy = "클로이영어", msg = {}, rule = {}) {
  const until = normalizeTime(r.report?.late_until || r.lateUntil || "");
  const extra = (r.report?.late_reason || r.extraReason || "").trim();
  const auto = lateReasons(r, rule);

  const L = [];
  L.push(`[${academy}] ${r.student.name} 학생 ${dateLabel(date)} 하원 안내`);
  L.push("");
  L.push("오늘은 아래 사유로 평소보다 조금 늦게 마치고 귀가할 예정입니다.");
  L.push("");

  if (auto.length === 0 && !extra) {
    L.push("· 학습 마무리");
  } else {
    auto.forEach((x) => L.push(x.detail ? `· ${x.label} — ${x.detail}` : `· ${x.label}`));
    if (extra) L.push(`· ${extra}`);
  }

  L.push("");
  L.push(until ? `▶ 예상 하원 시간: ${until}` : "▶ 예상 하원 시간: 확인되는 대로 다시 안내드리겠습니다");
  L.push("");
  L.push("귀가 시간에 참고해 주세요.");

  if (msg.phone) {
    L.push("");
    L.push(`문의: ${msg.phone}`);
  }
  return L.join("\n");
}
