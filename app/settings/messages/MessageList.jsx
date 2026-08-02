"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMessage, deleteMessage } from "./actions";
import { SOURCES, slotsIn } from "@/lib/alimtalk";

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
  function Alimtalk() {
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

        <div className="field" style={{ marginTop: 6 }}>
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
            <div className="stack" style={{ gap: 5 }}>
              {slots.map((slot) => (
                <div className="row" key={slot} style={{ gap: 6, alignItems: "center" }}>
                  <span className="tag tag-lav" style={{ minWidth: 96 }}>{slot}</span>
                  <span className="hint">←</span>
                  <select
                    className="input input-sm"
                    style={{ flex: 1 }}
                    value={draft.alimtalk_vars?.[slot] || ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        alimtalk_vars: { ...draft.alimtalk_vars, [slot]: e.target.value },
                      })
                    }
                  >
                    <option value="">— 붙이지 않음</option>
                    {SOURCES.map(([v, why]) => (
                      <option key={v} value={v}>
                        {v} · {why}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
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

  function Editor({ isAuto }) {
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

        {hasAlimtalk && <Alimtalk />}

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

        {isEditing && <Editor isAuto={isAuto} />}
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
