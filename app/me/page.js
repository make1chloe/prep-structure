/** 아이 화면 07 「나」 — 하루 동선대로: 등원 → 공지 → 등원학습(학원·숙제) → 숙제 → 시험 → 남아서 → 받을 것·영상·내 교재 → 앞으로·달력·성적·자료·우리 학교·선생님 한 마디 → 집에 가요. 설명은 안 한다 — 이름이 말한다(대전제-15 · (어16)).
 *  전부 아이 자격으로 읽는다(RLS 가 제 것만 준다). 카드는 원장님이 「누가 무엇을 보나」에서 켠 것만(me.*) — 안 정한 칸은 막혀 있다. 판단은 lib/me · lib/arrival-plan, 여기는 가져다 그린다 */
import Link from "next/link";
import { Oops } from "../_shell/oops.js";
import { guard } from "@/lib/session";
import { ROLES, isStaff } from "@/lib/roles";
import { itemTitle, itemSub } from "@/lib/item-plan";
import { decide, ME } from "@/lib/perm";
import { today } from "@/lib/day";
import { meDay } from "@/lib/me";
import { FACE } from "@/lib/emoji";   // (어67)-② 카드 얼굴은 그림 표 한 곳에서 온다(대전제-25)
import { hhmm } from "@/lib/late-plan";
import { classLabel, md } from "@/lib/dash-plan";
import { KIND as QKIND, scopeText, quizTag } from "@/lib/quiz-plan";
import { STOP } from "@/lib/routine-plan";
import { ArrivalCard, DoRow, MaterialCard, ScoreCard, AttachLines, FilesCard, SubmitLine } from "./cards.js";
import { CHECK } from "@/lib/status";   // (어76) 검사 부호는 한 벌에서 온다(아이 화면이 ○△✕ 를 제 손으로 안 적는다 · 원칙-1)
const MARK = Object.fromEntries(CHECK);
import { childLinks } from "@/lib/files-plan";
import AskCard from "../_shell/askcard.js";
import BellCard from "../_shell/bell.js";
import { ask } from "./actions.js";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { orderCards, foldedOf } from "@/lib/pref-plan";
import { asView, asId, keepAs } from "@/lib/asview";
import AsBand from "../_shell/asband.js";
import Mine from "./mine.js";   // (어72) 🧑 내 정보 — 빈 칸 채우기
import Fold from "../_shell/fold.js";
import CardOrder from "../_shell/cardorder.js";
import NoticeCard from "../_shell/noticecard.js";
import { ItemTree } from "../_shell/tree.js";   // (어42) 항목 나무 한 벌(01 · 09 와 같은 부품 · 영역 › 📕 교재 › ▸ 단원 › 활동)
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1400, margin: "16px auto", padding: "0 12px" }}><div className="mine">{children}</div></main>;   // (어17) 원내 PC 로도 연다 — 최대 너비(01 과 같은 1400) · PC 는 목업 .mine 두 열 · 폰은 한 줄(원장님 9/14)
const Card = ({ emo, title, id, pill, fold = null, folded = false, children }) => <div className="task" data-card={id} data-folded={folded ? "1" : "0"}><div className="h"><b><span className="cemo">{emo}</span>{title}</b><span className="spacer" />{pill != null && <span className="pill">{pill}</span>}{fold}</div>{children}</div>;
const Line = ({ it, right, attach = null }) => <><div className="li"><div><b>{itemTitle(it)}</b><small>{[itemSub(it, { unit: false }), it.received ? `${md(it.received)} 에 받음` : null].filter(Boolean).join(" · ")}</small></div>{right}</div>{attach}</>;
const qname = (k) => QKIND.find(([x]) => x === k)?.[1] ?? k;
export default async function Me({ searchParams }) {
  const { sb, me, user } = await guard();
  if (!me) redirect("/");
  let sp, date, d;
  try { [sp, date] = await Promise.all([searchParams, today(sb)]); }   // 주소 인자와 오늘을 **한 파도로** — 👁 를 더하며 층이 늘지 않게(속도-1 · check-fast 가 잡아 줬다)
  catch (e) { { console.error("[화면] 내 화면 못 엶:", e); return frame(<Oops what="내 화면" e={e} kind="task" />); } }
  const seeing = asView(me, sp);   // 👁 원장님이 그 아이 화면을 보는 중(lib/asview 한 곳에서 정한다)
  if (isStaff(me.role) && !seeing) return frame(<div className="task"><div className="h"><b>🎒 아이 화면입니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>학원 사람은 오늘 수업·대시보드에서 봅니다. 어느 아이가 보는 화면인지는 <b>운영 › 재원생</b>에서 「👁 아이 화면」으로 여십니다.</p></div>);
  if (!seeing && me.role !== ROLES.STUDENT) redirect("/");   // 직원은 위에서 이미 돌아갔다 — 여기 오는 직원은 보는 중인 사람뿐
  try { d = await meDay(sb, user, date, seeing ? asId(sp) : null); }
  catch (e) { { console.error("[화면] 내 화면 못 엶:", e); return frame(<Oops what={seeing ? "그 아이 화면" : "내 화면"} e={e} kind="task" />); } }
  const can = (k) => decide(ROLES.STUDENT, d.access, k) === true;
  const shown = [ME.arrival, ME.today, ME.books].filter(can);
  const fl = childLinks(d.links, date, d.rules?.["file.child_days"]);   // 📎 붙임 — 1달 안의 것만(규칙)
  const att = (it) => <AttachLines links={fl.pending.filter((l) => l.day_item_id === it.id || (it.carry_of && l.day_item_id === it.carry_of))} />;   // 검사 줄은 어제 숙제 줄을 가리킨다(carry_of) — 붙임이 따라온다
  const videosLeft = d.videos.filter((v) => v.status.key !== "done").length;
  const first = d.classes[0];
  const K = (h) => keepAs(h, me, sp);   // 👁 보는 중이면 안쪽 링크에도 as= 를 잇는다 — 눌렀더니 제 화면으로 튀지 않게(lib/asview)
  const fdd = foldedOf(d.prefs?.me);   // 접은 카드 — 사람마다(확정-⑮ · (어2))
  const auto = new Set([...(d.arrival?.left ? ["todo"] : []), ...(d.arrival?.arrived ? ["due"] : [])]);   // (어75) 등원을 찍으면 숙제는 낸 것이라 접고 · 하원을 찍으면 등원학습은 끝난 것이라 접는다(원장님 9/18) · 누르면 그 자리에서 펴진다
  const fold = (id) => { const on = fdd.has(id) || auto.has(id); return { fold: <Fold screen="me" id={id} folded={on} />, folded: on }; };   // 카드마다 ▾ 와 지금 접혀 있나 — 한 번에
  const cards = orderCards([
    { id: 'mine', name: '내 정보', node: d.fill.length > 0 && <Card emo={FACE.mine} title="내 정보" id="mine" {...fold("mine")} pill={`채울 칸 ${d.fill.length}`}><Mine fields={d.fill} filled={d.filled} progress={d.progressEdit} /></Card> },   // (어72) 원장님이 켠 칸 · 빈 칸일 때만 · 틀은 여기가 씌운다(눌리는 조각에는 함수를 못 건넨다)
    { id: 'notice', name: '공지', node: can(ME.today) && d.notices.length > 0 && <NoticeCard Card={Card} {...fold("notice")} lines={d.notices} unread={d.unread} /> },
    { id: 'todo', name: '등원학습', node: can(ME.today) && (<Card emo="📋" title="등원학습" id="todo" {...fold("todo")} pill={d.sheet ? `학원 ${d.classSteps.length} · 숙제 ${d.sheet.home.length}` : null}>
        {!d.sheet && <p className="note" style={{ margin: "8px 0 0" }}>아직 안 열렸어요</p>}
        {d.sheet && !d.classSteps.length && !d.sheet.home.length && <p className="note" style={{ margin: "8px 0 0" }}>검사 뒤에 떠요</p>}
        {d.classSteps.length > 0 && <><div className="hh" style={{ marginTop: 8 }}>학원에서 · 차례대로</div><ItemTree rows={d.classSteps} bySort row={(it) => <Line key={it.id} it={it} right={<DoRow item={it} state={it.state} hands="timer" />} />} />{/* (어35) 학원 줄은 타이머(▶ 시작 · ■ 끝) · 차례는 sort · (어77) 손은 DoRow 한 곳에서 낸다(🔒 3초 포함) */}
          {d.sheet.books.filter((b) => b.class_memo).map((b) => <p key={b.book_id} className="note" style={{ margin: "4px 0 0", color: "var(--navy)" }}>✎ 선생님 메모 · {b.class_memo}</p>)}</>}
        {d.homeSteps.length > 0 && <><div className="hh" style={{ marginTop: 8 }}>집에서 · 다음 시간에 냅니다</div><ItemTree rows={d.homeSteps} bySort row={(it) => <Line key={it.id} it={it} right={<DoRow item={it} state={it.state} />} attach={<>{att(it)}<SubmitLine item={it} rules={d.rules} /></>} />} />{/* (어75) 숙제에도 타이머(▶ 시작 · ■ 끝 · 했어요 ✓) — 원장님 9/18 「숙제에는 타이머가없어 추가해」 · (어77) 완료 뒤 다음 걸음(🃏 클래스카드 또는 사진·음성) */}
          {d.sheet.books.filter((b) => b.home_memo).map((b) => <p key={b.book_id} className="note" style={{ margin: "4px 0 0", color: "var(--navy)" }}>✎ 선생님 메모 · {b.home_memo}</p>)}</>}
      </Card>) },
    { id: 'due', name: '숙제', node: can(ME.today) && (<Card emo="📘" title="숙제" id="due" {...fold("due")} pill={String(d.due.length)}>
        {!d.due.length && <p className="note" style={{ margin: "8px 0 0" }}>낼 숙제가 없어요</p>}
        <ItemTree rows={d.due} row={(it) => <Line key={it.id} it={it} attach={<>{att(it)}<SubmitLine item={it} rules={d.rules} /></>} right={it.status && it.status !== "none" ? <span className={"tag" + (it.status === "done" ? " on" : "")}>검사 {MARK[it.status] ?? it.status}</span> : <DoRow item={it} />} />} />{/* (어75) 검사 끝난 줄은 그 결과만 · 아직인 줄은 타이머 · (어76) 줄마다 「내가 낸 것」(반려 글 · 사진·음성 · 지우고 다시 내기) */}
      </Card>) },
    { id: 'quiz', name: '시험', node: can(ME.today) && ((d.quizzes.today.length > 0 || d.quizzes.next.length > 0) && <Card emo="🔤" title="시험" id="quiz" {...fold("quiz")} pill={String(d.quizzes.today.length + d.quizzes.next.length)}>
        {d.quizzes.today.map((q) => <div className="li" key={q.id}><div><b>{qname(q.kind)} 시험 · {scopeText(q)}</b>{quizTag(q) && <span className="tag" data-g="quiz-tag" style={{ marginLeft: 6 }}>{quizTag(q)}</span>}<small>{q.total ? `${q.total}개 · 통과 ${q.cut_pct ?? 90}%` : "개수 아직"}{q.passed === true ? ` · ${q.pct}% 통과` : q.passed === false ? ` · ${q.pct}% 못 넘음 → 재시험` : ""}</small></div></div>)}
        {d.quizzes.next.map((q) => <div className="li" key={q.id}><div><b>다음 시간 {qname(q.kind)} 시험 · {scopeText(q)}</b><small>{q.total ? `${q.total}개 · 통과 ${q.cut_pct ?? 90}%` : "개수 아직"}</small></div></div>)}
      </Card>) },
    { id: 'stay', name: '오늘은 남아서', node: can(ME.today) && (Boolean(d.sheet?.late?.until_at || d.stayRows?.length) && <Card emo="🌙" title="오늘은 남아서" id="stay" {...fold("stay")} pill={d.sheet?.late?.until_at ? `${hhmm(d.sheet.late.until_at)} 예정` : "시간 미정"}>
        <p className="note" style={{ margin: "4px 0 0" }}>{d.sheet?.late?.reason || "남아서 하고 갑니다"}</p>
        {d.stayRows?.length > 0 && <div style={{ marginTop: 6 }}>{d.stayRows.map((r) => <div key={r.id} className="li" data-g="stay-line" data-state={r.state}><span className="n">{r.state === "done" ? "✓" : r.state === "missing" ? "⏭" : "남"}</span><div><b>{r.text}</b>{r.sub && <small>{r.sub}</small>}</div></div>)}</div>}</Card>) },
    { id: 'material', name: '받을 교재·학습지', node: can(ME.books) && <MaterialCard gives={d.gives} today={date} {...fold("material")} /> },
    { id: 'videos', name: '영상', node: can(ME.books) && d.videos.length > 0 && <div className="task" data-card="videos" data-folded={fdd.has("videos") ? "1" : "0"} style={{ borderStyle: videosLeft ? undefined : "dashed" }}><div className="h"><b><span className="cemo">🎬</span>영상</b><span className="spacer" /><span className={"pill" + (videosLeft ? " warn" : " hw")} data-g="videos-left">{videosLeft ? `${videosLeft}개 남음` : "다 봤어요"}</span>{fold("videos").fold}</div>
      {d.videos.slice(0, 3).map((v) => <Link prefetch={false} className="li" key={v.id} href={K(`/me/videos?v=${v.video_id}`)} data-g="video-line" style={{ textDecoration: "none", color: "inherit" }}><div><b>{v.video?.title}</b><small>{[v.due || null, v.status.key === "part" ? `이어 보기 ▶` : v.status.key === "done" ? "다시 보기 ▶" : "보기 ▶"].filter(Boolean).join(" · ")}</small></div><span className={"tag" + (v.status.key === "done" ? " on" : "")}>{v.status.text}</span></Link>)}
      <Link prefetch={false} className="btn sm" href={K("/me/videos")} data-g="videos-all" style={{ marginTop: 6 }}>모두 {d.videos.length}개 👉</Link></div> },
    { id: 'books', name: '내 교재', node: can(ME.books) && <Card emo="🗺" title="내 교재" id="books" {...fold("books")} pill={`${d.books.length}권`}>
      {!d.books.length && <p className="note" style={{ margin: "8px 0 0" }}>배정된 교재가 없어요</p>}
      {d.books.map((b) => <Link prefetch={false} className="li" key={b.id} href={K(`/me/book?b=${b.book_id}`)} data-g="book-link" style={{ textDecoration: "none", color: "inherit" }}><div><b>{b.books?.name}</b><small>{b.round}회독</small></div>{b.stop_mode !== "running" && <span className="tag">{STOP.find(([k]) => k === b.stop_mode)?.[1] ?? "보류"}</span>}</Link>)}
    </Card> },
    { id: 'future', name: '앞으로', node: can(ME.today) && (d.future.length > 0 && <Card emo="📅" title="앞으로" id="future" {...fold("future")} pill={String(d.future.length)}>
        {d.future.map((f, i) => <p key={i} className="note" style={{ margin: "4px 0 0", color: "var(--ink)" }}>{f.text}</p>)}</Card>) },
    { id: 'cal', name: '달력', node: can(ME.today) && (<Link prefetch={false} className="task" href={K("/me/cal")} data-card="cal" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="h"><b><span className="cemo">📅</span>달력</b><span className="spacer" /><span className="pill">달력 👉</span></div></Link>) },
    { id: 'scores', name: '성적', node: <ScoreCard scores={d.scores} entry={d.entry} {...fold("scores")} /> },
    { id: 'files', name: '자료', node: can(ME.books) && <FilesCard past={fl.past} hidden={fl.hidden} rules={d.rules} sent={d.uploads} {...fold("files")} /> },
    { id: 'school', name: '우리 학교', node: can(ME.grid) && d.school.length > 0 && (<Card emo="🏛️" title="우리 학교" id="school" {...fold("school")} pill={d.student.schools?.name ?? ""}>
        {d.school.map((g) => <div key={g.id} data-g="school-grid"><div className="hh" style={{ marginTop: 8 }}>{g.label}</div>{g.rows.map((r) => <div className="li" key={r.id} data-g="school-row"><div><b>{r.title}</b><small>{r.cells.map((c) => `${c.label} ${c.text}`).join(" · ")}</small></div></div>)}</div>)}
        </Card>) },
    { id: 'memo', name: '선생님 한 마디', node: can(ME.today) && d.memos.length > 0 && <Card emo="💬" title="선생님 한 마디" id="memo" {...fold("memo")} pill={md(d.memos[0].sheet_date)}>
      {d.memos.map((m) => <div className="li" key={m.area}><div><b>{m.area}</b><small>{m.memo}</small></div></div>)}</Card> },
  ].filter((c) => c.node), d.prefs?.me);   // 카드 차례 — 기본은 할 것(오늘 · 낼 숙제 · 시험 · 남아서 · 받을 것 · 영상 · 내 교재) → 볼 것(앞으로 · 달력 · 성적 · 자료 · 우리 학교 · 한 마디)((어16) · 목업 07 도 내 교재가 달력·성적 앞) · 바꾸면 그 사람 것(확정-⑮ · screen_pref me)
  const body = (<>
    <div className="wv" style={{ margin: "0 0 4px" }}><b style={{ fontSize: "var(--fs-6)" }}>{d.student.name}</b>{first && <span className="pill">{classLabel(first)}</span>}<span className="spacer" /><span className="pill">{md(date)}</span></div>
    {!shown.length && <div className="task"><div className="h"><b>🔐 아직 열리지 않았어요</b></div><p className="note" style={{ margin: "8px 0 0" }}>학원에서 아직 안 열었어요</p></div>}
    {can(ME.arrival) && <ArrivalCard arrival={d.arrival} choice={d.choice} off={d.off} />}
    {cards.map((c) => <Fragment key={c.id}>{c.node}</Fragment>)}
    {cards.length > 1 && <CardOrder screen="me" cards={cards.map((c) => ({ id: c.id, name: c.name }))} />}
    <BellCard />
    {can(ME.today) && <AskCard asks={d.asks} send={ask} />}
  </>);
  // 👁 보는 중에는 **아무것도 눌리지 않는다** — fieldset disabled 가 안의 단추·칸을 통째로 잠근다(브라우저가 한다 · 손도 역할을 봐서 한 번 더 막는다).
  //    링크는 안 잠긴다 — 「내 교재 👉」처럼 그 아이의 다음 화면으로 계속 갈 수 있어야 한다(주소의 as= 는 keepAs 가 잇는다).
  return frame(seeing
    ? <><AsBand name={d.student.name} kind="me" /><fieldset disabled style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} data-g="as-locked">{body}</fieldset></>
    : body);
}
