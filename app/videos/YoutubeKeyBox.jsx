"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveYoutubeKey, syncTitles } from "./actions";

/**
 * 유튜브 키.
 *
 * 키를 넣어두면 주소만 붙여넣어도 제목을 받아온다. 유튜브에서 제목이 바뀌면
 * 「제목 다시 받기」 한 번으로 전부 맞춘다.
 *
 * 키는 여기서 바로 서버로 간다. 화면으로 다시 내려오지 않는다 —
 * 넣어뒀는지 아닌지만 보인다.
 */
export default function YoutubeKeyBox({ saved = false }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save() {
    startTransition(async () => {
      const r = await saveYoutubeKey(key);
      if (r?.error) setMsg({ err: r.error });
      else {
        setMsg({ ok: "넣었어요." });
        setKey("");
        setOpen(false);
      }
      router.refresh();
    });
  }

  function sync() {
    startTransition(async () => {
      const r = await syncTitles();
      if (r?.error) setMsg({ err: r.error });
      else setMsg({ ok: `제목 ${r.changed}개를 바꿨어요.` });
      router.refresh();
    });
  }

  return (
    <div className="card card-tight">
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>유튜브 키</b>
        <span className={`tag ${saved ? "tag-mint" : "tag-amber"}`}>
          {saved ? "넣어둠" : "없음"}
        </span>
        <span className="hint" style={{ flex: 1, minWidth: 200 }}>
          넣어두면 주소만 붙여넣어도 <b>제목을 받아옵니다.</b> 없어도 영상은 쓸 수 있어요
          (제목을 직접 적으시면 됩니다).
        </span>
        {saved && (
          <button className="btn btn-ghost btn-sm" onClick={sync} disabled={pending}>
            {pending ? "받는 중…" : "제목 다시 받기"}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
          {open ? "닫기" : saved ? "키 바꾸기" : "키 넣기"}
        </button>
      </div>

      {open && (
        <div className="row" style={{ gap: 6, marginTop: 8, alignItems: "center" }}>
          <input
            className="input input-sm"
            style={{ flex: 1, minWidth: 220 }}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Google Cloud → YouTube Data API v3 키"
            autoComplete="off"
          />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={pending || !key.trim()}>
            저장
          </button>
        </div>
      )}

      {msg?.err && <div className="err" style={{ marginTop: 8 }}>{msg.err}</div>}
      {msg?.ok && <p className="hint" style={{ marginTop: 8 }}>{msg.ok}</p>}
    </div>
  );
}
