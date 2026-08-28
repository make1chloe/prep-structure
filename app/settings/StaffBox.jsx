"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStaffLogin,
  resetStaffPassword,
  setStaffRole,
  setStaffActive,
} from "./staffActions";

/**
 * **선생님(강사 · 조교) 계정.** 원장님만 여는 자리다 (`/settings` 안).
 *
 * 왜 이 카드가 생겼나 — 개발자에게 줄 계정을 만들려면 Supabase 대시보드에
 * 들어가 계정을 만들고 SQL Editor 에서 역할을 넣는 수밖에 없었다. 계정 하나
 * 주자고 원장님이 SQL 을 치시게 하면 안 된다.
 *
 * 화면이 하는 일은 셋뿐이다 — 만들고, 비번을 새로 주고, 그만둔 분을 끈다.
 * 판단(누가 할 수 있나 · 어떤 역할을 줄 수 있나 · 지우기는 왜 없나)은 전부
 * `staffActions.js` 에 있다. 여기는 받아 그리기만 한다.
 */

const ROLES = [
  { key: "instructor", label: "강사", desc: "학생 계정·성적 올리기까지 됩니다" },
  { key: "assistant", label: "조교", desc: "수업 돌리는 것만 됩니다" },
];
const labelOf = (r) => ROLES.find((x) => x.key === r)?.label || r;

/**
 * **이 계정으로 무엇이 안 보이는지 — 짐작이 아니라 실측이다** (2026-08-28).
 *
 * 원장님이 이 계정을 개발자에게 넘기신다. 「설정이 안 보인다」 를 만들 때
 * 알고 계셔야, 개발자가 「설정 화면이 안 열려요」 했을 때 고장이 아니라는
 * 걸 아신다.
 *
 * 어디서 셌나 (전수 grep) —
 *   메뉴 숨김   lib/menu.js 의 only:"principal" — 수강료 · 설정 딱 둘
 *   화면 차단   PrincipalOnly — app/tuition · app/settings ·
 *               app/settings/sql · app/import
 *   서버 차단   requirePrincipal — settings/actions · netActions ·
 *               screen/iconActions · sql/apply
 *               손으로 쓴 role!=="principal" — settings/messages/actions:180 ·
 *               import/wipeActions · yearFixActions · yearAudit ·
 *               scores/page.jsx:142(canEdit)
 *   DB(RLS)     payments · integrations · app_assets 쓰기 · profiles.role
 *   조교만 더   requireTeacher — scores/importActions · students/accountActions ·
 *               students/parentActions · settings/noteActions ·
 *               settings/layoutActions · settings/guideActions,
 *               그리고 settings/screen:52 · settings/messages:45 의 화면 숨김
 */
const BLOCKED = {
  instructor: [
    "수강료 — 메뉴에도 안 보이고, 주소로 들어가도 안 열립니다 (DB 도 막습니다)",
    "설정 — 이 화면 전부 (연동 키 · 솔라피 · IP · SQL · 노션 이관 · 앱 아이콘)",
    "성적은 볼 수만 있고 고치지 못합니다",
  ],
  assistant: [
    "수강료 — 메뉴에도 안 보이고, 주소로 들어가도 안 열립니다 (DB 도 막습니다)",
    "설정 — 이 화면 전부 (연동 키 · 솔라피 · IP · SQL · 노션 이관 · 앱 아이콘)",
    "성적은 볼 수만 있고 고치지 못합니다",
    "학생·학부모 계정 만들기와 비밀번호 초기화",
    "성적 일괄 올리기",
    "문구 화면의 「화면 안내」 탭 · 화면 구성 순서 · 수업 가이드 링크",
  ],
};

export default function StaffBox({ rows = [], hasKey = false, listError = null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [role, setRole] = useState("instructor");
  const [made, setMade] = useState(null);      // 방금 만든 것 — **지금만 보인다**
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (fn) => startTransition(async () => {
    const r = await fn();
    if (r?.error) { alert(r.error); return; }
    if (r?.password) setMade(r);
    router.refresh();
  });

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>선생님 계정</h2>
        <span className="tag tag-mint">{rows.length}개</span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
          {open ? "닫기" : "만들기"}
        </button>
      </div>
      <p className="hint" style={{ margin: "6px 0 0" }}>
        강사·조교 계정을 여기서 만들고 끕니다. <b>원장 계정은 여기서 만들 수 없습니다</b> —
        원장이 둘이 되면 서로를 끌 수 있어서, 그건 Supabase 에서만 합니다.
      </p>

      {!hasKey && (
        <div className="notice" style={{ marginTop: 10, fontSize: 14 }}>
          <b>Supabase service_role 키가 없습니다.</b> 계정을 만들 수도, 끈 계정을
          알아볼 수도 없어요. <b>설정 → Supabase SQL → 학생 계정 키</b> 에 한 번
          넣어주세요. (같은 키를 선생님 계정에도 씁니다)
        </div>
      )}
      {listError && (
        <div className="err" style={{ marginTop: 10, fontSize: 14 }}>{listError}</div>
      )}

      {/* ── 만들기 ─────────────────────────────────────── */}
      {open && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input
              className="input" style={{ maxWidth: 160 }}
              value={name} placeholder="이름 (예: 김선생)"
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input" style={{ maxWidth: 200 }}
              value={loginId} placeholder="아이디 (영문·숫자 4~30자)"
              onChange={(e) => setLoginId(e.target.value.toLowerCase())}
            />
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {ROLES.map((r) => (
              <button
                key={r.key}
                className={`btn btn-sm ${role === r.key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setRole(r.key)}
              >
                {r.label}
              </button>
            ))}
            <span className="hint" style={{ flex: 1, minWidth: 180 }}>
              {ROLES.find((r) => r.key === role)?.desc}
            </span>
          </div>

          {/* **무엇이 안 보이는지 만들 때 보여준다.** 개발자에게 넘기실 것이라
              「설정 화면이 안 열려요」 가 고장이 아니라는 걸 미리 아셔야 한다 */}
          <div className="notice" style={{ fontSize: 14 }}>
            <b>{labelOf(role)} 계정으로는 이런 것이 안 보입니다</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
              {BLOCKED[role].map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>

          <button
            className="btn btn-primary btn-sm"
            style={{ alignSelf: "flex-start" }}
            disabled={pending || !name.trim() || loginId.trim().length < 4}
            onClick={() => run(async () => {
              const r = await createStaffLogin(name, loginId, role);
              if (!r?.error) { setName(""); setLoginId(""); setOpen(false); }
              return r;
            })}
          >
            {pending ? "만드는 중…" : `${labelOf(role)} 계정 만들기`}
          </button>
        </div>
      )}

      {/* ── 방금 만든 비밀번호 — **지금만 보인다** ──────── */}
      {made && (
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>
          <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
            <b style={{ fontSize: 15 }}>{made.name || made.loginId} 님 비밀번호</b>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={() => setMade(null)}>지우기</button>
          </div>
          <pre
            style={{
              margin: 0, padding: 10, borderRadius: 8, fontSize: 15.5, lineHeight: 1.8,
              background: "var(--surface-2)", overflowX: "auto", whiteSpace: "pre",
            }}
          >
{`아이디  ${made.loginId}\n비번    ${made.password}`}
          </pre>
          <p className="hint" style={{ margin: 0, fontSize: 13 }}>
            <b>이 비밀번호는 지금만 보입니다.</b> 어디에도 저장하지 않아요 — 화면을
            닫으면 다시 볼 수 없습니다. 잊으면 아래에서 <b>비번 초기화</b> 를 누르면
            새 비번이 나옵니다. (선생님 계정은 학생과 달리 <b>0000 이 아니라 무작위</b>
            입니다 — 선생님은 첫 로그인에 비번을 바꾸는 화면을 지나지 않기 때문입니다)
          </p>
        </div>
      )}

      {/* ── 목록 ───────────────────────────────────────── */}
      <div className="stack" style={{ gap: 6, marginTop: 12 }}>
        {rows.length === 0 && (
          <p className="hint" style={{ margin: 0 }}>
            아직 선생님 계정이 없습니다. 위 <b>만들기</b> 로 하나 만들어주세요.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="unitrow" style={{ flexWrap: "wrap", gap: 6 }}>
            <b style={{ fontSize: 15, minWidth: 76 }}>{r.name || "(이름 없음)"}</b>
            <span className={`tag ${r.role === "instructor" ? "tag-mint" : "tag-amber"}`}>
              {labelOf(r.role)}
            </span>
            {r.off === true && <span className="tag">꺼짐</span>}
            {r.off === null && <span className="tag">켜짐/꺼짐 모름</span>}
            <span className="hint" style={{ flex: 1, minWidth: 120 }}>
              {r.login_id || "아이디 없음"}
              {r.created_at ? ` · ${String(r.created_at).slice(0, 10)} 만듦` : ""}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                const to = r.role === "instructor" ? "assistant" : "instructor";
                if (!confirm(`${r.name} 님을 ${labelOf(to)} 로 바꿀까요?`)) return;
                run(() => setStaffRole(r.id, to));
              }}
            >
              {r.role === "instructor" ? "조교로" : "강사로"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                if (!confirm(`${r.name} 님 비밀번호를 새로 만들까요?\n지금 쓰던 비번은 못 씁니다.`)) return;
                run(() => resetStaffPassword(r.id));
              }}
            >
              비번 초기화
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                const off = r.off !== true;
                if (!confirm(
                  off
                    ? `${r.name} 님 계정을 끌까요?\n로그인 자체가 막힙니다. 쓰신 기록은 그대로 남고, 다시 켤 수 있어요.`
                    : `${r.name} 님 계정을 다시 켤까요?`
                )) return;
                run(() => setStaffActive(r.id, !off));
              }}
            >
              {r.off === true ? "켜기" : "끄기"}
            </button>
          </div>
        ))}
      </div>

      <p className="hint" style={{ margin: "10px 0 0", fontSize: 13 }}>
        <b>지우기는 없습니다.</b> 계정을 지우면 그 선생님이 쓴 상담일지·성적·할일의
        작성자가 통째로 빕니다. 그만두시면 <b>끄기</b> 를 쓰세요 — 로그인만 막히고
        기록은 그대로 남습니다.
      </p>
    </div>
  );
}
