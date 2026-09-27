#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$root"

# The running kernel has no xt_mark module (common after a kernel upgrade
# that removed the booted kernel's modules). proxy-everything then exits
# before port 39001 listens, and the API worker returns 500.
if ! modinfo xt_mark >/dev/null 2>&1; then
  docker build -t anyshare-dev/proxy-everything:local infra/proxy-sidecar
  export CONTAINER_EGRESS_INTERCEPTOR_IMAGE=anyshare-dev/proxy-everything:local
fi

exec alchemy dev "$@"
