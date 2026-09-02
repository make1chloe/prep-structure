/**
 * 교재 — **학습 자료를 정리하는 화면.** 교재·단원 · 학습 항목 · 내신 대비 · 영상.
 * (계획 「교재 배정」 · 확정 ⑤ 표마다 주인 · ⑬ 교재 세 상태 · ㉙ 대단원 기준/소단원 기준 ·
 *  ㉒ 기본루틴+학생루틴 · ㊷ 더하고·고치고·내린다 · 「영상」 · 「엑셀 왕복」 · ⑮ 순서·접기·빈 것)
 *
 * ── 이 화면이 **하는 일**: 받아서 그린다. 판단은 한 줄도 안 만든다.
 *    단원 이름은 `v2.unit_label`, 멈춤은 `v2.book_stop`, 고르는 값은 `loadPicks()` 가 준다.
 *
 * ── 화면 차례 (급한 것이 위. ⚠️ **탭이 없다** — 탭 전환은 화면 전체 재조회다, §속도 1)
 *      ⓪ 무엇이 없어서 비었나   ← 대전제 0. 있을 때만 선다
 *      ① 교재 목록             영역 · 배정 겹 · 대단원/소단원 기준 · 상태  (늘 보인다)
 *      ② 고른 교재             설정 + **단원 나무(대›중›소)**
 *      ③ 루틴                  기본루틴(모든 항목) · 영역 루틴 · 학생 루틴
 *      ④ 내신 대비             자료 종류
 *      ⑤ 영상
 *      ⑥ 엑셀 왕복             내려받기 · **미리보기** · 저장
 *      ⑦ 이 화면이 몇 번 물었나
 *    ③~⑥ 은 **접기**다. 접기를 펴는 데는 조회가 한 번도 안 든다.
 *
 * ── ⚠️ **역할을 스스로 본다.** 문지기는 첫 화면만 고르고 역할로 화면을 안 지킨다.
 * ── ⚠️ **빈 화면을 예쁘게 만들지 않는다.** 비었으면 「무엇이 없어서 비었나」를 밝힌다 (대전제 0).
 * ── ⚠️ **닫는 길이 화면 안에 있다** (대전제 10) — 홈에 깐 앱엔 주소창도 뒤로가기도 없다.
 */
import Link from "next/link";
import "./books.css";
import { staffOnly } from "./who.js";
import { openAs, QUERY_CAP } from "./db.js";
import { loadAll, treeOf, byArea, byStudent, SHEET_KEYS, sheetTitle, sheetOwner,
         STEPS, stepLabel, nameOf } from "./read.js";
import { HOME } from "../../lib/menu.js";
import { BookForm, Tree, Items, AreaRoutine, MaterialTypes, Videos, Excel } from "./ui.js";

// ⚠️ 오늘 날짜와 멈춤이 날마다 다르다. 캐시되면 어제 판정이 오늘 화면에 그대로 뜬다
export const dynamic = "force-dynamic";
// `pg` 를 쓰므로 edge 가 아니다
export const runtime = "nodejs";
export const metadata = { title: "교재 · 클로이영어" };

const one = (v) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** 「무엇이 없어서 비었나」 — ⚠️ 빈 카드를 예쁘게 만들지 않는다 */
function Why({ children }) { return <p className="bk-why">{children}</p>; }

export default async function Books({ searchParams }) {
  const sp = Object.fromEntries(Object.entries((await searchParams) ?? {}));
  const me = await staffOnly();

  if (!me.ok) {
    return (
      <main className="wrap">
        <div className="stack">
          <h1>교재</h1>
          <div className="card">
            <div className="cardhd">이 화면을 못 엽니다</div>
            <Why>{me.msg}</Why>
            {me.how?.length ? <ul>{me.how.map((h) => <li key={h}>{h}</li>)}</ul> : null}
            <p><Link className="btn btnghost" href={HOME.staff}>← 대시보드</Link></p>
          </div>
        </div>
      </main>
    );
  }

  const conn = await openAs(me.profileId);
  if (!conn.ok) {
    return (
      <main className="wrap">
        <div className="stack">
          <h1>교재</h1>
          <div className="card"><div className="cardhd">DB 에 못 붙었습니다</div><Why>{conn.why}</Why></div>
          <p><Link className="btn btnghost" href={HOME.staff}>← 대시보드</Link></p>
        </div>
      </main>
    );
  }

  try {
    const asked = String(one(sp.b) ?? "");
    const bookId = UUID.test(asked) ? asked : null;
    const d = await loadAll(conn.db, { bookId });
    const book = bookId ? d.books.find((b) => b.id === bookId) ?? null : null;
    const tree = treeOf(d.tree);
    const stepNames = Object.fromEntries(STEPS.map((s) => [s, stepLabel(s)]));
    const sheets = SHEET_KEYS.map((k) => ({ key: k, title: sheetTitle(k), owner: sheetOwner(k) }));

    return (
      <main className="wrap">
        <div className="stack">
          <div className="bk-head">
            <h1>교재</h1>
            <span className="num muted">{d.today}</span>
            <span className="grow" />
            <Link className="btn btnghost" href={HOME.staff}>← 대시보드</Link>
          </div>

          <Empty empty={d.empty} books={d.books} />

          <BookList books={d.books} picked={bookId} />

          {book ? (
            <div className="card">
              <div className="cardhd">
                {book.name}
                <span className="chip">{book.area ?? "영역 없음"}</span>
                <span className="num muted">
                  단원 {book.units_total}줄 · 대단원 {book.chapters}개
                  {book.units_wb ? ` · 워크북 ${book.units_wb}줄` : " · 워크북 없음"}
                </span>
                <span className="grow" />
                <Link className="btn btnghost" href="/books">닫기</Link>
              </div>
              <BookForm book={book} picks={d.picks} can={d.can} />
              <h3>단원 나무 — 대 › 중 › 소</h3>
              {book.units_total + book.units_hidden === 0 ? (
                <Why>
                  이 교재는 단원이 <b>한 줄도 없습니다.</b> 그래서 배정이 돌지 않습니다 —
                  커서(<code className="mono">v2.cursor_of</code>)가 가리킬 대단원이 없기 때문입니다.
                  단원은 <b>한 곳에서만</b> 들어옵니다 (확정 ⑤): 옛 앱에 그 교재 단원이 하나라도 있으면
                  <b> 이관</b>이 넣고, 0줄이면 <b>아래 엑셀 왕복</b>이 넣습니다.
                  화면에서 단원을 손으로 더하지 않는 까닭이 이것입니다 — 세 번째 입구가 생기면
                  한 교재에 단원 나무가 두 벌 서고, <b>진도율 분모가 두 배로 읽힙니다.</b>
                </Why>
              ) : <Tree tree={tree} can={d.can} />}
            </div>
          ) : (
            <div className="card">
              <p className="muted">위에서 교재를 하나 고르면 그 교재의 설정과 단원 나무가 여기 섭니다.</p>
            </div>
          )}

          <details className="bk-fold">
            <summary className="bk-foldhd">
              <span>🧩 루틴</span>
              <span className="num">기본루틴 {d.items.length} · 영역 루틴 {d.areaRoutine.length} · 학생 루틴 {d.studentRoutine.length}</span>
            </summary>
            <div className="bk-foldbd stack">
              <h3>기본루틴 — 모든 항목</h3>
              <Items rows={d.items} picks={d.picks} can={d.can} />

              <h3>영역 루틴</h3>
              <AreaRoutine rows={d.areaRoutine} items={d.items} picks={d.picks} can={d.can} />

              <h3>학생 루틴</h3>
              <StudentRoutine rows={d.studentRoutine} empty={d.empty} />
            </div>
          </details>

          <details className="bk-fold">
            <summary className="bk-foldhd">
              <span>📄 내신 대비 — 자료 종류</span>
              <span className="num">{d.materialType.length}종</span>
            </summary>
            <div className="bk-foldbd">
              <MaterialTypes rows={d.materialType} steps={STEPS} stepNames={stepNames}
                             picks={d.picks} can={d.can} />
            </div>
          </details>

          <details className="bk-fold">
            <summary className="bk-foldhd">
              <span>🎬 영상</span>
              <span className="num">{d.video.length}개</span>
            </summary>
            <div className="bk-foldbd">
              <Videos rows={d.video} picks={d.picks} can={d.can} />
            </div>
          </details>

          <details className="bk-fold">
            <summary className="bk-foldhd">
              <span>📥 엑셀 왕복</span>
              <span className="muted">내려받기 · 미리보기 · 저장</span>
            </summary>
            <div className="bk-foldbd">
              <Excel sheets={sheets} bookId={bookId} />
            </div>
          </details>

          <Speed n={conn.count()} log={conn.log()} picked={!!bookId} />
        </div>
      </main>
    );
  } finally {
    await conn.end();
  }
}

/* ── ⓪ 무엇이 없어서 비었나 ────────────────────────────────────────── */

function Empty({ empty, books }) {
  const noArea = empty.no_area ?? [];
  const noRoutine = empty.no_routine ?? [];
  const lines = [];
  if (noArea.length)
    lines.push(<li key="area">
      <b>영역이 안 붙은 교재 {noArea.length}권</b> — 루틴은 영역에 붙으므로(㉚) 이 교재들은
      <b> 배정이 한 줄도 안 나갑니다.</b> {noArea.slice(0, 6).map((x) => x.name).join(" · ")}
      {noArea.length > 6 ? ` 외 ${noArea.length - 6}권` : ""}
    </li>);
  if (noRoutine.length)
    lines.push(<li key="routine">
      <b>루틴이 없는 영역 {noRoutine.length}개</b> — {noRoutine.map((x) => `${x.area}(교재 ${x.books}권)`).join(" · ")}
    </li>);
  if (empty.books_no_units)
    lines.push(<li key="units">
      <b>단원이 0줄인 교재 {empty.books_no_units}권</b> (내리지 않은 교재 가운데). 그중 지금 아이에게
      배정된 것은 <b>{books.filter((b) => b.assigned > 0 && b.units_total === 0).length}권</b>입니다 —
      배정된 것이 있으면 그 아이의 그 교재는 오늘 아무것도 안 나갑니다.
    </li>);
  if (empty.student_routine_rows === 0)
    lines.push(<li key="sr">
      <b>학생 루틴이 0줄</b>입니다 — 아이 {empty.students_active}명 전부가 지금 <b>영역 루틴 그대로</b> 돕니다
      (<code className="mono">lib/routine.js</code> 의 <code className="mono">pickRoutine</code>:
      「학생 것이 하나라도 있으면 그 영역은 학생 것만」).
    </li>);
  if (empty.items_retired)
    lines.push(<li key="items">
      내려둔 학습 항목 <b>{empty.items_retired}개</b>가 있습니다 — 지우지 않았고 되살릴 수 있습니다 (㊷).
    </li>);

  if (!lines.length) return null;
  return (
    <div className="card">
      <div className="cardhd">⚠️ 무엇이 없어서 비었나</div>
      <ul>{lines}</ul>
    </div>
  );
}

/* ── ① 교재 목록 ───────────────────────────────────────────────────── */

function BookList({ books, picked }) {
  const wb = books.filter((b) => b.units_wb > 0);
  return (
    <div className="card">
      <div className="cardhd">
        교재 <span className="num">{books.length}권</span>
        <span className="muted">이름을 누르면 그 교재가 아래에 섭니다</span>
      </div>
      <Why>
        ⚠️ <b>「대단원 기준 / 소단원 기준」은 워크북이 있는 {wb.length}권에서만 뜻이 있습니다</b> (㉙).
        나머지는 본책 한 벌이라 무엇을 골라도 배정이 같습니다.
        그리고 <b>멈춤(⑬)은 교재가 아니라 「그 아이의 그 교재」에 붙습니다</b> —
        「지금 배정」 칸이 그것이라 교재 하나에 여러 갈래가 같이 뜹니다.
      </Why>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            {/* ⚠️ 붙박이는 `<tr>` 이 아니라 **`<th>` 마다** 건다 — `<tr>` 에 걸면 브라우저에 따라
                오류 하나 없이 그냥 안 붙는다. 검사가 `th` 의 position 을 잰다 */}
            <tr>
              <th className="hdstick">교재</th><th className="hdstick">영역</th>
              <th className="hdstick">배정 겹</th><th className="hdstick">도는 차례</th>
              <th className="hdstick">단원</th><th className="hdstick">지금 배정</th>
              <th className="hdstick">교재 상태</th>
            </tr>
          </thead>
          <tbody>
            {books.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link className={"bk-name" + (b.id === picked ? " is-sel" : "")}
                        href={`/books?b=${b.id}`}>{b.name}</Link>
                </td>
                <td>{b.area ?? <span className="pill pillwarn">없음</span>}</td>
                <td>{nameOf("chunk_depth", b.chunk_depth)}</td>
                <td>
                  {nameOf("order_basis", b.order_basis)}
                  {b.units_wb === 0 ? <> <span className="pilloff pill">워크북 없음 · 뜻 없음</span></> : null}
                </td>
                <td className="num">
                  {b.units_total}
                  {b.units_wb ? <span className="chip">워크북 {b.units_wb}</span> : null}
                  {b.units_hidden ? <span className="pill pilloff">내림 {b.units_hidden}</span> : null}
                  {b.units_total === 0 && b.units_hidden === 0 ? <span className="pill pillwarn">단원 없음</span> : null}
                </td>
                <td className="num">
                  {b.assigned === 0 ? <span className="muted">—</span> : <>
                    {b.running ? <span className="pill pillok">{nameOf("stop", "running")} {b.running}</span> : null}
                    {b.hw_off ? <span className="pill pillwarn">{nameOf("stop", "hw_off")} {b.hw_off}</span> : null}
                    {b.book_off ? <span className="pill pillbad">{nameOf("stop", "book_off")} {b.book_off}</span> : null}
                  </>}
                </td>
                <td>
                  <span className={"pill " + (b.state === "active" ? "pillok" : b.state === "paused" ? "pillinfo" : "pilloff")}>
                    {nameOf("books_state", b.state)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── ③-c 학생 루틴 ─────────────────────────────────────────────────── */

function StudentRoutine({ rows, empty }) {
  if (!rows.length) {
    return (
      <Why>
        학생 루틴이 <b>0줄</b>입니다. 그래서 아이 {empty.students_active}명이 전부 <b>영역 루틴 그대로</b> 돕니다.
        <br />
        ㉒ 대로 학생 루틴은 기본루틴에서 <b>고르고 · 차례를 짜고 · 뺀 것</b>이고,
        <b> 학생 × 교재마다</b> 받는 것이 셋입니다 — ① 대단원 기준 / 소단원 기준 ② 회차(한 수업에 몇 개)
        ③ 단원평가를 볼지 · 어느 단위로 (㉙).
        <br />
        ⚠️ 그런데 <code className="mono">v2.student_routine</code> 은 <b>학생 × 영역</b>이라
        「교재마다」를 담을 칸이 없습니다. ①②③ 은 <code className="mono">v2.student_book</code> 의
        <code className="mono"> order_basis · per_session · unit_test · unit_test_n</code> 에 있고,
        그것은 <b>한 아이를 골라 여는 자리</b>(학생 화면)입니다. 이 화면은 <b>자료</b>를 정리하는 곳이라
        여기서 아이를 고르게 하지 않습니다 — 지금 있는 줄만 그대로 보여 드립니다.
      </Why>
    );
  }
  return (
    <div className="stack">
      {byStudent(rows).map((s) => (
        <details key={s.name} className="bk-fold">
          <summary className="bk-foldhd"><span>{s.name}</span><span className="num">{s.rows.length}줄</span></summary>
          <div className="bk-foldbd">
            {byArea(s.rows).map(([area, list]) => (
              <div key={area} className="stack">
                <h3>{area}</h3>
                {list.map((r) => (
                  <div key={r.id} className="bk-line">
                    <span className="num muted">{r.sort}</span>
                    <span className="grow">{r.name}</span>
                    <span className="chip">{nameOf("place", r.place)}</span>
                    {r.gate_prev ? <span className="pill pillinfo">앞엣것을 끝내야 열림</span> : null}
                    {r.count_n != null ? <span className="chip">갯수 {r.count_n}</span> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/* ── ⑦ 이 화면이 몇 번 물었나 ──────────────────────────────────────── */

function Speed({ n, log, picked }) {
  const over = n > QUERY_CAP;
  return (
    <details className="bk-fold">
      <summary className="bk-foldhd">
        <span>이 화면이 서버에 물은 횟수</span>
        <span className={"pill " + (over ? "pillbad" : "pillok")}>{n}번 / 상한 {QUERY_CAP}</span>
      </summary>
      <div className="bk-foldbd">
        <p className="muted">
          ⚠️ <b>탭이 없어서 첫 조회가 여러 번이고, 접었다 펴는 데는 한 번도 안 듭니다</b> (§속도 1).
          탭 일곱이면 이 값을 일곱 번 치릅니다. {picked ? "교재를 하나 골라서 단원 나무 조회가 하나 더 들었습니다." : "교재를 고르면 하나 더 듭니다."}
        </p>
        <ul>{log.map((s, i) => <li key={`${s}:${i}`}><code className="mono">{s}</code></li>)}</ul>
        {over ? <Why>상한을 넘었습니다 — 감추지 않고 그대로 띄웁니다.</Why> : null}
      </div>
    </details>
  );
}
