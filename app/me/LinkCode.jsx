"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLinkCode } from "./linkActions";

/**
 * 가입은 했는데 아직 어느 학생인지 모르는 계정.
 *
 * 선생님께 받은 6자리를 넣으면 붙는다. 아이들이 받아 적는 코드라
 * 소문자로 쳐도 되고 띄어 써도 되게 받는다.
 */
export default function LinkCode() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <main className="wrap" style={{ maxWidth: 460 }}>
      <div className="page-head">
        <h1 className="h1">클로이영어</h1>
        <p className="sub">선생님께 받은 6자리 코드를 넣어주세요.</p>
      </div>
      <div className="card stack" style={{ gap: 10 }}>
        {err && <div className="err">{err}</div>}
        <input
          className="input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={10}
          autoCapitalize="characters"
          style={{ fontSize: 27, letterSpacing: 6, textAlign: "center", fontWeight: 800 }}
        />
        <button
          className="btn btn-primary btn-block"
          disabled={pending || code.trim().length < 4}
          onClick={() =>
            startTransition(async () => {
              setErr("");
              const res = await useLinkCode(code);
              if (!res?.ok) {
                setErr(res?.message || "연결하지 못했어요.");
                return;
              }
              router.refresh();
            })
          }
        >
          {pending ? "확인 중…" : "연결하기"}
        </button>
        <p className="hint" style={{ margin: 0, fontSize: 14 }}>
          코드는 하루만 쓸 수 있어요. 만료됐으면 선생님께 새로 받아주세요.
        </p>
      </div>
    </main>
  );
}
