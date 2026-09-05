# 목업 — 화면 명세 (2026-09-03 · 9/5 검토 37곳 반영)

- `클로이영어-화면-목업.html` — 27화면(s0~s20) + 기록 페이지(notes). 아티팩트
  https://claude.ai/code/artifact/b762ba3a-dfd8-43ef-872f-0a7e3da495d5 와 같은 파일이다. **목업이 곧 명세다.**
  기록 페이지의 「정한 것」·「여쭐 것」·「안 되는 것」도 명세의 일부다.
- 지침: `docs/디자인-기본.md` (배색 다섯 벌 · 치수 한 벌 · 글꼴 한 벌 · 금지 9).

## 검사 돌리기 (이 폴더에서)

```
cd docs/목업 && node preview.mjs
NODE_PATH=$(npm root -g) node contrast.cjs    # 글씨 대비 (밝음·어두움)
NODE_PATH=$(npm root -g) node contrast2.cjs   # 배색 넷을 갈아 끼우며 대비 + 갈색 금지
NODE_PATH=$(npm root -g) node audit.cjs       # 치수 한 벌 · 넘침 0 · 글씨>상자 0 · 형제 겹침 0 · 단추 높이 하나 (PC 1280 · 폰 390)
NODE_PATH=$(npm root -g) node fonts.cjs       # 글꼴 1 · 크기 열 단계 · 입력칸 = 본문
```

전역 playwright 와 크로미움(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`)을 쓴다. 어긋나면 종료 코드 1.
새 앱을 지을 때 이 넷을 `scripts/check-*` 로 옮겨 앱 화면에 돌린다 — 목업과 앱이 같은 자로 재어진다.
