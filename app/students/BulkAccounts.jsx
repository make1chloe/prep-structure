"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAllStudentLogins, createAllParentLogins } from "./accountActions";

/**
 * 계정이 없는 재원생 전부에게 한 번에 아이디를 만들어 준다.
 *
 * 만들고 나면 **누구 아이디가 무엇인지** 한 화면에 모아 보여준다.
 * 이걸 그대로 복사해서 반톡에 올리거나 인쇄해서 나눠주면 된다 —
 * 학생마다 [계정] 을 다시 열어보게 하면 그게 또 스무 번이다.
 */
export default function BulkAccounts({ who = "student" }) {
  const [res, setRes] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 학생과 학부모는 **같은 화면**을 쓴다. 규칙도 비밀번호도 같아서,
  // 화면을 둘로 두면 「학부모는 어떻게 하더라」 를 매번 다시 떠올려야 한다.
  const parent = who === "parent";
  const lines = (res?.made || []).map(
    (m) => `${m.name}${parent && m.kids > 1 ? ` (${m.kids}명)` : ""}  ${m.loginId}  ${res.password}`
  );

  return (
    <div className="card card-tight" style={{ marginTop: 10 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>{parent ? "학부모" : "학생"} 계정 한 번에 만들기</b>
        <span className="spacer" />
        <button
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={() => {
            if (!confirm(
              parent
                ? "재원생 학부모 전부에게 아이디를 만들까요?\n어머니 번호가 같으면 한 계정으로 묶입니다. 이미 있는 분은 건드리지 않습니다."
                : "계정이 없는 재원생 전부에게 아이디를 만들까요?\n이미 있는 학생은 건드리지 않습니다."
            )) return;
            startTransition(async () => {
              const r = parent ? await createAllParentLogins() : await createAllStudentLogins();
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
        {parent ? (
          <>
            아이디는 <b>어머니 전화번호 그대로</b>입니다 — <b>01012345678</b>.
            (하이픈 없이 숫자만) 학생 아이디는 chloe 로 시작해서 안 겹칩니다.
            <br />
            비밀번호는 모두 <b>0000</b> 이고, 어머니가 처음 들어가시면 새로 정합니다.
            <b> 형제자매는 한 계정</b>으로 묶여서 한 번 로그인하면 두 아이가 다 보입니다.
          </>
        ) : (
          <>
            아이디는 <b>chloe0001</b> 부터 차례로, 비밀번호는 모두 <b>0000</b> 입니다.
            학생이 처음 들어가면 비밀번호를 새로 정합니다. 이미 계정이 있는 학생은 그대로 둡니다.
          </>
        )}
      </p>

      {res && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          {res.made.length === 0 && res.failed.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>
              새로 만들 것이 없었어요 — 이미 다 만들어져 있습니다.
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

          {/* 번호가 없으면 아이디를 만들 수가 없다. 누구인지 이름을 대준다 —
              「몇 명 안 됐어요」 만 보고는 누구를 챙겨야 할지 알 수 없다 */}
          {res.noPhone?.length > 0 && (
            <div className="notice">
              <b>학부모 번호가 없어서 못 만든 학생 {res.noPhone.length}명</b>
              <br />
              <span style={{ fontSize: 12.5 }}>{res.noPhone.join(", ")}</span>
              <br />
              <span className="hint">재원생 정보에 어머니 번호를 넣고 다시 눌러주세요.</span>
            </div>
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
