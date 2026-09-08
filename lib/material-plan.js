/** 받을 교재·학습지 판단 한 벌(순수, 목업 07 📚 · 07-2 ①) — 단계 넷(아직·받음·하는 중·완료) · 갈래(자료 종류)별 묶음 · 끝낸 것 접기 · 스스로 정한 마감 글. 원장이 나눠 준 것(handed_at)과 아이가 받았다고 찍은 것(got_at)은 다른 사실(0013) */
import { daysBetween, md } from "./dash-plan.js";
export const STAGES = Object.freeze([["none", "아직"], ["got", "받음"], ["doing", "하는 중"], ["done", "제출"]]);   // 마지막은 「제출」(원장님 9/8 「학생어플에서 제출」 — 제출한 때는 DB 가 적는다 0145 · 05 풀이·채점 칸이 읽는다)
export const stageName = (k) => STAGES.find(([x]) => x === k)?.[1] ?? k;
export const isStage = (k) => STAGES.some(([x]) => x === k);
/** 갈래별 묶음 — 자료 종류 이름 차례(sort → 이름), 끝낸 것은 따로 */
export function groupGives(rows = []) {
  const open = rows.filter((r) => r.stage !== "done"), done = rows.filter((r) => r.stage === "done");
  const groups = new Map();
  for (const r of open) { const k = r.material?.material_type?.name ?? "그 밖"; if (!groups.has(k)) groups.set(k, { name: k, sort: r.material?.material_type?.sort ?? 0, items: [] }); groups.get(k).items.push(r); }
  return { groups: [...groups.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ko")), done };
}
/** 「9/5까지」 · 「오늘까지」 · 「9/1 — 지났어요」 · 없으면 "" */
export function dueText(dueOn, today) { if (!dueOn) return ""; const n = daysBetween(today, dueOn); return n === 0 ? "오늘까지" : n < 0 ? `${md(dueOn)} — 지났어요` : `${md(dueOn)}까지`; }
export const dueBad = (dueOn, today) => Boolean(dueOn) && daysBetween(today, dueOn) < 0;
