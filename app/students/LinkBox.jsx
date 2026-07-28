"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { makeLinkCode, unlinkStudent, linkStatus } from "./linkActions";

/**
 * 학생에게 줄 연결 코드.
 *
 * 학생이 스스로 가입한 뒤 이 코드를 넣으면 그 계정이 이 학생에 붙는다.
 * 코드는 하루짜리고 한 번 쓰면 죽는다.
 */
export default function LinkBox({ studentId, name }) {
  const [st, setSt] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    linkStatus(studentId).then((r) => alive && setSt(r));
    return () => { alive = false; };
  }, [studentId]);

  function reload() {
    linkStatus(studentId).then(setSt);
    router.refresh();
  }

  if (!st) return <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>;
  if (st.error) return <div className="err">{st.error}</div>;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>{name} 계정</b>
        <span className={`tag ${st.linked ? "tag-mint" : "tag-muted"}`}>
          {st.linked ? "연결됨" : "아직 없음"}
        </span>
        <span className="spacer" />
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await makeLinkCode(studentId);
              if (r?.error) alert(r.error);
              reload();
            })
          }
        >
          {st.code ? "코드 새로 뽑기" : "연결 코드 뽑기"}
        </button>
        {st.linked && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm(`${name} 학생의 계정 연결을 끊을까요?`)) return;
              startTransition(async () => {
                const r = await unlinkStudent(studentId);
                if (r?.error) alert(r.error);
                reload();
              });
            }}
          >
            연결 끊기
          </button>
        )}
      </div>

      {st.code && (
        <div className="card card-tight" style={{ background: "var(--surface-2)" }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 6, textAlign: "center" }}>
            {st.code.code}
          </div>
          <p className="hint" style={{ margin: "6px 0 0", textAlign: "center" }}>
            {new Date(st.code.expires_at).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}{" "}
            까지
          </p>
        </div>
      )}

      <ol className="hint" style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
        <li>학생이 <b>/login</b> 에서 <b>처음이신가요? 가입하기</b> 로 이메일·비밀번호를 만든다</li>
        <li>가입하면 코드 넣는 화면이 바로 나온다 — 위 6자리를 넣는다</li>
        <li>넣는 순간 이 학생 화면으로 들어간다</li>
      </ol>
      {!st.linked && (
        <p className="hint" style={{ margin: 0, fontSize: 12 }}>
          로그인 없이 화면만 보시려면 <b>체험</b> 버튼을 쓰시면 됩니다 — 계정이 필요 없습니다.
        </p>
      )}
    </div>
  );
}
