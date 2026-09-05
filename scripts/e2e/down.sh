#!/usr/bin/env bash
# 검사용으로 띄운 것들을 내린다. (다시 돌릴 때는 up.sh 가 알아서 정리하므로
# 꼭 부르지 않아도 된다)
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "next dev -p 3300" 2>/dev/null
pkill -f "^node scripts/e2e/auth.mjs" 2>/dev/null
pkill -f "^/tmp/postgrest " 2>/dev/null
su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH pg_ctl -D /var/tmp/e2e-pg -m immediate stop" >/dev/null 2>&1
echo "내렸습니다."
