"use client";

import { useState } from "react";
import BrandMark from "@/components/BrandMark";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * 이 사람이 첫 화면으로 가야 할 곳.
 *
 * 역할을 못 읽으면 `/me` 로 보낸다 — 학생·학부모가 훨씬 많고, 선생님이면
 * 거기서 대시보드로 가는 단추가 있다 (막다른 곳이 아니다).
 */
const HOME = {
  principal: "/",
  instructor: "/",
  assistant: "/",
  parent: "/parent",
  student: "/me",
};

async function goHome(supabase, router) {
  let to = "/me";
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles").select("role").eq("id", user.id).maybeSingle();
      to = HOME[data?.role] || "/me";
    }
  } catch {
    // 역할을 못 읽어도 로그인은 됐다 — 들여보내고 화면에서 갈린다
  }
  router.push(to);
  router.refresh();
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  // 학생은 학원이 준 아이디로 들어온다 (chloe0001 · 처음엔 0000).
  // 아이디에는 @ 가 없으므로 그것만 보고 갈라서 이메일로 바꿔준다.
  const [mode, setMode] = useState("in");   // in | up

  async function signIn(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const supabase = createClient();

    // 아이디로 들어왔으면 그 아이디의 이메일을 찾아 바꿔 넣는다
    let id = email.trim();
    if (id && !id.includes("@")) {
      const { data } = await supabase.rpc("email_for_login_id", { p_login_id: id });
      if (!data) {
        setLoading(false);
        setErr("아이디 또는 비밀번호가 맞지 않아요.");
        return;
      }
      id = data;
    }

    const { error } = await supabase.auth.signInWithPassword({ email: id, password });
    setLoading(false);
    if (error) {
      setErr(
        /invalid/i.test(error.message || "")
          ? "아이디 또는 비밀번호가 맞지 않아요."
          : error.message || "로그인에 실패했습니다."
      );
      return;
    }
    /**
     * **들어가면 자기 자리로** (원장님, 2026-08-07 — 「로그인시 원장 첫화면은
     * 대시보드로 고정하고」).
     *
     * 지금까지는 누구든 `/me` 로 보냈다. 학생 화면이라 원장님은 거기서
     * 「학생이 없습니다」 를 보시고 다시 대시보드로 옮겨 가셔야 했다.
     * 전에 「원장 로그인하면 학생 화면이 나와」 라고 하셨을 때 나는 계정의
     * 역할만 고쳤는데, **로그인 자체가 자리를 하나로 박아두고 있었다.**
     */
    await goHome(supabase, router);
  }

  async function signUp(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setErr(error.message || "가입에 실패했습니다.");
      return;
    }
    // 메일 확인이 켜져 있으면 아직 로그인 상태가 아니다
    if (!data?.session) {
      setMsg("가입 메일을 보냈어요. 메일에서 확인한 뒤 다시 로그인해주세요.");
      setMode("in");
      return;
    }
    await goHome(supabase, router);
  }

  async function signInGoogle() {
    setErr("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
  }

  return (
    <div className="login-wrap">
      <div className="login-card card stack">
        <div>
          <div className="login-logo">
            <BrandMark />
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-.02em" }}>
              클로이영어
            </span>
          </div>
          <p className="sub" style={{ textAlign: "center", margin: "4px 0 0" }}>
            학습관리 시스템 로그인
          </p>
        </div>

        {!isSupabaseConfigured && (
          <div className="notice">
            아직 Supabase 접속 정보가 설정되지 않았습니다. 배포 환경변수(<b>NEXT_PUBLIC_SUPABASE_URL</b>,{" "}
            <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b>)를 넣으면 로그인이 활성화됩니다.
          </div>
        )}

        {err && <div className="err">{err}</div>}
        {msg && <div className="notice">{msg}</div>}

        <form onSubmit={mode === "in" ? signIn : signUp} className="stack">
          <div className="field">
            <label className="label">{mode === "in" ? "아이디 또는 이메일" : "이메일"}</label>
            <input
              className="input"
              type={mode === "in" ? "text" : "email"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === "in" ? "chloe0001" : "you@example.com"}
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </div>
          <div className="field">
            <label className="label">비밀번호</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? "잠시만요…" : mode === "in" ? "로그인" : "가입하기"}
          </button>
        </form>

        {/* 학생이 처음 들어올 때 — 가입하고 선생님께 받은 코드를 넣으면 된다 */}
        <button
          className="btn btn-ghost btn-block"
          type="button"
          onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); setMsg(""); }}
        >
          {mode === "in" ? "처음이신가요? 가입하기" : "이미 계정이 있어요 · 로그인"}
        </button>
        {mode === "in" ? (
          <p className="hint" style={{ margin: 0, fontSize: 12.5 }}>
            학생은 <b>선생님께 받은 아이디</b>로 들어오세요. 비밀번호를 잊었으면
            선생님께 말씀드리면 됩니다.
          </p>
        ) : (
          <p className="hint" style={{ margin: 0, fontSize: 12.5 }}>
            선생님·학부모 계정용입니다. 학생은 가입하지 않아도 됩니다.
          </p>
        )}

        <div className="divider">또는</div>

        <button className="btn btn-block" type="button" onClick={signInGoogle}>
          Google 계정으로 로그인
        </button>
      </div>
    </div>
  );
}
