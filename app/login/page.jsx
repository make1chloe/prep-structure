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
  const [loading, setLoading] = useState(false);

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

        <form onSubmit={signIn} className="stack">
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
            {loading ? "로그인 중…" : "로그인"}
          </button>
        </form>

        <div className="divider">또는</div>

        <button className="btn btn-block" type="button" onClick={signInGoogle}>
          Google 계정으로 로그인
        </button>
      </div>
    </div>
  );
}
