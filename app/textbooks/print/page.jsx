import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadHomeworkItems, checklistLines } from "@/lib/homeworkView";
import { printPlan } from "@/lib/routinePrint";
import { toolText } from "@/app/homework/categories";
import { listRoutine } from "../routineActions";
import { PrintBarLazy } from "./PrintLazy";

export const dynamic = "force-dynamic";

/**
 * **교재에 붙이는 인쇄물** (원장님 2026-08-31 — 「학습항목 적어놓은 걸,
 * 교재에 붙일 인쇄 자료로 만들려고 해」).
 *
 * 교재 한 권의 루틴에 들어 있는 학습 항목이 차례대로 서고, 항목마다
 * **준비물 · 학습 방법 · 체크리스트 · 동그라미 칸**이 붙는다. 종이 한 장이
 * 「이 책은 이렇게 공부한다」 가 되어 그 책 앞장에 붙는다.
 *
 * ── 왜 화면 안이 아니라 **딴 주소**인가 ────────────────────
 *
 * ① **재료가 다르다.** 교재 화면(app/textbooks/page.jsx)이 읽는 학습 항목은
 *    `id, name, sort, category, tool` 뿐이다 — 루틴 편집기가 이름과 준비물만
 *    그리기 때문이다. 인쇄물에 필요한 **학습 방법·체크리스트**가 거기 없다.
 *    그 조회에 두 칸을 더하면 교재 화면을 여는 **모든** 사람이 (인쇄를 안
 *    할 때도) 마흔몇 항목의 방법 글과 체크리스트를 매번 받는다. 일 년에
 *    몇 번 뽑는 종이 때문에 매일 여는 화면을 무겁게 하지 않는다.
 * ② **종이는 화면의 일부가 아니다.** 화면 안에서 뽑으면 `@media print` 가
 *    교재 목록·탭·단추를 하나하나 지워야 하고, 새 단추가 늘 때마다 지우는
 *    목록도 같이 늘어야 한다 — 빠뜨리는 날 종이에 단추가 찍힌다.
 *    빈 주소에서 시작하면 지울 것이 없다.
 * ③ **딴 탭으로 연다.** 원장님은 교재를 바꿔가며 여러 장 뽑으신다. 보던
 *    교재 화면이 그대로 남아 있어야 다음 교재로 넘어가기가 쉽다.
 *
 * 그래서 여기 서고, 교재 화면은 **링크 한 줄**만 는다 (자바스크립트 0).
 *
 * ── 조회 ────────────────────────────────────────────────
 *
 * 셋뿐이고, 셋 다 **이미 있는 한 벌**을 그대로 부른다 (원칙 1):
 *   교재 이름·영역   textbooks 한 줄
 *   루틴             app/textbooks/routineActions.listRoutine
 *                    — 교재 루틴이 있으면 그것, 없으면 그 교재 영역의
 *                      루틴(0137). 고르는 규칙을 여기서 다시 안 푼다.
 *   학습 항목        lib/homeworkView.loadHomeworkItems
 *                    — 방법·체크리스트·준비물까지 읽는 유일한 한 벌
 * 무엇을 어떤 차례로 실을지는 lib/routinePrint 에 적혀 있다.
 *
 * 로그인·권한은 미들웨어가 한 번만 막는다 (lib/roles — 「막는 곳은 한
 * 군데여야 한다」). 여기서 또 확인하지 않는다.
 */
export const metadata = { title: "교재 인쇄물 — 클로이영어" };

export default async function BookPrintPage(props) {
  const searchParams = await props.searchParams;
  // 교재를 가리키는 열쇠 이름은 교재 화면과 **같은 `tb`** 다 (app/textbooks/page.jsx).
  // 같은 것을 두 이름으로 부르면 주소를 손으로 고칠 때마다 어느 쪽인지 헷갈린다.
  const bookId = (searchParams?.tb || "").trim();
  const backHref = bookId ? `/textbooks?tb=${bookId}` : "/textbooks";

  if (!bookId) {
    return (
      <main className="wrap" style={{ paddingTop: 16 }}>
        <div className="card">
          <p className="sub" style={{ margin: 0 }}>
            어느 교재의 인쇄물인지 알 수 없어요.{" "}
            <Link href="/textbooks">교재 목록</Link>에서 교재를 고르고{" "}
            <b>진도루틴</b> 탭의 「인쇄용으로 보기」 를 눌러주세요.
          </p>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const [bookQ, routine, itemMap] = await Promise.all([
    supabase.from("textbooks").select("id, name, area").eq("id", bookId).maybeSingle(),
    listRoutine(bookId),
    loadHomeworkItems(supabase),
  ]);
  const book = bookQ?.data || null;
  const plan = printPlan(routine?.steps || [], (id) => itemMap.get(id) || null);

  if (!book) {
    return (
      <main className="wrap" style={{ paddingTop: 16 }}>
        <div className="card">
          <p className="sub" style={{ margin: 0 }}>
            그런 교재가 없어요. <Link href="/textbooks">교재 목록</Link>으로 돌아가 주세요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap bookprint">
      <PrintBarLazy backHref={backHref} />

      {plan.length === 0 ? (
        <div className="card noprint">
          <p className="sub" style={{ margin: 0 }}>
            <b>{book.name}</b> 에는 아직 뽑을 것이 없어요 — 진도루틴이 비어 있거나,
            루틴에 붙은 학습 항목이 모두 지워졌습니다.{" "}
            <Link href={backHref}>진도루틴</Link>을 먼저 채워주세요.
          </p>
        </div>
      ) : (
        /* 종이 한 장. 화면에서도 같은 모양으로 보여드린다 — 미리보기와
           나온 종이가 다르면 뽑아보기 전에는 알 수가 없다 */
        <article className="bp-sheet">
          <header className="bp-head">
            <p className="bp-eyebrow">이 책은 이렇게 공부해요</p>
            <h1 className="bp-title">{book.name}</h1>
            {/**
              * **남의 루틴을 빌려 쓰는 중이면 그것을 적는다** (0137).
              * 안 적으면 두 교재에서 똑같은 종이가 나오는 까닭을 알 수 없고,
              * 무엇보다 이 종이를 고치려고 교재 루틴을 열었다가 「아무것도
              * 없는데?」 를 만나게 된다 — 고칠 곳은 영역 루틴이다.
              * 아이에게는 상관없는 말이라 작게, 제목 아래 한 줄로만 둔다.
              */}
            <p className="bp-sub">
              {routine?.inherited
                ? `${book.area || routine.inherited} 영역 공통 학습 순서입니다`
                : book.area
                  ? `${book.area}`
                  : ""}
            </p>
            {/* 아이 것이 되어야 아이가 표시한다 — 이름 칸을 비워 둔다 */}
            <p className="bp-name-line">이름 <span className="bp-blank" /></p>
          </header>

          {plan.map((st) => (
            <section className="bp-step" key={st.key}>
              <h2 className="bp-stephead">
                <span className="bp-stepno">{st.no}회차</span>
                {st.label ? <span className="bp-steplabel">{st.label}</span> : null}
                {/* 회독은 학생마다 달라서(0135) 종이에서 못 고른다 — 대신
                    몇 회독부터인지 적어, 아닌 아이가 건너뛸 수 있게 한다 */}
                {st.round ? <span className="bp-round">{st.round}회독부터</span> : null}
              </h2>

              {st.groups.map((g) => (
                <div className="bp-group" key={g.key}>
                  <h3 className="bp-grouphead">
                    {g.label} <span className="bp-grouphint">— {g.hint}</span>
                  </h3>
                  <ol className="bp-rows">
                    {g.rows.map((r) => {
                      const lines = checklistLines(r.item.checklist);
                      const tool = toolText(r.item.tool);
                      return (
                        <li className="bp-row" key={`${g.key}-${r.no}`}>
                          <span className="bp-no">{r.no}</span>
                          <div className="bp-body">
                            <p className="bp-itemname">
                              {r.item.name}
                              {/* 종이에서는 그림표가 아니라 **글자**로 —
                                  흑백 복사에서 📕 과 📓 은 같은 얼룩이 된다 */}
                              {tool ? <span className="bp-tool">{tool}</span> : null}
                            </p>
                            {r.item.method ? (
                              <p className="bp-method">{r.item.method}</p>
                            ) : null}
                            {r.note ? <p className="bp-note">※ {r.note}</p> : null}
                            {/* 체크리스트가 없으면 **그 자리를 비운다** —
                                빈 네모 하나를 습관처럼 그려두면 아이는
                                무엇을 확인하라는 것인지 모른 채 칠한다 */}
                            {lines.length > 0 ? (
                              <ul className="bp-check">
                                {lines.map((t, k) => (
                                  <li key={k}>
                                    <span className="bp-box" aria-hidden="true" />
                                    {t}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                          {/* 아이가 하고 나서 직접 그리는 칸 */}
                          <span className="bp-circle" aria-hidden="true" />
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </section>
          ))}

          <footer className="bp-foot">
            다 한 것은 오른쪽 칸에 ○ 를 그려요. 클로이영어
          </footer>
        </article>
      )}
    </main>
  );
}
