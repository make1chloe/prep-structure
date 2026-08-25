const ROLES = {
  principal: { name: "클로이영어 원장", who: "원장·선생님", home: "대시보드" },
  parent: { name: "클로이영어 학부모", who: "학부모님", home: "학부모 화면" },
  student: { name: "클로이영어 학생", who: "학생", home: "학생 화면" },
};

export const dynamic = "force-dynamic";

/**
 * **이 화면에서 홈 화면에 담는다.**
 *
 * 폰은 「지금 보고 있는 화면이 가리키는 앱」 을 담는다. 그래서 담을 앱마다
 * 화면이 하나씩 있어야 한다 — 같은 화면에서 세 번 담으면 같은 앱이 세 개다.
 */
export async function generateMetadata(props) {
  const params = await props.params;
  const r = ROLES[params?.role];
  if (!r) return { title: "클로이영어" };
  return {
    title: r.name,
    manifest: `/manifest/${params.role}`,
    appleWebApp: { capable: true, title: r.name, statusBarStyle: "default" },
    icons: { apple: [{ url: "/api/icon/apple", sizes: "180x180", type: "image/png" }] },
  };
}

export default async function InstallRolePage(props) {
  const params = await props.params;
  const key = params?.role;
  const r = ROLES[key];
  if (!r) {
    return (
      <main className="wrap" style={{ maxWidth: 560 }}>
        <div className="card" style={{ marginTop: 20 }}>
          <p className="muted" style={{ margin: 0 }}>없는 주소예요. <a className="sky" href="/install">앱 담기</a> 로 가주세요.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap" style={{ maxWidth: 560, paddingBottom: 40 }}>
      <div className="page-head">
        <p className="eyebrow">앱 담기</p>
        <h1 className="h1">{r.name}</h1>
        <p className="sub">
          <b>{r.who}</b>용 앱입니다. 담으면 열 때 바로 <b>{r.home}</b>으로 갑니다.
        </p>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <b style={{ fontSize: 15 }}>지금 이 화면에서 담아주세요</b>
        <p className="hint" style={{ margin: "6px 0 0" }}>
          폰은 <b>지금 보고 있는 화면</b>이 가리키는 앱을 담습니다. 다른 화면에서
          담으면 세 개가 다 같은 앱이 됩니다.
        </p>
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          <div>
            <b style={{ fontSize: 14.5 }}>아이폰 (사파리)</b>
            <p className="hint" style={{ margin: "2px 0 0" }}>
              아래 <b>공유 단추(↑)</b> → <b>홈 화면에 추가</b> → 이름이{" "}
              <b>{r.name}</b> 인지 확인하고 추가
            </p>
          </div>
          <div>
            <b style={{ fontSize: 14.5 }}>안드로이드 (크롬)</b>
            <p className="hint" style={{ margin: "2px 0 0" }}>
              오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b> / <b>앱 설치</b>
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <a className="btn btn-ghost" href="/install">◂ 세 앱 목록으로</a>
      </div>
    </main>
  );
}
