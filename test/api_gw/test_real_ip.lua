-- Contract tests for trusted-proxy real-IP resolution.
-- Run: lua test/api_gw/test_real_ip.lua

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local RealIp = require("api_gw.real_ip")

local TRUSTED = { trusted_cidrs = { "10.0.0.0/8", "172.16.0.0/12" }, recursive = true,
    header = "X-Forwarded-For" }

-- ─── header parsing ─────────────────────────────────────────────────────────

A.set_eq(RealIp.split_forwarded("1.1.1.1, 10.0.0.1 ,10.0.0.2"),
    { "1.1.1.1", "10.0.0.1", "10.0.0.2" }, "the header splits and trims")
A.set_eq(RealIp.split_forwarded({ "1.1.1.1", "10.0.0.1" }),
    { "1.1.1.1", "10.0.0.1" }, "a repeated header is concatenated in wire order")
A.set_eq(RealIp.split_forwarded(nil), {}, "an absent header yields nothing")
A.set_eq(RealIp.split_forwarded("[2001:db8::1]"), { "2001:db8::1" }, "IPv6 brackets are stripped")

-- ─── the trust boundary ─────────────────────────────────────────────────────

-- No trusted CIDRs configured: the header is never consulted. This is the
-- default, and it is the only safe default.
local ip, from_header = RealIp.resolve({ trusted_cidrs = {} }, "203.0.113.9", "1.2.3.4")
A.eq(ip, "203.0.113.9", "with no trust boundary the peer address wins")
A.eq(from_header, false, "and the answer is not from the header")

-- An untrusted peer can claim anything; we ignore it. Without this, any caller
-- sets its own IP and walks through a per-IP rate limit or an allowlist.
ip, from_header = RealIp.resolve(TRUSTED, "203.0.113.9", "10.0.0.1, 8.8.8.8")
A.eq(ip, "203.0.113.9", "an untrusted peer's XFF is ignored entirely")
A.eq(from_header, false, "and reported as not from the header")

-- A trusted peer's header is evidence.
ip, from_header = RealIp.resolve(TRUSTED, "10.0.0.5", "198.51.100.7")
A.eq(ip, "198.51.100.7", "a trusted peer's XFF is honoured")
A.eq(from_header, true, "and reported as from the header")

-- Walk right-to-left past our own infrastructure to the first outside address.
A.eq(RealIp.resolve(TRUSTED, "10.0.0.5", "198.51.100.7, 172.16.3.1, 10.0.0.9"),
    "198.51.100.7", "trusted hops are skipped from the right")

-- The client may prepend its own fake hops; the first untrusted address from
-- the right is still the furthest one we can vouch for.
A.eq(RealIp.resolve(TRUSTED, "10.0.0.5", "1.1.1.1, 2.2.2.2, 198.51.100.7, 10.0.0.9"),
    "198.51.100.7", "client-supplied hops to the left of a real one are not trusted over it")

-- Everything inside the boundary: internal traffic, take the first hop.
A.eq(RealIp.resolve(TRUSTED, "10.0.0.5", "10.0.1.1, 10.0.2.2"),
    "10.0.1.1", "all-internal chains resolve to the first hop")

-- Trusted peer, empty header.
ip, from_header = RealIp.resolve(TRUSTED, "10.0.0.5", nil)
A.eq(ip, "10.0.0.5", "a trusted peer with no header resolves to itself")
A.eq(from_header, false, "and is not from the header")

-- Non-recursive: exactly one trusted hop, so the last entry is what it saw.
local ONE_HOP = { trusted_cidrs = { "10.0.0.0/8" }, recursive = false }
A.eq(RealIp.resolve(ONE_HOP, "10.0.0.5", "1.1.1.1, 198.51.100.7"),
    "198.51.100.7", "non-recursive mode takes the last hop")
A.eq(RealIp.resolve(ONE_HOP, "10.0.0.5", "198.51.100.7, 10.0.0.9"),
    "10.0.0.9", "non-recursive mode does not skip trusted hops")

-- A garbage header cannot crash the resolver or produce a nil IP.
A.eq(RealIp.resolve(TRUSTED, "10.0.0.5", ",,, "), "10.0.0.5", "a junk header falls back to the peer")
A.eq(RealIp.resolve(TRUSTED, "10.0.0.5", "not-an-ip"), "not-an-ip",
    "an unparseable hop is returned as-is rather than crashing — downstream keying treats it as opaque")
A.eq(RealIp.resolve(nil, "10.0.0.5", "1.1.1.1"), "10.0.0.5", "a nil config falls back to the peer")
A.eq(RealIp.resolve(TRUSTED, nil, nil), "0.0.0.0", "a missing peer resolves to a safe placeholder")

-- An unparseable CIDR in the config must not silently widen the boundary.
A.eq(RealIp.resolve({ trusted_cidrs = { "not-a-cidr" }, recursive = true }, "10.0.0.5", "1.1.1.1"),
    "10.0.0.5", "a broken trusted_cidrs entry does not make the peer trusted")

-- ─── pipeline stage ─────────────────────────────────────────────────────────

H.reset()
local cfg = Config.resolve({ server_name = "api.example.com",
    api_gw = { enabled = true, real_ip = { trusted_cidrs = { "10.0.0.0/8" } } } }, nil, "prod")

local ctx = Stub.context({ peer_addr = "10.0.0.5",
    headers = { ["x-forwarded-for"] = "198.51.100.7" } })
A.is_nil(RealIp.run(cfg, ctx), "the stage never denies")
A.eq(ctx.client_ip, "198.51.100.7", "it populates ctx.client_ip")
A.eq(ctx.client_ip_from_header, true, "and records where the answer came from")

H.reset()
local custom = Config.resolve({ server_name = "api.example.com",
    api_gw = { enabled = true, real_ip = { trusted_cidrs = { "10.0.0.0/8" },
        header = "CF-Connecting-IP", recursive = false } } }, nil, "prod")
ctx = Stub.context({ peer_addr = "10.0.0.5", headers = {
    ["cf-connecting-ip"] = "198.51.100.8",
    ["x-forwarded-for"] = "203.0.113.1",
} })
RealIp.run(custom, ctx)
A.eq(ctx.client_ip, "198.51.100.8", "the header name is configurable and XFF is then ignored")

A.done("test_real_ip")
