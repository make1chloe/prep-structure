const $ = (id) => document.getElementById(id);

async function refresh() {
  const c = await chrome.storage.local.get({
    appUrl: "https://chloe-english.vercel.app",
    key: "",
    lastRun: null,
    lastError: null,
  });
  $("appUrl").value = c.appUrl;
  $("key").value = c.key;
  const st = $("status");
  if (c.lastError) {
    st.innerHTML = `<div class="err">마지막 시도 실패:\n${c.lastError}</div>`;
  } else if (c.lastRun) {
    st.innerHTML = `<div class="ok">마지막으로 보낸 시각: ${new Date(c.lastRun).toLocaleString("ko-KR")}</div>`;
  } else {
    st.textContent = "아직 보낸 적이 없어요. 열쇠를 넣고 「지금 읽어서 보내기」 를 눌러보세요.";
  }
}

$("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    appUrl: $("appUrl").value.trim().replace(/\/$/, ""),
    key: $("key").value.trim(),
  });
  $("status").textContent = "저장했어요.";
});

$("backtest").addEventListener("click", () => {
  $("backtest").disabled = true;
  $("status").textContent = "지난 31일치를 읽는 중… (2~5분, 창 닫아도 계속 돕니다)";
  const tick = setInterval(async () => {
    const { btProgress } = await chrome.storage.local.get("btProgress");
    if (btProgress) $("status").textContent = btProgress;
  }, 1500);
  chrome.runtime.sendMessage("backtest", (res) => {
    clearInterval(tick);
    $("backtest").disabled = false;
    if (res?.ok) {
      $("status").innerHTML =
        `<div class="ok">백테스트 (${res.from}~${res.to})<br>` +
        `대조 ${res.compared}건 · <b>일치 ${res.agree}건 (${res.pct}%)</b><br>` +
        `자동이 후함 ${res.generous} (수업 뒤 마저 한 것 포함) · 자동이 박함 ${res.strict}</div>`;
    } else {
      $("status").innerHTML = `<div class="err">실패:\n${res?.error || "알 수 없음"}</div>`;
    }
  });
});

$("run").addEventListener("click", () => {
  $("run").disabled = true;
  $("status").textContent = "읽는 중… (학생 수만큼 몇 초 걸려요)";
  chrome.runtime.sendMessage("run-now", (res) => {
    $("run").disabled = false;
    if (res?.ok) {
      $("status").innerHTML =
        `<div class="ok">보냈어요 — 명단 ${res.roster}명 · 오늘 ${res.days}명분 · 달력 ${res.planner}건</div>`;
    } else {
      $("status").innerHTML = `<div class="err">실패:\n${res?.error || "알 수 없는 오류"}</div>`;
    }
    setTimeout(refresh, 1500);
  });
});

refresh();
