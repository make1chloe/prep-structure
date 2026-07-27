"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMessage, deleteMessage } from "./actions";

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
export default function MessageList({ rows = [], unavailable }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          문자 문구를 나누려면 <b>0029 SQL</b> 을 먼저 실행해주세요.{" "}
          <a href="/settings/sql">여기서 복사</a>할 수 있습니다.
        </div>
      </div>
    );
  }

  const auto = rows.filter((r) => r.key);
  const mine = rows.filter((r) => !r.key);

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
    });
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
    <div className="stack" style={{ gap: 18, marginTop: 12 }}>
      <div>
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>앱이 보내는 문자</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
          본문은 그날 입력한 내용으로 자동으로 만들어집니다. <b>인삿말·맺음말만</b> 정하시면 됩니다.
        </p>
        {auto.map((r) => (
          <Card key={r.id} r={r} />
        ))}
      </div>

      <div>
        <div className="row" style={{ alignItems: "baseline", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>내가 쓰는 문자</h2>
          <span className="spacer" />
          <button
            className="btn btn-sm"
            onClick={() => {
              setEditId(null);
              setAdding(true);
              setDraft({ name: "", greeting: "", closing: "", body: "", sort: "" });
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
