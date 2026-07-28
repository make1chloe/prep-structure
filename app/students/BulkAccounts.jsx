"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAllStudentLogins } from "./accountActions";

/**
 * 계정이 없는 재원생 전부에게 한 번에 아이디를 만들어 준다.
 *
 * 만들고 나면 **누구 아이디가 무엇인지** 한 화면에 모아 보여준다.
 * 이걸 그대로 복사해서 반톡에 올리거나 인쇄해서 나눠주면 된다 —
 * 학생마다 [계정] 을 다시 열어보게 하면 그게 또 스무 번이다.
 */
export default function BulkAccounts() {
  const [res, setRes] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const lines = (res?.made || []).map((m) => `${m.name}  ${m.loginId}  ${res.password}`);

  return (
    <div className="card card-tight" style={{ marginTop: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>학생 계정 한 번에 만들기</b>
        <span className="spacer" />
        <button
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={() => {
            if (!confirm("계정이 없는 재원생 전부에게 아이디를 만들까요?\n이미 있는 학생은 건드리지 않습니다.")) return;
            startTransition(async () => {
              const r = await createAllStudentLogins();
              if (r?.error) { alert(r.error); return; }
              setRes(r);
              router.refresh();
            });
          }}
        >
          {pending ? "만드는 중…" : "전부 만들기"}
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        아이디는 <b>chloe0001</b> 부터 차례로, 비밀번호는 모두 <b>0000</b> 입니다.
        학생이 처음 들어가면 비밀번호를 새로 정합니다. 이미 계정이 있는 학생은 그대로 둡니다.
      </p>

      {res && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          {res.made.length === 0 && res.failed.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>
              계정이 없는 학생이 없었어요 — 이미 다 만들어져 있습니다.
            </p>
          )}

          {res.made.length > 0 && (
            <>
              <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
                <b style={{ fontSize: 13.5 }}>{res.made.length}명 만들었어요</b>
                <span className="spacer" />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(lines.join("\n"))
                      .then(() => alert("복사했어요. 반톡에 붙여넣으시면 됩니다."))
                      .catch(() => alert("복사하지 못했어요. 아래 목록을 직접 선택해 주세요."));
                  }}
                >
                  목록 복사
                </button>
              </div>
              <pre
                style={{
                  margin: 0, padding: 10, borderRadius: 8, fontSize: 13, lineHeight: 1.7,
                  background: "var(--surface-2)", overflowX: "auto", whiteSpace: "pre",
                }}
              >
{`이름      아이디      비번\n${lines.join("\n")}`}
              </pre>
              <p className="hint" style={{ margin: 0, fontSize: 12 }}>
                이 목록은 <b>지금만 보입니다.</b> 나중에는 학생마다 [계정] 에서 아이디를
                볼 수 있지만, 비밀번호는 학생이 바꾸고 나면 아무도 못 봅니다
                (잊으면 초기화해 주세요).
              </p>
            </>
          )}

          {res.failed.length > 0 && (
            <div className="err">
              <b>{res.failed.length}명은 못 만들었어요</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {res.failed.map((f, i) => (
                  <li key={i} style={{ fontSize: 12.5 }}>{f.name} — {f.why}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
