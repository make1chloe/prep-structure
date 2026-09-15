/** 학교 · 순수 판단(표를 안 읽는다 · 화면 부품이 그대로 가져다 쓴다). 손은 lib/schools.js */
export const LEVELS = Object.freeze([["elem", "초"], ["middle", "중"], ["high", "고"]]);
export const levelName = (k) => LEVELS.find(([x]) => x === k)?.[1] ?? "";
/** 이름 끝으로 급을 짐작한다(「분당중학교」→ 중 · 「서현고」→ 고) · 못 알면 null(고르게 한다) */
export function guessLevel(name) { const n = String(name ?? "").trim(); return /고등학교$|고교$|고$/.test(n) ? "high" : /초등학교$|초교$|초$/.test(n) ? "elem" : /중학교$|중$/.test(n) ? "middle" : null; }
