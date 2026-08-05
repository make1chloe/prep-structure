"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  parentStatus, createParentLogin, resetParentPassword, unlinkParent,
} from "./parentActions";

/**
 * 학부모 계정.
 *
 * 학생 계정과 같은 방식이다 — 학원이 아이디를 주고 비번은 0000 으로 시작한다.
 * 다른 것이 하나 있다: **형제자매는 계정 하나로 둘 다 본다.** 형제를 묶어두신
 * 이유가 그것이라, 여기서 만들면 형제가 자동으로 같이 붙는다.
 */
export default function ParentBox({ studentId, name }) {
  const [st, setSt] = useState(null);
  const [wantId, setWantId] = useState("");
  const [made, setMade] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    setMade(null);
    parentStatus(studentId).then((r) => {
      if (!alive) return;
      setSt(r);
      setWantId(r?.suggest || "");
    });
    return () => { alive = false; };
  }, [studentId]);

  function reload() {
    parentStatus(studentId).then(setSt);
    router.refresh();
  }

  if (!st) return <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>;
  if (st.error) return <div className="err">{st.error}</div>;

  const sibNames = st.siblings.filter((s) => s.id !== studentId).map((s) => s.name);

  return (
    <div className="stack" style={{ gap: 8, marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13.5 }}>{name} 학부모 계정</b>
        {st.linked ? (
          <>
            <span className="tag tag-mint">아이디 {st.loginId}</span>
            {st.mustChange && <span className="tag tag-amber">비번 0000</span>}
            {st.children.length > 1 && (
              <span className="tag tag-lav">{st.children.join(" · ")} 함께 봄</span>
            )}
          </>
        ) : st.siblingOnly ? (
          <span className="tag tag-amber">형제 계정이 이미 있어요</span>
        ) : (
          <span className="tag tag-muted">아직 없음</span>
        )}
      </div>

      {!st.hasKey && !st.linked && (
        <div className="notice" style={{ fontSize: 12.5 }}>
          학부모 계정을 만들려면 <b>설정 → Supabase · AI 키</b> 에 service_role 키를
          한 번 넣어주셔야 합니다.
        </div>
      )}

      {!st.linked ? (
        <>
          {st.siblingOnly ? (
            <p className="hint" style={{ margin: 0, lineHeight: 1.7 }}>
              <b>{sibNames.join(", ")}</b> 학부모 계정이 이미 있습니다. 새로 만들지 않고
              그 계정에 <b>{name}</b> 을(를) 붙입니다 — 로그인 하나로 아이 둘을 다 보십니다.
            </p>
          ) : (
            <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span className="hint" style={{ fontSize: 12 }}>아이디</span>
              <input
                className="input input-sm"
                style={{ width: 160 }}
                value={wantId}
                onChange={(e) => setWantId(e.target.value.toLowerCase())}
                placeholder="chloe0001p"
              />
            </div>
          )}
          <button
            className="btn btn-primary btn-sm"
            style={{ alignSelf: "flex-start" }}
            disabled={pending || (!st.hasKey && !st.siblingOnly)}
            onClick={() =>
              startTransition(async () => {
                const r = await createParentLogin(studentId, wantId);
                if (r?.error) { alert(r.error); return; }
                setMade(r);
                reload();
              })
            }
          >
            {st.siblingOnly ? "형제 계정에 붙이기" : "학부모 계정 만들기"}
          </button>
          {!st.siblingOnly && sibNames.length > 0 && (
            <p className="hint" style={{ margin: 0 }}>
              형제 <b>{sibNames.join(", ")}</b> 도 이 계정 하나로 같이 보게 됩니다.
            </p>
          )}
        </>
      ) : (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button
            className="btn btn-sm"
            disabled={pending || !st.hasKey}
            title="학부모님이 비밀번호를 잊었을 때"
            onClick={() => {
              if (!confirm(`${name} 학부모 비밀번호를 0000 으로 되돌릴까요?`)) return;
              startTransition(async () => {
                const r = await resetParentPassword(studentId);
                if (r?.error) { alert(r.error); return; }
                setMade(r);
                reload();
              });
            }}
          >
            비밀번호 초기화 (0000)
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm(
                `${name} 을(를) 이 학부모 계정에서 뗄까요?\n\n` +
                "계정 자체는 안 지웁니다 (형제가 아직 붙어 있을 수 있어요)."
              )) return;
              startTransition(async () => {
                const r = await unlinkParent(studentId);
                if (r?.error) { alert(r.error); return; }
                reload();
              });
            }}
          >
            연결 끊기
          </button>
        </div>
      )}

      {made && (
        <div className="card card-tight" style={{ background: "var(--surface-2)", textAlign: "center" }}>
          <p className="hint" style={{ margin: 0, fontSize: 12 }}>학부모님께 알려주세요</p>
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>
            아이디 {made.loginId}
            {made.password ? ` · 비번 ${made.password}` : ""}
          </div>
          <p className="hint" style={{ margin: "4px 0 0", fontSize: 12 }}>
            {made.joined
              ? `이미 쓰시던 계정에 붙였습니다. 비밀번호는 그대로예요. (아이 ${made.count}명)`
              : `처음 들어가면 비밀번호를 새로 정하게 됩니다.${made.count > 1 ? ` (아이 ${made.count}명 함께)` : ""}`}
          </p>
        </div>
      )}
    </div>
  );
}
