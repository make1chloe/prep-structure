"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  // 학생은 스스로 가입한 뒤, 선생님께 받은 연결 코드를 넣는다 (0043)
  const [mode, setMode] = useState("in");   // in | up

  async function signIn(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErr(error.message || "로그인에 실패했습니다.");
      return;
    }
    router.push("/");
    router.refresh();
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
    router.push("/me");
    router.refresh();
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
            <span className="mark">클</span>
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
            <label className="label">이메일</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
        {mode === "up" && (
          <p className="hint" style={{ margin: 0, fontSize: 12.5 }}>
            가입한 뒤 <b>선생님께 받은 6자리 코드</b>를 넣으면 학생 화면으로 들어갑니다.
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
