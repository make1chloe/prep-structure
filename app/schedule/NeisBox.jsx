"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveNeisKey, neisReady, searchSchools, addSchool, removeSchool, listSchools,
  importSchedule, clearImported,
} from "./neisActions";
import { schoolYear } from "@/lib/neis";

/**
 * 나이스 학사일정.
 *
 * 학교 알림장을 보고 옮겨 적던 것을 받아온다.
 * 받아온 일정은 **일정 화면에 그대로** 들어간다 — 새 화면을 만들지 않는다.
 */
export default function NeisBox({ months = [] }) {
  const [ready, setReady] = useState(null);
  const [key, setKey] = useState("");
  const [openKey, setOpenKey] = useState(false);
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null);
  // 기본은 **올해 학사일정 전부** — 3월부터 다음 2월까지.
  // 학교 일정은 한 해가 한 덩어리라, 몇 달만 받으면 어차피 또 받게 된다.
  const year = schoolYear(months[0]?.ym ? `${months[0].ym}-01` : new Date().toISOString().slice(0, 10));
  const [range, setRange] = useState({ from: year.from, to: year.to });
  const [done, setDone] = useState(null);      // 받아온 결과
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => { neisReady().then((r) => setReady(!!r?.ready)); }, []);
  useEffect(() => { listSchools().then((r) => { setMine(r?.rows || []); if (r?.error) setErr(r.error); }); }, []);
  const reload = () => listSchools().then((r) => setMine(r?.rows || []));

  function run(fn, after) {
    setErr("");
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { setErr(res.error); return; }
      after?.(res);
      router.refresh();
    });
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>학교 학사일정 (나이스)</h2>
        <span className={`tag ${ready ? "tag-mint" : "tag-amber"}`}>
          {ready === null ? "…" : ready ? "키 넣어둠" : "키 없음"}
        </span>
        <span className="tag tag-muted">학교 {mine.length}곳</span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setOpenKey(!openKey)}>
          {openKey ? "닫기" : ready ? "키 바꾸기" : "키 넣기"}
        </button>
      </div>
      <p className="muted" style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.7 }}>
        학교 시험·방학·행사 날짜를 나이스에서 받아 <b>일정 화면에 넣습니다.</b>
        여러 번 받아도 같은 줄이 늘어나지 않고, <b>손으로 적으신 일정은 건드리지 않습니다.</b>
      </p>

      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

      {openKey && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <input
            className="input"
            type="password"
            placeholder="나이스 인증키"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="notice" style={{ fontSize: 12.5 }}>
            <b>open.neis.go.kr</b> 에서 회원가입 → 인증키 신청 → 받은 키를 여기에만 넣으세요.
            무료이고, 키는 저장한 뒤 화면에 다시 나오지 않습니다.
            메신저·메모·대화창에는 붙여넣지 마세요.
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ alignSelf: "flex-start" }}
            disabled={pending || key.trim().length < 10}
            onClick={() =>
              run(() => saveNeisKey(key), () => {
                setKey(""); setOpenKey(false); setReady(true);
              })
            }
          >
            저장
          </button>
        </div>
      )}

      {/* 학교 등록 */}
      <div style={{ marginTop: 12, borderTop: "1px solid var(--line, #2a2a2a)", paddingTop: 12 }}>
        <b style={{ fontSize: 13.5 }}>학교</b>
        <p className="hint" style={{ margin: "4px 0 8px" }}>
          같은 이름 학교가 여럿이라 <b>주소를 보고</b> 고르세요. 한 번 넣으면 계속 씁니다.
        </p>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <input
            className="input input-sm"
            style={{ width: 190 }}
            placeholder="학교 이름"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run(() => searchSchools(q), (r) => setFound(r.rows))}
          />
          <button
            className="btn btn-sm"
            disabled={pending || q.trim().length < 2}
            onClick={() => run(() => searchSchools(q), (r) => setFound(r.rows))}
          >
            찾기
          </button>
        </div>

        {found && (
          <div className="stack" style={{ gap: 3, marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
            {found.length === 0 && <p className="hint" style={{ margin: 0 }}>못 찾았어요.</p>}
            {found.map((s) => (
              <div className="unitrow" key={`${s.atpt_code}-${s.schul_code}`}>
                <b style={{ fontSize: 13 }}>{s.name}</b>
                <span className="tag tag-muted">{s.kind}</span>
                <span className="hint" style={{ fontSize: 11.5, flex: 1 }}>{s.address}</span>
                <button
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() => run(() => addSchool(s), () => { setFound(null); setQ(""); reload(); })}
                >
                  넣기
                </button>
              </div>
            ))}
          </div>
        )}

        {mine.length > 0 && (
          <div className="stack" style={{ gap: 3, marginTop: 8 }}>
            {mine.map((s) => (
              <div className="unitrow" key={s.id}>
                <b style={{ fontSize: 13 }}>{s.name}</b>
                <span className="tag tag-muted">{s.kind || "학교"}</span>
                <span className="hint mono" style={{ fontSize: 11 }}>{s.schul_code}</span>
                <span className="spacer" />
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`${s.name} 을 목록에서 뺄까요?\n이미 받아온 일정은 그대로 남습니다.`)) return;
                    run(() => removeSchool(s.id), reload);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 받아오기 */}
      {mine.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line, #2a2a2a)", paddingTop: 12 }}>
          <b style={{ fontSize: 13.5 }}>받아오기</b>
          <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ width: 150 }}>
              <label className="label">부터</label>
              <input
                className="input input-sm"
                type="date"
                value={range.from}
                onChange={(e) => setRange({ ...range, from: e.target.value })}
              />
            </div>
            <div className="field" style={{ width: 150 }}>
              <label className="label">까지</label>
              <input
                className="input input-sm"
                type="date"
                value={range.to}
                onChange={(e) => setRange({ ...range, to: e.target.value })}
              />
            </div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 1 }}
              disabled={pending}
              title={`${year.from} ~ ${year.to}`}
              onClick={() => setRange({ from: year.from, to: year.to })}
            >
              {year.year}학년도 전체
            </button>
            <button
              className="btn btn-primary btn-sm"
              style={{ marginBottom: 1 }}
              disabled={pending || !ready}
              title={ready ? undefined : "먼저 나이스 인증키를 넣어주세요"}
              onClick={() =>
                run(() => importSchedule(range.from, range.to), setDone)
              }
            >
              {pending ? "받는 중… (한 해치는 조금 걸려요)" : "학사일정 받아오기"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginBottom: 1 }}
              disabled={pending}
              onClick={() => {
                if (!confirm("이 기간에 나이스에서 받아온 일정을 지울까요?\n손으로 적으신 일정은 그대로 남습니다.")) return;
                run(() => clearImported(range.from, range.to), () => setDone(null));
              }}
            >
              받아온 것 지우기
            </button>
          </div>

          {done && (
            <div className="stack" style={{ gap: 6, marginTop: 10 }}>
              <div className="notice" style={{ fontSize: 12.5 }}>
                <b>{done.added}건</b> 을 일정에 반영했습니다.
                {done.notes?.length ? ` (${done.notes.join(" · ")})` : ""}
              </div>

              {done.failed?.length > 0 && (
                <div className="err" style={{ fontSize: 12.5 }}>
                  <b>못 받은 학교도 있어요</b>
                  <div className="stack" style={{ gap: 2, marginTop: 4 }}>
                    {done.failed.map((f, i) => (
                      <span key={i} style={{ fontSize: 12 }}>· {f}</span>
                    ))}
                  </div>
                </div>
              )}

              {done.examAdded > 0 && (
                <div className="notice" style={{ fontSize: 12.5 }}>
                  시험 기간 <b>{done.examAdded}건</b> 도 함께 넣었습니다.
                  필요 없는 것은 아래 <b>학교 시험 일정</b> 에서 <b>숨기기</b> 를 누르세요 —
                  숨긴 것은 알림·결석 예상에서 빠지고, <b>다시 받아와도 숨긴 채로</b> 있습니다.
                  <br />
                  <b>영어 시험일은 나이스에 없어서</b> 아래에서 직접 채우셔야 합니다.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
