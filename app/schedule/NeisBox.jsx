"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useBulk, BulkBar } from "@/components/Bulk";
import {
  neisReady, searchSchools, addSchool, removeSchool, listSchools,
  importSchedule, clearImported, importedSummary, diagnose, clearSchoolImports,
} from "./neisActions";
import { schoolYear } from "@/lib/neis";
import { schoolAlike, looseKey, shortName } from "@/lib/schoolName";
import { mergeSchools } from "./schoolActions";

/**
 * 나이스 학사일정.
 *
 * 학교 알림장을 보고 옮겨 적던 것을 받아온다.
 * 받아온 일정은 **일정 화면에 그대로** 들어간다 — 새 화면을 만들지 않는다.
 */
export default function NeisBox({ months = [] }) {
  const [ready, setReady] = useState(null);
  const [mine, setMine] = useState([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null);
  // 기본은 **올해 학사일정 전부** — 3월부터 다음 2월까지.
  // 학교 일정은 한 해가 한 덩어리라, 몇 달만 받으면 어차피 또 받게 된다.
  const year = schoolYear(months[0]?.ym ? `${months[0].ym}-01` : new Date().toISOString().slice(0, 10));
  const [range, setRange] = useState({ from: year.from, to: year.to });
  const [done, setDone] = useState(null);      // 방금 받아온 결과
  const [have, setHave] = useState(null);   // 지금 들어와 있는 것
  const [diag, setDiag] = useState(null);   // 무엇이 들어 있는지 그대로 보기
  const [one, setOne] = useState({});       // 학교 하나만 다시 받았을 때 나이스가 한 말
  const sBulk = useBulk(mine);
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => { neisReady().then((r) => setReady(!!r?.ready)); }, []);
  useEffect(() => { listSchools().then((r) => { setMine(r?.rows || []); if (r?.error) setErr(r.error); }); }, []);

  // 같은 학교로 보이는 것 — 지역 이름(인천)까지 떼고 견준다
  const dups = schoolAlike(mine.map((s) => s.name));
  // 손으로 고르는 합치기 — 짐작이 빗나간 짝도 합칠 수 있어야 한다
  const [mergeId, setMergeId] = useState(null);
  const [pick, setPick] = useState({});
  const twinsOf = (s) =>
    mine.filter((x) => x.id !== s.id && looseKey(x.name) === looseKey(s.name));
  useEffect(() => { importedSummary().then(setHave); }, []);
  const reload = () => {
    listSchools().then((r) => setMine(r?.rows || []));
    importedSummary().then(setHave);
  };

  function run(fn, after, loud = false) {
    setErr("");
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        setErr(res.error);
        // 목록이 길어서 카드 맨 위의 빨간 글씨는 **화면 밖**에 있을 때가 많다.
        // 눌렀는데 아무 일도 없는 것처럼 보이던 이유가 그것이다.
        if (loud) alert(res.error);
        return;
      }
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
        {/* **열쇠는 열쇠끼리** (2026-08-07). 넣는 자리는 설정 한 곳이다 —
            솔라피는 설정, 나이스는 여기, AI 는 또 다른 데였다 */}
        <a className="btn btn-ghost btn-sm" href="/settings">
          {ready ? "키 바꾸기 ›" : "키 넣기 ›"}
        </a>
      </div>
      <p className="muted" style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.7 }}>
        학교 시험·방학·행사 날짜를 나이스에서 받아 <b>일정 화면에 넣습니다.</b>
        여러 번 받아도 같은 줄이 늘어나지 않고, <b>손으로 적으신 일정은 건드리지 않습니다.</b>
      </p>

      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

      {/* **지금 들어와 있는 것** — 받았는지를 기억에 맡기면 안 된다.
          화면을 옮기면 결과 상자는 사라지고, 다시 눌러야 하나 망설이게 된다. */}
      <div className="card card-tight" style={{ marginTop: 10, background: "var(--surface-2)" }}>
        <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          <b style={{ fontSize: 13 }}>지금 들어와 있는 것</b>
          {have === null ? (
            <span className="hint">세는 중…</span>
          ) : have.total > 0 ? (
            <span className="tag tag-mint">{have.total}건</span>
          ) : (
            <span className="tag tag-amber">아직 없음</span>
          )}
        </div>
        {have?.total > 0 ? (
          <div className="stack" style={{ gap: 2, marginTop: 6 }}>
            {have.rows.map((r) => {
              const school = mine.find((m) => m.schul_code === r.code);
              return (
              <div className="unitrow" key={r.code}>
                {/* **학교 이름은 줄여서** (원장님, 2026-08-08 — 「학교 이름
                    박문중처럼 줄여서 써줘」). 「인천신정중학교」 는 목록에서
                    자리만 차지하고, 원장님이 부르시는 이름은 「신정중」 이다.
                    나이스가 준 원래 이름은 마우스를 올리면 나온다 */}
                <b style={{ fontSize: 12.5, flex: 1 }} title={r.name}>{shortName(r.name)}</b>
                {r.count > 0 ? (
                  <>
                    <span className="hint" style={{ fontSize: 11.5 }}>
                      {r.from} ~ {r.to}
                    </span>
                    <span className="tag tag-muted">{r.count}건</span>
                  </>
                ) : (
                  // 0건도 보여준다 — 안 보여주면 「넣었는데 목록에 없다」 가 된다
                  <>
                    <span className="tag tag-amber">받아온 것 없음</span>
                    {/**
                      * **왜 없는지 여기서 물어볼 수 있어야 한다** (원장님,
                      * 2026-08-07 — 「신정초중은 왜 안 받아와지지」).
                      *
                      * 「받아오기」 는 학교 아홉 곳을 한 번에 돈다. 한 곳이 못
                      * 받아도 결과 상자에 한 줄 섞여 있을 뿐이고, 화면을 옮기면
                      * 그 상자마저 사라진다. 그러면 남는 것은 「받아온 것 없음」
                      * 이라는 말뿐이라 — 아직 안 눌렀는지 · 그 기간에 일정이
                      * 없는 건지 · 나이스가 거절한 건지 알 길이 없다.
                      *
                      * 이 학교 하나만 다시 부르고, **나이스가 뭐라고 했는지를
                      * 그 자리에 적는다.**
                      */}
                    {school && school.schul_code && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={pending || !ready}
                        title={ready ? `${range.from} ~ ${range.to} 를 이 학교만 다시 받아옵니다` : "먼저 나이스 인증키를 넣어주세요"}
                        onClick={() =>
                          run(() => importSchedule(range.from, range.to, school.id), (x) => {
                            setOne({
                              ...one,
                              [r.code]:
                                x?.failed?.length ? x.failed.join(" · ")
                                : x?.added ? `${x.added}건을 받았어요.`
                                : (x?.notes || []).join(" · ") || "나이스가 이 기간에 줄 일정이 없다고 합니다.",
                            });
                            importedSummary().then(setHave);
                          })
                        }
                      >
                        이 학교만 받아오기
                      </button>
                    )}
                    {school && !school.schul_code && (
                      <span className="hint" style={{ fontSize: 11.5 }}>
                        나이스 코드가 없어 못 받아옵니다 — 위에서 이름으로 찾아 넣어주세요
                      </span>
                    )}
                  </>
                )}
                {one[r.code] && (
                  <span className="hint" style={{ fontSize: 11.5, flexBasis: "100%" }}>
                    {one[r.code]}
                  </span>
                )}
              </div>
            );
            })}
            <p className="hint" style={{ margin: "4px 0 0", fontSize: 11.5, lineHeight: 1.8 }}>
              <b>받아오기가 된 것입니다.</b> 일정 화면과 대시보드 달력에서 보입니다.
              다시 받아도 늘어나지 않으니 언제든 눌러도 됩니다.
              <br />
              학교별 학사일정은 <b>그 학교 아이·어머니 달력에</b> 뜹니다.
              {" "}
              <b>수능·모의고사·공휴일은 비공개</b>로 들어옵니다 — 수십 줄이
              달력을 채우면 정작 봐야 할 우리 학교 시험이 묻히기 때문입니다.
              알려야 할 것이 있으면 <b>할일 · 달력</b> 에서 그 줄만 「전체」 로 열어주세요.
            </p>
            <button
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: "flex-start", marginTop: 4 }}
              disabled={pending}
              onClick={() => {
                if (diag) { setDiag(null); return; }
                run(() => diagnose(), setDiag);
              }}
            >
              {diag ? "닫기" : "내용이 이상해요 · 무엇이 들어 있는지 보기"}
            </button>
          </div>
        ) : (
          have !== null && (
            <p className="hint" style={{ margin: "6px 0 0", fontSize: 12 }}>
              아직 받아온 학사일정이 없습니다. 아래 <b>학사일정 받아오기</b> 를 눌러주세요.
            </p>
          )
        )}
      </div>

      {diag && (
        <div className="card card-tight" style={{ marginTop: 8, background: "var(--surface-2)" }}>
          <b style={{ fontSize: 13 }}>지금 들어 있는 것 그대로</b>
          <p className="hint" style={{ margin: "4px 0 8px", fontSize: 11.5 }}>
            내용이 틀리거나 중복이 많다면 대개 셋 중 하나예요.
            ① 나이스 학교 찾기는 <b>부분 일치</b>라 '신송' 으로 찾으면 신송초·신송중·신송고가 같이 나옵니다 —
            엉뚱한 학교를 넣었을 수 있어요.
            ② 같은 학교를 <b>두 번</b> 넣으면 코드가 달라 같은 날 같은 행사가 두 줄이 됩니다.
            ③ 학교를 뺐어도 <b>그 학교 일정은 남습니다.</b> 목록에 없는데 달력에는 있는 경우예요.
          </p>

          <div className="stack" style={{ gap: 6 }}>
            {(diag.rows || []).map((r) => (
              <div key={r.code} className="card card-tight" style={{ background: "var(--surface)" }}>
                <div className="row" style={{ gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                  {r.registered ? (
                    <b style={{ fontSize: 13 }} title={r.name}>{shortName(r.name)}</b>
                  ) : (
                    <b style={{ fontSize: 13, color: "var(--amber)" }}>
                      ⚠ 목록에 없는 학교 ({r.code})
                    </b>
                  )}
                  {r.where && <span className="hint" style={{ fontSize: 11.5 }}>{r.where}</span>}
                  <span className="spacer" />
                  <span className="tag tag-muted">{r.count}건</span>
                  <span className="hint" style={{ fontSize: 11.5 }}>{r.from} ~ {r.to}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(
                        `${r.registered ? r.name : r.code} 에서 받아온 일정 ${r.count}건을 지울까요?\n` +
                        `손으로 적은 일정은 건드리지 않습니다.`
                      )) return;
                      run(() => clearSchoolImports(r.code), (x) => {
                        alert(`${x?.removed || 0}건을 지웠어요.`);
                        setDiag(null);
                        importedSummary().then(setHave);
                      });
                    }}
                  >
                    이 학교 것만 지우기
                  </button>
                </div>
                {/* 무엇이 들어 있는지 몇 줄 — 남의 학교 것이면 여기서 바로 티가 난다 */}
                <div className="hint" style={{ fontSize: 11.5, marginTop: 4 }}>
                  {(r.sample || []).join("  ·  ")}
                </div>
              </div>
            ))}
          </div>

          {(diag.dupes || []).length > 0 && (
            <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 13, color: "var(--amber)" }}>
                같은 날 같은 행사가 두 줄 이상 — {diag.dupes.length}가지
              </b>
              <p className="hint" style={{ margin: "2px 0 6px", fontSize: 11.5 }}>
                같은 학교를 <b>두 번 넣었을 때</b> 이렇게 됩니다. 위에서 잘못 넣은 쪽을 지우세요.
              </p>
              <div className="stack" style={{ gap: 2 }}>
                {diag.dupes.map((d) => (
                  <div className="unitrow" key={`${d.due_on}|${d.title}`}>
                    <span className="hint" style={{ minWidth: 64 }}>{d.due_on}</span>
                    <span style={{ fontSize: 12.5, flex: 1 }}>{d.title}</span>
                    <span className="tag tag-amber">{d.n}줄</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            {found.map((s) => {
              // 이미 넣은 학교인지, 같은 이름을 이미 넣었는지 미리 알려준다.
              // 나이스 학교 찾기는 부분 일치라 비슷한 이름이 우르르 나온다 —
              // 여기서 안 걸러주면 엉뚱한 학교나 같은 학교를 두 번 넣게 된다.
              const already = mine.some((m) => m.schul_code === s.schul_code);
              const sameName = !already && mine.some((m) => m.name === s.name);
              return (
                  <div className="unitrow" key={`${s.atpt_code}-${s.schul_code}`}>
                    {/* **여기만 원래 이름 그대로다.** 나이스에서 골라 넣는
                        자리라, 나이스가 뭐라고 부르는지가 그대로 보여야
                        「인천신정중학교」 와 「신정중학교」 를 가릴 수 있다 */}
                    <b style={{ fontSize: 13 }}>{s.name}</b>
                    <span className="tag tag-muted">{s.kind}</span>
                    <span className="hint" style={{ fontSize: 11.5, flex: 1 }}>
                      {[s.atpt_name, s.address].filter(Boolean).join(" · ")}
                    </span>
                    {already ? (
                      <span className="tag tag-mint">이미 넣음</span>
                    ) : (
                      <button
                        className="btn btn-sm"
                        disabled={pending}
                        onClick={() => {
                          if (sameName && !confirm(
                            `'${s.name}' 은 이미 목록에 있어요. 학교 코드가 다릅니다.\n\n` +
                            `같은 학교를 두 번 넣으면 같은 날 같은 행사가 두 줄씩 들어옵니다.\n` +
                            `주소를 보고 다른 학교가 맞는지 확인해주세요.\n\n${s.address || ""}\n\n` +
                            `그래도 넣을까요?`
                          )) return;
                          run(() => addSchool(s), (r) => {
                            if (r?.attachedTo) {
                              alert(
                                `이미 있던 「${r.attachedTo}」 에 나이스 코드를 붙였습니다.\n\n` +
                                `같은 학교라 새로 만들지 않았어요 — 이제 그 학교로 학사일정을 받아올 수 있습니다.`
                              );
                            }
                            setFound(null); setQ(""); reload();
                          }, true);
                        }}
                      >
                        넣기
                      </button>
                    )}
                  </div>
              );
            })}
          </div>
        )}

        {mine.length > 0 && (
          <div className="stack" style={{ gap: 3, marginTop: 8 }}>
            <BulkBar bulk={sBulk} label="학교">
              <button
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`고른 학교 ${sBulk.count}곳을 목록에서 뺄까요?`)) return;
                  const also = confirm(
                    `그 학교들에서 받아온 일정도 같이 지울까요?\n\n` +
                    `[확인] 일정까지 지웁니다\n[취소] 목록에서만 뺍니다`
                  );
                  run(async () => {
                    let removed = 0;
                    for (const id of sBulk.ids) {
                      const r = await removeSchool(id, also);
                      if (r?.error) return r;
                      removed += r?.removed || 0;
                    }
                    if (also) alert(`일정 ${removed}건을 지웠어요.`);
                    sBulk.clear();
                    return { error: null };
                  }, reload);
                }}
              >
                빼기
              </button>
            </BulkBar>
            {/* 같은 학교가 두 줄로 들어와 있으면 여기서 바로 합친다.
                예전에는 아래 「학교 명단」 이라는 **다른 목록**에만 합치기가 있어서,
                이 목록을 보고 계신 원장님은 찾을 수가 없었다. */}
            {dups.length > 0 && (
              <div className="notice" style={{ margin: "8px 0" }}>
                <b>같은 학교로 보이는 것이 있어요.</b> 합치면 학생·시험·일정이 한쪽으로 모입니다.
                {dups.map((g) => (
                  <div key={g.key} style={{ marginTop: 4 }}>· {g.names.join(" / ")}</div>
                ))}
              </div>
            )}
            {mine.map((s) => (
              <div className="unitrow" key={s.id}>
                <input type="checkbox" checked={sBulk.has(s.id)} onChange={() => sBulk.toggle(s.id)} />
                <b style={{ fontSize: 13 }} title={s.name}>{shortName(s.name)}</b>
                <span className="tag tag-muted">{s.kind || "학교"}</span>
                {/* 코드가 없으면 **나이스에서 못 받아온다** — 손으로 넣은 학교다.
                    이게 안 보이면 「받아오기를 눌렀는데 왜 이 학교만 안 오지」 가 된다 */}
                {!s.schul_code && (
                  <span className="tag tag-amber" title="위에서 학교 이름으로 찾아 넣으면 코드가 붙습니다">
                    나이스 코드 없음
                  </span>
                )}
                {/* 어느 지역 학교인지 — 같은 이름이 여러 곳이라 이게 없으면 구분이 안 된다 */}
                <span className="hint" style={{ fontSize: 11.5, flex: 1 }}>
                  {[s.atpt_name, s.address].filter(Boolean).join(" · ")}
                </span>
                <span className="hint mono" style={{ fontSize: 11 }}>{s.schul_code}</span>
                {/* 짐작이 맞은 짝은 단추로 바로. 아니면 아래 「합치기」 로 골라서 */}
                {mergeId === s.id ? (
                  <>
                    <select
                      className="input input-sm"
                      style={{ width: 190 }}
                      value={pick[s.id] || ""}
                      onChange={(e) => setPick({ ...pick, [s.id]: e.target.value })}
                    >
                      <option value="">이 학교에 합칠 학교…</option>
                      {mine
                        .filter((x) => x.id !== s.id)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                            {looseKey(o.name) === looseKey(s.name) ? " — 같은 학교로 보임" : ""}
                          </option>
                        ))}
                    </select>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={pending || !pick[s.id]}
                      onClick={() => {
                        const t = mine.find((x) => x.id === pick[s.id]);
                        if (!t) return;
                        if (!confirm(
                          `「${t.name}」 를 「${s.name}」 에 합칩니다.\n\n` +
                          `학생·시험·일정이 「${s.name}」 으로 옮겨가고,\n` +
                          `「${t.name}」 는 별칭으로 남습니다.\n\n합칠까요?`
                        )) return;
                        setMergeId(null);
                        run(() => mergeSchools(s.id, t.id), (r) => {
                          alert(
                            `합쳤습니다.\n\n` +
                            `학생 ${r?.students || 0}명 · 시험 ${r?.exams || 0}건이 「${s.name}」 으로 옮겨갔어요.` +
                            (r?.mergedExams ? `\n(그중 ${r.mergedExams}건은 같은 시험이라 한 줄로 합쳤습니다)` : "")
                          );
                          reload();
                        }, true);
                      }}
                    >
                      합치기
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setMergeId(null)}>취소</button>
                  </>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending || mine.length < 2}
                    title="다른 학교의 학생·시험·일정을 이 학교로 모읍니다"
                    onClick={() => setMergeId(s.id)}
                  >
                    합치기…
                  </button>
                )}
                {mergeId !== s.id && twinsOf(s).map((t) => (
                  <button
                    key={t.id}
                    className="btn btn-sm"
                    disabled={pending}
                    title={`${t.name} 의 학생·시험·일정을 ${s.name} 으로 옮깁니다`}
                    onClick={() => {
                      if (!confirm(
                        `「${t.name}」 를 「${s.name}」 에 합칩니다.\n\n` +
                        `학생·시험·일정이 「${s.name}」 으로 옮겨가고,\n` +
                        `「${t.name}」 는 별칭으로 남습니다 (옛 이름으로도 찾을 수 있어요).\n\n합칠까요?`
                      )) return;
                      run(() => mergeSchools(s.id, t.id), (r) => {
                        alert(
                            `합쳤습니다.\n\n` +
                            `학생 ${r?.students || 0}명 · 시험 ${r?.exams || 0}건이 「${s.name}」 으로 옮겨갔어요.` +
                            (r?.mergedExams ? `\n(그중 ${r.mergedExams}건은 같은 시험이라 한 줄로 합쳤습니다)` : "")
                          );
                        reload();
                      }, true);
                    }}
                  >
                    {shortName(t.name)} 합치기
                  </button>
                ))}
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => {
                    // 학교만 빼면 그 학교 일정이 달력에 그대로 남는다. 여기서 같이 정리한다
                    if (!confirm(`${s.name} 을 목록에서 뺄까요?`)) return;
                    const also = confirm(
                      `이 학교에서 받아온 일정도 같이 지울까요?\n\n` +
                      `[확인] 일정까지 지웁니다 (잘못 넣은 학교라면 이쪽)\n` +
                      `[취소] 목록에서만 뺍니다 — 일정은 달력에 그대로 남습니다`
                    );
                    run(() => removeSchool(s.id, also), (r) => {
                      if (also) alert(`일정 ${r?.removed || 0}건을 지웠어요.`);
                      reload();
                    });
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
                run(() => importSchedule(range.from, range.to), (r) => { setDone(r); importedSummary().then(setHave); })
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
                run(() => clearImported(range.from, range.to), () => { setDone(null); importedSummary().then(setHave); });
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
