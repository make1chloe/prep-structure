"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIntegration, clearIntegration } from "@/app/settings/actions";

/**
 * 학생 계정을 만들 때 쓰는 키.
 *
 * 학생 계정(아이디 · 비밀번호 0000)을 원장님이 대신 만들려면 Supabase 의
 * service_role 키가 있어야 한다. **여기에 직접 넣어주세요** —
 * 이 키는 저장된 뒤로는 화면에 다시 나오지 않고, 서버에서만 읽힙니다.
 *
 * 어디서 찾나: Supabase 대시보드 → Project Settings → API →
 *              Project API keys → service_role (secret)
 */
export default function ServiceKeyBox({ saved = false }) {
  const [key, setKey] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>학생 계정 키</h2>
        <span className={`tag ${saved ? "tag-mint" : "tag-amber"}`}>
          {saved ? "넣어둠" : "아직 없음"}
        </span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
          {open ? "닫기" : saved ? "바꾸기" : "넣기"}
        </button>
        {saved && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm("키를 지울까요? 학생 계정을 새로 만들 수 없게 됩니다.")) return;
              startTransition(async () => {
                await clearIntegration("supabase_service");
                router.refresh();
              });
            }}
          >
            지우기
          </button>
        )}
      </div>

      <p className="hint" style={{ margin: "6px 0 0" }}>
        재원생 목록에서 <b>학생 아이디와 비밀번호를 만들려면</b> 이 키가 필요합니다.
        한 번 넣으면 다시 넣지 않아도 됩니다.
      </p>

      {open && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <ol className="hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 14 }}>
            <li>Supabase 대시보드 → 왼쪽 아래 <b>Project Settings</b></li>
            <li><b>API</b> → Project API keys → <b>service_role</b> 옆 <b>Reveal</b> → 복사</li>
            <li>아래에 붙여넣고 저장</li>
          </ol>
          <input
            className="input"
            type="password"
            value={key}
            placeholder="service_role 키를 붙여넣으세요"
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="notice" style={{ fontSize: 14 }}>
            이 키는 <b>무엇이든 할 수 있는 키</b>입니다. 여기 말고 다른 곳
            (메신저·메모·대화창)에는 절대 붙여넣지 마세요. 저장한 뒤에는 화면에
            다시 나오지 않습니다.
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || key.trim().length < 20}
            style={{ alignSelf: "flex-start" }}
            onClick={() =>
              startTransition(async () => {
                const res = await saveIntegration("supabase_service", {
                  enabled: true,
                  config: { key: key.trim() },
                });
                if (res?.error) { alert(res.error); return; }
                setKey("");
                setOpen(false);
                router.refresh();
              })
            }
          >
            저장
          </button>
        </div>
      )}
    </div>
  );
}
