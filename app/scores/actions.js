"use server";
/** 성적 손 — 학원 사람만. 판단·쓰기는 lib/score.js 한 벌(등급컷 · 문항표 · 대신 넣기 · 확인 · 공개 · 엑셀). 지우는 손이 없다(대전제-6) */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { scoreBoard, setCuts, setQuestions, saveScore, confirmScore, confirmAll, setShow, importScores } from "@/lib/score";
import { parseSheet } from "@/lib/score-plan";
import * as XLSX from "xlsx";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function cutsAct(examId, text) { return wrap(async () => { const { sb } = await staff(); return { cuts: await setCuts(sb, examId, text) }; }); }
export async function questionsAct(examId, text) { return wrap(async () => { const { sb } = await staff(); return setQuestions(sb, examId, text); }); }
export async function saveAct(examId, studentId, f) { return wrap(async () => { const { sb } = await staff(); return saveScore(sb, { examId, studentId, raw: f?.raw, full: f?.full ?? 100, wrongs: f?.wrongs ?? "", note: f?.note ?? null, byWho: "staff" }, await today(sb)); }); }
export async function confirmAct(scoreId, showTo = null) { return wrap(async () => { const { sb } = await staff(); return confirmScore(sb, scoreId, showTo); }); }
export async function confirmAllAct(examId) { return wrap(async () => { const { sb } = await staff(); return confirmAll(sb, examId); }); }
export async function showAct(scoreId, showTo) { return wrap(async () => { const { sb } = await staff(); await setShow(sb, scoreId, showTo); return {}; }); }
export async function importAct(examId, formData) {
  return wrap(async () => {
    const { sb } = await staff(); const date = await today(sb); const board = await scoreBoard(sb, examId, date);
    const f = formData?.get?.("file"); if (!f || typeof f.arrayBuffer !== "function") throw new Error("엑셀 파일을 고르세요");
    const wb = XLSX.read(Buffer.from(await f.arrayBuffer()), { type: "buffer" }); const ws = wb.Sheets[wb.SheetNames[0]]; if (!ws) throw new Error("시트가 없습니다");
    const parsed = parseSheet(XLSX.utils.sheet_to_json(ws, { defval: "" }));
    if (!parsed.length) throw new Error("읽을 줄이 없습니다 — 이름 열(학생명·이름·성명)과 원점수 열이 있어야 합니다");
    return importScores(sb, examId, parsed, board, date);
  });
}
