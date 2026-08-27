"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMonthly, sendMonthly, unsendMonthly } from "./actions";
import { monthlyBriefing } from "@/app/ai/actions";
import { addMonths } from "@/lib/day";

/**
 * 월간리포트.
 *
 * 그 달 데일리리포트를 다시 세서 만든다. 새로 입력할 것은 없다.
 * 학생마다 한마디를 덧붙일 수 있고, 문구 자체를 고칠 수도 있다.
 *
 * **PC(≥1101px)는 좌 학생 목록 / 우 초안 편집 판** (B2, 원장 승인
 * 2026-08-27). 초안 textarea 가 줄 안에서 열리면 아래 학생들이 260px 넘게
 * 밀려나서, 다음 학생 문구를 보려면 접고 다시 찾아 내려가야 했다 —
 * 재원생·발송·진도에서 이미 고친 병이다.
 *
 * 폭은 **열 때 한 번만 본다** (진도 ProgressBoard 와 같은 원칙). 미디어쿼리로
 * 자리를 가르면 같은 초안 칸을 인라인·오른쪽 두 벌로 그려야 하고, 창 폭이
 * 문턱을 넘는 순간 적던 칸이 자리를 잃는다. 폰(<1101px)은 지금처럼 줄 아래
 * 인라인 그대로.
 */
export default function MonthlyBoard({ ym, rows = [], ready = true, mode = "copy" }) {
  const [sel, setSel] = useState(() => new Set());
  /**
   * **성적 비공개 학생 처리** (값-지도 P0-1, 원장님 2026-08-15 — 「선택
   * 가능하게」). 비공개면 문구에서 점수 절은 이미 빠져 있고, 여기서는
   * 그 학생을 보낼지 자체를 고른다.
   */
  const [privateMode, setPrivateMode] = useState("mask");   // mask: 점수 빼고 보냄 · skip: 발송 제외
  const [openId, setOpenId] = useState(null);
  const [wide, setWide] = useState(false);   // 연 순간의 화면 폭 — 초안 칸을 어디에 그릴지
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("todo");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const shown = rows.filter((r) =>
    filter === "todo" ? !r.sentAt : filter === "sent" ? !!r.sentAt : true
  );
  const todo = rows.filter((r) => !r.sentAt);

  // 열린 학생이 필터(보낼 것↔보냄)에 걸러지면 판도 같이 사라진다
  // (인라인 시절과 같은 결 — 줄이 없으면 초안 칸도 없다)
  const openRow = shown.find((r) => r.studentId === openId) || null;
  const split = !!openRow && wide;

  function openDraft(r, isOpen) {
    if (isOpen) { setOpenId(null); return; }
    setOpenId(r.studentId);
    setDraft(r.text);
    setNote(r.note);
    setWide(typeof window !== "undefined" && window.matchMedia("(min-width: 1101px)").matches);
  }

  function toggle(id) {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  }

  function send(list) {
    if (list.length === 0) return;
    // 앱으로 나간다 (2026-08-06) — 발송 방식과 상관없이 언제나 실제로 나간다
    if (!confirm(`${list.length}명에게 월간리포트를 앱으로 보낼까요?\n학부모 화면에 올라가고 폰으로 알림이 갑니다.`)) return;
    startTransition(async () => {
      const res = await sendMonthly(
        list.map((r) => ({ studentId: r.studentId, name: r.name, phone: r.phone, body: r.text })),
        ym
      );
      if (res?.error) {
        alert(res.error);
        return;
      }
      const f = res.failed || [];
      alert(
        f.length === 0
          ? `${res.count}명에게 보냈어요.`
          : `${res.count}명 보냈고, ${f.length}명 실패했어요.\n` +
              f.map((x) => `· ${x.name} — ${x.detail}`).join("\n")
      );
      setSel(new Set());
      router.refresh();
    });
  }

  // 월간은 「리포트」 화면의 탭이다 (2026-08-28) — 달을 넘겨도 그 탭에 머문다
  const go = (n) => router.push(`/report?t=monthly&m=${addMonths(ym, n)}`);

  /* 초안 편집 칸 — 폰에서는 줄 아래 인라인, PC 에서는 오른쪽 판.
     같은 칸을 두 벌로 적지 않으려고 한 함수로 뽑았다 (저장 로직 무접촉) */
  const editor = (r) => (
    <>
      <div className="field">
        <div className="row" style={{ alignItems: "baseline", gap: 6 }}>
          <label className="label">이 학생에게 덧붙일 한마디 (선택)</label>
          <span className="spacer" />
          {/* 월간 AI 브리핑 (11-4) — 그 달 별점·시험·수업 코멘트를
              모아 서너 문장 초안. 저장 전이니 고쳐서 쓰면 된다 */}
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            title="이 달의 집중도·이해도 별점, 시험, 수업 중 코멘트를 모아 AI 가 초안을 씁니다"
            onClick={() =>
              startTransition(async () => {
                const res = await monthlyBriefing(r.studentId, ym);
                if (res?.error) { alert(res.error); return; }
                setNote(res.text || "");
              })
            }
          >
            ✨ AI 브리핑 초안
          </button>
        </div>
        <p className="hint" style={{ margin: "0 0 4px", fontSize: 12.5 }}>
          비워두면 그 달 숫자를 보고 <b>한 줄 평이 자동으로</b> 붙습니다.
          여기에 적으시면 적으신 말이 대신 나갑니다.
        </p>
        <textarea
          className="input input-sm"
          rows={2}
          placeholder="예) 이번 달 문법 단원평가에서 특히 좋아졌습니다."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          /* transition 없이 조용히 저장 (2026-08-21) — pending 이 켜지면
             바로 아래 「문구 저장」 이 disabled 로 바뀌어 마우스를 내리는
             사이 첫 클릭이 씹혔다. refresh 도 안 한다 — draft 가 옛
             글로 남은 채 저장되면 한마디가 사라졌다 */
          onBlur={() => { saveMonthly(r.studentId, ym, { note }).catch(() => {}); }}
        />
      </div>
      <textarea
        className="input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ width: "100%", height: 260, fontSize: 16, marginTop: 8 }}
      />
      <div className="row" style={{ gap: 6, marginTop: 6, justifyContent: "flex-end" }}>
        {r.edited && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await saveMonthly(r.studentId, ym, { text: "" });
                setOpenId(null);
                router.refresh();
              })
            }
          >
            자동 문구로 되돌리기
          </button>
        )}
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await saveMonthly(r.studentId, ym, { text: draft });
              if (res?.error) {
                alert(res.error);
                return;
              }
              setOpenId(null);
              router.refresh();
            })
          }
        >
          문구 저장
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="row" style={{ gap: 6, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => go(-1)}>◂ 지난달</button>
        <b style={{ fontSize: 16 }}>{ym.replace("-", "년 ")}월</b>
        <button className="btn btn-ghost btn-sm" onClick={() => go(1)}>다음달 ▸</button>
        <span className="spacer" />
        {[["todo", `보낼 것 ${todo.length}`], ["sent", `보냄 ${rows.length - todo.length}`], ["all", `전체 ${rows.length}`]].map(
          ([k, label]) => (
            <button
              key={k}
              className={`btn btn-sm ${filter === k ? "btn-on" : "btn-ghost"}`}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          )
        )}
      </div>

      {!ready && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="notice">
            월간리포트를 저장하려면 <b>0031 SQL</b> 을 먼저 실행해주세요.{" "}
            <a href="/settings/sql">설정 → Supabase SQL</a>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <p className="hint" style={{ marginTop: 10 }}>
          이 달에는 수업 기록이 없습니다.
        </p>
      )}

      {shown.length > 0 && (
        <div className="row" style={{ gap: 8, alignItems: "center", margin: "14px 0 8px" }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const every = shown.every((r) => sel.has(r.studentId));
              const n = new Set(sel);
              shown.forEach((r) => (every ? n.delete(r.studentId) : n.add(r.studentId)));
              setSel(n);
            }}
          >
            보이는 학생 전체 선택
          </button>
          <span className="tag tag-sky">{sel.size}명</span>
          <span className="spacer" />
          {shown.some((r) => r.scoreHidden) && (
            <label className="hint" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              성적 비공개 학생:
              <select
                className="input input-sm"
                style={{ width: 150 }}
                value={privateMode}
                onChange={(e) => setPrivateMode(e.target.value)}
              >
                <option value="mask">점수 빼고 보냄</option>
                <option value="skip">보내지 않음</option>
              </select>
            </label>
          )}
          <button
            className="btn btn-primary btn-sm"
            disabled={pending || sel.size === 0}
            onClick={() =>
              send(
                shown.filter(
                  (r) => sel.has(r.studentId) && !(privateMode === "skip" && r.scoreHidden)
                )
              )
            }
          >
            고른 {sel.size}명에게 보내기
          </button>
        </div>
      )}

      {/* PC 에서 초안을 열면 좌 목록 / 우 편집 판의 좌우 분할로 선다 (B2) */}
      <div className={split ? "splitview" : undefined}>
      <div>
      {shown.map((r) => {
        const isOpen = openId === r.studentId;
        const hw = r.sum.homework;
        return (
          <div
            className="card card-tight"
            key={r.studentId}
            /* 좌우 분할 중에는 편집 칸이 줄 밖(오른쪽)에 있어서, 이 줄이
               열려 있다는 표시가 배경색뿐이다 */
            style={{ marginBottom: 6, background: isOpen && split ? "var(--surface-2)" : undefined }}
          >
            <div className="stuLine" style={{ padding: 0, cursor: "default" }}>
              <span className="stuWho">
              {!r.sentAt && (
                <input
                  type="checkbox"
                  checked={sel.has(r.studentId)}
                  onChange={() => toggle(r.studentId)}
                />
              )}
                <span className="stuName">{r.name}</span>
                <span className="stuSub">{r.who}</span>
              </span>
              <span className="stuTags">
              <span className="tag tag-muted">{r.sum.days}회</span>
              {hw.rate !== null && (
                <span
                  className={`tag ${hw.rate >= 85 ? "tag-mint" : hw.rate >= 70 ? "tag-sky" : "tag-amber"}`}
                  title={`완료 ${hw.done} / 보충 ${hw.weak} / 미완료 ${hw.missing}`}
                >
                  숙제 {hw.rate}%
                </span>
              )}
              {r.sum.word.count > 0 && (
                <span className="tag tag-muted">단어 {r.sum.word.rate}%</span>
              )}
              {r.scoreHidden && (
                <span className="tag tag-muted" title="성적 공개 설정이 학부모 비공개라, 문구에서 점수 절이 빠져 있어요">
                  성적 비공개
                </span>
              )}
              {r.sum.exams.length > 0 && (
                <span className="tag tag-lav">단원평가 {r.sum.exams.length}</span>
              )}
              {!r.phone && <span className="tag tag-red">번호 없음</span>}
              </span>
              <span className="stuEnd">
              {r.sentAt ? (
                <>
                  <span className="tag tag-mint">보냄</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await unsendMonthly(r.studentId, ym);
                        router.refresh();
                      })
                    }
                  >
                    되돌리기
                  </button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => send([r])}>
                  보내기
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => openDraft(r, isOpen)}>
                {isOpen ? "접기" : "문구"}
              </button>
              </span>
            </div>

            {isOpen && !split && <div style={{ marginTop: 10 }}>{editor(r)}</div>}
          </div>
        );
      })}
      </div>

      {/* 오른쪽 — 열린 학생의 초안. 학생을 바꾸면 key 로 새로 세운다
          (draft·note 는 열 때 채우지만, 칸 안 포커스·스크롤이 따라가면 안 된다) */}
      {split && (
        <aside className="card split-panel">
          <div className="row split-head" style={{ gap: 6, alignItems: "center" }}>
            <b style={{ fontSize: 15 }}>{openRow.name}</b>
            <span className="hint">{openRow.who}</span>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setOpenId(null)}>닫기</button>
          </div>
          <div className="split-body" key={openRow.studentId}>{editor(openRow)}</div>
        </aside>
      )}
      </div>
    </>
  );
}
