"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveNeisKey, neisReady } from "@/app/schedule/neisActions";

/**
 * 나이스 인증키 (2026-08-07).
 *
 * 원장님 — 「api, 솔라피, 등등 입력값이 필요한걸 한페이지에 모아야하지 않을까?」
 *
 * 이 키는 「학교 · 시험」 화면 안에 있었다. 학사일정을 받아오는 자리라
 * 처음에는 자연스러웠는데, **열쇠를 넣으려는 사람은 「어느 화면이었더라」
 * 부터 떠올려야 했다.** 솔라피는 설정, 나이스는 학교, AI 는 또 다른 데.
 *
 * 열쇠는 열쇠끼리 둔다. 학교 화면에는 넣어져 있는지만 보이고, 없으면
 * 여기로 오는 길만 남긴다.
 */
export default function NeisKeyBox() {
  const [ready, setReady] = useState(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => { neisReady().then((r) => setReady(!!r?.ready)); }, []);

  return (
    <div className="card">
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>나이스 (학사일정)</h2>
        <span className={`tag ${ready ? "tag-mint" : "tag-amber"}`}>
          {ready === null ? "…" : ready ? "키 넣어둠" : "키 없음"}
        </span>
        <span className="spacer" />
        <a className="btn btn-ghost btn-sm" href="/schools">학교 · 시험에서 받아오기 ›</a>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
          {open ? "닫기" : ready ? "키 바꾸기" : "키 넣기"}
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        학교 시험·방학·행사 날짜를 받아옵니다. 받아오기는 <b>학교 · 시험</b> 화면에서 합니다.
      </p>

      {open && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <input
            className="input"
            type="password"
            placeholder="나이스 인증키"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="notice" style={{ fontSize: 14 }}>
            <b>open.neis.go.kr</b> 에서 회원가입 → 인증키 신청 → 받은 키를 여기에만 넣으세요.
            무료이고, 키는 저장한 뒤 화면에 다시 나오지 않습니다.
            메신저·메모·대화창에는 붙여넣지 마세요.
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ alignSelf: "flex-start" }}
            disabled={pending || key.trim().length < 10}
            onClick={() =>
              startTransition(async () => {
                const r = await saveNeisKey(key);
                if (r?.error) { alert(r.error); return; }
                setKey(""); setOpen(false); setReady(true);
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
