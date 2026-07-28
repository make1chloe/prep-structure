"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { countRows, shiftBackOneYear } from "./fixDates";

/**
 * 연도가 1년 밀린 기록 되돌리기.
 *
 * 세어보고 → 눈으로 확인하고 → 옮긴다.
 * 날짜를 잘못 옮기면 되돌리기가 더 어려워서, 무엇이 몇 개 바뀌는지 먼저 보여준다.
 */
export default function FixDatesBox() {
  const thisYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${thisYear}-01-01`);
  const [to, setTo] = useState(`${thisYear}-12-31`);
  const [importedOn, setImportedOn] = useState("");
  const [res, setRes] = useState(null);
  const [done, setDone] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const total = (res?.tables || []).reduce((a, t) => a + t.count, 0);

  function look() {
    startTransition(async () => {
      setDone(null);
      setRes(await countRows({ from, to, importedOn: importedOn || null }));
    });
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>연도 1년 되돌리기</h2>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        노션에서 연도 없이 <b>12/30</b> 같은 날짜를 가져오면서 올해로 붙는 바람에,{" "}
        <b>작년 기록이 통째로 올해로</b> 들어갔습니다. 8~12월 것은 미래 날짜라 눈에
        띄지만 1~7월 것은 그냥 올해로 보여서 안 띕니다. 그래서 <b>기간을 직접 골라</b>{" "}
        되돌립니다.
      </p>

      <div className="row" style={{ gap: 6, alignItems: "flex-end", marginTop: 10, flexWrap: "wrap" }}>
        <div className="field">
          <label className="label">이 날짜부터</label>
          <input className="input input-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">이 날짜까지</label>
          <input className="input input-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">가져온 날 (선택)</label>
          <input
            className="input input-sm"
            type="date"
            title="이 날 우리 DB 에 들어온 것만 고릅니다. 직접 쓴 기록을 건드리지 않으려면 넣으세요."
            value={importedOn}
            onChange={(e) => setImportedOn(e.target.value)}
          />
        </div>
        <button className="btn btn-sm" disabled={pending} onClick={look}>
          세어보기
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 0", fontSize: 12 }}>
        <b>가져온 날</b>을 넣으면 그날 들어온 것만 옮깁니다. 직접 쓰신 기록은 수업한
        날에 만들어지고, 가져온 기록은 전부 가져오기 한 날에 만들어져서 이걸로 갈립니다.
        아래 <b>들어온 날</b>을 보시면 언제 가져왔는지 알 수 있습니다.
      </p>

      {res && (
        <div className="stack" style={{ gap: 8, marginTop: 12 }}>
          {res.tables.map((t) => (
            <div key={t.name} className="stack" style={{ gap: 2 }}>
              <div className="unitrow">
                <span className={`tag ${t.count > 0 ? "tag-amber" : "tag-mint"}`}>{t.count}건</span>
                <b style={{ fontSize: 13 }}>{t.label}</b>
                {t.count > 0 && (
                  <span className="hint" style={{ fontSize: 12 }}>
                    {t.first} ~ {t.last}
                    {t.future > 0 ? ` · 그중 미래 ${t.future}건` : ""}
                  </span>
                )}
              </div>
              {t.count > 0 && (
                <span className="hint" style={{ fontSize: 11.5, paddingLeft: 4 }}>
                  들어온 날: {t.days.join(", ") || "—"}
                  {t.sample.length > 0 &&
                    ` · 예) ${t.sample.map((s) => `${s.date}(${s.made} 들어옴)`).join(", ")}`}
                </span>
              )}
            </div>
          ))}

          <p className="hint" style={{ margin: 0, fontSize: 12 }}>
            오늘은 {res.today} 입니다.
          </p>

          {total > 0 && (
            <button
              className="btn btn-primary btn-sm"
              style={{ alignSelf: "flex-start" }}
              disabled={pending}
              onClick={() => {
                if (
                  !confirm(
                    `${from} ~ ${to} 의 ${total}건을 1년 앞으로 되돌립니다.\n` +
                      (importedOn ? `${importedOn} 에 들어온 것만.\n` : "가져온 날을 안 골랐습니다 — 직접 쓰신 기록도 함께 옮겨집니다.\n") +
                      "\n그대로 진행할까요?"
                  )
                ) return;
                startTransition(async () => {
                  const r = await shiftBackOneYear({ from, to, importedOn: importedOn || null });
                  if (r?.error) { alert(r.error); return; }
                  setDone(r.done);
                  setRes(await countRows({ from, to, importedOn: importedOn || null }));
                  router.refresh();
                });
              }}
            >
              {total}건 1년 되돌리기
            </button>
          )}
          {total === 0 && (
            <p className="hint" style={{ margin: 0 }}>이 기간에 해당하는 기록이 없습니다.</p>
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
