"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receiveMaterial, undoReceive } from "./prepReceiptActions";

/**
 * 받을 자료 — **아이가 「받았어요」를 누른다** (0178).
 *
 * 원장님이 자료를 나눠주시고 나서 누가 못 받아 갔는지 일일이 세지 않으시게,
 * 받은 아이가 직접 찍는다.
 *
 * ── 여기 뜨는 자료 ────────────────────────────────────
 * **원장님이 준비를 끝낸 것만** 온다 (만들기·인쇄·클래스카드 중 켜둔 것을
 * 다 끝낸 자료). 목록을 만드는 쪽에서도 거르고 잠금(RLS)에서도 거른다 —
 * 화면만 가리면 앱이 쓰는 통로로 그냥 읽힌다.
 *
 * ── 종이는 학원에서만 ─────────────────────────────────
 * 집에서 눌러버리면 「받았다」는 기록이 거짓이 된다. 등원 체크와 같은
 * 잣대로 학원 와이파이일 때만 열린다. 못 누르는 아이는 **원장님이 대신
 * 찍어주실 수 있다** (내신 대비 화면의 이름 칩).
 *
 * ── 누르면 0.1초 ─────────────────────────────────────
 * 서버 답을 기다리면 한 박자 늦어 아이들이 또 누른다. 먼저 바꾸고 저장은
 * 뒤에서 한다 — 실패하면 되돌리고 알린다 (ArrivalCard 와 같은 결).
 */
export default function PrepReceiptCard({ rows = [], atAcademy = true, readOnly = false }) {
  const [local, setLocal] = useState({});   // material_id → true(받음) / false(되돌림)
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (rows.length === 0) return null;

  const got = (r) => (r.id in local ? local[r.id] : !!r.receivedAt);

  function tap(r, on) {
    if (readOnly) return;
    setLocal((x) => ({ ...x, [r.id]: on }));          // 먼저 바꾼다
    startTransition(async () => {
      const res = on ? await receiveMaterial(r.id) : await undoReceive(r.id);
      if (res?.error) {
        setLocal((x) => ({ ...x, [r.id]: !on }));     // 실패 — 되돌린다
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="card">
      <h2 className="secthead">받을 자료</h2>
      <p className="hint" style={{ margin: "0 0 8px", fontSize: 13 }}>
        선생님께 받으면 눌러주세요. <b>종이 자료는 학원에서만</b> 누를 수 있어요.
      </p>

      <div className="stack" style={{ gap: 6 }}>
        {rows.map((r) => {
          const on = got(r);
          const paper = r.giveKind !== "file";
          const locked = paper && !atAcademy;
          return (
            <div className="unitrow" key={r.id}>
              <b style={{ fontSize: 14.5 }}>{r.name}</b>
              <span className={`tag ${paper ? "tag-muted" : "tag-lav"}`}>
                {paper ? "종이" : "파일"}
              </span>
              {r.scopeName && <span className="hint" style={{ fontSize: 12.5 }}>{r.scopeName}</span>}
              <span className="spacer" />
              {on ? (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending || readOnly}
                  onClick={() => tap(r, false)}
                >
                  받았어요 ✓ · 되돌리기
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  disabled={pending || readOnly || locked}
                  title={locked ? "학원에서 받을 때 눌러주세요" : ""}
                  onClick={() => tap(r, true)}
                >
                  {locked ? "학원에서 받을 때" : "받았어요"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
