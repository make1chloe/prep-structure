"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveIntegration, clearIntegration, testSend } from "./actions";
import { ensurePushKeys, testPush } from "@/app/push/actions";

const MODES = [
  { key: "copy", label: "직접 발송", hint: "앱에서는 문구만 만들고, 복사해서 문자 앱으로 보냅니다. 준비할 게 없어요." },
  { key: "sms", label: "문자 (솔라피)", hint: "앱이 솔라피로 바로 보냅니다. API 키와 등록된 발신번호가 필요해요." },
  { key: "webhook", label: "웹훅 (Make 등)", hint: "문구를 외부 자동화로 넘기고 발송은 거기서 합니다." },
];

export default function SettingsForm({ view, unavailable = false, canEdit = true, pushReady = false }) {
  const [mode, setMode] = useState(view.mode || "copy");
  const [academy, setAcademy] = useState(view.academy?.name || "클로이영어");
  const [solapi, setSolapi] = useState({
    apiKey: "",
    apiSecret: "",
    sender: view.solapi?.sender || "",
    pfId: view.solapi?.pfId || "",
  });
  const [webhook, setWebhook] = useState({ url: view.webhook?.url || "", secret: "" });
  const [msgCfg, setMsgCfg] = useState({
    greeting: view.message?.greeting || "",
    closing: view.message?.closing || "",
    phone: view.message?.phone || "",
    address: view.message?.address || "",
  });
  const [makeupDays, setMakeupDays] = useState(view.schedule?.makeupDays || []);
  const [warn, setWarn] = useState(() => ({
    reflectionAt: 3, wordPassPct: 80, weakAt: 2,
    countLate: true, countHomework: true, countWordTest: true,
    ...(view.warning || {}),
  }));
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn, okText) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        setMsg({ bad: true, text: res.error });
        return;
      }
      setMsg({ bad: false, text: okText || "저장했어요." });
      router.refresh();
    });
  }

  function saveAll() {
    run(async () => {
      const a = await saveIntegration("academy", { enabled: true, config: { name: academy } });
      if (a.error) return a;
      const s = await saveIntegration("solapi", {
        enabled: mode === "sms",
        config: solapi,
      });
      if (s.error) return s;
      const w = await saveIntegration("webhook", { enabled: mode === "webhook", config: webhook });
      if (w.error) return w;
      // 문구는 비워두는 것도 뜻이 있으므로 통째로 저장한다
      const m = await saveIntegration("message", { enabled: true, config: msgCfg, replace: true });
      if (m.error) return m;
      // 요일을 하나도 안 고른 것도 뜻이 있으므로 통째로 저장한다
      const sc = await saveIntegration("schedule", {
        enabled: true,
        config: { makeupDays },
        replace: true,
      });
      if (sc.error) return sc;
      return saveIntegration("warning", {
        enabled: true,
        config: {
          reflectionAt: Number(warn.reflectionAt) || 3,
          wordPassPct:
            warn.wordPassPct === "" || warn.wordPassPct === null
              ? 80
              : Math.max(0, Math.min(100, Number(warn.wordPassPct) || 0)),
          weakAt: Math.max(1, Number(warn.weakAt) || 2),
          countLate: !!warn.countLate,
          countHomework: !!warn.countHomework,
          countWordTest: !!warn.countWordTest,
        },
        replace: true,
      });
    }, "설정을 저장했어요.");
  }

  if (unavailable) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          설정을 쓰려면 Supabase에서 <b>0015 SQL</b>을 먼저 실행해주세요.
        </div>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="notice">
          발송 설정은 <b>원장 계정</b>에서만 볼 수 있어요.
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ marginTop: 10 }}>
      {/* 발송 방식 */}
      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>발송 방식</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
          여기서 고른 방식대로 <b>발송</b>·<b>재발송</b> 화면의 버튼이 동작합니다.
        </p>
        <div className="row" style={{ gap: 4 }}>
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`btn btn-sm ${mode === m.key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {MODES.find((m) => m.key === mode)?.hint}
        </p>
      </div>

      {/* 학원 정보 */}
      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>학원 이름</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
          문자 맨 앞에 <b>[{academy || "학원이름"}]</b> 으로 붙습니다.
        </p>
        <input
          className="input input-sm"
          style={{ maxWidth: 260 }}
          value={academy}
          onChange={(e) => setAcademy(e.target.value)}
        />
      </div>

      {/* 솔라피 */}
      {mode === "sms" && (
        <div className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>솔라피 연결</h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5 }}>
            솔라피 사이트에서 API Key·Secret을 발급받고, 발신번호를 <b>사전등록</b>해야 보낼 수 있어요.
          </p>
          <div className="editgrid">
            <div className="field">
              <label className="label">API Key</label>
              <input
                className="input input-sm"
                value={solapi.apiKey}
                placeholder={view.solapi?.maskedKey || "발급받은 API Key"}
                onChange={(e) => setSolapi({ ...solapi, apiKey: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">API Secret</label>
              <input
                className="input input-sm"
                type="password"
                value={solapi.apiSecret}
                placeholder={view.solapi?.maskedSecret || "발급받은 API Secret"}
                onChange={(e) => setSolapi({ ...solapi, apiSecret: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">발신번호</label>
              <input
                className="input input-sm"
                value={solapi.sender}
                placeholder="0311234567"
                onChange={(e) => setSolapi({ ...solapi, sender: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">알림톡 발신프로필 ID (pfId)</label>
              <input
                className="input input-sm"
                value={solapi.pfId}
                placeholder="비우면 전부 문자로 나갑니다"
                onChange={(e) => setSolapi({ ...solapi, pfId: e.target.value })}
              />
            </div>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            알림톡은 <b>문자 종류마다</b> 템플릿 코드를 붙여야 나갑니다 —{" "}
            <a className="sky" href="/settings/messages">설정 → 문자 문구</a> 에서 붙입니다.
            알림톡이 막힌 번호에는 <b>문자로 대신</b> 나갑니다.
          </p>
          <p className="hint" style={{ marginTop: 8 }}>
            이미 저장된 값이 있으면 칸을 비워둔 채 저장해도 그대로 유지됩니다.
            {view.solapi?.saved && " 현재 저장됨 ✓"}
          </p>
          {view.solapi?.saved && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 6 }}
              onClick={() => {
                if (!confirm("저장된 솔라피 키를 지울까요?")) return;
                run(() => clearIntegration("solapi"), "키를 지웠어요.");
              }}
              disabled={pending}
            >
              저장된 키 지우기
            </button>
          )}
        </div>
      )}

      {/* 웹훅 */}
      {mode === "webhook" && (
        <div className="card">
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>웹훅 연결</h2>
          <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5 }}>
            아래 주소로 이런 모양의 데이터를 보냅니다. Make에서 받아 발송하시면 돼요.
          </p>
          <pre className="reportbox" style={{ padding: 12, borderRadius: 10, borderTop: 0 }}>
{`{
  "kind": "report",
  "date": "2026-07-26",
  "messages": [
    { "to": "01012345678", "text": "[클로이영어] ...", "ref": "리포트id" }
  ]
}`}
          </pre>
          <div className="editgrid" style={{ marginTop: 10 }}>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label className="label">웹훅 주소</label>
              <input
                className="input input-sm"
                value={webhook.url}
                placeholder="https://hook.make.com/..."
                onChange={(e) => setWebhook({ ...webhook, url: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="label">보안 키 (선택)</label>
              <input
                className="input input-sm"
                type="password"
                value={webhook.secret}
                placeholder={view.webhook?.maskedSecret || "X-Webhook-Secret 헤더로 보냄"}
                onChange={(e) => setWebhook({ ...webhook, secret: e.target.value })}
              />
            </div>
          </div>
        </div>
      )}

      {/* 문자 문구 */}
      <div className="card">
        <div className="row" style={{ alignItems: "baseline" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>문자 문구</h2>
          <span className="spacer" />
          <a className="btn btn-ghost btn-sm" href="/settings/messages">
            문구 관리
          </a>
        </div>
        <p className="muted" style={{ margin: "6px 0 10px", fontSize: 12.5, lineHeight: 1.7 }}>
          데일리리포트·숙제 문자·하원 안내는 <b>종류마다 인삿말·맺음말을 따로</b> 정합니다.
          교재 안내·지각 안내처럼 직접 쓰는 문자도 거기서 추가하고 지웁니다.
          <br />
          아래 전화·주소는 문구 안에서 <b>{"{{학원전화}} {{학원주소}}"}</b> 로 쓸 수 있습니다.
        </p>
        <div className="editgrid">
          <div className="field">
            <label className="label">학원 전화</label>
            <input
              className="input input-sm"
              value={msgCfg.phone}
              onChange={(e) => setMsgCfg({ ...msgCfg, phone: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">학원 주소</label>
            <input
              className="input input-sm"
              value={msgCfg.address}
              onChange={(e) => setMsgCfg({ ...msgCfg, address: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* 보강 전용 요일 */}
      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>보강만 하는 요일</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.7 }}>
          정규수업이 아니라 <b>보강·재시험·특강만</b> 하는 요일입니다.
          여기 고른 요일은 <b>수강료 회차와 스케줄 알림에서 빠집니다.</b>
          그날 보강을 잡는 것은 그대로 됩니다.
        </p>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {["월", "화", "수", "목", "금", "토", "일"].map((d) => {
            const on = makeupDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                className={`btn btn-sm ${on ? "btn-primary" : "btn-ghost"}`}
                onClick={() =>
                  setMakeupDays(on ? makeupDays.filter((x) => x !== d) : [...makeupDays, d])
                }
              >
                {d}
              </button>
            );
          })}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {makeupDays.length === 0
            ? "고른 요일이 없습니다. 모든 요일이 정규 회차로 계산됩니다."
            : `${makeupDays.join("·")}요일은 회차에서 빠집니다.`}
        </p>
      </div>

      {/* 경고 규칙 */}
      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>경고 · 반성문 규칙</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.7 }}>
          아래에 해당하면 그날 <b>경고 1회</b>입니다. 하루에 여러 개가 겹쳐도 1회로 셉니다.
          경고는 따로 저장하지 않고 <b>리포트에서 매번 계산</b>하므로, 리포트를 고치면 경고도 같이 맞습니다.
        </p>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {[
            ["countLate", "지각"],
            ["countHomework", "숙제 미제출 · 미흡"],
            ["countWordTest", "단어시험 미통과"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`btn btn-sm ${warn[k] ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setWarn({ ...warn, [k]: !warn[k] })}
            >
              {warn[k] ? "✓ " : ""}{label}
            </button>
          ))}
        </div>
        <div className="editgrid">
          <div className="field">
            <label className="label">몇 회면 반성문</label>
            <input
              className="input input-sm"
              inputMode="numeric"
              value={warn.reflectionAt}
              onChange={(e) => setWarn({ ...warn, reflectionAt: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">단어시험 통과선 (%)</label>
            <input
              className="input input-sm"
              inputMode="numeric"
              value={warn.wordPassPct}
              onChange={(e) => setWarn({ ...warn, wordPassPct: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="label">숙제 미흡 몇 건부터</label>
            <input
              className="input input-sm"
              inputMode="numeric"
              value={warn.weakAt}
              onChange={(e) => setWarn({ ...warn, weakAt: e.target.value })}
            />
          </div>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          숙제는 <b>안 해온 것(✕)은 한 건만 있어도</b> 경고이고,{" "}
          <b>해왔는데 부족한 것(△)은 {warn.weakAt}건부터</b> 경고입니다.
          성실한 아이도 하루에 한 항목쯤은 아쉬운 날이 있어서, 그것까지 세면 매일 경고가 뜹니다.
          <br />
          단어시험은 <b>성취도 {warn.wordPassPct}% 이상이면 통과</b>입니다.
          <br />
          점수는 앱 전체에서 <b>성취도 %</b> 하나로 말합니다 — 단어시험도, 단원평가도,
          숙제 성취도도 <b>높을수록 좋은</b> 숫자입니다.
          <br />
          {warn.reflectionAt}회가 쌓이면 반성문 대상이 됩니다. 그때 <b>반성문 씀</b> 또는
          <b> 이번엔 넘어가기(유예)</b> 를 고를 수 있고, 둘 다 경고는 0으로 돌아갑니다.
          유예는 <b>봐준 이력이 남습니다.</b>
        </p>
      </div>

      {/* 앱 알림 */}
      <div className="card">
        <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>앱 알림 (무료)</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>
          학생이 학생용 페이지에서 <b>알림 켜기</b>를 누르면, 숙제를 배정할 때 자동으로 알림이 갑니다.
          문자와 달리 <b>건당 요금이 없어요.</b>
        </p>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {pushReady ? (
            <span className="tag tag-mint">알림 준비됨</span>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => run(() => ensurePushKeys(), "알림 키를 만들었어요. 이제 학생들이 알림을 켤 수 있어요.")}
              disabled={pending}
            >
              알림 키 만들기
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => run(() => testPush(), "테스트 알림을 보냈어요.")}
            disabled={pending || !pushReady}
          >
            내 기기로 테스트
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          아이폰은 사파리에서 <b>공유 → 홈 화면에 추가</b> 한 뒤 그 아이콘으로 열어야 알림이 켜집니다.
          안드로이드는 크롬에서 바로 켤 수 있어요.
        </p>
      </div>

      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={saveAll} disabled={pending}>
          {pending ? "저장 중…" : "설정 저장"}
        </button>
        {mode !== "copy" && (
          <>
            <input
              className="input input-sm"
              style={{ width: 150 }}
              placeholder="테스트 받을 번호"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <button
              className="btn btn-ghost"
              onClick={() =>
                run(async () => {
                  const r = await testSend(testTo, mode);
                  return r;
                }, "테스트 발송했어요. 문자를 확인해보세요.")
              }
              disabled={pending || !testTo}
            >
              연결 테스트
            </button>
          </>
        )}
      </div>

      {msg && (
        <div className={msg.bad ? "err" : "notice"}>{msg.text}</div>
      )}
    </div>
  );
}
