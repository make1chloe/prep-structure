#!/usr/bin/env bash
# 검사에 필요한 연장 두 가지를 받아온다 (한 번만).
#
#   PostgREST   표를 HTTP 로 여는 부분. 진짜 Supabase 도 이걸 쓴다
#   Chromium    이미 깔려 있다 (/opt/pw-browsers). Playwright 만 붙이면 된다
#
# 도커 이미지는 이 환경에서 못 받는다 (레지스트리 셋 다 403). 그래서
# `supabase start` 대신 조각을 직접 세운다.
set -eu
cd "$(dirname "$0")/../.."

if [ ! -x /tmp/postgrest ]; then
  echo "== PostgREST 받기 =="
  curl -sSL -o /tmp/pgrst.tar.xz \
    "https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz"
  tar xf /tmp/pgrst.tar.xz -C /tmp
  /tmp/postgrest --version
fi

if [ ! -d node_modules/playwright-core ]; then
  echo "== Playwright 붙이기 (브라우저는 이미 있다) =="
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i --no-save --silent playwright-core
fi

echo "다 받았습니다."
