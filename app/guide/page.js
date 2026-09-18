/** ❓ 사용 가이드 — (어77) 원장님 2026-09-17 「새로고침, 알림 설정, 사용가이드를 이모지를 이용한 버튼의 형태로
 *  학생 어플 학부모 어플 상단의 배치 해 줘」. 들어오는 길은 상단 띠의 ❓ 하나(app/_shell/mebar.js).
 *  ⚠️ 대전제-15 「화면은 설명하지 않는다」의 **바깥**이다 — 여기서는 설명이 곧 내용이다. 대신 규칙은 둘:
 *   ① 그림은 lib/emoji 한 곳에서 가져온다(그림을 바꾸면 가이드도 저절로 따라온다 · 대전제-25)
 *   ② **있는 것만 적는다** — 화면에 없는 손을 적으면 그것이 거짓말이다(대전제-0). 손이 늘면 여기 한 줄을 더한다.
 *  읽는 사람에 따라 갈린다(아이 · 학부모) · DB 를 안 읽어 조회가 0이다(속도). */
import Link from "next/link";
import { guard } from "@/lib/session";
import { redirect } from "next/navigation";
import { ROLES } from "@/lib/roles";
import { ACT, FACE } from "@/lib/emoji";
import { REJECT_NAME, REJECT_MARK } from "@/lib/status";
export const dynamic = "force-dynamic";
const Row = ({ emo, what, where }) => <div className="li" data-g="guide-row"><span className="n">{emo}</span><div><b>{what}</b><small>{where}</small></div></div>;

const 아이 = [
  { emo: FACE.mine, what: "등원을 찍어요", where: "나 › 맨 위 · 학원에 오면 눌러요" },
  { emo: ACT.lock, what: "앞엣것부터 하는 줄", where: "차례대로 하는 줄이에요 · 급하면 3초 길게 눌러 열어요" },
  { emo: ACT.start, what: "시작 · 끝", where: "얼마나 걸렸는지 남아요 · 안 눌러도 돼요" },
  { emo: ACT.done, what: "완료", where: "다 한 줄에 눌러요 · 한 번 더 누르면 취소돼요" },
  { emo: FACE.cc, what: "클래스카드 숙제", where: "완료를 누르면 클래스카드로 가는 단추가 떠요" },
  { emo: ACT.upload, what: "교재 숙제는 사진으로", where: "완료를 누르면 사진 · 음성으로 낼 수 있어요" },
  { emo: ACT.rec, what: "음성으로 내기", where: "읽기 숙제는 녹음해서 내요" },
  { emo: REJECT_MARK, what: REJECT_NAME, where: "다시 내라는 뜻이에요 · 낸 것을 지우고 다시 내요" },
  { emo: ACT.push, what: "알림", where: "켜 두면 숙제 · 공지가 폰으로 와요" },
  { emo: ACT.reload, what: "새로고침", where: "화면이 오래된 것 같으면 눌러요" },
];
const 학부모 = [
  { emo: FACE.today, what: "오늘", where: "아이가 왔는지 · 오늘 무엇을 했는지 보여요" },
  { emo: FACE.notice, what: "공지 · 선생님 한 마디", where: "읽으면 읽음으로 남아요" },
  { emo: FACE.fee, what: "수납", where: "이 달 안내와 받은 것이 보여요" },
  { emo: ACT.sms, what: "보낸 것", where: "학원이 보낸 안내가 쌓여요" },
  { emo: ACT.push, what: "알림", where: "켜 두면 하원 · 공지가 폰으로 와요" },
  { emo: ACT.reload, what: "새로고침", where: "화면이 오래된 것 같으면 눌러요" },
];
export default async function Guide() {
  const { me } = await guard();
  if (!me) redirect("/");
  const parent = me.role === ROLES.PARENT;
  const rows = parent ? 학부모 : 아이;
  const home = parent ? "/parent" : "/me";
  return (
    <main className="frame" style={{ maxWidth: 1400, margin: "16px auto", padding: "0 12px" }}>
      <div className="task" data-card="guide">
        <div className="h"><b><span className="cemo">{ACT.guide}</span>사용 가이드</b><span className="spacer" /><Link prefetch={false} className="btn sm" href={home}>{ACT.goto} 내 화면</Link></div>
        {rows.map((r) => <Row key={r.what} {...r} />)}
        <p className="note" style={{ margin: "8px 0 0" }}>더 궁금하면 내 화면 맨 밑에서 선생님께 물어봐요</p>
      </div>
    </main>
  );
}
