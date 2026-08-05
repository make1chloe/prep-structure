"use client";

import { useState, useTransition } from "react";
import { getCalendarToken, newCalendarToken } from "./calendarActions";

/**
 * 구글 캘린더에서 **구독**하기.
 *
 * 원래 쓰시던 구글 캘린더에 앱 일정이 저절로 따라오게 한다. 폰 캘린더에도
 * 같이 뜬다. 한 방향이다 — 앱에서 넣은 것이 구글로 간다.
 */
export default function GoogleSync() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(undefined);   // undefined = 아직 안 물어봄
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/api/calendar?t=${token}`
      : "";

  function load() {
    setOpen(true);
    if (token !== undefined) return;
    startTransition(async () => {
      const r = await getCalendarToken();
      setErr(r.error);
      setToken(r.token);
    });
  }

  function issue() {
    startTransition(async () => {
      const r = await newCalendarToken();
      if (r.error) { setErr(r.error); return; }
      setErr(null);
      setToken(r.token);
      setCopied(false);
    });
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={load}>
        구글 캘린더에 넣기
      </button>
    );
  }

  return (
    <div className="card sect sect-info" style={{ marginBottom: 10, width: "100%" }}>
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <h2 className="secthead" style={{ margin: 0 }}>구글 캘린더에 넣기</h2>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>

      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

      {!err && token === null && (
        <>
          <p className="hint" style={{ margin: "8px 0", lineHeight: 1.7 }}>
            주소를 하나 만들면 구글 캘린더가 그 주소를 <b>계속 읽어갑니다.</b> 앱에서
            일정을 넣거나 고치면 구글에도 따라옵니다 (구글이 몇 시간에 한 번 읽어가서
            바로는 아닙니다). 폰 캘린더에도 같이 떠요.
          </p>
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={issue}>
            {pending ? "만드는 중…" : "주소 만들기"}
          </button>
        </>
      )}

      {!err && token && (
        <>
          <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center" }}>
            <input className="input input-sm" style={{ flex: 1 }} readOnly value={url} />
            <button
              className="btn btn-sm"
              onClick={() => {
                navigator.clipboard?.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? "복사했어요" : "복사"}
            </button>
          </div>

          <div className="notice" style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.9 }}>
            <b>구글 캘린더에 넣는 법</b>
            <br />
            ① 컴퓨터에서{" "}
            <a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noreferrer">
              calendar.google.com
            </a>{" "}
            열기 (폰 앱에서는 이 메뉴가 없습니다)
            <br />
            ② 왼쪽 <b>다른 캘린더 ＋</b> → <b>URL로 만들기</b>
            <br />
            ③ 위 주소를 붙여넣고 <b>캘린더 추가</b>
            <br />
            ④ 폰은 그다음에 저절로 따라옵니다
          </div>

          <p className="hint" style={{ margin: "8px 0 0", lineHeight: 1.7 }}>
            <b>이 주소를 아는 사람은 학원 일정을 볼 수 있습니다.</b> 그래서 학생 이름과
            「나만 보기」 일정은 안 담습니다. 어디에 흘렸다 싶으면 아래에서 새로 만드세요 —
            <b>옛 주소는 그 자리에서 죽습니다</b> (구글에서도 지우고 새로 넣으셔야 합니다).
          </p>
          <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center" }}>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                if (!confirm("새 주소를 만들면 지금 주소는 못 쓰게 됩니다.\n구글 캘린더에서도 지우고 다시 넣으셔야 해요.\n\n만들까요?")) return;
                issue();
              }}
            >
              주소 새로 만들기
            </button>
            <span className="hint">
              구글에서 넣은 일정은 앱으로 <b>안 옵니다</b> — 한 방향이에요.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
