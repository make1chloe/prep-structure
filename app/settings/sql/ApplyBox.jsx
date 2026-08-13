"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAdminToken, clearAdminToken, applyMissing } from "./apply";

/**
 * 앱이 SQL 을 직접 실행한다.
 *
 * 복사·붙여넣기를 하다 보면 딴 글자가 섞여 들어가 실패한다.
 * Supabase 액세스 토큰을 한 번 넣어두면 앱이 알아서 넣는다.
 */
export default function ApplyBox({ saved = false, projectRef = "", savedRef = "", missingCount = 0 }) {
  const [token, setToken] = useState("");
  const [ref, setRef] = useState(savedRef || projectRef);
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const res = await saveAdminToken(token, ref);
      if (res?.error) {
        alert(res.error);
        return;
      }
      setToken("");
      setOpen(false);
      router.refresh();
    });
  }

  function apply() {
    setLog(null);
    startTransition(async () => {
      const res = await applyMissing();
      if (res?.error) {
        alert(res.error);
        return;
      }
      setLog(res.results || []);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>앱이 대신 실행하기</b>
        {saved ? (
          <span className="tag tag-mint">토큰 저장됨</span>
        ) : (
          <span className="tag tag-muted">토큰 없음</span>
        )}
        <span className="spacer" />
        {saved && missingCount > 0 && (
          <button className="btn btn-primary btn-sm" disabled={pending} onClick={apply}>
            {pending ? "넣는 중…" : `안 들어간 ${missingCount}개 지금 넣기`}
          </button>
        )}
        {saved && missingCount === 0 && <span className="hint">넣을 것이 없습니다</span>}
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
          {open ? "접기" : saved ? "토큰 바꾸기" : "토큰 넣기"}
        </button>
      </div>

      <p className="hint" style={{ margin: "6px 0 0", lineHeight: 1.8 }}>
        복사·붙여넣기를 하다 보면 딴 글자가 섞여 들어가 실패합니다. 토큰을 한 번 넣어두면{" "}
        <b>앱이 직접 넣습니다.</b> 하나씩 넣으므로 실패해도 어느 파일인지 바로 나옵니다.
      </p>

      {open && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          <div className="notice" style={{ fontSize: 14, lineHeight: 1.9 }}>
            <b>토큰 만드는 법</b>
            <br />
            ① <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noreferrer">
              supabase.com/dashboard/account/tokens
            </a>{" "}
            열기
            <br />
            ② <b>Generate new token</b> → 이름은 아무거나 (예: 클로이영어 앱)
            <br />
            &nbsp;&nbsp;&nbsp;스코프를 고르라고 나오면 <b>All</b> (또는 이 프로젝트 전체)로 두세요
            <br />
            ③ 나온 글자를 <b>여기에만</b> 붙여넣기 — 채팅이나 메모에 남기지 마세요
            <br />
            <br />
            이 토큰은 <b>{projectRef || "이 프로젝트"}</b> 에 SQL 을 넣는 데만 씁니다. 원장 계정만
            읽을 수 있게 저장되고 화면에도 다시 안 보입니다. 언제든 위 주소에서 폐기할 수 있습니다.
          </div>
          <div className="field">
            <label className="label">프로젝트 이름</label>
            <input
              className="input input-sm"
              value={ref}
              onChange={(e) => setRef(e.target.value.trim())}
              placeholder={projectRef}
            />
            <p className="hint" style={{ margin: "3px 0 0", fontSize: 12.5 }}>
              Supabase 주소창의 <code>project/</code> 뒤 글자입니다. 앱 주소에서 뽑은 값은{" "}
              <b>{projectRef}</b> 입니다.
            </p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input input-sm"
              type="password"
              style={{ flex: 1 }}
              placeholder="sbp_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" disabled={pending || !token} onClick={save}>
              확인하고 저장
            </button>
            {saved && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm("저장해둔 토큰을 지울까요?")) return;
                  startTransition(async () => {
                    await clearAdminToken();
                    router.refresh();
                  });
                }}
              >
                지우기
              </button>
            )}
          </div>
        </div>
      )}

      {log && (
        <div className="stack" style={{ gap: 3, marginTop: 12 }}>
          {log.map((r) => (
            <div className="unitrow" key={r.name}>
              <span className={`tag ${r.ok ? "tag-mint" : "tag-red"}`}>{r.ok ? "됨" : "실패"}</span>
              <span style={{ fontSize: 14 }}>{r.name}</span>
              {!r.ok && (
                <span className="hint" style={{ flex: 1, fontSize: 12, textAlign: "right" }}>
                  {r.detail}
                </span>
              )}
            </div>
          ))}
          {log.length === 0 && <p className="hint">넣을 것이 없었습니다.</p>}
        </div>
      )}
    </div>
  );
}
