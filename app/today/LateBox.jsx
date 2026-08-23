"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLate, previewLate, sendLateNow, unsendLate, clearLate } from "./lateActions";
import { TIME_PRESETS, normalizeTime } from "@/lib/lateNotice";

/**
 * 늦은 귀가 안내 한 학생 분.
 *
 * 사유는 **자동으로 잡힌다.**
 *   · 단어시험을 통과 못 하면      → 단어 재시험
 *   · 숙제가 미제출·미흡이면        → 늦귀가 과제
 * 원장님이 더할 것은 **하원 예상 시간** 하나다.
 *
 * 그 밖의 사유(상담·보강·학교 행사 …)는 직접 적어서 보낸다.
 * 데리러 오시는 분께 가는 문자라 발송 화면까지 가지 않고 여기서 바로 보낸다.
 */
export default function LateBox({
  studentId,
  date,
  reasons = [],
  saved = {},
  // 단어 재시험 건너뛰기 (원장님 2026-08-19) — 사유 줄에서 바로 끄고 켠다
  retestSkipped = false,
  onSkipRetest = null,
}) {
  const [until, setUntil] = useState(saved.until || "");
  const [reason, setReason] = useState(saved.reason || "");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const auto = reasons.length > 0;
  const has = auto || !!saved.until || !!saved.reason;
  const sent = saved.sentAt;

  /**
   * @param quiet 새로고침 없이 조용히 (2026-08-21). 프리셋·사유는 이미
   *   로컬 state 라, 누를 때마다 페이지 전체를 다시 그려 위 목록이
   *   재정렬되고 스크롤이 흔들리던 것이 순수 손해였다.
   *   보내기·되돌리기처럼 다른 화면 상태가 바뀌는 것만 새로고침한다.
   */
  function run(fn, after, quiet = false) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        alert(res.error);
        return;
      }
      if (after) after(res);
      if (!quiet) router.refresh();
    });
  }

  function save(extra) {
    return saveLate(studentId, date, { until, reason, ...extra });
  }

  // 아직 사유가 없고 열지도 않았으면 조용히 버튼 하나만
  if (!has && !open) {
    return (
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(true)}
        title="상담·보강처럼 자동으로 안 잡히는 사유"
      >
        + 늦게 가는 사유 직접 넣기
      </button>
    );
  }

  return (
    <div style={{ flex: 1 }}>
      {/* 자동으로 잡힌 사유 */}
      {auto && (
        <div className="stack" style={{ gap: 3, marginBottom: 8 }}>
          {reasons.map((x) => (
            <div className="unitrow" key={x.key}>
              <span className="tag tag-amber">{x.label}</span>
              <span className="hint" style={{ flex: 1, fontSize: 13 }}>{x.detail}</span>
              {x.key === "retest" && onSkipRetest && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onSkipRetest(true)}
                  title="오늘은 재시험을 안 봅니다 — 사유·문구에서 빠져요. 점수 기록은 그대로예요"
                >
                  오늘은 건너뛰기
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {/* 건너뛴 상태 — 어디서 사라졌는지 보이고, 한 번에 되돌린다 */}
      {retestSkipped && (
        <div className="unitrow" style={{ marginBottom: 8 }}>
          <span className="tag tag-muted">단어 재시험 건너뜀</span>
          {onSkipRetest && (
            <button className="btn btn-ghost btn-sm" onClick={() => onSkipRetest(false)}>
              되돌리기
            </button>
          )}
        </div>
      )}

      {/* 하원 예상 시간 — 원장님이 더할 것은 이것뿐 */}
      <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        <span className="hint" style={{ fontSize: 13 }}>하원</span>
        {TIME_PRESETS.map((t) => (
          <button
            key={t}
            className={`btn btn-sm ${until === t ? "btn-on" : "btn-ghost"}`}
            disabled={pending || sent}
            style={{ padding: "2px 8px", fontSize: 13 }}
            onClick={() => {
              setUntil(t);
              run(() => saveLate(studentId, date, { until: t, reason }), null, true);
            }}
          >
            {t}
          </button>
        ))}
        <input
          className="input input-sm"
          style={{ width: 74 }}
          placeholder="직접"
          value={until}
          disabled={sent}
          onChange={(e) => setUntil(e.target.value)}
          onBlur={() => {
            const v = normalizeTime(until);
            setUntil(v);
            run(() => saveLate(studentId, date, { until: v, reason }), null, true);
          }}
        />
      </div>

      {/* 그 밖의 사유 */}
      <input
        className="input input-sm"
        style={{ width: "100%", marginTop: 6 }}
        placeholder="다른 사유가 있으면 (상담, 보강, 학교 행사 …)"
        value={reason}
        disabled={sent}
        onChange={(e) => setReason(e.target.value)}
        onBlur={() => run(() => save(), null, true)}
      />

      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {!sent && (
          <>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const s = await save();
                  if (s?.error) {
                    alert(s.error);
                    return;
                  }
                  const res = await previewLate(studentId, date);
                  if (res?.error) {
                    alert(res.error);
                    return;
                  }
                  setPreview(res.text || "");
                })
              }
            >
              문구 보기
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() => {
                if (!until && !confirm("하원 시간을 안 넣었습니다. 그래도 보낼까요?")) return;
                startTransition(async () => {
                  const s = await save(preview !== null ? { text: preview } : {});
                  if (s?.error) {
                    alert(s.error);
                    return;
                  }
                  const res = await sendLateNow(studentId, date);
                  if (res?.error) {
                    alert(res.error);
                    return;
                  }
                  const bad = (res.failed || [])[0];
                  alert(bad ? `보내지 못했어요: ${bad.detail}` : "하원 안내를 보냈어요.");
                  router.refresh();
                });
              }}
            >
              지금 보내기
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              title="오늘은 늦지 않습니다"
              onClick={() => {
                setUntil("");
                setReason("");
                setOpen(false);
                run(() => clearLate(studentId, date));
              }}
            >
              해당 없음
            </button>
          </>
        )}

        {sent && (
          <>
            <span className="tag tag-mint">
              {new Date(sent).toLocaleTimeString("ko-KR", {
                timeZone: "Asia/Seoul",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              보냄
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() => run(() => unsendLate(saved.reportId))}
            >
              보낸 표시 취소
            </button>
          </>
        )}
      </div>

      {preview !== null && !sent && (
        <textarea
          className="input"
          value={preview}
          onChange={(e) => setPreview(e.target.value)}
          style={{
            width: "100%",
            height: 150,
            marginTop: 8,
            fontSize: 16,
            whiteSpace: "pre-wrap",
          }}
        />
      )}
    </div>
  );
}
