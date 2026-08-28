#!/usr/bin/env bash
# **진짜 Postgres 한 대** — 리눅스면 그 자리 initdb 로, 없으면 도커로.
#
# ── 왜 이 파일이 생겼나 (2026-08-28) ─────────────────────────
#
# 진짜 DB 가 있어야 도는 검사 다섯이 전부 이렇게 시작했다:
#
#     command -v initdb >/dev/null || { echo "postgres 가 없어 건너뜁니다"; exit 0; }
#
# 맥에는 initdb 가 없다. 그래서 RLS 유출(check-leak) · 학부모 가시성
# (check-parent) · 조교 차단(check-roles) · SETUP_ALL 멱등(check-sql) ·
# 옛 시험 이관(check-exam-merge) 다섯이 **한 줄도 안 돌고 rc=0** 으로 끝났고,
# check-pages 맨 끝에는 「✅ 전부 통과」 가 찍혔다. 학생 계정에 남의 것이
# 보이는지는 **한 번도 확인된 적이 없는데 통과로 보고**되고 있었다.
#
# 검사를 믿을 수 없으면 검사가 없는 것보다 나쁘다 — 있다고 여기게 되니까.
# 그래서 (1) 도커가 있으면 도커의 postgres:16 으로 진짜 돌리고,
#        (2) 그마저 없으면 「통과」 가 아니라 **「건너뜀」 으로 크게** 알린다.
#
# ── 쓰는 법 ─────────────────────────────────────────────────
#
#   . "$(dirname "$0")/pg-boot.sh"
#   pg_boot pgleak 55434 /var/tmp/pgleak || { pg_skip "학생 계정 유출 (RLS)"; exit 0; }
#   trap pg_stop EXIT
#   $Q -c "create database chloe;"
#
# 돌려주는 것:  Q (psql 앞머리) · PGMODE (native|docker)
# 도커일 때는 저장소의 supabase/ 를 컨테이너 /work 안에 넣어두므로
# `-f supabase/SETUP_ALL.sql` 같은 **상대 경로가 그대로 통한다.**

PG=${PG:-/usr/lib/postgresql/16/bin}
export PATH="$PG:$PATH"
# 부르는 쪽은 모두 저장소 뿌리에서 도는 것을 전제로 `supabase/…` 를 적는다
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

PGMODE=""
PG_NAME=""
PG_DATA=""
Q=""

# 진짜로 못 돌렸을 때 — **통과라고 말하지 않는다.**
# check-pages 가 PGSKIP_FILE 을 쥐어주면 거기에도 한 줄 남겨서
# 맨 끝 요약에 노란 경고로 다시 뜨게 한다.
pg_skip() {
  echo "  ⚠️  건너뜀 (통과가 아닙니다) — $1"
  echo "     진짜 Postgres 가 없습니다. 리눅스면 postgresql-16,"
  echo "     맥이면 도커를 켜고 한 번만:  docker pull postgres:16"
  [ -n "${PGSKIP_FILE:-}" ] && echo "$1" >> "$PGSKIP_FILE"
  return 0
}

# pg_boot <도커이름> <포트(리눅스용)> <자료방(리눅스용)>
pg_boot() {
  local name=$1 port=$2 data=$3 i

  if command -v initdb >/dev/null 2>&1; then
    PGMODE=native; PG_DATA=$data
    rm -rf "$data"; mkdir -p "$data"; chown postgres "$data"; chmod 700 "$data"
    su postgres -c "PATH=$PG:\$PATH initdb -D $data -U postgres -A trust" >/dev/null 2>&1
    su postgres -c "PATH=$PG:\$PATH pg_ctl -D $data -o '-p $port -k /var/tmp' -l $data/log start" >/dev/null 2>&1
    sleep 2
    Q="psql -h /var/tmp -p $port -U postgres -q"
    return 0
  fi

  # 도커 — 이미지를 미리 받아둔 경우에만 (검사 도중에 몇 백 MB 를 받지 않는다)
  #
  # **이름을 두 가지로 물어본다** (2026-08-28, 원장님 맥에서 실측).
  # `docker images` 에는 `postgres:16` 이 멀쩡히 보이는데
  # `docker image inspect postgres:16` 만 「No such image」 였다 —
  # 요즘 Docker Desktop(containerd 이미지 저장소)에서 짧은 이름을 못 찾는 경우다.
  # 그래서 이 한 줄 때문에 **이미지를 받아두고도 여섯 검사가 통째로 건너뛰었다.**
  # 그게 바로 이 파일이 없애려던 그 일이다. 긴 이름으로 한 번 더 물어본다.
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 \
     && { docker image inspect postgres:16 >/dev/null 2>&1 \
          || docker image inspect docker.io/library/postgres:16 >/dev/null 2>&1; }; then
    PGMODE=docker; PG_NAME=$name
    docker rm -f "$name" >/dev/null 2>&1
    docker run -d --name "$name" \
      -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_PASSWORD=chloe \
      postgres:16 >/dev/null 2>&1 || { PGMODE=""; return 1; }
    for i in $(seq 1 60); do
      docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break
      sleep 1
    done
    if ! docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then
      docker rm -f "$name" >/dev/null 2>&1; PGMODE=""; return 1
    fi
    # SQL 파일을 컨테이너 안에서 그대로 -f 로 읽게 넣어둔다
    docker exec "$name" mkdir -p /work >/dev/null 2>&1
    docker cp supabase "$name":/work/supabase >/dev/null 2>&1 || { pg_stop; return 1; }
    Q="docker exec -i -w /work $name psql -U postgres -q"
    return 0
  fi

  return 1
}

pg_stop() {
  case "$PGMODE" in
    docker) docker rm -f "$PG_NAME" >/dev/null 2>&1 ;;
    native) su postgres -c "PATH=$PG:\$PATH pg_ctl -D $PG_DATA stop" >/dev/null 2>&1
            rm -rf "$PG_DATA" ;;
  esac
}
