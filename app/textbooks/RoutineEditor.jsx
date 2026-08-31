"use client";

import { useEffect, useState, useTransition } from "react";
import { listRoutine, saveStep, deleteStep, seedRoutine, copyAreaRoutine } from "./routineActions";
import { CATEGORIES, CAT_CLS, toolBadge } from "@/app/homework/categories";

/**
 * 학습 루틴 — 진도를 따라 순서대로.
 *
 * 한 줄이 **한 수업 회차**다.
 *   1  등원: 단원 설명 정독 · 문답노트    숙제: 구두테스트(녹음) · 본교재 문제풀기
 *   2  등원: 숙제채점 · 구두테스트(직접)  숙제: 워크북 풀기
 *
 * 오늘 수업에서 [루틴 다음] 을 누르면 이 줄이 그대로 채워지고,
 * 그 학생의 단계가 하나 넘어간다. 매번 고를 필요가 없다.
 */
/**
 * 항목 고르기 판. **파일 최상위에 있어야 한다** — 컴포넌트 안에서 정의하면
 * 렌더마다 새 타입이라 리마운트되어 검색어·스크롤이 날아간다 (2026-08-21).
 * 훅(useState)이 있어서 호출식으로도 못 쓴다.
 */
function Picker({ label, value, onChange, items = [] }) {
  const [kw, setKw] = useState("");
  const q = kw.trim().toLowerCase();
  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const pool = q ? items.filter((i) => (i.name || "").toLowerCase().includes(q)) : items;
  // 분류 차례는 CATEGORIES 를 따른다 — 화면마다 순서가 다르면 손이 헷갈린다
  // CATEGORIES 에 이미 「기타」 가 있어서 빈 갈래("")와 겹치면 기타 묶음이
  // 두 번 선다 (원장님 2026-08-21 「기타가 두 번 나와」) — 한 번만
  const groups = [...new Set([...CATEGORIES, "기타"])]
    .map((c) => ({
      cat: c || "기타",
      cls: CAT_CLS[c] || "tag-muted",
      rows: pool.filter((i) => (i.category || "기타") === (c || "기타")),
    }))
    .filter((g) => g.rows.length > 0);

  const picked = value.map((id) => items.find((i) => i.id === id)).filter(Boolean);

  return (
    <div className="field" style={{ marginTop: 10 }}>
      <div className="row" style={{ alignItems: "center", gap: 6 }}>
        <label className="label" style={{ flex: 1 }}>
          {label} {value.length > 0 && <span className="hint">{value.length}개</span>}
        </label>
        <input
          className="input input-sm"
          style={{ width: 120 }}
          placeholder="항목 검색"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
        />
      </div>

      {/* 고른 것 — 누르면 바로 빠진다 */}
      {picked.length > 0 && (
        <div className="pickedbar">
          {picked.map((i) => (
            <button key={i.id} className="chip on" onClick={() => toggle(i.id)} title="빼기">
              {i.name}{i.tool ? ` ${toolBadge(i.tool)}` : ""} ✕
            </button>
          ))}
        </div>
      )}

      <div className="stack" style={{ gap: 6, marginTop: 6 }}>
        {groups.map((g) => (
          <div className="catgroup" key={g.cat}>
            <span className={`tag ${g.cls} catlabel`}>{g.cat}</span>
            <div className="chips">
              {g.rows.map((i) => (
                <button
                  key={i.id}
                  className={`chip ${value.includes(i.id) ? "on" : ""}`}
                  onClick={() => toggle(i.id)}
                >
                  {i.name}{i.tool ? ` ${toolBadge(i.tool)}` : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <span className="hint">맞는 항목이 없어요.</span>}
      </div>
    </div>
  );
}

// 교재(textbookId) 또는 영역(area) 하나를 받는다 — 영역 진도루틴(0137)도
// 같은 편집기로 고친다 (원칙 1: 같은 판을 두 벌로 그리지 않는다, 2026-08-21)
export default function RoutineEditor({ textbookId = null, area = null, items = [], initialSteps = null, initialReady = true }) {
  // 처음 데이터는 페이지가 실어 보낸다 (원칙 6 — 탭을 누르고 나서 서버에
  // 다녀오면, 누를 때마다 빈 판을 보게 된다). 이후 고침은 load() 로 새로.
  const [steps, setSteps] = useState(initialSteps);
  const [ready, setReady] = useState(initialReady);
  const [editing, setEditing] = useState(null);
  const [pending, startTransition] = useTransition();

  const [inherited, setInherited] = useState(null);   // 영역 진도루틴을 따르는 중 (0137)
  async function load() {
    const res = await listRoutine(textbookId, area);
    setSteps(res.steps);
    setReady(res.ready);
    setInherited(res.inherited || null);
  }
  useEffect(() => {
    if ((textbookId || area) && steps === null) load();
  }, [textbookId, area]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!textbookId && !area) return null;
  if (steps === null) return <p className="hint">불러오는 중…</p>;

  /**
   * **이름 옆에 준비물을 같이** (원장님 2026-08-28 — 「클래스카드 필수학습이
   * 나와야 하는데 필수학습이라고만 나옴. 이러면 뭔지 모름」).
   *
   * 이름이 잘린 것이 아니었다 — 「클래스카드」는 이름의 일부가 아니라
   * 준비물 칸(homework_items.tool, 0116)인데 이 화면이 그것을 안 그렸다.
   * 「필수학습」 같은 이름은 준비물이 달라도 같은 글자라, 줄에 나란히
   * 서면 어느 것이 어느 것인지 알 수가 없다. 그림표는 아이 화면·오늘
   * 수업과 **같은 한 벌**(toolBadge)로 만든다.
   */
  const itemOf = (id) => items.find((i) => i.id === id) || null;
  const nameOf = (id) => {
    const it = itemOf(id);
    if (!it) return "";
    return it.tool ? `${it.name} ${toolBadge(it.tool)}` : it.name;
  };

  function run(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      setEditing(null);
      await load();
    });
  }

  /**
   * 항목 고르기 — **분류로 묶고, 검색으로 좁힌다.**
   *
   * 원장님 (2026-08-13): 「이것도 좀 어느정도는 분류를 해야 정보가 눈에 들어오지」.
   * 마흔여섯 개를 한 덩어리로 펴 놓으면 (그것도 등원·숙제 두 번) 눈이 어디서
   * 멈춰야 할지 모른다. 분류는 이미 항목마다 붙어 있다 (단어·독해·문법…).
   *
   * **고른 것은 맨 위에 따로 모은다** — 아래 목록에서 색만으로 찾으면
   * 무엇을 골랐는지 세어봐야 안다.
   */

  /**
    * **본보기 넣고 고치기** (원장님, 2026-08-11 — 「엄두가 안나」).
    * 빈 화면에서 마흔여섯 개를 골라 순서를 짜는 것이 어려운 일이다.
    * 이미 루틴이 있으면 안 넣는다 — 손으로 짜두신 것을 덮으면 안 된다.
    */
  function seed() {
    startTransition(async () => {
      const res = await seedRoutine(textbookId, area);
      if (res?.error) { alert(res.error); return; }
      const lines = [`${res.added}단계를 넣었어요 (${res.area}).`, "", "그대로 쓰셔도 되고, 고치셔도 됩니다."];
      if (res.missing?.length) {
        lines.push("", `학습 항목에 없어서 빠진 것 ${res.missing.length}개 —`);
        res.missing.forEach((m) => lines.push(`  · ${m}`));
        lines.push("", "숙제 → 학습 항목 → 「노션 기본숙제 가져오기」 를 먼저 누르시면 다 들어옵니다.");
      }
      alert(lines.join("\n"));
      await load();
    });
  }

  /**
   * **따르는 중에는 그냥 못 더한다** (원장님 2026-08-24). 여태 여기서
   * 「＋ 단계 추가」 를 누르면 교재 루틴(1단계)이 생기고, 교재가 영역보다
   * 우선이라 **영역의 나머지 단계가 통째로 사라졌다.** 더하려다 지운 셈이다.
   * 먼저 가져올지 묻고, 가져온 뒤에 더한다.
   */
  function copyThenAdd() {
    if (!confirm(
      `이 교재는 지금 「${inherited}」 영역 루틴을 따르고 있어요.\n\n` +
      "여기에 단계를 더하려면 영역 루틴을 이 교재로 **가져와야** 합니다.\n" +
      "가져오면 이 교재만 따로 굴러가고, 영역 루틴을 나중에 고쳐도 이 교재는 안 따라갑니다."
    )) return;
    startTransition(async () => {
      const res = await copyAreaRoutine(textbookId);
      if (res?.error) { alert(res.error); return; }
      await load();
    });
  }

  const addStep = () =>
    setEditing({
      sort: (steps[steps.length - 1]?.sort ?? 0) + 10,
      label: "",
      inclass_items: [],
      home_items: [],
      home_next: [],
      note: "",
    });

  /**
   * 순서 이동 (원장님, 2026-08-21 — 「수정·삭제 가능하게 해줘」).
   * 이웃한 두 줄의 sort 값을 서로 바꾼다. **낙관적** — 화면을 먼저 바꾸고
   * 저장은 뒤에서, 실패하면 되돌린다 (PRINCIPLES 6-3 · 낙관 UI 원칙
   * 2026-08-21). startTransition 에 안 넣는 것도 같은 까닭 — pending 이
   * 걸리면 두 칸 올리려는 연타가 기다리게 된다.
   */
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const prev = steps;
    let next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    if (prev[i].sort === prev[j].sort) {
      // sort 가 같으면 바꿔 넣어도 순서가 그대로다 — 전체를 10 간격으로 다시 매긴다
      next = next.map((s, k) => ({ ...s, sort: (k + 1) * 10 }));
    } else {
      next[i] = { ...next[i], sort: prev[i].sort };
      next[j] = { ...next[j], sort: prev[j].sort };
    }
    const oldSort = new Map(prev.map((s) => [s.id, s.sort]));
    const changed = next.filter((s) => oldSort.get(s.id) !== s.sort);
    setSteps(next);   // 서버 답을 기다리지 않는다
    Promise.all(changed.map((s) => saveStep(textbookId, s, area))).then((rs) => {
      const bad = rs.find((r) => r?.error);
      if (bad) { alert(bad.error); setSteps(prev); }
    });
  }

  // **판 안에 카드를 또 그리지 않는다.** 이 자리는 이미 「루틴」 탭이라
  // 제목도 테두리도 한 겹 더 두르면 그만큼 안이 좁아지고 겹쳐 보인다.
  return (
    <>
      {!ready && (
        <div className="notice" style={{ marginBottom: 10, fontSize: 14 }}>
          <b>0035 SQL</b> 을 먼저 실행해주세요.
        </div>
      )}

      {/* 아직 하나도 없을 때 — **할 일 하나만 크게.** 「엄두가 안 난다」는
          자리에 단추 둘을 나란히 놓으면 그것부터가 고르는 일이 된다 */}
      {steps.length === 0 ? (
        <div className="emptybox">
          <p style={{ margin: "0 0 3px", fontSize: 14.5, fontWeight: 700 }}>아직 진도루틴이 없어요</p>
          <p className="hint" style={{ margin: "0 0 12px", lineHeight: 1.6 }}>
            한 줄이 한 수업 회차입니다. 진도를 따라 순서대로 돌아가요.
            <br />
            본보기를 넣고 고치는 편이 빠릅니다.
          </p>
          <div className="row" style={{ gap: 6, justifyContent: "center" }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              title="이 교재 영역에 맞는 순서를 넣어드립니다. 넣고 나서 고치시면 됩니다"
              onClick={seed}
            >
              ✨ 본보기 넣기
            </button>
            <button className="btn btn-ghost btn-sm" onClick={addStep}>
              직접 만들기
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span className="hint" style={{ flex: 1 }}>
              한 줄이 한 수업 회차입니다. 진도를 따라 순서대로 돌아갑니다.
            </span>
            {/**
              * **교재에 붙일 종이** (원장님 2026-08-31 — 「학습항목 적어놓은
              * 걸, 교재에 붙일 인쇄 자료로 만들려고 해」).
              *
              * 판을 여기 안에 열지 않고 **딴 주소**로 보낸다. 인쇄물에는
              * 학습 방법·체크리스트가 필요한데 이 화면은 그것을 안 읽어와서
              * (이름·분류·준비물뿐), 여기서 그리려면 교재 화면을 여는
              * 모든 사람이 매번 그 글을 같이 받아야 한다. 까닭은
              * app/textbooks/print/page.jsx 머리에 다 적어두었다.
              *
              * `target="_blank"` — 교재를 바꿔가며 여러 장 뽑으시니, 보던
              * 목록이 그대로 남아 있어야 다음 교재로 넘어가기가 쉽다.
              * 영역 루틴 편집기(textbookId 없음)에는 안 단다 — 종이는
              * **책에** 붙는 것이라 붙일 책이 있어야 한다.
              */}
            {textbookId ? (
              <a
                className="btn btn-sm"
                href={`/textbooks/print?tb=${textbookId}`}
                target="_blank"
                rel="noopener noreferrer"
                title="이 교재의 학습 순서를 종이로 — 교재 앞장에 붙이시면 됩니다"
              >
                🖨 인쇄용으로 보기
              </a>
            ) : null}
            <button className="btn btn-sm" onClick={inherited ? copyThenAdd : addStep}>＋ 단계 추가</button>
          </div>

          {/**
            * **지금 어느 갈래인지 한 줄로 말한다** (원장님 2026-08-24 —
            * 「영역루틴 먼저 짜고, 교재가 생겼을 때 영역루틴을 그대로 추가할지
            * 수정할지 더 추가할지 정하고, 그 다음에 학생별 루틴을 배정」).
            * 여태는 작은 딱지 하나뿐이라, 이 교재가 남의 루틴을 빌려 쓰는
            * 중인지 제 것을 가진 건지 눈에 안 들어왔다.
            */}
          {inherited && (
            <div className="notice" style={{ marginBottom: 10, fontSize: 14 }}>
              <b>「{inherited}」 영역 루틴을 그대로 쓰는 중</b> — 이 교재만의 루틴은 아직 없어요.
              영역 루틴을 고치면 이 교재도 같이 바뀝니다.
              <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn btn-sm" disabled={pending} onClick={copyThenAdd}>
                  이 교재만 따로 짜기 (영역 것을 가져와서 고침)
                </button>
                <span className="hint">그대로 쓰실 거면 아무것도 안 하셔도 됩니다.</span>
              </div>
            </div>
          )}

          <div className="stack" style={{ gap: 6 }}>
            {steps.map((s, i) => (
              <div className="steprow" key={s.id}>
                <span className="stepno">{i + 1}</span>
                <div className="stepbody">
                  {s.label && <b style={{ fontSize: 14 }}>{s.label}</b>}
                  {s.round ? (
                    <span className="tag tag-amber" title="이 회독부터 적용 — 더 높은 회독 줄이 있으면 그게 이깁니다">
                      {s.round}회독부터
                    </span>
                  ) : null}
                  {/* **어느 쪽 일인지 딱지로.** 「등원:」 「숙제:」 를 글자로 적으면
                      항목 이름과 같은 굵기라 눈이 한 번 더 읽어야 한다 */}
                  <div className="prow">
                    <span className="tag tag-lav plabel">등원</span>
                    <span style={{ fontSize: 14 }}>
                      {(s.inclass_items || []).map(nameOf).filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  <div className="prow">
                    <span className="tag tag-mint plabel">숙제</span>
                    <span style={{ fontSize: 14 }}>
                      {(s.home_items || []).map(nameOf).filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  {(s.home_next || []).length > 0 && (
                    <div className="prow">
                      <span className="tag tag-sky plabel">예습</span>
                      <span style={{ fontSize: 14 }}>
                        {(s.home_next || []).map(nameOf).filter(Boolean).join(" · ")}
                        <span className="hint"> (다음 단원)</span>
                      </span>
                    </div>
                  )}
                </div>
                <div className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                  {/* 순서 이동 — 따르는 중(inherited)이면 남의 루틴이라 못 만진다 */}
                  {inherited ? null : (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={i === 0}
                    title="위로"
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </button>
                  )}
                  {inherited ? null : (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={i === steps.length - 1}
                    title="아래로"
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </button>
                  )}
                  {inherited ? null : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...s })}>
                    수정
                  </button>
                  )}
                  {inherited ? null : (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("이 단계를 지울까요?")) return;
                      run(() => deleteStep(s.id));
                    }}
                  >
                    삭제
                  </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 고치는 판 — 목록과 **테두리로 갈라둔다.** 그냥 이어 붙이면 어디까지가
          목록이고 어디부터가 지금 고치는 것인지 눈으로 갈리지 않는다 */}
      {editing && (
        <div className="editpane">
          <div className="field">
            <label className="label">이름 (알아보기 쉽게)</label>
            <input
              className="input input-sm"
              placeholder="예) 설명 정독 · 문답노트"
              value={editing.label || ""}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
            />
          </div>
          {/* 회독 분기 (0135) — 브릿지1처럼 회독마다 하는 일이 다른 교재.
              비워두면 모든 회독에 적용된다 */}
          <div className="field">
            <label className="label">어느 회독부터? (비우면 모든 회독)</label>
            <select
              className="input input-sm"
              style={{ width: 180 }}
              value={editing.round || ""}
              onChange={(e) =>
                setEditing({ ...editing, round: e.target.value ? +e.target.value : null })
              }
            >
              <option value="">모든 회독</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}회독부터</option>
              ))}
            </select>
          </div>
          <Picker
            label="등원해서 할 것"
            items={items}
            value={editing.inclass_items || []}
            onChange={(v) => setEditing({ ...editing, inclass_items: v })}
          />
          <Picker
            label="숙제로 낼 것 (오늘 단원 복습)"
            items={items}
            value={editing.home_items || []}
            onChange={(v) => setEditing({ ...editing, home_items: v })}
          />
          {/* 예습(선행) 숙제 (0136) — 루틴이 채울 때 **다음 단원**이 붙는다 */}
          <Picker
            label="예습 숙제 (다음 단원이 붙어요)"
            items={items}
            value={editing.home_next || []}
            onChange={(v) => setEditing({ ...editing, home_next: v })}
          />
          <div className="row" style={{ gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
              취소
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() => run(() => saveStep(textbookId, editing, area))}
            >
              저장
            </button>
          </div>
        </div>
      )}
    </>
  );
}
