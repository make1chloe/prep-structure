"use client";
/** 학원 회선 더하기 단추 — 원장님이 학원에서 한 번 누른다(답 ⑨). 서버가 그 자리의 주소를 읽어 적는다 */
import { useState, useTransition } from "react";
import { allowThisIp } from "./actions.js";
export default function IpCard() {
  const [msg, setMsg] = useState(""); const [, start] = useTransition();
  return (<div className="wv" style={{ marginTop: 8 }}>
    <button type="button" className="btn sm pri" data-act="allow-ip" onClick={() => start(async () => { const r = await allowThisIp(); setMsg(r.ok ? (r.added ? `더했습니다 — ${r.ip}` : `이미 있습니다 — ${r.ip}`) : r.msg); })}>지금 이 자리의 주소 더하기</button>
    {msg && <span className="note" style={{ margin: 0 }} data-g="ip-msg">{msg}</span>}
  </div>);
}
