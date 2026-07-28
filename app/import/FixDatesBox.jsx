"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { countFutureRows, fixFutureRows } from "./fixDates";

/**
 * 미래로 들어간 수업 기록 되돌리기.
 *
 * 세어만 보고 → 확인하고 → 고친다. 데이터를 건드리는 일이라
 * 무엇이 몇 개 바뀌는지 먼저 보여준다.
 */
export default function FixDatesBox() {
  const [res, setRes] = useState(null);
  const [done, setDone] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const total = (res?.tables || []).reduce((a, t) => a + t.count, 0);

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>미래 날짜 되돌리기</h2>
        <span className="spacer" />
        <button
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setDone(null);
              const r = await countFutureRows();
              setRes(r);
            })
          }
        >
          몇 개인지 세어보기
        </button>
      </div>

      <p className="hint" style={{ margin: "6px 0 0" }}>
        노션에서 연도 없는 <b>12/30</b> 을 가져오면서 올해로 붙는 바람에, 작년 기록이
        미래 날짜가 된 것이 있습니다. 지난주에 수업하고도 &ldquo;최근 수업 12월 30일&rdquo;
        이 뜬 게 그 때문입니다. 가져오기는 고쳤고, <b>이미 들어간 것은 여기서 1년
        앞으로 되돌립니다.</b>
      </p>

      {res && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <div className="stack" style={{ gap: 3 }}>
            {res.tables.map((t) => (
              <div className="unitrow" key={t.name}>
                <span className={`tag ${t.count > 0 ? "tag-amber" : "tag-mint"}`}>
                  {t.count}건
                </span>
                <b style={{ fontSize: 13 }}>{t.label}</b>
                {t.count > 0 && (
                  <span className="hint" style={{ fontSize: 12 }}>
                    {t.from} ~ {t.to}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="hint" style={{ margin: 0, fontSize: 12 }}>
            오늘({res.today})보다 뒤에 있는 것을 셌습니다.
          </p>

          {total > 0 && !done && (
            <button
              className="btn btn-primary btn-sm"
              style={{ alignSelf: "flex-start" }}
              disabled={pending}
              onClick={() => {
                if (!confirm(`${total}건을 1년 앞으로 되돌릴까요?`)) return;
                startTransition(async () => {
                  const r = await fixFutureRows();
                  if (r?.error) { alert(r.error); return; }
                  setDone(r.done);
                  const again = await countFutureRows();
                  setRes(again);
                  router.refresh();
                });
              }}
            >
              {total}건 되돌리기
            </button>
          )}
          {total === 0 && (
            <p className="hint" style={{ margin: 0 }}>미래로 들어간 기록이 없습니다 👏</p>
          )}
        </div>
      )}

      {done && (
        <div className="notice" style={{ marginTop: 10, fontSize: 12.5 }}>
          {done.map((d) => (
            <div key={d.name}>
              {d.label} — {d.fixed}건 되돌림
              {d.skipped > 0 && ` · ${d.skipped}건은 같은 날짜가 이미 있어서 그대로 뒀습니다`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
