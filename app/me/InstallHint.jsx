"use client";

import { useEffect, useState } from "react";

// 홈 화면에 추가 안내 — 이미 설치했거나 닫았으면 보이지 않는다
export default function InstallHint() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 홈 화면에서 연 상태면 안내할 필요 없다
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;
    if (standalone) return;
    if (localStorage.getItem("hideInstallHint") === "1") return;

    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua);
    setIos(isIos);
    setShow(true);

    // 안드로이드 크롬은 설치 버튼을 직접 띄울 수 있다
    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function close() {
    localStorage.setItem("hideInstallHint", "1");
    setShow(false);
  }

  async function install() {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
    close();
  }

  if (!show) return null;

  return (
    <div className="card card-tight" style={{ background: "var(--lav-soft)", borderColor: "transparent" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <b style={{ fontSize: 15 }}>앱처럼 쓰기 (선택)</b>
          <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.6 }}>
            {ios ? (
              <>
                아래 <b>공유 버튼 ⬆️</b> → <b>홈 화면에 추가</b> 를 누르면 아이콘이 생겨요.
                <br />
                아이폰은 이렇게 해야 <b>숙제 알림</b>을 받을 수 있습니다.
              </>
            ) : (
              <>
                홈 화면에 추가하면 아이콘으로 바로 열 수 있어요. 그냥 이 링크로 보셔도 됩니다.
              </>
            )}
          </p>
        </div>
        <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
          {prompt && (
            <button className="btn btn-primary btn-sm" onClick={install}>
              설치
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={close}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
