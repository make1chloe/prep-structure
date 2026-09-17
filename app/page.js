/** 첫 화면 = 대시보드(목업 17) — 빵꾸 막이가 맨 위. 판단은 lib/dash(파도) + lib/dash-plan(순수), 여기는 가져다 그린다.
 *  층은 다섯(속도-상한 대시보드 20 · 5단): 로그인 확인 → 오늘 → 반·아이(∥ 예정) → 나머지 한 파도 — 뒤 둘은 lib/dash.dashboard 안. 단추는 전부 지은 화면으로 가는 링크(발송·루틴·시험 화면은 아직) */
import Link from "next/link";
import { Oops } from "./_shell/oops.js";
import { guard } from "@/lib/session";
import { ROLE_NAME, ROLES, isStaff, displayId } from "@/lib/roles";
import { CELLS } from "@/lib/perm";
import { today } from "@/lib/day";
import { dashboard } from "@/lib/dash";
import { dateLabel, classLabel, whenText, md } from "@/lib/dash-plan";
import { DISPOSAL } from "@/lib/warn-plan";
import { KIND as QKIND } from "@/lib/quiz-plan";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { orderCards, foldedOf } from "@/lib/pref-plan";
import Fold from "./_shell/fold.js";
import CardOrder from "./_shell/cardorder.js";
import Answer from "./_shell/answer.js";
import DashGaps from "./dashgaps.js";   // (어41) 빈 배정 · 메모로만 · 진도 체크 띠 · 칩과 모달(원장님 9/15)
import { ClassMakeup } from "./schedule/panel.js";   // (어41) 보강일은 그 자리에서(12 와 같은 부품)   // (처) 💬 남기실 말 「답하기」
import { KINDS as RKINDS } from "@/lib/request";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1400, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
const Card = ({ emo, title, id, fold = null, folded = false, children }) => <div className="dcard" data-card={id} data-folded={folded ? "1" : "0"}><div className="ctitle"><span className="cemo">{emo}</span>{title}<span className="spacer" />{fold}</div>{children}</div>;
const Row = ({ icon, cls = "i-cls", b, small, children }) => <div className="dayrow"><i className={"cm " + cls}>{icon}</i><div><b>{b}</b>{small && <small>{small}</small>}</div>{children}</div>;
const dispName = (k) => DISPOSAL.find(([x]) => x === k)?.[1] ?? "처분 아직";
const qkind = (k) => QKIND.find(([x]) => x === k)?.[1] ?? k;
const rkind = (k) => RKINDS.find(([x]) => x === k)?.[1] ?? k;
export default async function Home() {
  const { sb, me, user, err } = await guard();
  if (!me) return frame(<div className="card" data-g="no-profile">   {/* (어36) 계정만 있고 사람 줄이 없는 아이디(원장님 9/15 「학생페이지들어가면이래」) · 진짜 길을 말한다 · 꼬리 도메인은 안 보인다 */}
    <div className="ctitle"><span className="cemo">⚠️</span>아직 학원에 이어지지 않은 아이디</div>
    <p className="note">로그인은 됐는데 <b>{displayId(user.email)}</b> 에 이어진 학생·학부모·선생님 줄이 없음{err ? ` · 읽기 오류: ${err}` : ""}</p>
    <p className="note">원장님이 학생 14 → 그 아이 → ✎ 고치기 → 🔑 계정 · 학생 칸(<b>{displayId(user.email)}</b> 이 채워져 있음) → 「발급」 → 이어짐(비밀번호는 그대로) · 🃏 클래스카드 아이디 칸이 아닙니다 · 학부모면 계정 · 학부모에 전화번호로 발급·연결</p>
    <form action="/logout" method="post"><button className="btn sm" type="submit">로그아웃</button></form></div>);
  if (me.role === ROLES.STUDENT) redirect("/me");   // 아이는 제 화면(07) — 메뉴 없이 하나
  if (!isStaff(me.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🎒</span>{me.name} 님, {ROLE_NAME[me.role]} 화면은 곧 열립니다</div><p className="note">2단계에서 아이·학부모 화면이 섭니다.</p></div>);
  let date, d;
  try { date = await today(sb); d = await dashboard(sb, date, { principal: me.role === ROLES.PRINCIPAL }); }
  catch (e) {   // 화면이 스스로 말한다(대전제-0)
    console.error("[화면] 대시보드 못 엶:", e); return frame(<Oops what="대시보드" e={e} />);
  }
  const left = d.undecided, first = d.people.classes[0], unsent = d.late.filter((l) => !l.sent);
  const fdd = foldedOf(d.pref);   // 접은 카드 — 사람마다(확정-⑮ · (어2))
  const fold = (id) => ({ fold: <Fold screen="dash" id={id} folded={fdd.has(id)} />, folded: fdd.has(id) });
  const cards = orderCards([
    { id: 'today', name: '오늘 수업', node: <Card emo="📚" title="오늘 수업" id="today" {...fold("today")}>
        {!d.people.classes.length && <Row icon="·" b="오늘 수업 없음" small="오늘 도는 반이 없습니다" />}
        {d.people.classes.map((c) => { const abs = c.students.filter((s) => s.plan?.absent).length; return <Row key={c.id ?? "makeup"} icon="·" b={classLabel(c)} small={`${c.students.length}명${c.kind !== "makeup" ? ` · 결석 예정 ${abs ? `${abs}명` : "없음"}` : ""}`}><Link prefetch={false} className="btn sm" href="/today">열기</Link></Row>; })}
        {d.late.length > 0 && <Row icon="🌙" cls="i-late" b={`하원 지연 예정 ${d.late.length}명`} small={d.late.map((l) => `${l.name} ${l.until}${l.sent ? " · 보냄" : " · 아직 안 보냄"}`).join(" · ")}>{unsent.length > 0 && <span className="tag now">보내야 함 {unsent.length}</span>}</Row>}
        {d.reflect.length > 0 && <Row icon="⚠️" cls="i-abs" b={`반성문 ${d.reflect.length}명`} small={d.reflect.map((r) => `${r.name} · 이달 경고 ${r.count}회째 · ${dispName(r.disposal)}`).join(" · ")} />}
      </Card> },
    { id: 'send', name: '발송', node: <Card emo="📨" title="발송" id="send" {...fold("send")}>
        <Row icon="📨" cls="i-hw" b={`데일리리포트 ${d.sheets.closed} / ${d.sheets.total}`} small={<>마감한 것만 나갑니다 · <span data-g="unread">안 읽은 집 {d.unread}</span></>}><Link prefetch={false} className="btn sm" href="/send">발송 👉</Link></Row>
      </Card> },
    { id: 'soon', name: '오늘 안', node: <Card emo="🔥" title="오늘 안" id="soon" {...fold("soon")}>
        {!d.unitTodo.length && !d.retests.length && <Row icon="✓" cls="i-ok" b="오늘 안에 할 것 없음" />}
        {d.unitTodo.map((u) => <Row key={u.id} icon="✍️" cls="i-ex" b={`단원평가 출제 · ${u.name}`} small={`${u.topic} ${u.n}문항 · ${md(u.on)} 낼 것`} />)}
        {d.retests.map((q) => <Row key={q.id} icon="📄" cls="i-ex" b={`${qkind(q.kind)} 재시험 · ${q.name}`} small={`${q.total ?? "?"}개 · 재시험지는 업무(05)에서`} />)}
        <Row icon="🗂️" cls="i-cls" b="내 업무 · 자료 만들기 · 인쇄 · 배부 · 단원평가 출제 · 재시험지 · 성적 받기 · 반복"><Link prefetch={false} className="btn sm" href="/schedule/todo">열기</Link></Row>
      </Card> },
    { id: 'ops', name: '안 돌고 있는 것', node: <Card emo="⚠️" title="안 돌고 있는 것" id="ops" {...fold("ops")}>
        <Row icon={d.ops.cc.bad ? "✕" : "✓"} cls={d.ops.cc.bad ? "i-abs" : "i-ok"} b={d.ops.cc.text} small={d.ops.cc.sub} />
        <Row icon={d.ops.queue.bad ? "✕" : "✓"} cls={d.ops.queue.bad ? "i-abs" : "i-ok"} b={d.ops.queue.text} small={d.ops.queue.sub} />
      </Card> },
    { id: 'month', name: '이 달', node: <Card emo="📅" title="이 달" id="month" {...fold("month")}>
        {!d.makeupTodo.length && !d.exams.soon.length && !d.exams.missing.length && !d.exams.changed.length && !d.short.length && !d.confirm?.show && <Row icon="✓" cls="i-ok" b="이 달 챙길 것 없음" />}
        {d.confirm?.show && <Row icon="📅" cls="i-abs" b={<span data-g="confirm-line">{d.confirm.text}</span>} small={d.confirm.small}><Link prefetch={false} className="btn sm pri" href={`/schedule?m=${d.confirm.ym}`} data-act="confirm-go">일정 👉</Link></Row>}
        {d.short.map((s) => <Row key={`short-${s.id}`} icon="📅" cls="i-abs" b={<span data-g="short-class">{s.text}</span>}><ClassMakeup classId={s.id} ym={s.ym} short={s} /></Row>)}
        {d.makeupTodo.length > 0 && <Row icon="↻" cls="i-mk" b={`보강 안 잡힘 ${d.makeupTodo.length}명`} small={d.makeupTodo.map((m) => `${m.name} · ${md(m.of_date)} 결석`).join(" · ")}><Link prefetch={false} className="btn sm" href="/today">잡기</Link></Row>}
        {d.exams.changed.map((e) => <Row key={`chg-${e.id}`} icon="📡" cls="i-ex" b={<span data-g="exam-changed">학교 일정이 바뀌었어요. {e.text}</span>} small={e.english_on ? `영어 시험일 ${md(e.english_on)} 은 그대로입니다. 학교 시험에서 보고 「봤음」` : "학교 시험에서 보고 「봤음」"}><Link prefetch={false} className="btn sm" href="/schedule/exams" data-act="exam-changed-go">시험 👉</Link></Row>)}
        {d.exams.soon.map((e) => <Row key={e.id} icon="📝" cls="i-ex" b={`시험 임박 · ${e.text}`} />)}
        {d.exams.missing.length > 0 && <Row icon="🅰️" cls="i-ex" b={`영어 시험일 없음 · ${d.exams.missing.map((s) => s.name).join(" · ")}`}><Link prefetch={false} className="btn sm" href="/schedule/exams" data-act="exam-missing-go">시험 👉</Link></Row>}
      </Card> },
    { id: 'answer', name: '답할 것', node: <Card emo="💬" title="답할 것" id="answer" {...fold("answer")}>
        {!d.requests.length && !d.inquiries.length && <Row icon="✓" cls="i-ok" b="답할 것 없음" />}
        {d.requests.length > 0 && <Row icon="💬" cls="i-hw" b={`남기실 말 ${d.requests.length}`} />}
        {d.requests.map((r) => <Row key={r.id} icon="·" cls="i-hw" b={<span data-g="req-row" data-req={r.id}>{r.name} · {whenText(r.at, date)} 「{r.body.slice(0, 60)}」</span>} small={rkind(r.kind)}><Answer id={r.id} /></Row>)}
        {d.inquiries.length > 0 && <Row icon="☎️" cls="i-hw" b={`신규 상담 ${d.inquiries.length}건`} small={d.inquiries.map((i) => `${i.name} · ${whenText(i.at, date)} · 아직 답 안 함`).join(" · ")}><Link prefetch={false} className="btn sm" href="/ops/inquiry" data-act="inquiry-go">신규 상담 👉</Link></Row>}
      </Card> },
  ], d.pref);   // 카드 차례 — 사람마다(확정-⑮ · screen_pref dash · 4단계-6)
  return frame(<>
    <div className="wv" style={{ marginBottom: 8 }}>
      <span className="pill">{dateLabel(date)}</span>
      <span className={"pill " + (d.summary.bad > 0 ? "warn" : "hw")} data-g="gap-count">🚨 빌 아이 {d.summary.bad > 0 ? d.summary.bad : "없음"}</span>
      <span className="spacer" />
      <span className="pill">오늘 {d.people.students}명{first ? ` · ${first.start}` : ""}</span>
    </div>
    {left && (
      <div className={"card" + (left.length ? " warn" : "")}>
        <div className="ctitle"><span className="cemo">🔐</span>누가 무엇을 보나 · {CELLS}칸 중 아직 안 정한 것 <b>{left.length}</b></div>
        <p className="note">{left.length ? "안 정한 칸은 막힘" : "다 정함"}</p>
        <Link prefetch={false} className="btn sm" href="/settings/access">정하러 가기 →</Link>
      </div>
    )}
    <DashGaps gaps={d.gaps} calls={d.calls} summary={d.summary} people={d.people} date={date} progress={d.progress} />   {/* (어41) 이름(개수) 칩 → 모달 · 저장해도 그 자리 */}
    <div className="dash">
      {cards.map((c) => <Fragment key={c.id}>{c.node}</Fragment>)}
    </div>
    <CardOrder screen="dash" cards={cards.map((c) => ({ id: c.id, name: c.name }))} />
  </>);
}
