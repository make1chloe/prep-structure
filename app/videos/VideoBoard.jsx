"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addFolder,
  removeFolder,
  addVideo,
  updateVideo,
  removeVideo,
  setVideoStudents,
  setVideosActive,
  setVideosFolder,
  removeVideos,
  assignVideosTo,
} from "./actions";
import { useBulk, BulkBar } from "@/components/Bulk";
import VideoUpload from "./VideoUpload";
import { thumbUrl, VIEW_LABEL, VIEW_CLS } from "@/lib/video";
import { sortRows } from "@/lib/listSort";

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/**
 * **PC(≥1101px)는 좌 영상 목록 / 우 배정 판** (B2, 원장 승인 2026-08-27).
 * 배정 패널이 줄 안에서 열리면 학생 칩 서너 줄만큼 아래 영상들이 밀려나서,
 * 다음 영상을 배정하려면 닫고 다시 찾아 내려가야 했다 — 재원생·발송·진도·
 * 월간과 같은 전환이다.
 *
 * 폭은 **열 때 한 번만 본다** (진도 ProgressBoard 와 같은 원칙). 미디어쿼리로
 * 자리를 가르면 같은 패널을 인라인·오른쪽 두 벌로 그려야 하고, 창 폭이
 * 문턱을 넘는 순간 고르던 패널이 자리를 잃는다. 폰(<1101px)은 지금처럼
 * 줄 아래 인라인 그대로.
 */
export default function VideoBoard({ folders = [], videos = [], students = [], classes = [], roster = [] }) {
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState(null);      // 배정 패널을 연 영상
  const [wide, setWide] = useState(false);         // 연 순간의 화면 폭 — 패널을 어디에 그릴지
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({});
  const [picked, setPicked] = useState(() => new Set());
  const [due, setDue] = useState("");
  const [folderId, setFolderId] = useState("");
  // **넣은 차례가 기본** — 방금 넣은 것을 바로 찾으시는 일이 가장 잦다
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [q, setQ] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);   // 골라서 한꺼번에 배정하는 칸
  const [bulkPick, setBulkPick] = useState(() => new Set());
  const [bulkDue, setBulkDue] = useState("");
  const router = useRouter();

  const inClass = new Map();
  roster.forEach((r) => {
    if (!inClass.has(r.class_id)) inClass.set(r.class_id, []);
    inClass.get(r.class_id).push(r.student_id);
  });

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) alert(res.error);
      router.refresh();
    });
  }

  function openAssign(v) {
    if (openId === v.id) { setOpenId(null); return; }
    setOpenId(v.id);
    setPicked(new Set(v.rows.map((r) => r.studentId)));
    setDue(v.rows.find((r) => r.dueOn)?.dueOn || "");
    setWide(typeof window !== "undefined" && window.matchMedia("(min-width: 1101px)").matches);
  }

  function toggle(id) {
    const n = new Set(picked);
    n.has(id) ? n.delete(id) : n.add(id);
    setPicked(n);
  }

  const kw = q.trim().toLowerCase();
  const shown = sortRows(
    videos.filter((v) => {
      if (folderId && (v.folder_id || "") !== folderId) return false;
      if (kw && !v.title.toLowerCase().includes(kw)) return false;
      return true;
    }),
    sort,
    "title"
  );
  // 「전체」는 지금 화면에 보이는 것만이다 (걸러놓고 눌러도 안전하다)
  const bulk = useBulk(shown);

  // 열린 영상이 검색·폴더 필터에 걸러지면 판도 같이 사라진다
  // (인라인 시절과 같은 결 — 줄이 없으면 배정 패널도 없다)
  const openVideo = shown.find((v) => v.id === openId) || null;
  const split = !!openVideo && wide;

  /* 배정 패널 속 — 폰에서는 줄 아래 인라인, PC 에서는 오른쪽 판.
     같은 패널을 두 벌로 적지 않으려고 한 함수로 뽑았다 (저장 로직 무접촉) */
  const assignPanel = (v) => (
    <>
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14.5 }}>볼 사람 {picked.size}명</b>
        <span className="spacer" />
        <span className="hint">언제까지</span>
        <input
          type="date"
          className="input input-sm"
          style={{ width: 150 }}
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
        <button
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await setVideoStudents(v.id, [...picked], due || null);
              if (!r?.error) setOpenId(null);
              return r;
            })
          }
        >
          저장
        </button>
      </div>

      <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
        {classes.map((c) => (
          <button
            key={c.id}
            className="btn btn-ghost btn-sm"
            onClick={() => setPicked(new Set([...picked, ...(inClass.get(c.id) || [])]))}
          >
            ＋ {c.name} 전체
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>
          전체 해제
        </button>
      </div>

      <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
        {students.map((s) => (
          <button
            key={s.id}
            className={`hwchip ${picked.has(s.id) ? "hw-next" : ""}`}
            onClick={() => toggle(s.id)}
          >
            {picked.has(s.id) && <b>＋</b>} {s.name}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="stack" style={{ gap: 12, marginTop: 12 }}>
      {/* ---- 넣기 ---- */}
      <div className="card">
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800 }}>영상 넣기</h2>
        <form action={(fd) => run(() => addVideo(fd))} className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label className="label">유튜브 / 비메오 주소 *</label>
              <input className="input input-sm" name="url" required placeholder="https://youtu.be/…" />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 180 }}>
              <label className="label">제목 (비우면 주소가 그대로 들어가요)</label>
              <input className="input input-sm" name="title" placeholder="예: 관계대명사 1강" />
            </div>
            <div className="field" style={{ width: 150 }}>
              <label className="label">폴더</label>
              <select className="input input-sm" name="folderId" defaultValue="">
                <option value="">폴더 없음</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
              넣기
            </button>
          </div>
        </form>

        {/* **한 개씩 말고 한 번에** (원장님, 2026-08-09 — 「영상 엑셀로 한 번에
            넣을 수 있게 해 줘」). 문법 강의 한 단원이 스무 개면 스무 번을
            붙여넣어야 했다. 넣는 자리 바로 아래에 둔다 — 다른 화면에 있으면
            있는 줄도 모르신다 */}
        <VideoUpload />

        <form
          action={(fd) => run(() => addFolder(fd))}
          className="row"
          style={{ gap: 6, marginTop: 10, alignItems: "center" }}
        >
          <span className="hint">폴더</span>
          <input className="input input-sm" name="name" style={{ width: 150 }} placeholder="새 폴더 이름" />
          <button className="btn btn-ghost btn-sm" type="submit" disabled={pending}>추가</button>
          {folders.map((f) => (
            <span key={f.id} className="tag tag-muted">
              {f.name}
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: "0 4px" }}
                onClick={(e) => {
                  e.preventDefault();
                  if (confirm(`'${f.name}' 폴더를 지울까요? 안에 있던 영상은 남습니다.`)) {
                    run(() => removeFolder(f.id));
                  }
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </form>
      </div>

      {/* ---- 목록 ---- (배정을 열면 PC 에서 좌 목록 / 우 배정 판 — B2.
          검색·정렬 컨트롤도 목록과 같은 왼쪽 칼럼에 함께 선다) */}
      <div className={split ? "splitview" : undefined}>
      <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <input
          className="input input-sm"
          style={{ width: 180 }}
          placeholder="영상 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className={`btn btn-sm ${folderId === "" ? "btn-on" : "btn-ghost"}`}
          onClick={() => setFolderId("")}
        >
          전체 {videos.length}
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            className={`btn btn-sm ${folderId === f.id ? "btn-on" : "btn-ghost"}`}
            onClick={() => setFolderId(f.id)}
          >
            {f.name}
          </button>
        ))}
        <span className="spacer" />
        <span className="hint">{shown.length}개</span>
        <select
          className="input input-sm"
          style={{ width: 106 }}
          value={sort.key}
          onChange={(e) => setSort({ key: e.target.value, dir: e.target.value === "created_at" ? "desc" : "asc" })}
          title="목록 정렬"
        >
          <option value="created_at">넣은 순</option>
          <option value="title">이름순</option>
        </select>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setSort((v) => ({ ...v, dir: v.dir === "asc" ? "desc" : "asc" }))}
          title={sort.dir === "asc" ? "오름차순 (누르면 뒤집기)" : "내림차순 (누르면 뒤집기)"}
        >
          {sort.dir === "asc" ? "▲" : "▼"}
        </button>
      </div>

      {/* 골라서 한 번에 — 폴더를 새로 만들면 스무 개를 옮겨야 한다 */}
      <div className="card card-tight">
        <BulkBar bulk={bulk} label="영상">
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => setBulkOpen(!bulkOpen)}
          >
            {bulkOpen ? "닫기" : `${bulk.count}개 배정`}
          </button>
          <select
            className="input input-sm"
            style={{ width: 140 }}
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (v === "") return;
              run(() => bulk.run((ids) => setVideosFolder(ids, v === "none" ? null : v)));
            }}
          >
            <option value="">폴더 옮기기…</option>
            <option value="none">폴더 없음</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => run(() => bulk.run((ids) => setVideosActive(ids, false)))}
          >
            숨기기
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => run(() => bulk.run((ids) => setVideosActive(ids, true)))}
          >
            보이기
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() => {
              if (!confirm(`고른 영상 ${bulk.count}개를 지울까요?\n누가 봤는지 기록도 함께 지워집니다.`)) return;
              run(() => bulk.run((ids) => removeVideos(ids)));
            }}
          >
            삭제
          </button>
        </BulkBar>

        {bulkOpen && bulk.count > 0 && (
          <div className="card card-tight" style={{ background: "var(--surface-2)", marginTop: 6 }}>
            <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 14.5 }}>영상 {bulk.count}개 → 학생 {bulkPick.size}명</b>
              <span className="spacer" />
              <span className="hint">언제까지</span>
              <input
                type="date"
                className="input input-sm"
                style={{ width: 150 }}
                value={bulkDue}
                onChange={(e) => setBulkDue(e.target.value)}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || bulkPick.size === 0}
                onClick={() =>
                  run(async () => {
                    const r = await assignVideosTo(bulk.ids, [...bulkPick], bulkDue || null);
                    if (!r?.error) {
                      alert(`${r.added || 0}건을 냈어요. (이미 받은 학생은 그대로 둡니다)`);
                      setBulkOpen(false);
                      setBulkPick(new Set());
                      bulk.clear();
                    }
                    return r;
                  })
                }
              >
                한 번에 내기
              </button>
            </div>
            <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {classes.map((c) => (
                <button
                  key={c.id}
                  className="btn btn-ghost btn-sm"
                  onClick={() => setBulkPick(new Set([...bulkPick, ...(inClass.get(c.id) || [])]))}
                >
                  ＋ {c.name} 전체
                </button>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={() => setBulkPick(new Set())}>
                전체 해제
              </button>
            </div>
            <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {students.map((s) => (
                <button
                  key={s.id}
                  className={`hwchip ${bulkPick.has(s.id) ? "hw-next" : ""}`}
                  onClick={() => {
                    const n = new Set(bulkPick);
                    n.has(s.id) ? n.delete(s.id) : n.add(s.id);
                    setBulkPick(n);
                  }}
                >
                  {bulkPick.has(s.id) && <b>＋</b>} {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {shown.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>영상이 없어요.</p>
        </div>
      )}

      {shown.map((v) => {
        const thumb = thumbUrl(v.provider, v.vid);
        const isOpen = openId === v.id;
        const isEdit = editId === v.id;
        return (
          <div
            className="card"
            key={v.id}
            /* 좌우 분할 중에는 패널이 줄 밖(오른쪽)에 있어서, 이 영상이
               열려 있다는 표시가 배경색뿐이다 */
            style={{
              opacity: v.active ? 1 : 0.55,
              background: isOpen && split ? "var(--surface-2)" : undefined,
            }}
          >
            <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={bulk.has(v.id)}
                onChange={() => bulk.toggle(v.id)}
                style={{ marginTop: 4 }}
              />
              {thumb && (
                <a href={v.url} target="_blank" rel="noreferrer">
                  <img
                    src={thumb}
                    alt=""
                    style={{ width: 120, borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                </a>
              )}
              <div className="stack" style={{ gap: 4, flex: 1, minWidth: 200 }}>
                {isEdit ? (
                  <div className="stack" style={{ gap: 6 }}>
                    <input
                      className="input input-sm"
                      value={draft.title ?? ""}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      placeholder="제목"
                    />
                    <input
                      className="input input-sm"
                      value={draft.url ?? ""}
                      onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                      placeholder="주소"
                    />
                    {/* 설명 — 학생 화면에 영상 아래로 보인다. 넣을 수는 있는데
                        고칠 수가 없던 칸 (값-지도 P2) */}
                    <textarea
                      className="input input-sm"
                      rows={2}
                      placeholder="설명 (학생 화면에 영상 아래로 보입니다)"
                      value={draft.note ?? ""}
                      onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                    />
                    <div className="row" style={{ gap: 6 }}>
                      <select
                        className="input input-sm"
                        style={{ width: 140 }}
                        value={draft.folder_id ?? ""}
                        onChange={(e) => setDraft({ ...draft, folder_id: e.target.value })}
                      >
                        <option value="">폴더 없음</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const r = await updateVideo(v.id, draft);
                            if (!r?.error) setEditId(null);
                            return r;
                          })
                        }
                      >
                        저장
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>취소</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontWeight: 800, fontSize: 15 }}
                    >
                      {v.title}
                    </a>
                    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                      <span className="tag tag-mint">다 봄 {v.done}</span>
                      <span className="tag tag-amber">열어만 봄 {v.opened}</span>
                      <span className="tag tag-muted">안 봄 {v.none}</span>
                      <span className="hint">배정 {v.total}명</span>
                    </div>
                  </>
                )}
              </div>

              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openAssign(v)} disabled={pending}>
                  {isOpen ? "닫기" : "배정"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditId(v.id);
                    setDraft({ title: v.title, url: v.url, folder_id: v.folder_id || "", note: v.note || "" });
                  }}
                >
                  수정
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => run(() => updateVideo(v.id, { active: !v.active }))}
                >
                  {v.active ? "숨기기" : "보이기"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("이 영상을 지울까요? 누가 봤는지 기록도 함께 지워집니다.")) {
                      run(() => removeVideo(v.id));
                    }
                  }}
                >
                  삭제
                </button>
              </div>
            </div>

            {/* 누가 봤나 */}
            {v.rows.length > 0 && (
              <div className="row" style={{ gap: 4, marginTop: 10, flexWrap: "wrap" }}>
                {v.rows.map((r) => (
                  <span
                    key={r.studentId}
                    className={`tag ${VIEW_CLS[r.state]}`}
                    title={
                      r.state === "none"
                        ? "아직 안 열었어요"
                        : `${r.opens}번 열었어요 · 마지막 ${when(r.lastAt)}` +
                          (r.doneAt ? ` · 다 봄 ${when(r.doneAt)}` : "")
                    }
                  >
                    {r.name} · {VIEW_LABEL[r.state]}
                  </span>
                ))}
              </div>
            )}

            {/* 배정 패널 — 폰에서만 줄 안에서 연다. PC 는 오른쪽 판이 대신 */}
            {isOpen && !split && (
              <div className="card card-tight" style={{ marginTop: 10, background: "var(--surface-2)" }}>
                {assignPanel(v)}
              </div>
            )}
          </div>
        );
      })}
      </div>

      {/* 오른쪽 — 열린 영상의 배정 판. 영상을 바꾸면 key 로 새로 세운다 */}
      {split && (
        <aside className="card split-panel">
          <div className="row split-head" style={{ gap: 6, alignItems: "center" }}>
            <b style={{ fontSize: 15 }}>{openVideo.title}</b>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>닫기</button>
          </div>
          <div className="split-body" key={openVideo.id}>{assignPanel(openVideo)}</div>
        </aside>
      )}
      </div>
    </div>
  );
}
