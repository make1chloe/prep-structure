"use client";
/** 모달 안 오류 한 벌((어49) · 원장님 9/16 「진도체크들어가면 버튼이 제대로 작동하지않음」) · 모달의 손이 실패하면 글은 모달 **안**에 서야 한다.
 *  판(Row)의 alert 는 덮개(.mdlov) 뒤라 안 보였다 · 누른 사람은 「단추가 안 먹힌다」로 읽는다. 모달마다 베끼지 않는다(원칙-1) · fail 꼴은 판과 같다(ok 를 돌려준다) · 성공하면 지난 글은 지운다 */
import { useState } from "react";
export function useModalErr() {
  const [err, setErr] = useState("");
  const fail = (r) => { if (r && !r.ok) { setErr(String(r.msg ?? "실패")); return false; } setErr(""); return Boolean(r?.ok); };
  const node = err ? <div className="lf warn" role="alert" data-g="modal-err" style={{ margin: "0 0 8px" }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div> : null;
  return [fail, node, setErr];
}
/** 서버 손을 부른다 · 네트워크·서버가 죽어 던지면(500 · 끊김) 삼키지 않고 {ok:false, msg} 로 돌려 화면이 되돌리고 말하게 한다(lib/act.js wrap 은 서버 안의 실패만 잡는다) */
export async function call(run) { try { return await run(); } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
