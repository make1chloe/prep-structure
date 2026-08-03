"use client";

/**
 * **무엇이 알림톡으로 나가고 무엇이 문자로 나가나** — 한 판.
 *
 * 원장님 규칙이 있다: *반복되는 것은 알림톡, 그때그때 다른 것은 문자.*
 * 그런데 지금까지는 그 규칙이 화면 어디에도 없었다. 문구를 하나씩 열어
 * 「알림톡 템플릿 코드」 칸이 채워졌는지 봐야만 알 수 있었다.
 *
 * 보내기 전에 **무엇이 어디로 나갈지** 알아야 한다. 다 보내고 나서
 * "이거 문자로 나갔네" 를 알면 늦다 — 비용도 다르고, 학부모가 보는 모양도 다르다.
 */
export default function ChannelPlan({ plan = [], pfId = "" }) {
  const talk = plan.filter((p) => p.channel === "alimtalk").length;
  const need = plan.filter((p) => p.channel === "sms").length;

  return (
    <div className="card sect sect-info" style={{ marginBottom: 10 }}>
      <h2 className="secthead">
        지금 무엇이 알림톡으로 나가나
        <span className={`tag ${talk > 0 ? "tag-mint" : "tag-muted"}`}>알림톡 {talk}</span>
        {need > 0 && <span className="tag tag-amber">붙일 것 {need}</span>}
      </h2>

      <p className="hint" style={{ margin: "0 0 10px", lineHeight: 1.7 }}>
        <b>템플릿 코드를 붙인 문구는 알림톡, 안 붙인 것은 문자</b>로 나갑니다.
        무엇을 알림톡으로 할지는 <b>원장님이 정하시는 것</b>이에요 — 모양이 정해져 있으면
        안내 문자도 얼마든지 템플릿으로 승인받을 수 있습니다.
      </p>

      {!pfId && (
        <div className="notice" style={{ margin: "0 0 10px" }}>
          <b>지금은 전부 문자로 나갑니다.</b> 알림톡을 쓰시려면{" "}
          <a className="sky" href="/settings">설정 → 발송 방식</a> 에서
          <b> 알림톡 발신프로필 ID(pfId)</b> 를 먼저 넣어주세요.
        </div>
      )}

      <div className="stack" style={{ gap: 3 }}>
        {plan.map((p) => (
          <div className="unitrow" key={p.key || p.label}>
            <span className={`tag ${p.channel === "alimtalk" ? "tag-mint" : "tag-muted"}`}>
              {p.channel === "alimtalk" ? "알림톡" : "문자"}
            </span>
            <b style={{ fontSize: 12.5, minWidth: 104 }}>{p.label}</b>
            <span className={`tag ${p.auto ? "tag-sky" : "tag-muted"}`}>
              {p.auto ? "앱이 만듦" : "내가 씀"}
            </span>
            <span className="hint" style={{ minWidth: 150 }}>{p.when}</span>
            <span className="spacer" />
            <span className={`hint ${p.channel === "sms" ? "" : "muted"}`}>{p.why}</span>
          </div>
        ))}
      </div>

      {need > 0 && pfId && (
        <p className="hint" style={{ margin: "8px 0 0", lineHeight: 1.7 }}>
          <b>{need}가지가 아직 문자로 나갑니다.</b> 아래 목록에서 그 문구를 열어
          <b> 「승인받은 템플릿에서 고르기」</b> 를 누르면 알림톡으로 바뀝니다.
        </p>
      )}

      <p className="hint" style={{ margin: "8px 0 0" }}>
        알림톡이 막힌 번호(수신 거부·미가입)에는 <b>문자로 대신</b> 나갑니다 — 안 가고 마는 일은 없어요.
      </p>
    </div>
  );
}
