"use client";

import { useState, useTransition } from "react";
import { pushDiag } from "@/app/push/diag";
import { testPush } from "@/app/push/actions";
import { deviceKind, isStandalone, whyUnsupported, lastPushError } from "@/lib/pushClient";

/**
 * **「알림이 안 와요」 를 한 줄로 바꾼다.**
 *
 * 원장님 (2026-08-07)
 *   「1. 학생이 부르는 중 눌러도 알림이 안 와」
 *   「2. 안드로이드폰에서 알림이 안 켜져」
 *
 * 두 번 다 저는 코드를 읽고 「아마 이것일 겁니다」 로 답했다. 그러면
 * 고치고 나서도 맞았는지 알 수가 없고, 다음 주에 같은 말을 듣는다.
 *
 * 여기 있는 것은 고치는 단추가 아니라 **읽는 단추**다. 안 되는 그 폰,
 * 안 되는 그 계정으로 이 화면을 열고 한 번 누르면 —
 * 막힌 문 하나가 이름으로 나온다. 그 이름을 저에게 보내주시면 됩니다.
 *
 * 브라우저에서만 알 수 있는 것(폰 종류 · 허용 여부 · 구독 유무)은 여기서,
 * DB 쪽(SQL · 열쇠 · 갈 곳)은 app/push/diag.js 에서 본다.
 */
export default function PushDiag() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  /** 이 폰이 지금 어떤 상태인가 — 브라우저에게 직접 묻는다 */
  async function browserRows() {
    const out = [];
    const kind = deviceKind();
    const stand = isStandalone();
    const KIND = { ios: "아이폰 · 아이패드", android: "안드로이드", windows: "윈도우", mac: "맥" };
    out.push({ label: "이 기기", state: "ok", detail: `${KIND[kind] || kind}${stand ? " · 홈 화면 앱으로 열림" : " · 브라우저 탭"}` });

    const no = whyUnsupported();
    if (no) {
      out.push({ label: "이 브라우저에서 알림이 되나", state: "bad", detail: no.why, fix: no.fix });
      return out;                              // 여기서 막히면 아래는 볼 것도 없다
    }
    out.push({ label: "이 브라우저에서 알림이 되나", state: "ok", detail: "됩니다." });

    // 허용/차단 — 안드로이드에서 「안 켜져」 의 절반이 여기다.
    // 크롬은 물음창을 두 번 무시하면 **다시 안 묻고** 조용히 막는다
    const perm = typeof Notification !== "undefined" ? Notification.permission : "?";
    out.push(
      perm === "granted"
        ? { label: "폰이 알림을 허용했나", state: "ok", detail: "허용됨." }
        : perm === "denied"
        ? {
            label: "폰이 알림을 허용했나", state: "bad", detail: "차단되어 있습니다.",
            fix: kind === "android"
              ? "크롬 주소창 왼쪽 자물쇠(또는 ⓘ) → 권한 → 알림 → 허용. 그래도 안 되면 안드로이드 설정 → 앱 → Chrome → 알림 을 켜주세요."
              : "주소창 옆 자물쇠에서 이 사이트의 알림을 허용으로 바꿔주세요.",
          }
        : { label: "폰이 알림을 허용했나", state: "warn", detail: "아직 안 물어봤습니다.", fix: "[알림 켜기] 를 눌러주세요." }
    );

    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      out.push(reg
        ? { label: "알림 받는 프로그램(sw.js)", state: "ok", detail: "깔려 있습니다." }
        : { label: "알림 받는 프로그램(sw.js)", state: "bad", detail: "안 깔렸습니다.", fix: "[알림 켜기] 를 눌러주세요. 그래도 안 되면 앱을 지웠다가 다시 담아주세요." });

      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        // 어느 회사 서버로 가는지까지 — 안드로이드는 구글(FCM), 아이폰은 애플
        const ep = sub.endpoint || "";
        const via = /fcm|google/.test(ep) ? "구글" : /apple/.test(ep) ? "애플" : /mozilla/.test(ep) ? "파이어폭스" : "기타";
        out.push({ label: "이 폰이 등록됐나", state: "ok", detail: `됐습니다 (${via} 서버).` });
      } else {
        out.push({ label: "이 폰이 등록됐나", state: "bad", detail: "안 됐습니다.", fix: "[알림 켜기] 를 눌러주세요." });
      }
    } catch (e) {
      out.push({ label: "알림 받는 프로그램(sw.js)", state: "bad", detail: e?.message || String(e) });
    }
    const last = lastPushError();
    if (last) out.push({ label: "마지막 오류", state: "warn", detail: last });
    return out;
  }

  function run() {
    setNote("");
    setRows("loading");
    startTransition(async () => {
      const mine = await browserRows();
      const server = await pushDiag();
      setRows([...mine, ...(server.steps || [])]);
    });
  }

  function send() {
    setNote("보내는 중…");
    startTransition(async () => {
      const r = await testPush();
      setNote(r.error ? `못 보냈어요: ${r.error}` : `${r.note} 폰에 안 뜨면 위 목록을 봐주세요.`);
    });
  }

  if (!open) {
    return (
      <p className="hint" style={{ margin: "10px 0 0" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          알림이 안 와요
        </button>
      </p>
    );
  }

  const ICON = { ok: "✓", bad: "✗", warn: "!" };
  const COLOR = { ok: "var(--mint)", bad: "var(--red)", warn: "var(--amber)" };

  return (
    <div className="sect" style={{ marginTop: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ fontSize: 13.5 }}>알림 점검</b>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>닫기</button>
      </div>
      <p className="hint" style={{ margin: "4px 0 8px", lineHeight: 1.7 }}>
        {/* **안 되는 그 폰에서** 눌러야 뜻이 있다 — 다른 기기에서 누르면
            그 기기가 멀쩡하다는 것만 알게 된다 */}
        알림이 안 오는 <b>그 폰에서</b>, 안 오는 <b>그 계정으로</b> 눌러주세요.
        ✗ 가 뜬 줄이 막힌 곳입니다.
      </p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={pending}>
          점검하기
        </button>
        <button className="btn btn-ghost btn-sm" onClick={send} disabled={pending}>
          나에게 테스트 알림
        </button>
      </div>

      {rows === "loading" && <p className="hint" style={{ marginTop: 8 }}>보는 중…</p>}
      {Array.isArray(rows) && (
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none" }}>
          {rows.map((r, i) => (
            <li key={i} style={{ padding: "5px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
              <span style={{ color: COLOR[r.state], fontWeight: 800, marginRight: 6 }}>
                {ICON[r.state] || "·"}
              </span>
              <b style={{ fontSize: 13 }}>{r.label}</b>
              <span className="hint"> — {r.detail}</span>
              {r.fix && (
                <p className="hint" style={{ margin: "3px 0 0 18px", color: "var(--red)" }}>
                  → {r.fix}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="hint" style={{ marginTop: 8 }}>{note}</p>}
    </div>
  );
}
