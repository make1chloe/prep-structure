"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteGuide, listGuides, saveGuide } from "./guideActions";

/**
 * **수업 가이드 링크** — 여기서 넣으면 학생·학부모 화면에 뜬다 (0089).
 *
 * 원장님 (2026-08-06) — 「수업 가이드 링크를 설정에서 넣고 학생 화면에 띄워줘」
 *
 * 카톡으로 보내던 것을 여기로 옮기는 자리다. 카톡은 하루 만에 밀려 올라가고,
 * 새로 온 아이에게는 아예 안 간다. 앱에 붙여두면 **언제든 그 자리에 있다.**
 *
 * 새 줄을 미리 만들어두지 않는다 — 빈 줄이 학생 화면에 「제목 없음」 으로
 * 떠버린다. 다 적고 「추가」 를 누를 때 한 번에 만든다.
 */
const BLANK = { title: "", url: "", note: "", sort: 100 };

export default function GuideBox() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [add, setAdd] = useState(BLANK);
  const [edit, setEdit] = useState(null);     // { id, title, url, note, sort }
  const [pending, startTransition] = useTransition();

  async function reload() {
    const r = await listGuides();
    setErr(r.error || "");
    setRows(r.rows || []);
  }
  useEffect(() => { reload(); }, []);

  function save(id, patch, done) {
    startTransition(async () => {
      const r = await saveGuide(id, patch);
      if (r?.error) { alert(r.error); return; }
      done?.();
      reload();
    });
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>수업 가이드 링크</b>
        <span className="hint" style={{ flex: 1 }}>
          여기 넣은 것이 <b>학생·학부모 화면</b>에 그대로 뜹니다. 카톡으로 보내시던
          안내(단어 외우는 법 · 수업 규칙 · 교재 사는 곳)를 여기 붙여두세요.
        </span>
      </div>

      {err && <div className="notice" style={{ marginTop: 10 }}>{err}</div>}

      {rows === null ? (
        <p className="hint" style={{ margin: "10px 0 0" }}>불러오는 중…</p>
      ) : (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          {rows.length === 0 && !err && (
            <p className="hint" style={{ margin: 0 }}>
              아직 넣은 것이 없어요. 아래에서 하나 넣어보세요.
            </p>
          )}

          {rows.map((g) =>
            edit?.id === g.id ? (
              <div className="card card-tight" key={g.id}>
                <Fields v={edit} on={(k, val) => setEdit({ ...edit, [k]: val })} />
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={pending}
                    onClick={() => save(g.id, { ...edit, active: g.active }, () => setEdit(null))}
                  >
                    저장
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>
                    그만
                  </button>
                </div>
              </div>
            ) : (
              <div className="unitrow" key={g.id}>
                <span className="hint mono" style={{ minWidth: 32 }}>{g.sort}</span>
                <b style={{ fontSize: 13, minWidth: 120 }}>{g.title}</b>
                <a className="sky" href={g.url} target="_blank" rel="noreferrer"
                   style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {g.url}
                </a>
                {g.note && <span className="hint" style={{ minWidth: 90 }}>{g.note}</span>}
                <span className={`tag ${g.active ? "tag-mint" : "tag-muted"}`}>
                  {g.active ? "보임" : "숨김"}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...g })}>
                  고치기
                </button>
                {/* 잠깐 내리는 것과 아예 지우는 것은 다르다 — 둘 다 둔다 */}
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => save(g.id, { ...g, active: !g.active })}
                >
                  {g.active ? "숨기기" : "보이기"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`「${g.title}」 링크를 지울까요?`)) return;
                    startTransition(async () => {
                      const r = await deleteGuide(g.id);
                      if (r?.error) { alert(r.error); return; }
                      reload();
                    });
                  }}
                >
                  지우기
                </button>
              </div>
            )
          )}

          <div className="card card-tight" style={{ marginTop: 4 }}>
            <b style={{ fontSize: 13 }}>새 링크</b>
            <Fields v={add} on={(k, val) => setAdd({ ...add, [k]: val })} />
            <div className="row" style={{ gap: 6, marginTop: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || !add.title.trim() || !add.url.trim()}
                onClick={() => save(null, add, () => setAdd(BLANK))}
              >
                추가
              </button>
              <span className="hint">
                주소는 <b>http 없이</b> 붙여넣어도 됩니다 — 알아서 붙여드려요.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fields({ v, on }) {
  return (
    <div className="editgrid" style={{ marginTop: 6 }}>
      <div className="field">
        <label className="label">이름</label>
        <input
          className="input input-sm"
          value={v.title}
          placeholder="단어 외우는 방법"
          onChange={(e) => on("title", e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label">주소</label>
        <input
          className="input input-sm"
          value={v.url}
          placeholder="youtube.com/watch?v=…"
          onChange={(e) => on("url", e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label">한 줄 설명 (없어도 됩니다)</label>
        <input
          className="input input-sm"
          value={v.note || ""}
          placeholder="3분짜리 영상이에요"
          onChange={(e) => on("note", e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label">순서 (작은 것이 위로)</label>
        <input
          className="input input-sm"
          type="number"
          value={v.sort}
          onChange={(e) => on("sort", e.target.value)}
        />
      </div>
    </div>
  );
}
