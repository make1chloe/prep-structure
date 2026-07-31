"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { pwChanged, setMyPassword } from "./pwActions";

/**
 * 처음 들어왔을 때 · 선생님이 되돌렸을 때 — 비밀번호부터 정한다.
 *
 * 0000 인 채로 두면 다른 아이가 들어갈 수 있다.
 * 아이들이 쓰는 화면이라 조건은 **네 자리 이상** 하나뿐이다.
 */
export default function ChangePw({ name }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    setErr("");
    if (pw.length < 4) return setErr("네 자리 이상으로 정해주세요.");
    if (pw === "0000") return setErr("0000 말고 다른 것으로 정해주세요.");
    if (pw !== pw2) return setErr("두 번 넣은 것이 서로 달라요.");

    startTransition(async () => {
      // 서버가 직접 바꾼다 — 진짜로 바뀌어야 이 화면을 지나간다
      const res = await setMyPassword(pw);
      if (res?.error) { setErr(res.error); return; }
      if (res?.byServer) { router.refresh(); return; }

      // 열쇠가 아직 없는 동안에는 예전 길로 (아이가 여기서 막히면 안 된다)
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { setErr(error.message); return; }
      const done = await pwChanged();
      if (done?.error) { setErr(done.error); return; }
      router.refresh();
    });
  }

  return (
    <main className="wrap" style={{ maxWidth: 460 }}>
      <div className="page-head">
        <h1 className="h1">{name ? `${name} 학생, 반가워요` : "클로이영어"}</h1>
        <p className="sub">쓸 비밀번호를 정해주세요. 다음부터 이걸로 들어옵니다.</p>
      </div>
      <div className="card stack" style={{ gap: 10 }}>
        {err && <div className="err">{err}</div>}
        <div className="field">
          <label className="label">새 비밀번호</label>
          <input
            className="input"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="네 자리 이상"
          />
        </div>
        <div className="field">
          <label className="label">한 번 더</label>
          <input
            className="input"
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={pending} onClick={save}>
          {pending ? "저장 중…" : "정하기"}
        </button>
        <p className="hint" style={{ margin: 0, fontSize: 12.5 }}>
          잊어버리면 선생님께 말씀드리면 다시 <b>0000</b> 으로 만들어 주세요.
        </p>
      </div>
    </main>
  );
}
