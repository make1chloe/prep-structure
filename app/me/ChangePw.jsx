"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pwChanged, setMyPassword } from "./pwActions";

/**
 * 처음 들어왔을 때 · 선생님이 되돌렸을 때 — 비밀번호부터 정한다.
 *
 * **첫 비번은 학생·학부모 모두 0000 이다** (2026-08-06). 아이디는 규칙으로
 * 만들어지니 (학부모는 전화번호 그대로다) 0000 인 채로 두면 번호만 아는 사람이
 * 남의 계정에 들어갈 수 있다. 그래서 안전은 이 화면 하나가 지킨다 —
 * **자기 비번을 정하기 전에는 여기서 한 발짝도 못 나간다.**
 * 학생 화면도 학부모 화면도 이 화면을 먼저 지나야 열린다.
 *
 * 아이들이 쓰는 화면이라 조건은 **네 자리 이상** 하나뿐이다.
 *
 * @param who "student" | "parent" — 인사말만 다르다
 */
export default function ChangePw({ name, who = "student" }) {
  const parent = who === "parent";
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

      // 열쇠가 아직 없는 동안에는 예전 길로 (아이가 여기서 막히면 안 된다).
      // supabase-js 는 215kB — 여기까지 내려온 드문 경우에만 내려받는다.
      // 화면 뜰 때 미리 받으면 아이 화면이 그만큼 늦게 열린다.
      const { createClient } = await import("@/lib/supabase/client");
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
        <h1 className="h1">
          {name
            ? parent
              ? `${name} 학부모님, 반갑습니다`
              : `${name} 학생, 반가워요`
            : "클로이영어"}
        </h1>
        <p className="sub">
          쓰실 비밀번호를 정해주세요. 다음부터 이걸로 들어옵니다.
          {parent ? " 정하시기 전에는 아이 화면이 열리지 않습니다." : ""}
        </p>
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
        <p className="hint" style={{ margin: 0, fontSize: 14 }}>
          잊어버리면 선생님께 말씀해주세요. 다시 <b>0000</b> 으로 돌려드리고,
          들어오시면 여기서 새로 정하시면 됩니다.
        </p>
        {/**
          * **여기서 나갈 길이 없었다** (원장님, 2026-08-11 — 「학부모페이지는
          * 아직 확인못했어 근데 로그아웃이 안돼」).
          *
          * 이 화면은 비밀번호를 정하기 전에는 아무 데도 안 열리게 앞을 막는
          * 자리다. 그런데 **로그아웃 단추가 없었다** — 남의 계정으로 잘못
          * 들어오거나, 확인만 해보려던 것이면 나갈 방법이 아예 없다.
          * 홈 화면에 담아 여신 경우에는 주소창조차 없다.
          */}
        <form action="/logout" method="post">
          <button className="btn btn-ghost btn-block" type="submit">로그아웃</button>
        </form>
      </div>
    </main>
  );
}
