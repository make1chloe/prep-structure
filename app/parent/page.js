/** 학부모 화면 09 — 형제 고르기 → 🌙 오늘 늦게 갑니다(보낸 것만) → 🕘 오늘(등원·하원) → 📋 오늘 수업(마감한 수업일지 + 꼬리표) → 📘 다음 숙제 → 📝 다음 시간 시험 → 📅 앞으로 → 💬 선생님 한 마디 → 📅 달력 → 💬 남기실 말.
 *  마감한 판만 보인다(사고 #7 · 0084 sheet_visible_to). 빈 카드는 숨긴다(확정-⑮). 카드는 원장님이 켠 parent.* 만 */
import Link from "next/link";
import { guard } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { decide, PARENT } from "@/lib/perm";
import { today } from "@/lib/day";
import { myChildren, parentDay } from "@/lib/parent";
import { md } from "@/lib/dash-plan";
import { childLinks } from "@/lib/files-plan";
import Upload from "../_shell/upload.js";
import Photo from "../_shell/photo.js";
import { myUploads } from "@/lib/files-plan";
import AskCard from "../_shell/askcard.js";
import BellCard from "../_shell/bell.js";
import { ask } from "./actions.js";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { orderCards } from "@/lib/pref-plan";
import CardOrder from "../_shell/cardorder.js";
import NoticeCard from "../_shell/noticecard.js";
export const dynamic = "force-dynamic";
const frame = (children) => <main className="frame" style={{ maxWidth: 560, margin: "16px auto", padding: "0 12px" }}><div className="mine">{children}</div></main>;
const Card = ({ emo, title, id, pill, pillCls = "", children }) => <div className="task" data-card={id}><div className="h"><b><span className="cemo">{emo}</span>{title}</b><span className="spacer" />{pill != null && <span className={"pill " + pillCls}>{pill}</span>}</div>{children}</div>;
const unitText = (it) => it.units ? `${it.units.chapter} › ${it.units.short}` : "";
export default async function Parent({ searchParams }) {
  const { sb, me, user } = await guard();
  if (me?.role !== ROLES.PARENT) redirect("/");
  const q = await searchParams;
  let date, kids, d;
  try {
    [date, kids] = await Promise.all([today(sb), myChildren(sb)]);
    const pick = kids.find((k) => k.id === String(q?.s ?? "")) ?? kids[0];
    d = pick ? await parentDay(sb, user, pick, date) : null;
  } catch (e) { return frame(<div className="task"><div className="h"><b>⚠️ 화면을 못 열었습니다</b></div><p className="note" style={{ margin: "8px 0 0" }}>{String(e?.message ?? e)}</p></div>); }
  if (!d) return frame(<div className="task"><div className="h"><b>👨‍👩‍👧 아이가 아직 이어지지 않았어요</b></div><p className="note" style={{ margin: "8px 0 0" }}>원장님이 「재원생」에서 이 계정을 아이와 이어야 합니다.</p></div>);
  const can = (k) => decide(ROLES.PARENT, d.access, k) === true;
  const sendFor = ask.bind(null, d.student.id);
  const anyCard = [PARENT.sent, PARENT.recent, PARENT.homework, PARENT.next, PARENT.intro, PARENT.files].some(can);
  const fl = childLinks(d.links, date, d.rules?.["file.child_days"]), sentFiles = [...fl.pending, ...fl.past];   // 📎 아이 숙제에 붙은 것(마감한 판만 · 1달 안)
  const kidsForUpload = [d.student, ...kids.filter((k) => k.id !== d.student.id)];
  const mine = myUploads(d.uploads);   // 📎 내가 보낸 것 — 원장님 답 한 줄(d.sent 는 📨 보낸 것 — 알림 자취)
  const cards = orderCards([
    { id: 'late', name: '오늘은 늦게 갑니다', node: can(PARENT.sent) && d.late && <Card emo="🌙" title="오늘은 늦게 갑니다" id="late" pill={d.late.left ? `${d.late.left} 에 갔습니다` : `${d.late.until} 예정`} pillCls={d.late.left ? "hw" : "warn"}>
      <p className="note" style={{ margin: "4px 0 0", color: "var(--ink)" }}>{d.late.reason || "남아서 하고 갑니다"}</p>
      <p className="note" style={{ margin: "4px 0 0" }}>{d.late.sentAt ? `${d.late.sentAt}에 받았습니다` : ""}{d.late.left ? "" : " · 실제 하원을 찍으면 여기가 바뀝니다"}</p></Card> },
    { id: 'today', name: '오늘', node: can(PARENT.recent) && d.arrival && <Card emo="🕘" title="오늘" id="today" pill={d.arrival.pill} pillCls={d.arrival.pillOn ? "hw" : d.arrival.pill === "결석" ? "bad" : "warn"}>
      <p className="note" style={{ margin: "4px 0 0" }}>{d.arrival.text}</p></Card> },
    { id: 'notice', name: '공지', node: can(PARENT.sent) && d.board.length > 0 && <NoticeCard Card={Card} lines={d.board} unread={d.unread} /> },
    { id: 'recent', name: '수업', node: can(PARENT.recent) && d.last && <Card emo="📋" title={d.last.date === date ? "오늘 수업" : `${md(d.last.date)} 수업`} id="recent">
      <p className="note" style={{ margin: "4px 0 0", color: "var(--ink)" }}>{d.last.comment || "(수업일지 글이 없습니다)"}</p>
      {d.tags.length > 0 && <div className="tags" style={{ marginTop: 8 }}>{d.tags.map((t) => <span key={t.text} className={"tag" + (t.on ? " on" : "")}>{t.text}</span>)}</div>}
      {d.last.late?.until_at && <p className="note" style={{ margin: "4px 0 0" }}>🌙 {String(d.last.late.until_at).slice(0, 5)} 귀가 예정 — {d.last.late.reason ?? ""}</p>}</Card> },
    { id: 'homework', name: '다음 숙제', node: can(PARENT.homework) && d.last?.home.length > 0 && <Card emo="📘" title="다음 숙제" id="homework" pill={String(d.last.home.length)}>
      {d.last.home.map((it) => <div className="li" key={it.id}><div><b>{it.learn_items?.name ?? it.range_note ?? ""}</b><small>{[unitText(it), it.learn_items && it.range_note ? `이번에 ${it.range_note}` : null].filter(Boolean).join(" · ")}</small></div>{it.said_done_at && <span className="tag on">했어요 ✓</span>}</div>)}
      {d.last.books.filter((b) => b.home_memo).map((b) => <p key={b.book_id} className="note" style={{ margin: "4px 0 0", color: "var(--navy)" }}>✎ {b.home_memo}</p>)}</Card> },
    { id: 'videos', name: '영상', node: can(PARENT.homework) && d.videos.length > 0 && <Card emo="🎬" title="영상" id="videos" pill={`${d.videos.filter((v) => v.status.key !== "done").length}개 남음`} pillCls={d.videos.some((v) => v.status.key !== "done") ? "warn" : "hw"}>
      {d.videos.map((v) => <div className="li" key={v.id} data-g="video-line" data-status={v.status.key}><div><b>{v.video?.title}</b><small>{[v.due || null, v.opens ? `${v.opens}번 열어봄` : null].filter(Boolean).join(" · ") || "앱 안에서 봅니다"}</small></div><span className={"tag" + (v.status.key === "done" ? " on" : "")}>{v.status.text}</span></div>)}
      <p className="note k" style={{ margin: "4px 0 0" }}>아이가 앱 안에서 봅니다 · 지나간 구간만 세고 「몇 %」는 대략입니다</p></Card> },
    { id: 'nextquiz', name: '다음 시간 시험', node: can(PARENT.next) && d.nextQuizzes.length > 0 && <Card emo="📝" title="다음 시간 시험" id="nextquiz" pill={String(d.nextQuizzes.length)}>
      {d.nextQuizzes.map((l) => <div className="lf" key={l.id} style={{ marginTop: 4 }}><span className="ln">{l.emo}</span><div><b>{l.b}</b><small>{l.small}</small></div></div>)}
      <p className="note k" style={{ margin: "4px 0 0" }}>숙제와 같이 왔습니다. 다음 수업 시작하자마자 봅니다. 개수를 안 정한 시험은 여기 안 옵니다.</p></Card> },
    { id: 'future', name: '앞으로', node: can(PARENT.next) && d.future.length > 0 && <Card emo="📅" title="앞으로" id="future" pill={String(d.future.length)}>
      {d.future.map((f, i) => <p key={i} className="note" style={{ margin: "4px 0 0", color: "var(--ink)" }}>{f.text}</p>)}</Card> },
    { id: 'report', name: '월간 리포트', node: can(PARENT.reports) && d.report && <Card emo="📊" title={d.report.title} id="report" pill={d.report.pill}>
      <div className="tags" style={{ margin: "0 0 6px" }} data-g="report-lines">{d.report.lines.map((l) => <span className="tag" key={l.key}>{l.text}</span>)}</div>
      {d.report.body && <div className="li" data-g="report-body"><div><b>원장님 한마디</b><small style={{ whiteSpace: "pre-wrap" }}>{d.report.body}</small></div></div>}</Card> },
    { id: 'fee', name: '수강료', node: can(PARENT.reports) && d.fee && <Card emo="💰" title="수강료" id="fee" pill={d.fee.pill} pillCls={d.fee.paid ? "hw" : "warn"}>
      <div className="li" data-g="fee-line" data-paid={d.fee.paid ? "1" : "0"}><div><b>{d.fee.text}</b><small>{d.fee.small}</small></div></div></Card> },
    { id: 'scores', name: '성적', node: can(PARENT.reports) && d.scores.length > 0 && <Card emo="📈" title="성적" id="scores" pill={d.scores[0].title}>
      {d.scores.map((s) => <div className="li" key={s.id} data-g="score-line"><div><b>{s.title}</b><small>{s.small || "원장님이 공개한 시험"}</small></div>{s.deltaText && <span className={"tag" + (s.delta > 0 ? " on" : "")} data-g="score-delta" title="같은 갈래 지난 시험보다(100점 기준)">{s.deltaText}</span>}</div>)}
      <p className="note k" style={{ margin: "4px 0 0" }}>원장님이 공개한 시험만 보입니다.</p></Card> },
    { id: 'memo', name: '선생님 한 마디', node: can(PARENT.recent) && d.memos.length > 0 && <Card emo="💬" title="선생님 한 마디" id="memo" pill={md(d.memos[0].sheet_date)}>
      {d.memos.map((m) => <div className="li" key={m.area}><div><b>{m.area}</b><small>{m.memo}</small></div></div>)}</Card> },
    { id: 'files', name: '자료', node: can(PARENT.files) && <Card emo="📎" title="자료" id="files" pill={sentFiles.length ? `받은 것 ${sentFiles.length}` : "보내기"}>
      <Upload rules={d.rules} kids={kidsForUpload} label="📷 사진 · 📄 파일 보내기" hint="학교에서 받은 종이(수행평가·시험 안내·가정통신문)를 찍어 보내 주세요 — 원장님만 봅니다" onDone={null} />
      {sentFiles.length > 0 && <div className="hh" style={{ marginTop: 8 }}>아이에게 보낸 자료 · 숙제에 붙은 것</div>}
      {sentFiles.map((l) => <div className="lf" key={`${l.file_id}-${l.day_item_id}`} data-g="sent-file" data-file={l.file_id}>{/^image\//.test(l.file?.mime ?? "") ? <Photo id={l.file_id} name={l.name} /> : <span className="ln">{l.icon}</span>}<div><b>{l.name}</b><small>{l.on ? `${md(l.on)} 숙제 · ` : ""}{l.item} · 아이가 {l.seen === "아직" ? "아직 안 봄" : l.seen} · {l.until}까지</small></div><a className="btn sm" href={`/api/files/${l.file_id}`} target="_blank" rel="noreferrer">열기</a></div>)}
      {mine.length > 0 && <div className="hh" style={{ marginTop: 8 }}>내가 보낸 것 · 원장님 답</div>}
      {mine.map((f) => <div className="lf" key={f.id} data-g="mine" data-file={f.id} data-replied={f.replied ? "1" : "0"}>{f.photo ? <Photo id={f.id} name={f.orig_name} /> : <span className="ln">{f.icon}</span>}<div><b>{f.orig_name}</b><small>{f.when} · {f.size}{f.kid ? ` · ${f.kid}` : ""}{f.note ? ` · 💬 ${f.note}` : ""}</small><small data-g="reply" style={{ color: f.replied ? "var(--on-ok)" : undefined }}>{f.replied ? "✓ " : "⏳ "}{f.reply}</small></div></div>)}
      {fl.hidden > 0 && <p className="note k" style={{ margin: "4px 0 0" }}>{fl.hidden}개는 1달이 지나 안 보입니다</p>}
    </Card> },
    { id: 'cal', name: '달력', node: can(PARENT.recent) && <Link prefetch={false} className="task" href={`/parent/cal?s=${d.student.id}`} data-card="cal" style={{ display: "block", textDecoration: "none", color: "inherit" }}><div className="h"><b><span className="cemo">📅</span>달력</b><span className="spacer" /><span className="pill">열기 ↗</span></div><p className="note" style={{ margin: "4px 0 0" }}>지난 수업일지·숙제·출결과 앞으로의 시험 일정을 날짜로 봅니다</p></Link> },
    { id: 'intro', name: '아이', node: can(PARENT.intro) && <Card emo="🎒" title={d.student.name} id="intro" pill={d.student.schools ? `${d.student.schools.name}` : null}>
      <p className="note" style={{ margin: "4px 0 0" }}>{d.todayClass ? "오늘 수업이 있는 날입니다" : "오늘은 수업이 없는 날입니다"}</p></Card> },
    { id: 'sent', name: '보낸 것', node: can(PARENT.sent) && d.sent.length + d.notices.length > 0 && <Card emo="📨" title="보낸 것" id="sent" pill={String(d.sent.length + d.notices.length)}>
      {d.sent.map((s) => <div className="li" key={s.id}><div><b>{s.text}</b><small>{s.small}</small></div></div>)}
      {d.notices.map((s) => <div className="li" key={s.id} data-g="notice-line"><div><b>{s.text}</b><small>{s.small}</small></div><Link prefetch={false} className="btn sm" href={s.url}>보기</Link></div>)}</Card> },
  ].filter((c) => c.node), d.prefs?.parent);   // 카드 차례 — 사람마다(확정-⑮ · screen_pref parent · 4단계-6)
  return frame(<>
    <div className="wv" style={{ margin: "0 0 4px" }}><b style={{ fontSize: "var(--fs-6)" }}>학부모</b>
      {kids.length > 1 ? <div className="seg sm" data-g="kids">{kids.map((k) => <Link prefetch={false} key={k.id} className={"btn sm"} aria-pressed={k.id === d.student.id} href={`/parent?s=${k.id}`} style={{ border: 0 }}>{k.name}</Link>)}</div> : <span className="pill" data-g="kid">{d.student.name}</span>}
      <span className="spacer" /><span className="pill">{md(date)}</span></div>
    {!anyCard && <div className="task"><div className="h"><b>🔐 아직 열리지 않았어요</b></div><p className="note" style={{ margin: "8px 0 0" }}>원장님이 「누가 무엇을 보나」에서 학부모 화면 카드를 켜면 보입니다.</p></div>}
    {cards.map((c) => <Fragment key={c.id}>{c.node}</Fragment>)}
    {cards.length > 1 && <CardOrder screen="parent" cards={cards.map((c) => ({ id: c.id, name: c.name }))} />}
    <BellCard />
    {anyCard && <AskCard asks={d.asks} send={sendFor} note="결석 예정을 미리 알려 주시면 수업을 준비하는 데에 큰 도움이 됩니다. 병원 진료가 아닌 당일 결석은 보강이 불가합니다." placeholder="선생님께 한마디" />}
  </>);
}
