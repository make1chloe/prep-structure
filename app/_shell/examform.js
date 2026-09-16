"use client";
/** 시험 넣는 자리 한 벌((어52) · 원장님 2026-09-16 「일정입력에 시험날짜 입력이 가능한데, 내신에도 그게 가능해」 · 「입력방식은 일정에서 입력하는 방식이 맞아보여 영어시험일까지 챙기도록」) —
 *  12 일정 · 12b 가져오기 · 06b 학교 시험이 **같은 부품**을 쓴다(원칙-1 · 전에는 12 와 12b 에 같은 칸이 두 벌이라 06b 에는 아예 없었다).
 *  넣으면 v2.exams 한 표에 들어가니 12 달력 · 06b 카드 · 04 자료 · 05 업무 · 16 성적이 저절로 본다(대전제-24) · 손은 examAct 하나 · 출처 manual(가져와도 안 덮는다 · 확정-㊲) */
import { useState } from "react";
import SchoolAdd from "./schooladd.js";
import { examAct } from "../schedule/actions.js";
export const SCOPES = Object.freeze([["school", "학교(중간·기말)"], ["national", "전국(수능·모의)"]]);
export const SAVED = "시험을 넣었습니다(손으로 · 가져와도 안 덮습니다)";   /* 저장 뒤 글도 한 벌 — 세 화면이 같은 말을 한다 */
export const emptyExam = (schoolId = "", date = "") => ({ scope: "school", schoolId, grade: "", name: "", termFrom: date, termTo: date, englishOn: "" });
export default function ExamForm({ schools = [], date, pending, run, onDone = null, done = SAVED }) {
  const [x, setX] = useState(() => emptyExam(schools[0]?.id ?? "", date));
  const set = (k) => (e) => setX({ ...x, [k]: e.target.value });
  return <div className="card" style={{ marginTop: 8 }} data-g="exam-form"><div className="wv">
    <div className="seg sm" data-g="exam-scope">{SCOPES.map(([k, name]) => <button key={k} type="button" aria-pressed={x.scope === k} onClick={() => setX({ ...x, scope: k })}>{name}</button>)}</div>
    {x.scope === "school" && <select value={x.schoolId} onChange={set("schoolId")} aria-label="학교" style={{ width: "auto" }}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
    {x.scope === "school" && <SchoolAdd open={!schools.length} onAdded={(id) => setX((v) => ({ ...v, schoolId: id }))} />}
    <input value={x.grade} onChange={set("grade")} placeholder="학년(비면 전체)" aria-label="학년" inputMode="numeric" style={{ width: 110 }} />
    <input value={x.name} onChange={set("name")} placeholder="이름 (예: 2학기 중간)" aria-label="시험 이름" name="exam-name" style={{ flex: "1 1 160px" }} />
    <span className="note" style={{ margin: 0 }}>기간</span><input type="date" value={x.termFrom} onChange={set("termFrom")} aria-label="시작" style={{ width: "auto" }} /><input type="date" value={x.termTo} onChange={set("termTo")} aria-label="끝" style={{ width: "auto" }} />
    <span className="note" style={{ margin: 0 }}>영어 시험일</span><input type="date" value={x.englishOn} onChange={set("englishOn")} aria-label="영어 시험일" style={{ width: "auto" }} />
    <button className="btn pri sm" type="button" disabled={pending} data-act="exam-save" onClick={() => run(() => examAct(x), done, () => { setX(emptyExam(schools[0]?.id ?? "", date)); onDone?.(); })}>저장</button>
    {onDone && <button className="btn sm gho" type="button" data-act="exam-close" onClick={() => onDone()}>닫기</button>}
  </div></div>;
}
