"use client";

import { useState, useTransition } from "react";
import { checkUpsert } from "./upsertCheck";

/**
 * 나이스 받아오기 · 숙제→할일이 진짜로 되는지 확인한다.
 *
 * 위의 표 점검은 표와 칸만 본다. 인덱스는 밖에서 물어볼 수가 없어서
 * **"다 됐다" 로 보이는데 실제로는 안 되는** 일이 생긴다. 여기서 직접 해본다.
 */
export default function UpsertBox() {
  const [res, setRes] = useState(null);
  const [pending, startTransition] = useTransition();
  const bad = res?.steps?.some((s) => !s.ok);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>받아오기 · 할일 점검</h2>
        {res && (
          <span className={`tag ${bad ? "tag-amber" : "tag-mint"}`}>
            {bad ? "막힌 데가 있어요" : "잘 됩니다"}
          </span>
        )}
        <span className="spacer" />
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() => startTransition(async () => setRes(await checkUpsert()))}
        >
          {pending ? "해보는 중…" : "실제로 해보기"}
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        위 목록은 <b>표와 칸</b>만 봅니다. <b>0061</b> 이 고친 것은 인덱스라 밖에서 물어볼
        방법이 없어서, SQL 을 돌렸는지 목록만 봐서는 알 수 없습니다 —
        <b> 다 됐다고 보이는데 나이스가 안 될 수 있습니다.</b>
        <br />
        그래서 여기서 <b>실제로 넣어보고 지웁니다.</b> 나이스 받아오기와 숙제→할일이
        쓰는 것과 똑같은 방식입니다. 점검하느라 만든 줄은 바로 치웁니다.
      </p>

      {res && (
        <div className="stack" style={{ gap: 3, marginTop: 10 }}>
          {res.steps.map((s, i) => (
            <div className="unitrow" key={i}>
              <span className={`tag ${s.ok ? "tag-mint" : "tag-amber"}`}>
                {s.ok ? "OK" : "막힘"}
              </span>
              <b style={{ fontSize: 14.5 }}>{s.name}</b>
              {s.why && (
                <span className="hint" style={{ flex: 1, fontSize: 13 }}>{s.why}</span>
              )}
            </div>
          ))}
          {bad && (
            <div className="notice" style={{ fontSize: 14, marginTop: 4 }}>
              위의 <b>전체 SQL</b> 을 한 번 더 복사해서 Supabase SQL Editor 에 붙여넣고
              실행해주세요. <b>0061 까지 들어 있습니다.</b> 여러 번 돌려도 안전합니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
