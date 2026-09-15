"use client";
/** 01 판 — **한 번에 한 아이**((어12) · 원장님 2026-09-13 「쓸데없는 설명을 빼고 직관적으로 기능을 파악하고 생각의 흐름에 따라 페이지를 따라가게」).
 *  열린 아이 하나를 여기서 들고 줄(row.js)이 읽는다. PC(≥1100px · 목업 .split)에서는 이름이 왼쪽 열, 판이 오른쪽 열 · 둘이 열리면 판이 겹치므로 하나만 연다. 폰도 같은 규칙(한 아이씩).
 *  저장하지 않는다 · 브라우저 저장은 배색뿐(폰-7) · PC 는 왼쪽 이름 줄이 늘 보여 「어디 있었나」가 한 번 누르면 돌아온다.
 *  (어28)-② 고르기 · 한 번에(대전제-20 · 원장님 2026-09-15 「ㅇㅇ넣음」): 줄 앞 네모(마감된 줄은 못 고름) · 머리 「전체 N명」 · 고르면 아래 띠에 출결 다섯(판이 없으면 세우고 적는다 · 줄의 손과 같은 길) · 「마감 N」(판이 있는 줄만 · 저장된 글 그대로 · 미래 날은 잠김) */
import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePick, PickAll, PickBar, PickGroup } from "../_shell/pick.js";
import { ATTEND } from "@/lib/day-plan";
import { attendMany, closeMany } from "./actions.js";
const Ctx = createContext({ openId: null, setOpenId: () => {}, pick: null });
export default function Board({ initial = null, rows = [], date = "", future = false, head = null, children }) {
  const [openId, setOpenId] = useState(initial);
  const openRows = useMemo(() => rows.filter((r) => !r.closed), [rows]);
  const ids = useMemo(() => openRows.map((r) => r.id), [openRows]);
  const pk = usePick(ids);
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState("");
  const picked = openRows.filter((r) => pk.has(r.id)), withSheet = picked.filter((r) => r.sheetId);
  const run = (fn) => start(async () => { setErr(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } pk.clear(); router.refresh(); });
  return <Ctx.Provider value={{ openId, setOpenId, pick: pk }}>
    <div className="wv" style={{ marginBottom: 8 }} data-g="pick-head"><PickAll pick={pk} label={`전체 ${openRows.length}명`} disabled={!openRows.length} />{head}</div>
    <div className="split">{children}</div>
    {err && <p className="note" role="alert" style={{ margin: "8px 0 0", color: "var(--miss)" }}>{err}</p>}
    <PickBar pick={pk} unit="명">
      <span className="fl" style={{ margin: 0 }}>출결</span>
      <div className="seg sm" data-g="att-picked">{ATTEND.map(([v, name]) => <button key={v} type="button" disabled={pending} onClick={() => run(() => attendMany(picked.map((r) => ({ studentId: r.id, classId: r.classId })), date, v))}>{name}</button>)}</div>
      <button type="button" className="btn sm pri" disabled={pending || future || !withSheet.length} data-act="close-picked" onClick={() => run(() => closeMany(withSheet.map((r) => r.sheetId)))}>마감 {withSheet.length}</button>
    </PickBar>
  </Ctx.Provider>;
}
/** 줄 하나의 열림 — [열렸나, 열기/닫기, 다음 아이(go 면 연다 · 마감 안 한 다음 줄 · 없으면 null)]((어24) 「저장하고 마감 → 다음 아이」) */
export function useOpen(id) { const { openId, setOpenId } = useContext(Ctx);
  const nextOf = (go = false) => { if (typeof document === "undefined") return null; const ids = [...document.querySelectorAll(".row[data-student]")].filter((el) => !el.classList.contains("closed")).map((el) => el.dataset.student); const i = ids.indexOf(id); const n = ids.find((_, k) => k > i) ?? null; if (go && n) setOpenId(n); return n; };
  return [openId === id, (v) => setOpenId(v ? id : null), nextOf]; }
/** 줄이 읽는 고르기(네모 하나) · 판 밖(고른 것 없음)이면 null */
export function usePickCtx() { return useContext(Ctx).pick; }
/** 반 머리((어31) · 원장님 2026-09-15 「오늘수업에서 반 이름 잘보이게 하고 반별 선택도 가능하게」) · 반 이름 크게(대시보드와 같은 classLabel 을 페이지가 준다) · 「반 전체」 네모는 그 반의 마감 안 한 줄만(줄 네모와 같은 셈 · 다른 반은 그대로) */
export function ClassHead({ id = null, label, count = null, ids = [] }) {   // label 에 시각까지 들어 있다(classLabel · 대시보드와 같은 글)
  const pk = usePickCtx();
  return <div className="wv" style={{ margin: "10px 0 6px" }} data-g="class-head" data-class={id ?? "makeup"}>
    {pk && <PickGroup pick={pk} ids={ids} label="반 전체" />}<b style={{ fontSize: "var(--fs-5)" }}>🏫 {label}</b>{count != null && <span className="pill">{count}명</span>}
  </div>;
}
