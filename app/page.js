/** 첫 화면 = 대시보드(목업 17) — 빵꾸 막이가 맨 위. 판단은 lib/dash(파도) + lib/dash-plan(순수), 여기는 가져다 그린다.
 *  층은 다섯(속도-상한 대시보드 20 · 5단): 로그인 확인 → 오늘 → 반·아이(∥ 예정) → 나머지 한 파도 — 뒤 둘은 lib/dash.dashboard 안. 단추는 전부 지은 화면으로 가는 링크(발송·루틴·시험 화면은 아직) */
import { guard } from "@/lib/session";
import { ROLE_NAME, ROLES, isStaff } from "@/lib/roles";
import { CELLS } from "@/lib/perm";
import { today } from "@/lib/day";
import { dashboard } from "@/lib/dash";
import { dateLabel, classLabel, whenText, md } from "@/lib/dash-plan";
import { DISPOSAL } from "@/lib/warn-plan";
import { KIND as QKIND } from "@/lib/quiz-plan";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { orderCards } from "@/lib/pref-plan";
import CardOrder from "./_shell/cardorder.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 1100, margin: "16px auto", padding: "0 16px" }}>{children}</main>;
const Card = ({ emo, title, id, children }) => <div className="dcard" data-card={id}><div className="ctitle"><span className="cemo">{emo}</span>{title}</div>{children}</div>;
const Row = ({ icon, cls = "i-cls", b, small, children }) => <div className="dayrow"><i className={"cm " + cls}>{icon}</i><div><b>{b}</b>{small && <small>{small}</small>}</div>{children}</div>;
const dispName = (k) => DISPOSAL.find(([x]) => x === k)?.[1] ?? "처분 아직";
const qkind = (k) => QKIND.find(([x]) => x === k)?.[1] ?? k;
export default async function Home() {
  const { sb, me, user } = await guard();
  if (!me) return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>사람 줄이 없습니다</div><p className="note">로그인은 됐는데 <b>{user.email}</b> 의 역할 줄(v2.profiles)이 없습니다. 원장님이 「누가 누구인가」에서 넣어야 합니다.</p></div>);
  if (me.role === ROLES.STUDENT) redirect("/me");   // 아이는 제 화면(07) — 메뉴 없이 하나
  if (!isStaff(me.role)) return frame(<div className="card"><div className="ctitle"><span className="cemo">🎒</span>{me.name} 님, {ROLE_NAME[me.role]} 화면은 곧 열립니다</div><p className="note">2단계에서 아이·학부모 화면이 섭니다.</p></div>);
  let date, d;
  try { date = await today(sb); d = await dashboard(sb, date, { principal: me.role === ROLES.PRINCIPAL }); }
  catch (e) {   // 화면이 스스로 말한다(대전제-0)
    return frame(<div className="card"><div className="ctitle"><span className="cemo">⚠️</span>대시보드를 못 열었습니다</div><p className="note">{String(e?.message ?? e)}</p><p className="note">표·함수가 없다는 말이면 새 앱 마이그레이션(0100~)을 이 DB 에 아직 안 돌린 것입니다 — `docs/미리보기-켜기.md`</p></div>);
  }
  const left = d.undecided, first = d.people.classes[0], unsent = d.late.filter((l) => !l.sent);
  const cards = orderCards([
    { id: 'today', name: '오늘 수업', node: <Card emo="📚" title="오늘 수업" id="today">
        {!d.people.classes.length && <Row icon="·" b="오늘 수업 없음" small="오늘 도는 반이 없습니다" />}
        {d.people.classes.map((c) => { const abs = c.students.filter((s) => s.plan?.absent).length; return <Row key={c.id ?? "makeup"} icon="·" b={classLabel(c)} small={`${c.students.length}명${c.kind !== "makeup" ? ` · 결석 예정 ${abs ? `${abs}명` : "없음"}` : ""}`}><a className="btn sm" href="/today">열기</a></Row>; })}
        {d.late.length > 0 && <Row icon="🌙" cls="i-late" b={`늦귀가 예정 ${d.late.length}명`} small={d.late.map((l) => `${l.name} ${l.until}${l.sent ? " · 보냄" : " — 아직 안 보냄"}`).join(" · ")}>{unsent.length > 0 && <span className="tag now">보내야 함 {unsent.length}</span>}</Row>}
        {d.reflect.length > 0 && <Row icon="⚠️" cls="i-abs" b={`반성문 ${d.reflect.length}명`} small={d.reflect.map((r) => `${r.name} — 이달 경고 ${r.count}회째 · ${dispName(r.disposal)}`).join(" · ")} />}
      </Card> },
    { id: 'send', name: '발송', node: <Card emo="📨" title="발송" id="send">
        <Row icon="📨" cls="i-hw" b={`데일리리포트 ${d.sheets.closed} / ${d.sheets.total}`} small={<>마감한 것만 나갑니다 · <span data-g="unread">안 읽은 집 {d.unread}</span></>}><a className="btn sm" href="/send">발송 ↗</a></Row>
      </Card> },
    { id: 'soon', name: '오늘 안', node: <Card emo="🔥" title="오늘 안" id="soon">
        {!d.unitTodo.length && !d.retests.length && <Row icon="✓" cls="i-ok" b="오늘 안에 할 것 없음" />}
        {d.unitTodo.map((u) => <Row key={u.id} icon="📝" cls="i-ex" b={`단원평가 출제 · ${u.name}`} small={`${u.topic} ${u.n}문항 · ${md(u.on)} 낼 것`} />)}
        {d.retests.map((q) => <Row key={q.id} icon="📄" cls="i-ex" b={`${qkind(q.kind)} 재시험 · ${q.name}`} small={`${q.total ?? "?"}개 — 재시험지는 할 일(05)에서`} />)}
        <Row icon="🗂️" cls="i-cls" b="내 할 일 — 자료 만들기 · 인쇄 · 배부 · 단원평가 출제 · 재시험지 · 성적 받기 · 되풀이" small="표 하나에 보기 둘(표 · 보드)"><a className="btn sm" href="/schedule/todo">열기</a></Row>
      </Card> },
    { id: 'ops', name: '안 돌고 있는 것', node: <Card emo="⚠️" title="안 돌고 있는 것" id="ops">
        <Row icon={d.ops.cc.bad ? "✕" : "✓"} cls={d.ops.cc.bad ? "i-abs" : "i-ok"} b={d.ops.cc.text} small={d.ops.cc.sub} />
        <Row icon={d.ops.queue.bad ? "✕" : "✓"} cls={d.ops.queue.bad ? "i-abs" : "i-ok"} b={d.ops.queue.text} small={d.ops.queue.sub} />
      </Card> },
    { id: 'month', name: '이 달', node: <Card emo="📅" title="이 달" id="month">
        {!d.makeupTodo.length && !d.exams.soon.length && !d.exams.missing.length && !d.confirm?.show && <Row icon="✓" cls="i-ok" b="이 달 챙길 것 없음" />}
        {d.confirm?.show && <Row icon="📅" cls="i-abs" b={<span data-g="confirm-line">{d.confirm.text}</span>} small={d.confirm.small}><a className="btn sm pri" href={`/schedule?m=${d.confirm.ym}`} data-act="confirm-go">일정 ↗</a></Row>}
        {d.makeupTodo.length > 0 && <Row icon="↻" cls="i-mk" b={`보강 안 잡힘 ${d.makeupTodo.length}명`} small={d.makeupTodo.map((m) => `${m.name} · ${md(m.of_date)} 결석`).join(" · ")}><a className="btn sm" href="/today">잡기</a></Row>}
        {d.exams.soon.map((e) => <Row key={e.id} icon="📝" cls="i-ex" b={`시험 임박 — ${e.text}`} />)}
        {d.exams.missing.length > 0 && <Row icon="📝" cls="i-ex" b={`영어일 없음 — ${d.exams.missing.map((s) => s.name).join(" · ")}`} small="시험(06)에 넣어야 시험전·시험후 루틴이 섭니다" />}
      </Card> },
    { id: 'answer', name: '답할 것', node: <Card emo="💬" title="답할 것" id="answer">
        {!d.requests.length && !d.inquiries.length && <Row icon="✓" cls="i-ok" b="답할 것 없음" />}
        {d.requests.length > 0 && <Row icon="💬" cls="i-hw" b={`남기실 말 ${d.requests.length}`} small={d.requests.map((r) => `${r.name} · ${whenText(r.at, date)} 「${r.body.slice(0, 40)}」`).join(" · ")} />}
        {d.inquiries.length > 0 && <Row icon="☎️" cls="i-hw" b={`신규 상담 ${d.inquiries.length}건`} small={d.inquiries.map((i) => `${i.name} · ${whenText(i.at, date)} · 아직 답 안 함`).join(" · ")} />}
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
        <div className="ctitle"><span className="cemo">🔐</span>누가 무엇을 보나 — {CELLS}칸 중 아직 안 정한 것 <b>{left.length}</b></div>
        <p className="note">{left.length ? "안 정한 칸은 막혀 있습니다(막는 쪽이 안전). 정하러 가세요." : "다 정하셨습니다. 강사·조교·학생·학부모는 켠 만큼만 봅니다."}</p>
        <a className="btn sm" href="/settings/access">정하러 가기 →</a>
      </div>
    )}
    {d.progress?.show && <div className="lf warn" style={{ marginBottom: 8 }} data-g="progress-band" data-open={d.progress.open ? "1" : "0"}><span className="ln">✎</span><div><b>{d.progress.text}</b><small>{d.progress.small}</small></div><a className="btn sm pri" href="/settings/progress">진도 체크 ↗</a></div>}
    <div className="gap" data-g="gap">
      <div className="gaph"><span className="gi">🚨</span><b>{d.gaps.length ? `오늘 수업 전에 — 배정이 빌 아이 ${d.summary.bad}명` : "오늘 수업 전에 — 배정이 빈 아이 없음"}</b><span className="spacer" />{d.gaps.length > 0 && <span className="pill warn">고치지 않으면 그 교재는 오늘 0줄로 나갑니다</span>}</div>
      {d.gaps.map((g) => (
        <div className="gapr" key={`${g.student_id}|${g.book_id}`} data-gap={g.kind}><span className="gt">{g.at}</span>
          <div className="gn"><b>{g.name} · {g.book}</b><small>{g.text}</small>
            <div className="tags"><span className="tag">{g.tag}</span>{g.areaBooks > 1 && <span className="tag act">이 영역 교재 {g.areaBooks}권이 다 멈춥니다</span>}{g.absent && <span className="tag">오늘 결석 예정</span>}</div></div>
          {g.kind === "no_units" ? <a className="btn pri sm" href="/today">진도 체크 ↗</a> : <span className="note" style={{ margin: 0 }}>{g.kind === "no_routine" ? "루틴 화면(11)은 아직 — 영역 루틴을 넣으면 저절로 풀립니다" : "교재 화면(13)은 아직"}</span>}
        </div>))}
      <div className="gapok"><span className="gi">✅</span>{d.gaps.length ? <>나머지 <b>{d.summary.ok}명</b>은 오늘 낼 것이 다 차 있습니다</> : <>오늘 <b>{d.people.students}명</b> 모두 낼 것이 차 있습니다</>}<span className="spacer" /><a className="btn sm" href="/today">오늘 수업 열기 ↗</a></div>
    </div>
    <div className="dash">
      {cards.map((c) => <Fragment key={c.id}>{c.node}</Fragment>)}
    </div>
    <CardOrder screen="dash" cards={cards.map((c) => ({ id: c.id, name: c.name }))} />
  </>);
}
