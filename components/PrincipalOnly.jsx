import TopBar from "@/components/TopBar";

/**
 * **원장님만 여는 화면.**
 *
 * 메뉴에서 감추는 것은 예의일 뿐이다 — 주소를 알면 그냥 열린다. 그래서 화면에서
 * 한 번 더 막는다. 진짜 자물쇠는 DB 쪽 정책이고(0079), 이건 그 앞의 안내판이다.
 *
 * 「없는 화면」 이라고 하지 않고 **누가 열 수 있는지** 를 알려준다. 강사·조교가
 * 잘못 눌렀을 때 앱이 고장 난 줄 알면 안 되기 때문이다.
 */
export default function PrincipalOnly({ profile, what = "이 화면" }) {
  return (
    <>
      <TopBar profile={profile} active="" />
      <main className="wrap">
        <div className="card" style={{ marginTop: 20 }}>
          <h1 className="h1" style={{ fontSize: 17 }}>원장님만 볼 수 있어요</h1>
          <p className="sub" style={{ marginTop: 8, lineHeight: 1.8 }}>
            {what}은(는) <b>수강료·발송 열쇠</b>처럼 학원 운영에 관한 것이라
            원장 계정에서만 열립니다. 고장 난 것이 아니에요.
            <br />
            필요하시면 원장님께 말씀해주세요.
          </p>
        </div>
      </main>
    </>
  );
}
