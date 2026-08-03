"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMessage, deleteMessage, listApprovedTemplates } from "./actions";
import { sourcesFor, slotsIn, fillTemplate, EXAMPLE } from "@/lib/alimtalk";

/** 본문에 쓸 수 있는 변수 — 보낼 때 채워진다 */
const VARS = [
  ["{{학원명}}", "학원 이름"],
  ["{{학생명}}", "학생 이름"],
  ["{{날짜}}", "보내는 날 (또는 잡아둔 날짜)"],
  ["{{시간}}", "보낼 때 직접 채웁니다"],
  ["{{내용}}", "보낼 때 직접 채웁니다"],
  ["{{교재목록}}", "그 학생에게 배정된 교재"],
  ["{{교재비}}", "교재 값 합계"],
  ["{{구매링크}}", "교재 구매처"],
  ["{{테스트결과}}", "레벨테스트 결과"],
  ["{{학원주소}}", "설정에 적어둔 주소"],
  ["{{학원전화}}", "설정에 적어둔 전화"],
];

/**
 * 문자 문구 한 곳에서 관리.
 *
 * 두 갈래다.
 *   앱이 만드는 문자 — 본문은 그날 입력에서 자동으로 만들어진다.
 *                      고칠 것은 인삿말·맺음말뿐이고, 지울 수 없다.
 *   내가 쓰는 문자   — 본문을 직접 쓴다. 얼마든지 추가·삭제할 수 있다.
 */
export default function MessageList({ rows = [], level = "full", error = null, pfId = "" }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [adding, setAdding] = useState(false);
  const [tplRows, setTplRows] = useState(null);   // 솔라피에서 불러온 템플릿 목록
  const [tplErr, setTplErr] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // 아예 못 읽었을 때만 화면을 막는다. 그 외에는 되는 데까지 보여준다.
  if (level === "none") {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          <b>문자 문구를 불러오지 못했습니다.</b>
          <p style={{ margin: "6px 0 0", fontSize: 12.5 }}>{error}</p>
          <p style={{ margin: "8px 0 0", fontSize: 12.5 }}>
            <a href="/settings/sql">설정 → Supabase SQL</a> 에서 전체 복사해 한 번 실행해주세요.
            (SQL Editor 안을 <b>Ctrl+A 로 지우고</b> 붙여넣어야 합니다)
          </p>
        </div>
      </div>
    );
  }

  const hasKinds = level === "full" || level === "kinds";
  const hasAlimtalk = level === "full";

  const auto = hasKinds ? rows.filter((r) => r.key) : [];
  const mine = hasKinds ? rows.filter((r) => !r.key) : rows;

  function run(fn, after) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (after) after();
      router.refresh();
    });
  }

  function start(r) {
    setAdding(false);
    setEditId(r.id);
    setTplRows(null);
    setTplErr(null);
    setDraft({
      name: r.name || "",
      greeting: r.greeting || "",
      closing: r.closing || "",
      body: r.body || "",
      sort: r.sort ?? "",
      alimtalk_id: r.alimtalk_id || "",
      alimtalk_body: "",                            // 심사받은 템플릿 원문 (붙여넣기용, 저장 안 함)
      alimtalk_vars: { ...(r.alimtalk_vars || {}) },
    });
  }

  /**
   * 알림톡 연결.
   *
   * 승인받은 템플릿 원문을 붙여넣으면 그 안의 #{변수} 를 찾아
   * 앱의 어떤 값에 붙일지 고르는 칸이 만들어진다.
   * 원문은 저장하지 않는다 — 붙이는 데만 쓴다.
   */
  function Alimtalk({ msgKey }) {
    // 이 문자가 채울 수 있는 것만 고르게 한다 (늦은 귀가에 단어시험은 없다)
    const groups = sourcesFor(msgKey, draft.body || "");
    const slots = [
      ...slotsIn(draft.alimtalk_body || ""),
      ...Object.keys(draft.alimtalk_vars || {}),
    ].filter((v, i, a) => a.indexOf(v) === i);

    return (
      <div className="card card-tight" style={{ background: "transparent" }}>
        <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
          <b style={{ fontSize: 13 }}>알림톡</b>
          {!pfId && (
            <span className="hint" style={{ fontSize: 11.5 }}>
              먼저 <a href="/settings">설정</a> 에 발신프로필 ID(pfId)를 넣어주세요
            </span>
          )}
        </div>

        {/* **골라서 붙인다.** 코드를 손으로 옮겨 적으면 오타가 나고,
            오타가 나도 저장은 되고 보낼 때가 되어서야 실패한다. */}
        <div className="row" style={{ gap: 6, alignItems: "center", marginTop: 6 }}>
          <button
            className="btn btn-sm"
            disabled={pending || !pfId}
            title={pfId ? "솔라피에 승인받아 둔 템플릿을 불러옵니다" : "먼저 pfId 를 넣어주세요"}
            onClick={() => {
              setTplErr(null);
              setTplRows("loading");
              startTransition(async () => {
                const r = await listApprovedTemplates();
                if (r?.error) { setTplErr(r.error); setTplRows(null); return; }
                setTplRows(r.rows || []);
              });
            }}
          >
            승인받은 템플릿에서 고르기
          </button>
          {draft.alimtalk_id && <span className="tag tag-mint">붙어 있음</span>}
        </div>

        {tplErr && <div className="err" style={{ marginTop: 6 }}>{tplErr}</div>}

        {tplRows === "loading" && (
          <p className="hint" style={{ margin: "6px 0 0" }}>불러오는 중…</p>
        )}

        {Array.isArray(tplRows) && (
          <div className="stack" style={{ gap: 3, marginTop: 6, maxHeight: 220, overflowY: "auto" }}>
            {tplRows.length === 0 && (
              <p className="hint" style={{ margin: 0 }}>
                이 발신프로필에 템플릿이 없어요. 카카오에서 먼저 승인받아주세요.
              </p>
            )}
            {tplRows.map((t) => (
              <button
                key={t.templateId}
                className="unitrow"
                disabled={!t.approved}
                style={{
                  textAlign: "left", cursor: t.approved ? "pointer" : "not-allowed",
                  opacity: t.approved ? 1 : 0.5, font: "inherit",
                }}
                onClick={() => {
                  // 코드와 **본문을 같이** 가져온다 — 본문이 있어야 #{변수} 를
                  // 찾아 연결 칸을 만들 수 있다. 붙여넣기 단계가 없어진다.
                  setDraft({ ...draft, alimtalk_id: t.templateId, alimtalk_body: t.content || "" });
                  setTplRows(null);
                }}
              >
                <span className={`tag ${t.approved ? "tag-mint" : "tag-amber"}`}>
                  {t.approved ? "승인" : t.status || "심사중"}
                </span>
                <b style={{ fontSize: 12.5 }}>{t.name}</b>
                <span className="hint mono" style={{ fontSize: 11 }}>{t.templateId}</span>
                <span className="spacer" />
                {draft.alimtalk_id === t.templateId && <span className="tag tag-sky">지금 이것</span>}
              </button>
            ))}
          </div>
        )}

        <div className="field" style={{ marginTop: 8 }}>
          <label className="label">승인받은 템플릿 코드</label>
          <input
            className="input input-sm"
            placeholder="비우면 이 문자는 문자(SMS/LMS)로 나갑니다"
            value={draft.alimtalk_id || ""}
            onChange={(e) => setDraft({ ...draft, alimtalk_id: e.target.value })}
          />
        </div>

        <div className="field" style={{ marginTop: 8 }}>
          <label className="label">
            템플릿 원문 붙여넣기 (변수를 찾아내는 데만 씁니다 · 저장 안 함)
          </label>
          <textarea
            className="input input-sm"
            rows={4}
            placeholder={"[클로이영어] #{학생명} 학생 #{날짜} 수업 안내\n\n#{내용}"}
            value={draft.alimtalk_body || ""}
            onChange={(e) => setDraft({ ...draft, alimtalk_body: e.target.value })}
          />
        </div>

        {slots.length > 0 ? (
          <>
            <p className="hint" style={{ margin: "10px 0 6px" }}>
              템플릿의 변수를 앱의 값에 붙여주세요. 안 붙인 변수는 빈 채로 나갑니다.
            </p>
            <div className="stack" style={{ gap: 10 }}>
              {slots.map((slot) => {
                const cur = draft.alimtalk_vars?.[slot] || "";
                const set = (v) =>
                  setDraft({ ...draft, alimtalk_vars: { ...draft.alimtalk_vars, [slot]: v } });
                // 지금 이 칸에 들어 있는 값들 (여럿일 수 있다)
                const picked = new Set(cur.match(/\{\{[^}]*\}\}/g) || []);
                const sep = draft._sep?.[slot] ?? " · ";
                const preview = fillTemplate(cur, EXAMPLE);

                return (
                  <div className="card card-tight" key={slot} style={{ background: "var(--surface-2)" }}>
                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      <span className="tag tag-lav">{slot}</span>
                      <span className="hint">에 넣을 것 — 여러 개 고르면 이어붙습니다</span>
                      <span className="spacer" />
                      <span className="hint">사이에</span>
                      <select
                        className="input input-sm"
                        style={{ width: 96 }}
                        value={sep}
                        onChange={(e) => {
                          const next = e.target.value;
                          setDraft({
                            ...draft,
                            _sep: { ...(draft._sep || {}), [slot]: next },
                            // 이미 고른 것들을 새 구분자로 다시 잇는다
                            alimtalk_vars: {
                              ...draft.alimtalk_vars,
                              [slot]: [...picked].join(next),
                            },
                          });
                        }}
                      >
                        <option value=" · ">가운뎃점</option>
                        <option value=" ">공백</option>
                        <option value={"\n"}>줄바꿈</option>
                        <option value=", ">쉼표</option>
                      </select>
                    </div>

                    {/* **체크박스.** 노션에서 수식으로 여러 값을 합쳐 쓰시던 것과
                        같게, 한 칸에 여럿을 넣을 수 있어야 한다 */}
                    {groups.map((g) => (
                      <div key={g.label} style={{ marginTop: 6 }}>
                        <span className="hint" style={{ fontWeight: 700 }}>
                          {g.label}
                          {g.hint ? ` — ${g.hint}` : ""}
                        </span>
                        <div className="row" style={{ gap: 4, marginTop: 3 }}>
                          {g.items.map(([v, why, ex]) => (
                            <button
                              key={v}
                              className={`hwchip ${picked.has(v) ? "hw-next" : ""}`}
                              title={ex ? `${why} — 예: ${ex}` : why}
                              onClick={() => {
                                const next = new Set(picked);
                                next.has(v) ? next.delete(v) : next.add(v);
                                set([...next].join(sep));
                              }}
                            >
                              {picked.has(v) && <b>＋</b>} {v.replace(/[{}]/g, "")}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* 고정 문구를 섞고 싶을 때는 여기서 직접 손본다.
                        체크박스로 고른 것도 이 칸에 그대로 보인다 */}
                    <div className="field" style={{ marginTop: 8 }}>
                      <label className="label">
                        이 칸에 들어갈 글 (고정 문구를 섞어도 됩니다)
                      </label>
                      <textarea
                        className="input input-sm"
                        rows={2}
                        placeholder="비우면 이 변수는 빈 채로 나갑니다"
                        value={cur}
                        onChange={(e) => set(e.target.value)}
                      />
                    </div>

                    {/* **보내면 이렇게 나갑니다** — 이름만 봐서는 알 수 없다 */}
                    <p className="hint" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
                      {preview
                        ? <>보내면 이렇게 → <b>{preview}</b></>
                        : "아직 아무것도 안 골랐어요 (이 변수는 빈 채로 나갑니다)"}
                    </p>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="hint" style={{ margin: "8px 0 0" }}>
            위에 템플릿 원문을 붙여넣으면 변수를 붙일 칸이 생깁니다.
          </p>
        )}
      </div>
    );
  }

  function Editor({ isAuto, msgKey = null }) {
    return (
      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        <div className="field">
          <label className="label">이름 (내가 알아보는 용도)</label>
          <input
            className="input input-sm"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>

        {isAuto ? (
          <>
            <div className="field">
              <label className="label">인삿말 — 제목 바로 아래</label>
              <textarea
                className="input input-sm"
                rows={2}
                placeholder="예) 안녕하세요, 오늘 수업 안내드립니다."
                value={draft.greeting}
                onChange={(e) => setDraft({ ...draft, greeting: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">맺음말 — 맨 아래</label>
              <textarea
                className="input input-sm"
                rows={2}
                placeholder="예) 궁금한 점은 언제든 연락주세요."
                value={draft.closing}
                onChange={(e) => setDraft({ ...draft, closing: e.target.value })}
              />
            </div>
            <p className="hint" style={{ margin: 0 }}>
              본문은 그날 입력한 내용으로 앱이 만듭니다. 여기서는 앞뒤 인사만 정합니다.
            </p>
          </>
        ) : (
          <>
            <div className="field">
              <label className="label">본문</label>
              <textarea
                className="input"
                rows={10}
                style={{ fontSize: 13, whiteSpace: "pre-wrap" }}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </div>
            <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
              {VARS.map(([v, why]) => (
                <button
                  key={v}
                  className="btn btn-ghost btn-sm"
                  title={why}
                  style={{ padding: "2px 7px", fontSize: 11.5 }}
                  onClick={() => setDraft({ ...draft, body: `${draft.body}${v}` })}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="hint" style={{ margin: 0 }}>
              변수를 누르면 본문 끝에 붙습니다. 보낼 때 실제 값으로 바뀌고, 자동으로 못 채우는
              것은 <b>보내기 전에 입력칸</b>이 뜹니다.
            </p>
          </>
        )}

        {hasAlimtalk && <Alimtalk msgKey={msgKey} />}

        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setEditId(null);
              setAdding(false);
            }}
          >
            취소
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() =>
              run(() => saveMessage(adding ? null : editId, draft), () => {
                setEditId(null);
                setAdding(false);
              })
            }
          >
            저장
          </button>
        </div>
      </div>
    );
  }

  function Card({ r }) {
    const isEditing = editId === r.id;
    const isAuto = !!r.key;
    return (
      <div className="card card-tight" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 13.5 }}>{r.name}</b>
          {isAuto ? (
            <span className="tag tag-sky" title="본문을 앱이 만듭니다">자동</span>
          ) : (
            <span className="tag tag-lav" title="본문을 직접 씁니다">직접</span>
          )}
          {isAuto && !r.greeting && !r.closing && (
            <span className="hint" style={{ fontSize: 11.5 }}>인사말 없음</span>
          )}
          {hasAlimtalk &&
            (r.alimtalk_id ? (
              <span className="tag tag-mint" title={`알림톡 템플릿 ${r.alimtalk_id}`}>알림톡</span>
            ) : (
              <span className="tag tag-muted" title="문자(SMS/LMS)로 나갑니다">문자</span>
            ))}
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={() => (isEditing ? setEditId(null) : start(r))}>
            {isEditing ? "접기" : "수정"}
          </button>
          {!isAuto && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`'${r.name}' 을 목록에서 뺄까요?\n지난 발송 기록은 그대로 남습니다.`))
                  return;
                run(() => deleteMessage(r.id));
              }}
            >
              삭제
            </button>
          )}
        </div>

        {!isEditing && (
          <p className="hint" style={{ margin: "5px 0 0", whiteSpace: "pre-wrap", fontSize: 12 }}>
            {isAuto
              ? [r.greeting, r.closing].filter(Boolean).join("\n…\n") || "— 인사말을 정하지 않았습니다"
              : (r.body || "").slice(0, 120) + ((r.body || "").length > 120 ? " …" : "")}
          </p>
        )}

        {isEditing && <Editor isAuto={isAuto} msgKey={r.key || null} />}
      </div>
    );
  }

  return (
    <div className="stack" style={{ marginTop: 10 }}>
      {!hasKinds && (
        <div className="notice">
          아직 <b>종류별 문구 나누기</b>가 안 켜져 있습니다 (0029). 지금은 목록만 보입니다.{" "}
          <a href="/settings/sql">설정 → Supabase SQL</a> 을 한 번 실행해주세요.
        </div>
      )}
      {hasKinds && !hasAlimtalk && (
        <div className="notice">
          문구는 나뉘었지만 <b>알림톡 연결</b>은 아직입니다 (0030).{" "}
          <a href="/settings/sql">SQL</a> 을 한 번 더 실행하면 켜집니다.
        </div>
      )}

      {hasKinds && (
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>앱이 보내는 문자</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
          본문은 그날 입력한 내용으로 자동으로 만들어집니다. <b>인삿말·맺음말만</b> 정하시면 됩니다.
        </p>
        {auto.map((r) => (
          <Card key={r.id} r={r} />
        ))}
      </div>
      )}

      <div>
        <div className="row" style={{ alignItems: "baseline", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>내가 쓰는 문자</h2>
          <span className="spacer" />
          <button
            className="btn btn-sm"
            onClick={() => {
              setEditId(null);
              setAdding(true);
              setDraft({
                name: "",
                greeting: "",
                closing: "",
                body: "",
                sort: "",
                alimtalk_id: "",
                alimtalk_body: "",
                alimtalk_vars: {},
              });
            }}
          >
            + 문자 추가
          </button>
        </div>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
          <b>발송 → 안내 문자</b> 에서 학생을 골라 보냅니다. 얼마든지 추가하고 지울 수 있습니다.
        </p>

        {adding && (
          <div className="card card-tight" style={{ marginBottom: 8 }}>
            <b style={{ fontSize: 13.5 }}>새 문자</b>
            <Editor isAuto={false} />
          </div>
        )}

        {mine.map((r) => (
          <Card key={r.id} r={r} />
        ))}
        {mine.length === 0 && !adding && (
          <p className="hint">아직 없습니다. 위의 <b>+ 문자 추가</b> 를 눌러 만드세요.</p>
        )}
      </div>
    </div>
  );
}
