# Local stand-in for cloudflare/proxy-everything when the host kernel
# cannot load xt_mark. Same binary; iptables is a no-op so startup does
# not fatal on the DIVERT/MARK rule.
FROM cloudflare/proxy-everything@sha256:0ef6716c52430096900b150d84a3302057d6cd2319dae7987128c85d0733e3c8

COPY iptables /usr/sbin/iptables
RUN chmod 755 /usr/sbin/iptables
