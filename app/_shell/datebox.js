"use client";
/** 날짜·시각 상자 한 벌 — **넣은 값은 지울 수 있다**(원장님 2026-09-19 「시간 날짜를 한번 선택하면 삭제가 안돼 되게해」).
 *
 *  브라우저의 `<input type=date>` 에는 비우는 손이 없다. 폰에서는 아예 지울 길이 없다.
 *  그래서 비어도 되는 칸은 전부 이 한 벌을 쓴다 — **값이 있을 때만** ✕ 가 옆에 선다
 *  (41 열쇠 상자 app/settings/keys.js 가 이미 쓰던 꼴 · 원칙-1 같은 일은 한 벌).
 *
 *  쓰는 법은 `<input>` 과 똑같다 — 이름만 바꾸면 된다. 그래야 38곳을 옮기면서 딸린 것을 안 흘린다:
 *      <input type="date" value={f.dueOn} aria-label="마감" onChange={up("dueOn")} />
 *   →  <DateBox type="date" value={f.dueOn} aria-label="마감" onChange={up("dueOn")} />
 *  ✕ 는 그 onChange 를 빈 값으로 그대로 부른다. 서버는 이미 빈 값을 null 로 받는다(lib/todo.js `due_on: dueOn || null`).
 *  값을 남이 안 쥐고 있으면(defaultValue) 내가 쥔다 — 07 아이 화면의 마감이 그렇다.
 *
 *  ⚠️ 화면이 그 값으로 서 있는 칸에는 쓰지 않는다(01 날짜 고르개) — 비우면 아무 날도 못 연다.
 *     그런 곳은 scripts/check-datebox.mjs 의 KEEP 에 **까닭과 함께** 적는다. */
import { useState } from "react";
import { icon } from "./icon.js";
export function DateBox({ defaultValue, ...p }) {
  const free = p.value === undefined;                       // 남이 안 쥐면 내가 쥔다
  const [own, setOwn] = useState(defaultValue ?? "");
  const v = (free ? own : p.value) ?? "";
  const put = (nv) => { if (free) setOwn(nv); p.onChange?.({ target: { value: nv } }); };
  const name = p["aria-label"] ?? "날짜";
  return (<>
    <input {...p} value={v} onChange={(e) => put(e.target.value)} />
    {v !== "" && !p.disabled && <button type="button" className="btn sm gho" data-act="dt-clear" {...icon(`${name} 비우기`)} onClick={() => put("")}>✕</button>}
  </>);
}
