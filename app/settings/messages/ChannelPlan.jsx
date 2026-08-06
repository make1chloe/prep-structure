"use client";

/**
 * **무엇이 어디로 나가나** — 한 판.
 *
 * 원장님 규칙 (2026-08-06): *재원생·학부모께는 앱으로, 밖으로 나가는 것은
 * 신규 상담뿐.* 그런데 그 규칙이 화면 어디에도 없으면 문구를 하나씩 열어
 * 「알림톡 템플릿 코드」 칸을 봐야만 짐작할 수 있다 — 그러고도 틀린다.
 *
 * 보내기 전에 **무엇이 어디로 나갈지** 알아야 한다. 다 보내고 나서
 * "이거 문자로 나갔네" 를 알면 늦다 — 돈이 나가고, 학부모가 받는 모양도 다르다.
 */
const CH = {
  app: { label: "앱", cls: "tag-lav" },
  alimtalk: { label: "알림톡", cls: "tag-mint" },
  sms: { label: "문자", cls: "tag-muted" },
};

export default function ChannelPlan({ plan = [], pfId = "" }) {
  const app = plan.filter((p) => p.channel === "app").length;
  const talk = plan.filter((p) => p.channel === "alimtalk").length;
  const need = plan.filter((p) => p.channel === "sms").length;

  return (
    <div className="card sect sect-info" style={{ marginBottom: 10 }}>
      <h2 className="secthead">
        지금 무엇이 어디로 나가나
        <span className={`tag ${app > 0 ? "tag-lav" : "tag-muted"}`}>앱 {app}</span>
        <span className={`tag ${talk > 0 ? "tag-mint" : "tag-muted"}`}>알림톡 {talk}</span>
        {need > 0 && <span className="tag tag-amber">문자 {need}</span>}
      </h2>

      <p className="hint" style={{ margin: "0 0 10px", lineHeight: 1.7 }}>
        <b>재원생과 그 학부모께는 앱으로 나갑니다.</b> 수업 리포트 · 숙제 · 늦은 귀가 ·
        교재 · 보강 안내 — 전부 앱 공지에 올라가고 그 집 폰으로 알림이 갑니다.
        문자도 알림톡도 한 통 안 나가요.
        <br />
        <b>밖으로 나가는 것은 아직 계정이 없는 신규 상담뿐</b>입니다. 거기에만
        템플릿 코드를 붙이면 알림톡으로 나가고, 안 붙이면 문자로 나갑니다.
      </p>

      {!pfId && talk + need > 0 && (
        <div className="notice" style={{ margin: "0 0 10px" }}>
          <b>상담 안내는 지금 전부 문자로 나갑니다.</b> 알림톡을 쓰시려면{" "}
          <a className="sky" href="/settings">설정 → 발송 방식</a> 에서
          <b> 알림톡 발신프로필 ID(pfId)</b> 를 먼저 넣어주세요.
        </div>
      )}

      <div className="stack" style={{ gap: 3 }}>
        {plan.map((p) => {
          const c = CH[p.channel] || CH.sms;
          return (
            <div className="unitrow" key={p.key || p.label}>
              <span className={`tag ${c.cls}`}>{c.label}</span>
              <b style={{ fontSize: 12.5, minWidth: 104 }}>{p.label}</b>
              <span className={`tag ${p.auto ? "tag-sky" : "tag-muted"}`}>
                {p.auto ? "앱이 만듦" : "내가 씀"}
              </span>
              <span className="hint" style={{ minWidth: 150 }}>{p.when}</span>
              <span className="spacer" />
              <span className={`hint ${p.channel === "sms" ? "" : "muted"}`}>{p.why}</span>
            </div>
          );
        })}
      </div>

      {need > 0 && pfId && (
        <p className="hint" style={{ margin: "8px 0 0", lineHeight: 1.7 }}>
          <b>상담 안내 {need}가지가 아직 문자로 나갑니다.</b> 아래 목록에서 그 문구를 열어
          <b> 「승인받은 템플릿에서 고르기」</b> 를 누르면 알림톡으로 바뀝니다.
        </p>
      )}

      <p className="hint" style={{ margin: "8px 0 0", lineHeight: 1.7 }}>
        알림톡이 막힌 번호(수신 거부·미가입)에는 <b>문자로 대신</b> 나갑니다 — 안 가고 마는 일은 없어요.
        <br />
        <b>앱으로 나가는 것</b>은 학부모님이 앱을 홈 화면에 담고 <b>알림 받기</b>를 켜두셔야
        폰에 뜹니다. 안 켜두셨어도 앱을 열면 공지에 그대로 있습니다.
      </p>
    </div>
  );
}
