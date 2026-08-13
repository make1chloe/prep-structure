export const dynamic = "force-dynamic";

const APPS = [
  { key: "principal", name: "원장 · 선생님", desc: "대시보드 · 오늘 수업 · 발송" },
  { key: "parent", name: "학부모", desc: "우리 아이 이번 달" },
  { key: "student", name: "학생", desc: "오늘 할 것 · 선생님 부르기" },
];

/**
 * **세 개를 따로 담는 자리.**
 *
 * 원장님 (2026-08-05) — 「원장용, 부모님과 학생용 3개 따로 홈 화면에 저장한 뒤
 * 각각 계정 다르게 로그인해서 테스트하면서 사용할 수 없어?」
 *
 * 담기는 것은 갈라 준다. **로그인까지 갈라지는지는 폰이 정한다** —
 * 같은 주소의 앱이라 쿠키를 나눠 쓰는 폰에서는 한 곳에서 로그인하면 나머지도
 * 같이 바뀐다. 되는지 안 되는지를 제가 단정해서 말씀드리면, 안 될 때
 * 원장님이 헤매시게 된다. 그래서 **직접 확인하는 방법**을 적어둔다.
 */
export default function InstallPage() {
  return (
    <main className="wrap" style={{ maxWidth: 620, paddingBottom: 40 }}>
      <div className="page-head">
        <p className="eyebrow">앱 담기</p>
        <h1 className="h1">홈 화면 앱</h1>
        <p className="sub">
          원장 · 학부모 · 학생 앱을 <b>따로</b> 담습니다. 아이콘이 세 개 생기고,
          각각 열면 그 사람이 볼 화면으로 바로 갑니다.
        </p>
      </div>

      <div className="stack" style={{ gap: 8, marginTop: 12 }}>
        {APPS.map((a) => (
          <a className="card" key={a.key} href={`/install/${a.key}`} style={{ textDecoration: "none", display: "block" }}>
            <div className="row" style={{ alignItems: "center", gap: 8 }}>
              <b style={{ fontSize: 15 }}>{a.name}</b>
              <span className="hint">{a.desc}</span>
              <span className="spacer" />
              <span className="btn btn-ghost btn-sm">담으러 가기 ›</span>
            </div>
          </a>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <b style={{ fontSize: 15 }}>계정을 따로 로그인해서 쓸 수 있나요</b>
        <p className="hint" style={{ margin: "6px 0 0" }}>
          <b>폰에 따라 다릅니다.</b> 셋 다 같은 주소의 앱이라, 로그인 정보를
          나눠 쓰는 폰에서는 <b>한 곳에서 로그인하면 나머지도 같이 바뀝니다.</b>
          아이폰은 홈 화면 앱마다 따로 두는 편이지만 버전에 따라 다릅니다.
        </p>
        <p className="hint" style={{ margin: "8px 0 0" }}>
          <b>확인하는 방법</b> — 세 개를 다 담고, <b>원장 앱</b>에서 원장 계정으로
          로그인한 뒤 <b>학생 앱</b>을 열어보세요.
          <br />
          · 로그인 화면이 뜨면 <b>따로 됩니다.</b> 학생 계정으로 로그인해서 그대로 쓰시면 됩니다.
          <br />
          · 원장 화면이 그대로 뜨면 <b>같이 쓰는 폰</b>입니다. 아래 방법을 쓰세요.
        </p>
        {/**
          * **「from ○○」 은 보낸 사람이 아니다** (원장님, 2026-08-07).
          *
          * 아이폰은 알림에 **그 알림을 받은 앱의 이름**을 붙인다. 우리가
          * 지울 수 있는 말이 아니다 — 그래서 앱 이름을 「클로이영어」 로
          * 맞췄다. 「from 클로이영어」 면 거슬리지 않는다.
          */}
        <p className="hint" style={{ margin: "8px 0 0" }}>
          <b>알림에 뜨는 「from 클로이영어」</b> — 아이폰이 붙이는 말이고,
          <b> 그 알림을 받은 앱 이름</b>입니다. 보낸 사람이 아니에요.
          <br />
          학부모·학생 앱은 이름이 <b>둘 다 「클로이영어」</b> 입니다 —
          그분들은 자기 앱 하나만 담으시니 겹칠 일이 없습니다.
          원장님 폰에서는 두 아이콘 이름이 같아지는데, <b>아이 화면만 보실
          것이면 재원생 → 학생 화면 미리보기</b> 가 더 낫습니다.
          <br />
          이름을 바꿨는데 예전 이름 그대로면, 홈 화면에서 그 아이콘을 지우고
          여기서 <b>다시 담아</b> 주세요.
        </p>
        <p className="hint" style={{ margin: "8px 0 0" }}>
          <b>같이 쓰는 폰일 때</b> — 브라우저를 나눠 쓰면 확실합니다.
          사파리에 원장, 크롬에 학생, 시크릿 창에 학부모 식으로요.
          브라우저가 다르면 로그인은 언제나 따로입니다.
          <br />
          학생 화면만 보시려는 것이면 <b>재원생 → 계정 → 학생 화면 미리보기</b>가
          더 낫습니다. 로그아웃할 것도 없고, 그 아이에게 보이는 그대로 나옵니다.
        </p>
      </div>
    </main>
  );
}
