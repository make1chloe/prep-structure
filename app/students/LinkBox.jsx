"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStudentLogin, resetStudentPassword, accountStatus } from "./accountActions";

/**
 * 학생 아이디 · 비밀번호.
 *
 * 아이들은 이메일도 비밀번호도 잊어버린다. 그래서 학원이 준다.
 *   아이디  chloe0001
 *   비번    0000 → 처음 들어오면 학생이 바꾼다 (바꾸기 전에는 못 지나간다)
 * 또 잊으면 여기서 되돌린다 (다시 0000 이 된다).
 */
export default function LinkBox({ studentId, name }) {
  const [st, setSt] = useState(null);
  const [wantId, setWantId] = useState("");
  const [made, setMade] = useState(null);      // 방금 만든 것 (한 번만 보여준다)
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    accountStatus(studentId).then((r) => {
      if (!alive) return;
      setSt(r);
      setWantId(r?.suggest || "");
    });
    return () => { alive = false; };
  }, [studentId]);

  function reload() {
    accountStatus(studentId).then(setSt);
    router.refresh();
  }

  if (!st) return <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>;
  if (st.error) return <div className="err">{st.error}</div>;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{name} 계정</b>
        {st.linked ? (
          <>
            <span className="tag tag-mint">아이디 {st.loginId}</span>
            {st.mustChange && (
              <span className="tag tag-amber" title="학생이 처음 들어오면 비밀번호를 바꾸게 됩니다">
                첫 비번 그대로
              </span>
            )}
          </>
        ) : (
          <span className="tag tag-muted">아직 없음</span>
        )}
      </div>

      {!st.hasKey && (
        <div className="notice" style={{ fontSize: 14 }}>
          학생 계정을 만들려면 <b>설정 → Supabase SQL → 학생 계정 키</b> 에
          service_role 키를 한 번 넣어주셔야 합니다.
        </div>
      )}

      {!st.linked ? (
        <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="hint" style={{ fontSize: 13 }}>아이디</span>
          <input
            className="input input-sm"
            style={{ width: 160 }}
            value={wantId}
            onChange={(e) => setWantId(e.target.value.toLowerCase())}
            placeholder="chloe0001"
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || !st.hasKey}
            onClick={() =>
              startTransition(async () => {
                const r = await createStudentLogin(studentId, wantId);
                if (r?.error) { alert(r.error); return; }
                setMade({ loginId: r.loginId, password: r.password });
                reload();
              })
            }
          >
            계정 만들기
          </button>
        </div>
      ) : (
        <button
          className="btn btn-sm"
          style={{ alignSelf: "flex-start" }}
          disabled={pending || !st.hasKey}
          title="아이가 비밀번호를 잊었을 때"
          onClick={() => {
            if (!confirm(`${name} 학생의 비밀번호를 0000 으로 되돌릴까요?\n다음에 들어오면 바로 새로 정하게 됩니다.`)) return;
            startTransition(async () => {
              const r = await resetStudentPassword(studentId);
              if (r?.error) { alert(r.error); return; }
              setMade({ loginId: r.loginId, password: r.password });
              reload();
            });
          }}
        >
          비밀번호 초기화 (0000)
        </button>
      )}

      {made && (
        <div className="card card-tight" style={{ background: "var(--surface-2)", textAlign: "center" }}>
          <p className="hint" style={{ margin: 0, fontSize: 13 }}>학생에게 알려주세요</p>
          <div style={{ fontSize: 20.5, fontWeight: 800, marginTop: 4 }}>
            아이디 {made.loginId} · 비번 {made.password}
          </div>
          <p className="hint" style={{ margin: "4px 0 0", fontSize: 13 }}>
            처음 들어가면 비밀번호를 새로 정하게 됩니다.
          </p>
        </div>
      )}

      <p className="hint" style={{ margin: 0, fontSize: 14 }}>
        학생은 <b>/login</b> 에서 이 아이디와 비밀번호로 들어갑니다. 로그인 없이
        화면만 보시려면 <b>학생 화면 보기</b>를 쓰시면 됩니다.
      </p>
    </div>
  );
}
