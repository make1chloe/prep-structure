/** 한 갈래에 속한 화면끼리 서로 오가는 길 한 벌(원칙-1) — 화면마다 링크를 손으로 적어 두니 **빠진 것이 생겼다**.
 *  2026-09-11 첫 주 돌려보기: 「📄 내신 자료(04)」는 상단 메뉴에서 **두 번 눌러도 못 닿았다** —
 *  회차 카드의 「자료 ↗」 하나뿐이라, 시험 회차가 아직 없는 첫 주에는 들어갈 길이 아예 없었다.
 *  여기 한 곳에만 적고, 화면들은 <Sibs here="/…" /> 로 가져다 쓴다. 지금 있는 화면은 빼고 그린다. */
import Link from "next/link";
export const 갈래 = {
  내신: [["/schedule/grid", "🗂️ 학교별 표"], ["/schedule/exams", "🏫 시험 회차"], ["/schedule/exams/prep", "📄 내신 자료"], ["/schedule/todo", "🗂️ 할 일"]],
};
export const familyOf = (here) => Object.values(갈래).find((xs) => xs.some(([h]) => h === here)) ?? null;
export default function Sibs({ here }) {
  const fam = familyOf(here);
  if (!fam) return null;
  return <>{fam.filter(([h]) => h !== here).map(([h, name]) => <Link prefetch={false} className="btn sm" key={h} href={h} data-g="sib">{name} ↗</Link>)}</>;
}
