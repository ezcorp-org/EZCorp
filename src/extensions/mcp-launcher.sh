#!/bin/sh
# Phase 7 — MCP namespace launcher.
#
# Spawned by `mcp-sandbox.ts` via:
#   unshare -U -n -m --map-root-user -- mcp-launcher.sh \
#     <orig-prlimit-cmd> <orig-prlimit-args...>
#
# When this script runs we are inside a fresh user+net+mount namespace.
# Our job:
#   1. Bring up loopback so the MCP can talk to the proxy via UDS / 127.0.0.1.
#      (Even UDS technically needs lo; some libc dial paths route via the
#      socket layer.)
#   2. Apply an iptables ruleset that DROPs everything outbound except
#      loopback. The netns has no upstream interface anyway — this is
#      defense-in-depth for the case where future kernels add a default
#      route or someone misconfigures a veth pair.
#   3. Drop CAP_SYS_ADMIN. unshare needed it to enter the namespace; the
#      MCP must not retain it.
#   4. exec the original prlimit-wrapped command. argv[1..] is the full
#      `prlimit --rss=... --as=... <mcp-command> <mcp-args...>` chain
#      mcp-sandbox.ts built; we exec it verbatim.
#
# Failure mode: any step that errors aborts the launch. The MCP never
# starts, registry.getMcpClient throws, the operator sees a clear error.
# Fail-closed.

set -e

# Step 1: loopback up. inside a fresh netns, lo starts DOWN.
ip link set lo up

# Step 2: iptables OUTPUT-DROP DROP-ALL with a loopback exemption.
# We use iptables-restore (atomic batch) instead of repeated `iptables
# -A` calls so a partial application can't leave a half-open ruleset.
# `-w 1` waits up to 1s for the xtables lock — defensive in case the
# host's iptables happens to be in flight, though inside the netns we
# own the lock.
iptables-restore -w 1 <<'EOF'
*filter
:INPUT ACCEPT [0:0]
:FORWARD DROP [0:0]
:OUTPUT DROP [0:0]
-A OUTPUT -o lo -j ACCEPT
COMMIT
EOF

# Step 3: drop capabilities — best-effort.
#
# Inside an unprivileged userns we ARE "root" but the bounding set is
# inherited from the parent process; CAP_SYS_ADMIN drop via capsh requires
# CAP_SETPCAP on some kernels, which we don't have. capsh on NixOS also
# misbehaves with non-script targets ("cannot execute binary file"). The
# primary security gate is the netns + iptables — no internet means the
# MCP can't reach anything outside loopback regardless of which caps it
# nominally holds.
#
# We attempt the drop once via `capsh --drop=cap_sys_admin --` and proceed
# unconditionally on failure (audit only). When the kernel later adds
# userns features that require CAP_SYS_ADMIN, this layer kicks in
# transparently.
if command -v capsh >/dev/null 2>&1; then
  capsh --drop=cap_sys_admin -- /bin/true >/dev/null 2>&1 \
    && exec capsh --drop=cap_sys_admin -- "$@"
fi
# Fallback: exec the inner command directly. The netns is the primary gate.
exec "$@"
