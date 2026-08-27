import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import PrincipalOnly from "@/components/PrincipalOnly";
import CopyBox from "./CopyBox";
import { checkSchema } from "./status";
import ServiceKeyBox from "./ServiceKeyBox";
import StorageBox from "./StorageBox";
import UpsertBox from "./UpsertBox";
import { loadSteps } from "./steps";
import { SUPABASE_URL } from "@/lib/supabase/env";
import StepBox from "./StepBox";
import SchemaList from "./SchemaList";
import ApplyBox from "./ApplyBox";
import { sessionUser } from "@/lib/session";
import { cachedProfile } from "@/lib/profileCache";

export const dynamic = "force-dynamic";

/**
 * Supabase 에 붙여 넣을 SQL.
 *
 * SQL 은 깃 저장소 안의 파일이라 Supabase 화면에서는 찾을 수 없다.
 * (SQL Editor 의 "Untitled query" 는 그냥 빈 종이다.)
 * 매번 깃허브에 들어가 복사해 오는 게 번거로워서 여기서 바로 복사한다.
 */
export default async function SqlPage() {
  const supabase = await createClient();
  const user = await sessionUser(supabase);

  let profile = null;
  if (user) {
    const { data } = await cachedProfile(supabase, user.id);
    profile = data;
  }

  // 메뉴에서 감추는 것만으로는 부족하다 — 주소를 알면 그냥 열린다 (0079)
  if (profile?.role !== "principal") {
    return <PrincipalOnly what="Supabase SQL 화면" />;
  }

  // 앱이 실제로 붙어 있는 프로젝트 — SQL 을 돌리는 곳과 같아야 한다
  const host = (() => {
    try {
      return new URL(SUPABASE_URL).host;
    } catch {
      return SUPABASE_URL;
    }
  })();
  const projectRef = host.split(".")[0];

  /**
   * **서로 안 물어보는 것은 나란히 세운다** (성능수리 4차).
   *
   * 표 검사 · 돌린 기록 · 연동칸 셋 · SETUP_ALL 파일 읽기 — 일곱이 한 줄로
   * 서 있었다. 서로의 답을 쓰는 것은 하나도 없다.
   *
   * 그리고 supabase_admin · supabase_service · neis 는 **같은 integrations
   * 표의 세 줄**이다 — `.in` 한 번으로 가져온다 (왕복 3→1).
   *
   * 권한 갈림(위 :38)은 그대로 앞에 둔다 — 원장이 아니면 아무것도 안 물어본다.
   */
  const [checks, steps, intQ, sql] = await Promise.all([
    checkSchema(),
    loadSteps(),
    supabase
      .from("integrations")
      .select("id, config")
      .in("id", ["supabase_admin", "supabase_service", "neis"]),
    fs
      .readFile(path.join(process.cwd(), "supabase", "SETUP_ALL.sql"), "utf8")
      .catch(() => ""),
  ]);
  const done = checks.filter((c) => c.ok).length;
  const intById = new Map((intQ.data || []).map((r) => [r.id, r]));
  const adminRow = intById.get("supabase_admin") || null;
  const svcRow = intById.get("supabase_service") || null;
  const neisRow = intById.get("neis") || null;
  const neisSaved = !!neisRow?.config?.key;
  const missing = checks.filter((c) => !c.ok).map((c) => c.id);

  return (
    <>
      {/* "sql" 키는 메뉴에서 뺐다 (2026-08-27) — 설정 아래 칸에서 여는
          화면이니, 여기 있을 때도 「설정」 이 켜진 것으로 본다 */}
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">설정</p>
          <h1 className="h1">Supabase SQL</h1>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <b style={{ fontSize: 15 }}>앱이 보고 있는 프로젝트</b>
          <p
            className="mono"
            style={{ margin: "6px 0 0", fontSize: 16, fontWeight: 700, letterSpacing: 0.3 }}
          >
            {projectRef}
          </p>
          <p className="hint" style={{ margin: "6px 0 0", lineHeight: 1.8 }}>
            SQL 을 실행하신 Supabase 화면의 주소창을 보세요.
            <br />
            <code>supabase.com/dashboard/project/<b>{projectRef}</b></code> 이어야 합니다.
            <br />
            <b>다르면 다른 프로젝트에 SQL 을 넣고 계신 겁니다.</b> 아무리 Run 해도 앱은 안 바뀝니다.
          </p>
        </div>

        <ApplyBox
          saved={!!adminRow?.config?.token}
          projectRef={projectRef}
          savedRef={adminRow?.config?.ref || ""}
          missingCount={checks.length - done}
        />

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
            <b style={{ fontSize: 15 }}>지금 DB 상태</b>
            <span className={`tag ${done === checks.length ? "tag-mint" : "tag-amber"}`}>
              {done} / {checks.length}
            </span>
            {done === checks.length && <span className="hint">표와 칸은 다 들어가 있습니다</span>}
          </div>
          {/* 여기서 다 됐다고 나와도 안 되는 것이 있다. 그걸 숨기면 안 된다. */}
          <p className="hint" style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.8 }}>
            이 목록은 <b>표와 칸</b>만 봅니다. 인덱스처럼 밖에서 물어볼 수 없는 것은
            여기 안 나옵니다 — <b>다 됐다고 보여도 나이스 받아오기나 숙제→할일이 막혀
            있을 수 있습니다.</b> 아래 <b>「받아오기 · 할일 점검」</b> 에서 실제로 해보세요.
          </p>
          {/* 잘 들어간 것은 안 보여준다 — 여든 줄의 「OK」 사이에 「없음」 두 줄이 묻힌다 */}
          <SchemaList checks={checks} />

          {done < checks.length && (
            <div className="hint" style={{ marginTop: 10, lineHeight: 1.9 }}>
              <b>없음</b> 이 있으면 아래 SQL 을 실행해주세요. 실행하고 이 화면을 새로고침하면 바뀝니다.
              <br />
              <b>실행했는데도 숫자가 그대로라면 = 에러가 나서 아무것도 안 들어간 것입니다.</b>{" "}
              (Supabase 는 한 덩어리로 실행해서, 하나라도 실패하면 전부 취소됩니다)
              <br />
              그럴 때는 맨 아래 <b>하나씩 실행하기</b> 에서 <b>안 들어간 것 중 맨 위 하나</b>만 따로
              Run 해보세요. 어느 구문이 문제인지 바로 나옵니다.
              <br />
              <br />
              <b>Success 가 떴는데도 여기가 안 바뀐다면</b> 둘 중 하나입니다.
              <br />
              ① 위에 적힌 프로젝트가 아닌 <b>다른 프로젝트</b>에 넣었다
              <br />
              ② Supabase 가 바뀐 표를 아직 못 읽었다 — SQL Editor 에 아래 한 줄만 Run 해보세요
              <br />
              <code style={{ fontSize: 13 }}>notify pgrst, &apos;reload schema&apos;;</code>
            </div>
          )}
        </div>

        <div className="card">
          <b style={{ fontSize: 15 }}>이 순서로 하시면 됩니다</b>
          <ol className="hint" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.9 }}>
            <li>아래 <b>전체 복사</b> 를 누릅니다.</li>
            <li>
              Supabase → 왼쪽 <b>SQL Editor</b> → Untitled query 안을 클릭하고{" "}
              <b>Ctrl+A 로 전체 선택 후 지웁니다.</b>
            </li>
            <li>
              빈 칸에 붙여넣습니다. <b>지난번 내용 아래에 덧붙이지 마세요</b> — 통째로 갈아끼우는
              것입니다.
            </li>
            <li>
              오른쪽 아래 <b>Run</b> (또는 Ctrl+Enter) 을 누릅니다.
            </li>
            <li>
              <b>Success</b> 가 뜨면 끝입니다. 여러 번 눌러도 안전하게 만들어 두었습니다.
            </li>
          </ol>
          <p className="hint" style={{ margin: "10px 0 0", lineHeight: 1.8 }}>
            <b>빨간 에러가 났다면</b> — 한 덩어리로 실행되기 때문에{" "}
            <b>아무것도 반영되지 않습니다.</b> DB 가 망가진 게 아니니 그대로 두셔도 됩니다.
            에러 문구를 알려주시면 봐드릴게요.
          </p>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <b style={{ fontSize: 15 }}>SETUP_ALL.sql</b>
          <p className="hint" style={{ margin: "4px 0 10px" }}>
            처음부터 지금까지가 순서대로 다 들어 있습니다. 이미 있는 것은 전부 건너뜁니다.
            새 프로젝트든 쓰던 프로젝트든 <b>이 파일 하나면</b> 됩니다.
            아래 줄 수가 편집기에 붙여넣은 줄 수와 같아야 합니다.
          </p>
          <CopyBox sql={sql} empty={!sql} />
        </div>

        <ServiceKeyBox saved={!!svcRow?.config?.key} />

        <UpsertBox />
        <StorageBox />


        {/* 나이스 키만 다른 화면에 있다. 키를 찾으러 여기 오시는 것이 당연하므로
            여기서 길을 알려준다 (넣는 칸을 두 군데 두면 언젠가 한쪽만 고치게 된다) */}
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>나이스 인증키</h2>
            <span className={`tag ${neisSaved ? "tag-mint" : "tag-amber"}`}>
              {neisSaved ? "키 넣어둠" : "키 없음"}
            </span>
            <span className="spacer" />
            <a className="btn btn-sm" href="/schedule">넣으러 가기</a>
          </div>
          <p className="hint" style={{ margin: "6px 0 0" }}>
            나이스 키는 <b>일정 → 학교 · 시험</b> 화면 <b>맨 위</b> 의
            「학교 학사일정 (나이스)」 상자에 있습니다. 학교를 고르고 바로 받아와야 해서
            그 화면에 함께 두었습니다.
          </p>
        </div>

        <StepBox steps={steps} missing={missing} />
      </main>
    </>
  );
}
