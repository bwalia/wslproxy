-- Date: 2020/09/04
-- Author: Balinder Walia
-- Desc: Router for the API Gateway and CDN Frontend domains
-- Usage: This file is loaded by nginx.conf and is used to route requests to the appropriate backend service
-- All the servers hosts for TLS termination are defined in this lua file and dynamically routed based on the request headers
-- The ideas behind this approach are:
-- No need to reload nginx when adding new backend servers
-- No need to restart nginx when adding new backend servers
-- No need to restart nginx when removing backend servers
-- No need to restart nginx when changing the backend servers
-- v1 - Initial version is taken and then modified for more API GW features in gateway.lua
-- For authentication see auth.lua

local cjson = require "cjson"
local jwt = require "resty.jwt"
Base64 = require "base64"
Hostname = ngx.var.host
local configPath = os.getenv("NGINX_CONFIG_DIR")

local redisHost = os.getenv("REDIS_HOST")

if redisHost == nil then
    redisHost = "localhost"
end

-- =============================================================================
-- DEFAULT ERROR PAGES (Base64 Encoded)
-- These are hardcoded fallback defaults. Can be overridden via:
--   1. sample-settings.json (nginx.default.*)
--   2. Environment-specific secrets at deployment time
--   3. Runtime configuration updates via API
-- Priority: Runtime Config > Env Secret > sample-settings.json > Hardcoded Default
-- =============================================================================
local DEFAULT_ERROR_PAGES = {
    no_rule = "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8dGl0bGU+Q29uZmlndXJhdGlvbiBNaXNzaW5nIHwgV1NMIFByb3h5PC90aXRsZT4KICA8bWV0YSBuYW1lPSJ2aWV3cG9ydCIgY29udGVudD0id2lkdGg9ZGV2aWNlLXdpZHRoLCBpbml0aWFsLXNjYWxlPTEuMCI+CiAgPGxpbmsgcmVsPSJzdHlsZXNoZWV0IiBocmVmPSJodHRwczovL2NkbmpzLmNsb3VkZmxhcmUuY29tL2FqYXgvbGlicy9mb250LWF3ZXNvbWUvNC43LjAvY3NzL2ZvbnQtYXdlc29tZS5taW4uY3NzIj4KICA8c3R5bGU+CiAgICAqIHsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwOyBib3gtc2l6aW5nOiBib3JkZXItYm94OyB9CiAgICBib2R5IHsKICAgICAgZm9udC1mYW1pbHk6ICdJbnRlcicsIC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgJ1NlZ29lIFVJJywgUm9ib3RvLCBzYW5zLXNlcmlmOwogICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMGYwZjIzIDAlLCAjMWExYTJlIDUwJSwgIzE2MjEzZSAxMDAlKTsKICAgICAgbWluLWhlaWdodDogMTAwdmg7CiAgICAgIGRpc3BsYXk6IGZsZXg7CiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7CiAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyOwogICAgICBwYWRkaW5nOiAyMHB4OwogICAgfQogICAgLmNvbnRhaW5lciB7CiAgICAgIG1heC13aWR0aDogNTAwcHg7CiAgICAgIGJhY2tncm91bmQ6IHJnYmEoMjU1LDI1NSwyNTUsMC4wNSk7CiAgICAgIGJvcmRlci1yYWRpdXM6IDI0cHg7CiAgICAgIHBhZGRpbmc6IDNyZW07CiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjsKICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSgyNTUsMjU1LDI1NSwwLjEpOwogICAgICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoMTBweCk7CiAgICAgIGJveC1zaGFkb3c6IDAgMjVweCA1MHB4IHJnYmEoMCwwLDAsMC4zKTsKICAgIH0KICAgIC5pY29uLXdyYXBwZXIgewogICAgICB3aWR0aDogMTAwcHg7CiAgICAgIGhlaWdodDogMTAwcHg7CiAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICNmNTllMGIsICNkOTc3MDYpOwogICAgICBib3JkZXItcmFkaXVzOiA1MCU7CiAgICAgIGRpc3BsYXk6IGZsZXg7CiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7CiAgICAgIGp1c3RpZnktY29udGVudDogY2VudGVyOwogICAgICBtYXJnaW46IDAgYXV0byAxLjVyZW07CiAgICAgIGJveC1zaGFkb3c6IDAgMTBweCA0MHB4IHJnYmEoMjQ1LCAxNTgsIDExLCAwLjMpOwogICAgfQogICAgLmljb24td3JhcHBlciBpIHsgZm9udC1zaXplOiAyLjVyZW07IGNvbG9yOiAjZmZmOyB9CiAgICBoMSB7IGZvbnQtc2l6ZTogMS43NXJlbTsgY29sb3I6ICNmZmY7IG1hcmdpbi1ib3R0b206IDFyZW07IGZvbnQtd2VpZ2h0OiA3MDA7IH0KICAgIHAgeyBmb250LXNpemU6IDFyZW07IGNvbG9yOiByZ2JhKDI1NSwyNTUsMjU1LDAuNyk7IG1hcmdpbi1ib3R0b206IDJyZW07IGxpbmUtaGVpZ2h0OiAxLjY7IH0KICAgIC5lcnJvci1jb2RlIHsKICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrOwogICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI0NSwgMTU4LCAxMSwgMC4yKTsKICAgICAgY29sb3I6ICNmNTllMGI7CiAgICAgIHBhZGRpbmc6IDAuNXJlbSAxcmVtOwogICAgICBib3JkZXItcmFkaXVzOiA4cHg7CiAgICAgIGZvbnQtc2l6ZTogMC44NXJlbTsKICAgICAgZm9udC13ZWlnaHQ6IDYwMDsKICAgICAgbWFyZ2luLWJvdHRvbTogMS41cmVtOwogICAgICBib3JkZXI6IDFweCBzb2xpZCByZ2JhKDI0NSwgMTU4LCAxMSwgMC4zKTsKICAgIH0KICAgIC5idG4gewogICAgICBkaXNwbGF5OiBpbmxpbmUtZmxleDsKICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjsKICAgICAgZ2FwOiAwLjVyZW07CiAgICAgIHBhZGRpbmc6IDAuODc1cmVtIDEuNzVyZW07CiAgICAgIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM2MzY2ZjEsICM4YjVjZjYpOwogICAgICBjb2xvcjogI2ZmZjsKICAgICAgZm9udC1zaXplOiAxcmVtOwogICAgICBmb250LXdlaWdodDogNjAwOwogICAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7CiAgICAgIGJvcmRlci1yYWRpdXM6IDEycHg7CiAgICAgIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7CiAgICAgIGJveC1zaGFkb3c6IDAgNHB4IDE1cHggcmdiYSg5OSwgMTAyLCAyNDEsIDAuNCk7CiAgICB9CiAgICAuYnRuOmhvdmVyIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpOyBib3gtc2hhZG93OiAwIDhweCAyNXB4IHJnYmEoOTksIDEwMiwgMjQxLCAwLjUpOyB9CiAgICAuZm9vdGVyIHsgbWFyZ2luLXRvcDogMnJlbTsgcGFkZGluZy10b3A6IDEuNXJlbTsgYm9yZGVyLXRvcDogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4xKTsgfQogICAgLmZvb3RlciBhIHsgY29sb3I6IHJnYmEoMjU1LDI1NSwyNTUsMC41KTsgdGV4dC1kZWNvcmF0aW9uOiBub25lOyBmb250LXNpemU6IDAuODVyZW07IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBnYXA6IDAuNXJlbTsgfQogICAgLmZvb3RlciBhOmhvdmVyIHsgY29sb3I6ICNmZmY7IH0KICA8L3N0eWxlPgo8L2hlYWQ+Cjxib2R5PgogIDxkaXYgY2xhc3M9ImNvbnRhaW5lciI+CiAgICA8ZGl2IGNsYXNzPSJpY29uLXdyYXBwZXIiPjxpIGNsYXNzPSJmYSBmYS1leGNsYW1hdGlvbi10cmlhbmdsZSI+PC9pPjwvZGl2PgogICAgPHNwYW4gY2xhc3M9ImVycm9yLWNvZGUiPk5PX1JVTEVfQ09ORklHVVJFRDwvc3Bhbj4KICAgIDxoMT5Db25maWd1cmF0aW9uIE1pc3NpbmchPC9oMT4KICAgIDxwPk5vIHJvdXRpbmcgcnVsZXMgaGF2ZSBiZWVuIGNvbmZpZ3VyZWQgZm9yIHRoaXMgQVBJIEdhdGV3YXkuIFBsZWFzZSBjb250YWN0IHlvdXIgV2ViT3BzIHRlYW0gdG8gc2V0IHVwIHRoZSByZXF1aXJlZCBjb25maWd1cmF0aW9uLjwvcD4KICAgIDxhIGhyZWY9Im1haWx0bzphZG1pbkBleGFtcGxlLmNvbSIgY2xhc3M9ImJ0biI+PGkgY2xhc3M9ImZhIGZhLWVudmVsb3BlIj48L2k+IENvbnRhY3QgQWRtaW5pc3RyYXRvcjwvYT4KICAgIDxkaXYgY2xhc3M9ImZvb3RlciI+PGEgaHJlZj0iLyI+PGkgY2xhc3M9ImZhIGZhLWN1YmUiPjwvaT4gUG93ZXJlZCBieSBXU0wgUHJveHk8L2E+PC9kaXY+CiAgPC9kaXY+CjwvYm9keT4KPC9odG1sPgo=",
    conf_mismatch = "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8dGl0bGU+Q29uZmlndXJhdGlvbiBNaXNtYXRjaCB8IFdTTCBQcm94eTwvdGl0bGU+CiAgPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLjAiPgogIDxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9jZG5qcy5jbG91ZGZsYXJlLmNvbS9hamF4L2xpYnMvZm9udC1hd2Vzb21lLzQuNy4wL2Nzcy9mb250LWF3ZXNvbWUubWluLmNzcyI+CiAgPHN0eWxlPgogICAgKiB7IG1hcmdpbjogMDsgcGFkZGluZzogMDsgYm94LXNpemluZzogYm9yZGVyLWJveDsgfQogICAgYm9keSB7CiAgICAgIGZvbnQtZmFtaWx5OiAnSW50ZXInLCAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICdTZWdvZSBVSScsIFJvYm90bywgc2Fucy1zZXJpZjsKICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzBmMGYyMyAwJSwgIzFhMWEyZSA1MCUsICMxNjIxM2UgMTAwJSk7CiAgICAgIG1pbi1oZWlnaHQ6IDEwMHZoOwogICAgICBkaXNwbGF5OiBmbGV4OwogICAgICBhbGlnbi1pdGVtczogY2VudGVyOwogICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsKICAgICAgcGFkZGluZzogMjBweDsKICAgIH0KICAgIC5jb250YWluZXIgewogICAgICBtYXgtd2lkdGg6IDUwMHB4OwogICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwyNTUsMjU1LDAuMDUpOwogICAgICBib3JkZXItcmFkaXVzOiAyNHB4OwogICAgICBwYWRkaW5nOiAzcmVtOwogICAgICB0ZXh0LWFsaWduOiBjZW50ZXI7CiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4xKTsKICAgICAgYmFja2Ryb3AtZmlsdGVyOiBibHVyKDEwcHgpOwogICAgICBib3gtc2hhZG93OiAwIDI1cHggNTBweCByZ2JhKDAsMCwwLDAuMyk7CiAgICB9CiAgICAuaWNvbi13cmFwcGVyIHsKICAgICAgd2lkdGg6IDEwMHB4OwogICAgICBoZWlnaHQ6IDEwMHB4OwogICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZWY0NDQ0LCAjZGMyNjI2KTsKICAgICAgYm9yZGVyLXJhZGl1czogNTAlOwogICAgICBkaXNwbGF5OiBmbGV4OwogICAgICBhbGlnbi1pdGVtczogY2VudGVyOwogICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsKICAgICAgbWFyZ2luOiAwIGF1dG8gMS41cmVtOwogICAgICBib3gtc2hhZG93OiAwIDEwcHggNDBweCByZ2JhKDIzOSwgNjgsIDY4LCAwLjMpOwogICAgfQogICAgLmljb24td3JhcHBlciBpIHsgZm9udC1zaXplOiAyLjVyZW07IGNvbG9yOiAjZmZmOyB9CiAgICBoMSB7IGZvbnQtc2l6ZTogMS43NXJlbTsgY29sb3I6ICNmZmY7IG1hcmdpbi1ib3R0b206IDFyZW07IGZvbnQtd2VpZ2h0OiA3MDA7IH0KICAgIHAgeyBmb250LXNpemU6IDFyZW07IGNvbG9yOiByZ2JhKDI1NSwyNTUsMjU1LDAuNyk7IG1hcmdpbi1ib3R0b206IDJyZW07IGxpbmUtaGVpZ2h0OiAxLjY7IH0KICAgIC5lcnJvci1jb2RlIHsKICAgICAgZGlzcGxheTogaW5saW5lLWJsb2NrOwogICAgICBiYWNrZ3JvdW5kOiByZ2JhKDIzOSwgNjgsIDY4LCAwLjIpOwogICAgICBjb2xvcjogI2VmNDQ0NDsKICAgICAgcGFkZGluZzogMC41cmVtIDFyZW07CiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDsKICAgICAgZm9udC1zaXplOiAwLjg1cmVtOwogICAgICBmb250LXdlaWdodDogNjAwOwogICAgICBtYXJnaW4tYm90dG9tOiAxLjVyZW07CiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjM5LCA2OCwgNjgsIDAuMyk7CiAgICB9CiAgICAuYnRuIHsKICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7CiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7CiAgICAgIGdhcDogMC41cmVtOwogICAgICBwYWRkaW5nOiAwLjg3NXJlbSAxLjc1cmVtOwogICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNjM2NmYxLCAjOGI1Y2Y2KTsKICAgICAgY29sb3I6ICNmZmY7CiAgICAgIGZvbnQtc2l6ZTogMXJlbTsKICAgICAgZm9udC13ZWlnaHQ6IDYwMDsKICAgICAgdGV4dC1kZWNvcmF0aW9uOiBub25lOwogICAgICBib3JkZXItcmFkaXVzOiAxMnB4OwogICAgICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlOwogICAgICBib3gtc2hhZG93OiAwIDRweCAxNXB4IHJnYmEoOTksIDEwMiwgMjQxLCAwLjQpOwogICAgfQogICAgLmJ0bjpob3ZlciB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMnB4KTsgYm94LXNoYWRvdzogMCA4cHggMjVweCByZ2JhKDk5LCAxMDIsIDI0MSwgMC41KTsgfQogICAgLmZvb3RlciB7IG1hcmdpbi10b3A6IDJyZW07IHBhZGRpbmctdG9wOiAxLjVyZW07IGJvcmRlci10b3A6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMSk7IH0KICAgIC5mb290ZXIgYSB7IGNvbG9yOiByZ2JhKDI1NSwyNTUsMjU1LDAuNSk7IHRleHQtZGVjb3JhdGlvbjogbm9uZTsgZm9udC1zaXplOiAwLjg1cmVtOyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgZ2FwOiAwLjVyZW07IH0KICAgIC5mb290ZXIgYTpob3ZlciB7IGNvbG9yOiAjZmZmOyB9CiAgPC9zdHlsZT4KPC9oZWFkPgo8Ym9keT4KICA8ZGl2IGNsYXNzPSJjb250YWluZXIiPgogICAgPGRpdiBjbGFzcz0iaWNvbi13cmFwcGVyIj48aSBjbGFzcz0iZmEgZmEtdGltZXMtY2lyY2xlIj48L2k+PC9kaXY+CiAgICA8c3BhbiBjbGFzcz0iZXJyb3ItY29kZSI+Q09ORl9NSVNNQVRDSDwvc3Bhbj4KICAgIDxoMT5Db25maWd1cmF0aW9uIE1pc21hdGNoITwvaDE+CiAgICA8cD5UaGUgY29uZmlndXJhdGlvbiBkb2VzIG5vdCBtYXRjaCB0aGUgZXhwZWN0ZWQgZm9ybWF0LiBQbGVhc2UgY2hlY2sgeW91ciBjb25maWd1cmF0aW9ucyBvciBjb250YWN0IHlvdXIgV2ViT3BzIHRlYW0gdG8gcmVzb2x2ZSB0aGlzIGlzc3VlLjwvcD4KICAgIDxhIGhyZWY9Im1haWx0bzphZG1pbkBleGFtcGxlLmNvbSIgY2xhc3M9ImJ0biI+PGkgY2xhc3M9ImZhIGZhLWVudmVsb3BlIj48L2k+IENvbnRhY3QgQWRtaW5pc3RyYXRvcjwvYT4KICAgIDxkaXYgY2xhc3M9ImZvb3RlciI+PGEgaHJlZj0iLyI+PGkgY2xhc3M9ImZhIGZhLWN1YmUiPjwvaT4gUG93ZXJlZCBieSBXU0wgUHJveHk8L2E+PC9kaXY+CiAgPC9kaXY+CjwvYm9keT4KPC9odG1sPgo=",
    no_server = "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8dGl0bGU+Tm8gU2VydmVyIENvbmZpZyB8IFdTTCBQcm94eTwvdGl0bGU+CiAgPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCwgaW5pdGlhbC1zY2FsZT0xLjAiPgogIDxsaW5rIHJlbD0ic3R5bGVzaGVldCIgaHJlZj0iaHR0cHM6Ly9jZG5qcy5jbG91ZGZsYXJlLmNvbS9hamF4L2xpYnMvZm9udC1hd2Vzb21lLzQuNy4wL2Nzcy9mb250LWF3ZXNvbWUubWluLmNzcyI+CiAgPHN0eWxlPgogICAgKiB7IG1hcmdpbjogMDsgcGFkZGluZzogMDsgYm94LXNpemluZzogYm9yZGVyLWJveDsgfQogICAgYm9keSB7CiAgICAgIGZvbnQtZmFtaWx5OiAnSW50ZXInLCAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICdTZWdvZSBVSScsIFJvYm90bywgc2Fucy1zZXJpZjsKICAgICAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzBmMGYyMyAwJSwgIzFhMWEyZSA1MCUsICMxNjIxM2UgMTAwJSk7CiAgICAgIG1pbi1oZWlnaHQ6IDEwMHZoOwogICAgICBkaXNwbGF5OiBmbGV4OwogICAgICBhbGlnbi1pdGVtczogY2VudGVyOwogICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsKICAgICAgcGFkZGluZzogMjBweDsKICAgIH0KICAgIC5jb250YWluZXIgewogICAgICBtYXgtd2lkdGg6IDUwMHB4OwogICAgICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwyNTUsMjU1LDAuMDUpOwogICAgICBib3JkZXItcmFkaXVzOiAyNHB4OwogICAgICBwYWRkaW5nOiAzcmVtOwogICAgICB0ZXh0LWFsaWduOiBjZW50ZXI7CiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHJnYmEoMjU1LDI1NSwyNTUsMC4xKTsKICAgICAgYmFja2Ryb3AtZmlsdGVyOiBibHVyKDEwcHgpOwogICAgICBib3gtc2hhZG93OiAwIDI1cHggNTBweCByZ2JhKDAsMCwwLDAuMyk7CiAgICB9CiAgICAuaWNvbi13cmFwcGVyIHsKICAgICAgd2lkdGg6IDEwMHB4OwogICAgICBoZWlnaHQ6IDEwMHB4OwogICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNjM2NmYxLCAjOGI1Y2Y2KTsKICAgICAgYm9yZGVyLXJhZGl1czogNTAlOwogICAgICBkaXNwbGF5OiBmbGV4OwogICAgICBhbGlnbi1pdGVtczogY2VudGVyOwogICAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsKICAgICAgbWFyZ2luOiAwIGF1dG8gMS41cmVtOwogICAgICBib3gtc2hhZG93OiAwIDEwcHggNDBweCByZ2JhKDk5LCAxMDIsIDI0MSwgMC4zKTsKICAgIH0KICAgIC5pY29uLXdyYXBwZXIgaSB7IGZvbnQtc2l6ZTogMi41cmVtOyBjb2xvcjogI2ZmZjsgfQogICAgaDEgeyBmb250LXNpemU6IDEuNzVyZW07IGNvbG9yOiAjZmZmOyBtYXJnaW4tYm90dG9tOiAxcmVtOyBmb250LXdlaWdodDogNzAwOyB9CiAgICBwIHsgZm9udC1zaXplOiAxcmVtOyBjb2xvcjogcmdiYSgyNTUsMjU1LDI1NSwwLjcpOyBtYXJnaW4tYm90dG9tOiAycmVtOyBsaW5lLWhlaWdodDogMS42OyB9CiAgICAuZXJyb3ItY29kZSB7CiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jazsKICAgICAgYmFja2dyb3VuZDogcmdiYSg5OSwgMTAyLCAyNDEsIDAuMik7CiAgICAgIGNvbG9yOiAjODE4Y2Y4OwogICAgICBwYWRkaW5nOiAwLjVyZW0gMXJlbTsKICAgICAgYm9yZGVyLXJhZGl1czogOHB4OwogICAgICBmb250LXNpemU6IDAuODVyZW07CiAgICAgIGZvbnQtd2VpZ2h0OiA2MDA7CiAgICAgIG1hcmdpbi1ib3R0b206IDEuNXJlbTsKICAgICAgYm9yZGVyOiAxcHggc29saWQgcmdiYSg5OSwgMTAyLCAyNDEsIDAuMyk7CiAgICB9CiAgICAuYnRuIHsKICAgICAgZGlzcGxheTogaW5saW5lLWZsZXg7CiAgICAgIGFsaWduLWl0ZW1zOiBjZW50ZXI7CiAgICAgIGdhcDogMC41cmVtOwogICAgICBwYWRkaW5nOiAwLjg3NXJlbSAxLjc1cmVtOwogICAgICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjMTBiOTgxLCAjMDU5NjY5KTsKICAgICAgY29sb3I6ICNmZmY7CiAgICAgIGZvbnQtc2l6ZTogMXJlbTsKICAgICAgZm9udC13ZWlnaHQ6IDYwMDsKICAgICAgdGV4dC1kZWNvcmF0aW9uOiBub25lOwogICAgICBib3JkZXItcmFkaXVzOiAxMnB4OwogICAgICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlOwogICAgICBib3gtc2hhZG93OiAwIDRweCAxNXB4IHJnYmEoMTYsIDE4NSwgMTI5LCAwLjQpOwogICAgfQogICAgLmJ0bjpob3ZlciB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMnB4KTsgYm94LXNoYWRvdzogMCA4cHggMjVweCByZ2JhKDE2LCAxODUsIDEyOSwgMC41KTsgfQogICAgLmZvb3RlciB7IG1hcmdpbi10b3A6IDJyZW07IHBhZGRpbmctdG9wOiAxLjVyZW07IGJvcmRlci10b3A6IDFweCBzb2xpZCByZ2JhKDI1NSwyNTUsMjU1LDAuMSk7IH0KICAgIC5mb290ZXIgYSB7IGNvbG9yOiByZ2JhKDI1NSwyNTUsMjU1LDAuNSk7IHRleHQtZGVjb3JhdGlvbjogbm9uZTsgZm9udC1zaXplOiAwLjg1cmVtOyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgZ2FwOiAwLjVyZW07IH0KICAgIC5mb290ZXIgYTpob3ZlciB7IGNvbG9yOiAjZmZmOyB9CiAgPC9zdHlsZT4KPC9oZWFkPgo8Ym9keT4KICA8ZGl2IGNsYXNzPSJjb250YWluZXIiPgogICAgPGRpdiBjbGFzcz0iaWNvbi13cmFwcGVyIj48aSBjbGFzcz0iZmEgZmEtc2VydmVyIj48L2k+PC9kaXY+CiAgICA8c3BhbiBjbGFzcz0iZXJyb3ItY29kZSI+Tk9fU0VSVkVSX0NPTkZJRzwvc3Bhbj4KICAgIDxoMT5ObyBTZXJ2ZXIgQ29uZmlnIEZvdW5kITwvaDE+CiAgICA8cD5ObyBOZ2lueCBzZXJ2ZXIgY29uZmlndXJhdGlvbiBoYXMgYmVlbiBmb3VuZCBmb3IgdGhpcyBkb21haW4uIFBsZWFzZSBjb250YWN0IHlvdXIgV2ViT3BzIHRlYW0gdG8gY29uZmlndXJlIHRoZSBzZXJ2ZXIuPC9wPgogICAgPGEgaHJlZj0ibWFpbHRvOmFkbWluQGV4YW1wbGUuY29tIiBjbGFzcz0iYnRuIj48aSBjbGFzcz0iZmEgZmEtZW52ZWxvcGUiPjwvaT4gQ29udGFjdCBBZG1pbmlzdHJhdG9yPC9hPgogICAgPGRpdiBjbGFzcz0iZm9vdGVyIj48YSBocmVmPSIvIj48aSBjbGFzcz0iZmEgZmEtY3ViZSI+PC9pPiBQb3dlcmVkIGJ5IFdTTCBQcm94eTwvYT48L2Rpdj4KICA8L2Rpdj4KPC9ib2R5Pgo8L2h0bWw+Cg=="
}

-- Helper function to get error page with fallback to default
local function getErrorPage(settingsObj, pageType)
    if settingsObj and settingsObj.nginx and settingsObj.nginx.default and settingsObj.nginx.default[pageType] then
        return settingsObj.nginx.default[pageType]
    end
    return DEFAULT_ERROR_PAGES[pageType]
end

local function loadGlobalSettings()
    local readSettings, errSettings = io.open(configPath .. "data/settings.json", "rb")
    local settings = {}
    if readSettings == nil then
        ngx.say("Couldn't read file: " .. errSettings)
    else
        local jsonString = readSettings:read "*a"
        readSettings:close()
        settings = cjson.decode(jsonString)
    end
    return settings
end

local settingsObj = loadGlobalSettings()
local envProfile = settingsObj.env_profile == nil and "prod" or settingsObj.env_profile

local function trimWhitespace(str)
    -- Trim whitespace from the start and end of the string
    local trimmedStr = string.gsub(str, "^%s*(.-)%s*$", "%1")
    return trimmedStr
end

local function splitString(inputString, separator)
    local result = {}
    local pattern = string.format("([^%s]+)", separator)
    for value in string.gmatch(inputString, pattern) do
        table.insert(result, value)
    end
    return result
end

local function loadFileContent(path)
    local fileData = nil
    local file, err = io.open(path, "rb")
    if file ~= nil then
        fileData = file:read "*a"
        file:close()
    end
    return fileData, err
end

local function isNil(s)
    return s == nil
end

local function isEmpty(s)
    if isNil(s) then
        return true
    end
    return s == ''
end

local function gatewayHostAuthenticate(rule)
    local isTokenVerified = true
    if rule.jwt_token_validation_key ~= nil and rule.jwt_token_validation_value ~= nil and type(rule.jwt_token_validation_key) ~= "userdata" and  type(rule.jwt_token_validation_value) ~= "userdata" then
        local jwt_token_key_passphrase = tostring(rule.jwt_token_validation_key)
        local jwt_token_key_val_value = tostring(rule.jwt_token_validation_value)
        local amazon_s3_access_key = tostring(rule.amazon_s3_access_key)
        local amazon_s3_secret_key = tostring(rule.amazon_s3_secret_key)
    if isEmpty(jwt_token_key_passphrase) or isEmpty(jwt_token_key_val_value) then
            isTokenVerified = true
    else
        local passPhrase = Base64.decode(jwt_token_key_passphrase)
        local reqHeaders = ngx.req.get_headers()
        local securityToken = nil
       	local tokenAuthTokenSource = nil

        if rule.jwt_token_validation ~= nil then
          tokenAuthTokenSource = rule.jwt_token_validation
         end

        if tokenAuthTokenSource == "cookie_jwt_token_validation" then
            securityToken = reqHeaders['cookie']
            if securityToken and securityToken ~= nil and type(securityToken) ~= nil then
                local securityToken = string.match(tostring(securityToken), jwt_token_key_val_value .. "=([^;]+)")
                if securityToken ~= nil then
                    securityToken = string.gsub(securityToken, "Bearer", "")
                    securityToken = trimWhitespace(ngx.unescape_uri(securityToken))
                    local isTokenVerified = jwt:verify(passPhrase, securityToken)
                else
                    isTokenVerified = false
                end
            else
                isTokenVerified = false
            end
        end
        if tokenAuthTokenSource == "cookie_key_value" then
            securityToken = reqHeaders['cookie']
            if securityToken and securityToken ~= nil and type(securityToken) ~= nil then
                local securityToken = string.match(tostring(securityToken), jwt_token_key_val_value .. "=([^;]+)")
                if securityToken ~= nil then
                    -- securityToken = string.gsub(securityToken, "Bearer", "")
                    securityToken = trimWhitespace(ngx.unescape_uri(securityToken))
                    if passPhrase == securityToken then
                        isTokenVerified = true
                    end
                else
                    isTokenVerified = false
                end
            else
                isTokenVerified = false
            end
        end

        if tokenAuthTokenSource == "header_jwt_token_validation" then
            securityToken = ngx.req.get_headers()[jwt_token_key_val_value]
            if securityToken ~= nil then
                isTokenVerified = false
                securityToken = trimWhitespace(ngx.unescape_uri(securityToken))
                local verified_token = jwt:verify(passPhrase, securityToken)
                if not verified_token then
                    isTokenVerified = false
                end

                ngx.say("header token found ok: "..jwt_token_key_val_value.." - "..securityToken)
                ngx.exit(ngx.HTTP_OK)

            else
                isTokenVerified = true
            end
        end

        if tokenAuthTokenSource == "amazon_s3_signed_header_validation" then
            local folderPath, bucketName = passPhrase, jwt_token_key_val_value
            local s3AccessKey, s3SecretKey = Base64.decode(amazon_s3_access_key), Base64.decode(amazon_s3_secret_key)
            local timestamp = os.date("%a, %d %b %Y %H:%M:%S +0000")
            -- local string_to_sign = ngx.var.request_method .. "\n\n\n\nx-amz-date:" .. ngx.var.now .. "\n/" .. bucketName .. "/" .. ngx.var.request_uri
            local string_to_sign = ngx.var.request_method .. "\n\n\n" .. timestamp .. "\n/" .. bucketName .. ngx.var.request_uri
            -- GET\n\n\nTue, 27 Mar 2007 19:36:42 +0000\n/awsexamplebucket1/photos/puppy.jpg
            local signature = ngx.encode_base64(ngx.hmac_sha1(s3SecretKey, string_to_sign))
            -- # encode the signature with base64
            -- signature = Base64.encode(signature)
            -- ngx.say(
            --     "folderPath: " .. folderPath .. "\n",
            --     "bucketName: " .. bucketName .. "\n",
            --     "s3AccessKey: " .. s3AccessKey .. "\n",
            --     "string_to_sign: " .. string_to_sign .. "\n",
            --     "signature: " .. signature
            -- )
            -- ngx.exit(ngx.HTTP_OK)
            ngx.req.set_header("string_to_sign", string_to_sign)
            ngx.req.set_header("x-amz-date", timestamp)
            ngx.req.set_header("Authorization", "AWS " .. s3AccessKey .. ":" .. signature)
        -- set_encode_base64 $aws_signature $aws_signature;
        -- proxy_set_header x-amz-date $now;
        -- proxy_set_header Authorization "AWS $aws_access_key:$aws_signature";
        -- set $authorization_header_override "AWS $aws_access_key:$aws_signature";

        -- rewrite .* /$bucket_file_path break;

        -- # we need to set the host header here in order to find the bucket
        -- proxy_set_header Host $bucket_name.s3.amazonaws.com;

        -- # another solution would be to use the bucket in the url
        -- # rewrite .* /$bucket/$key break;

        -- # proxy_pass http://s3.amazonaws.com;
        end

        -- if tokenAuthTokenSource == "redis" then
        --     -- local redis = require "resty.redis"
        --     -- local red = redis:new()
        --     -- red:set_timeout(1000) -- 1 sec
        --     -- local ok, err = red:connect(redisHost, 6379)
        --     -- if not ok then
        --     --     ngx.say("failed to connect: ", err)
        --     --     return
        --     -- end
        --     -- local res, err = red:get("token:"..jwt_token_key_val_value)
        --     -- if not res then
        --     --     ngx.say("failed to get token: ", err)
        --     --     return
        --     -- end
        --     -- securityToken = res
        --     -- local ok, err = red:close()
        --     -- if not ok then
        --     --     ngx.say("failed to close: ", err)
        --     --     return
        --     -- end
        -- end

    end
end
    return isTokenVerified
end

local function gatewayHostRulesParser(rules, ruleId, priority, message, statusCode, redirectUri)
    local chk_path = (rules.path ~= nil and type(rules.path) ~= "userdata") and trimWhitespace(rules.path) or rules.path
    local isPathPass, failMessage, isTokenPass = false, "", false
    local finalResult, results = {}, {}
    local req_url = ngx.var.request_uri
    if rules.jwt_token_validation_value ~= nil and rules.jwt_token_validation_key ~= nil and type(rules.jwt_token_validation_value) ~= "userdata" and  type(rules.jwt_token_validation_key) ~= "userdata" then
        isTokenPass = gatewayHostAuthenticate(rules)
    else
        isTokenPass = true
    end

    results["token"] = isTokenPass
    if chk_path and chk_path ~= nil and chk_path ~= "" and type(chk_path) ~= "userdata" then
        if rules.path_key == 'starts_with' and req_url:startswith(chk_path) == true then
            isPathPass = true
        elseif rules.path_key == 'ends_with' and req_url:endswith(chk_path) == true then
            isPathPass = true
        elseif rules.path_key == 'equals' and chk_path == req_url then
            isPathPass = true
        else
            isPathPass, failMessage = false, string.format(
                "Route does not match. Expected path is %s, but current is %s", chk_path, req_url)
        end
    else
        isPathPass = true
    end
    results["path"] = isPathPass

    -- client IP check rules
    local isClientIpPass = false
    local req_add = ngx.var.remote_addr
    local testingIps = {
        BE = "104.155.127.255",
        IN = "117.245.73.99",
        AU = "1.44.255.255",
        GB = "103.219.168.255",
        TH = "101.109.255.255"
    }
    if string.find(Hostname, "localhost") or string.find(Hostname, "int") then
        if rules.country ~= nil and rules.client_ip ~= nil then
            req_add = testingIps[rules.country]
        end
    end

    local ip2location = require('ip2location')
    local ip2loc = ip2location:new('/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN')
    local result = ip2loc:get_all(req_add)
    local country = ""
    if result.country_short then
        country = result.country_short
    end
    local client_ip = (rules.client_ip ~= nil and type(rules.client_ip) ~= "userdata") and rules.client_ip or
        rules.client_ip
    -- user data type is null
    if client_ip and client_ip ~= nil and client_ip ~= "" and type(client_ip) ~= "userdata" then
        if rules.client_ip_key == 'starts_with' and req_add:startswith(client_ip) == true then -- and req_add~=client_ipand  (req_add:startswith(client_ip) ~= true
            isClientIpPass = true
        elseif rules.client_ip_key == 'equals' and req_add == client_ip then
            isClientIpPass = true
        else
            isClientIpPass, failMessage = false, string.format(
                "Client IP does not match. Expected IP is %s, but your IP is %s", client_ip, req_add)
        end
    else
        isClientIpPass = true
    end

    results["client_ip"] = isClientIpPass
    local isCountryPass = false
    -- check country
    if rules.country and rules.country ~= nil and rules.country ~= "" and type(rules.country) ~= "userdata" then
        if rules.country_key == 'equals' and rules.country == country then
            isCountryPass = true
        else
            isCountryPass, failMessage = false, string.format(
                "Country does not match. Expected country is %s, but your country is %s", rules.country, country)
        end
    else
        isCountryPass = true
    end
    results["country"] = isCountryPass
    results["priority"] = priority
    results["message"] = message
    results["statusCode"] = statusCode
    results["redirectUri"] = redirectUri
    results["rule_data"] = rules

    finalResult[ruleId] = results

    return finalResult
end

string.startswith = function(self, str)
    return self:find('^' .. str) ~= nil
end

function string:endswith(suffix)
    return self:sub(- #suffix) == suffix
end

local function hasAndCondition(tbl)
    local andKeys = {}
    for _, entry in ipairs(tbl) do
        if entry.condition == "and" then
            table.insert(andKeys, entry.statement)
        end
    end
    return andKeys
end

local function gatewayRequestHandler(ruleId)
    local settings = loadGlobalSettings()
    local ruleFromRedis = nil
    ruleFromRedis = loadFileContent(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json")
    if ruleFromRedis ~= nil and type(ruleFromRedis) ~= "userdata" then
        ruleFromRedis = cjson.decode(ruleFromRedis)
        if ruleFromRedis.match and ruleFromRedis.match.rules then
            -- check prefix and postfix URL
            local results = gatewayHostRulesParser(ruleFromRedis.match.rules, ruleFromRedis.id, ruleFromRedis.priority,
                ruleFromRedis.match.response.message, ruleFromRedis.match.response.code,
                ruleFromRedis.match.response.redirect_uri)
            return results
        end
    end
end

local function anyValueIsTrue(table)
    for _, value in ipairs(table) do
        if value == true then
            return true
        end
    end
    return false
end

local function getTableLength(tbl)
    local count = 0
    for _ in pairs(tbl) do
        count = count + 1
    end
    return count
end

local function isIpAddress(str)
    local pattern = "^%d+%.%d+%.%d+%.%d+$"
    local match = string.match(str, pattern)
    if match then
        -- Further validate the IP address components
        local a, b, c, d = string.match(str, "(%d+)%.(%d+)%.(%d+)%.(%d+)")
        if tonumber(a) <= 255 and tonumber(b) <= 255 and tonumber(c) <= 255 and tonumber(d) <= 255 then
            return true
        end
    end
    return false
end

local function isAnyPathExists(myTable, targetPath)
    local isPathEqual = false
    for _, entry in pairs(myTable) do
        if isEmpty(entry.paths) then
            isPathEqual = false 
        elseif entry.paths_key == "starts_with" and targetPath:startswith(entry.paths) == true and entry.paths ~= "/" then
            isPathEqual = true
            break
        elseif entry.paths_key == 'ends_with' and targetPath:endswith(entry.paths) == true and entry.paths ~= "/" then
            isPathEqual = true
            break
        elseif entry.paths_key == 'equals' and entry.paths == targetPath then
            isPathEqual = true
            break
        end
    end
    return isPathEqual
end

local function isAllPathAllowed(myTable, targetPath)
    local isPathEqual = false
    for _, entry in pairs(myTable) do
        if entry.paths == targetPath then
            isPathEqual = true
            break
        end
    end
    return isPathEqual
end

local exist_values = nil

local file, err = io.open(configPath .. "data/servers/" .. envProfile .. "/host:" .. Hostname .. ".json", "rb")
if file == nil then
    -- Use default error page (can be overridden via settings.json or environment secrets at deployment)
    local errorPageB64 = getErrorPage(settingsObj, "no_server")
    ngx.header["Content-Type"] = settingsObj.nginx.content_type ~= nil and settingsObj.nginx.content_type or "text/html"
    do return ngx.say(Base64.decode(errorPageB64)) end
else
    exist_values = file:read "*a"
end

local function findIndexByKey(table, keyToFind)
    for index, item in ipairs(table) do
        for key, _ in pairs(item) do
            if key == keyToFind then
                return index
            end
        end
    end
    return nil
end

local function isPathsValueUnique(table)
    local reqUri = ngx.var.request_uri

    local uniquePaths = {}  -- To keep track of unique paths
    local highestPriorityByPath = {}  -- To keep track of the highest priority for each path
    local highestPriority = -1
    local highestPriorityUUID = nil

    local function processEntry(key, entry)
        local path = entry.paths
        local priority = entry.path_priority

        if uniquePaths[path] then
            if priority > highestPriorityByPath[path] then
                highestPriorityByPath[path] = priority
            end
        else
            uniquePaths[path] = true
            highestPriorityByPath[path] = priority
        end
    end

    for key, item in pairs(table) do
        local path, isCheck = item["paths"], false
        if reqUri == "/" and item.paths == "/" then
            isCheck = true
        end
        if item.paths_key == "starts_with" and reqUri:startswith(item.paths) == true then
            if string.len(item.paths) > 1 then
                isCheck = true
            end
        elseif item.paths_key == "ends_with" and reqUri:endswith(item.paths) == true then
            isCheck = true
        elseif item.paths_key == "equals" and reqUri == item.paths then
            isCheck = true
        end
        if isCheck == true then
            processEntry(key, item)
            local path = item.paths
            local priority = item.path_priority

            if priority > highestPriority then
                highestPriority = priority
                highestPriorityUUID = key
            elseif priority == highestPriority and uniquePaths[path] then
                highestPriorityUUID = key
            end
        end
    end

    return highestPriorityUUID
end

if exist_values and exist_values ~= 0 and exist_values ~= nil and exist_values ~= "" then
    local jsonval = cjson.decode(exist_values)
    local parse_rules = {}
    if jsonval.rules and type(jsonval.rules) ~= "userdata" then
        table.insert(parse_rules, gatewayRequestHandler(jsonval.rules))
        if jsonval.match_cases then
            local hasAnd = hasAndCondition(jsonval.match_cases)
            if next(hasAnd) ~= nil then
                for inx, conditionRule in ipairs(hasAnd) do
                    table.insert(parse_rules, gatewayRequestHandler(conditionRule))
                end
            end
        end
        -- do return ngx.say(cjson.encode(parse_rules)) end
        local highestPriority = 0
        local highestPriorityKey, highestPriorityParentKey
        local hasFalseValue, pathMatched, finalObj = {}, false, {}
        local reqUri = ngx.var.request_uri
        for _, record in ipairs(parse_rules) do
            for key, value in pairs(record) do
                local preFinalObj = {}
                local hasFalseField = false
                if value.rule_data.path_key == "starts_with" and reqUri:startswith(value.rule_data.path) == true then
                    highestPriority = value.priority
                    highestPriorityKey = key
                    highestPriorityParentKey = _
                    pathMatched = true
                    hasFalseValue = {}
                    preFinalObj["path_matched"] = true
                    preFinalObj["path_key"] = _
                elseif value.rule_data.path_key == 'ends_with' and reqUri:endswith(value.rule_data.path) == true then
                    highestPriority = value.priority
                    highestPriorityKey = key
                    highestPriorityParentKey = _
                    pathMatched = true
                    hasFalseValue = {}
                    preFinalObj["path_matched"] = true
                    preFinalObj["path_key"] = _
                elseif value.rule_data.path_key == 'equals' and value.rule_data.path == reqUri then
                    highestPriority = value.priority
                    highestPriorityKey = key
                    highestPriorityParentKey = _
                    pathMatched = true
                    hasFalseValue = {}
                    preFinalObj["path_matched"] = true
                    preFinalObj["path_key"] = _
                else
                    preFinalObj["path_matched"] = false
                    preFinalObj["path_key"] = _
                end
                preFinalObj["paths"] = value.rule_data.path
                preFinalObj["paths_key"] = value.rule_data.path_key

                for field, fieldValue in pairs(value) do
                    if fieldValue == false then
                        hasFalseField = true
                    end
                    preFinalObj["has_false_value"] = hasFalseField
                end
                preFinalObj['path_priority'] = value.priority
                finalObj[key] = preFinalObj
            end
        end
        -- ngx.say(highestPriorityParentKey, "  --- ", highestPriorityKey)
        local finalObjCount, isAllPathPass, isPathExists, isUnique = 0, false, false, false
        if type(finalObj) == "table" then
            finalObjCount = getTableLength(finalObj)
            isAllPathPass = isAllPathAllowed(finalObj, "/")
            isPathExists = isAnyPathExists(finalObj, ngx.var.request_uri)
            isUnique = isPathsValueUnique(finalObj)
        end
        -- do
        --     return ngx.say(cjson.encode({
        --         finalObjCount = finalObjCount,
        --         isAllPathPass = isAllPathPass,
        --         isPathExists = isPathExists,
        --         isUnique = isUnique
        --     }))
        -- end
        -- do return ngx.say(cjson.encode(finalObj)) end
        local rulePasses = false
        local requestedUri = ngx.var.request_uri
        for index, passedRule in pairs(finalObj) do
            if isAllPathPass and not isPathExists then
                if requestedUri == "/" and passedRule.has_false_value == false then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                elseif passedRule.paths_key == "starts_with" and
                    requestedUri:startswith(passedRule.paths) == false
                then
                    rulePasses = true
                    break
                elseif passedRule.paths_key == "ends_with" and
                    requestedUri:startswith(passedRule.paths) == false
                then
                    rulePasses = true
                    break
                elseif passedRule.paths_key == "equals" and
                    requestedUri:startswith(passedRule.paths) == false
                then
                    rulePasses = true
                    break
                end
            end
            if isAllPathPass == true then
                if requestedUri == "/" and passedRule.has_false_value == false then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                elseif passedRule.paths_key == "starts_with" and
                    requestedUri:startswith(passedRule.paths) == false and
                    passedRule.path_matched == true and
                    passedRule.has_false_value == false
                then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                elseif passedRule.paths_key == "ends_with" and
                    requestedUri:startswith(passedRule.paths) == false and
                    passedRule.path_matched == true and
                    passedRule.has_false_value == false
                then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                elseif passedRule.paths_key == "equals" and
                    requestedUri:startswith(passedRule.paths) == false and
                    passedRule.path_matched == true and
                    passedRule.has_false_value == false
                then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                end
                if passedRule.path_matched == true and passedRule.has_false_value == false and passedRule.paths ~= "/" then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                elseif passedRule.path_matched == true and passedRule.has_false_value == false and finalObjCount == 1 then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                else
                    rulePasses = false
                end
            else
                if passedRule.path_matched == true and passedRule.has_false_value == false then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                end
            end
        end
        -- do return ngx.say(isUnique) end
        -- do return ngx.say(cjson.encode({
        --         data = { highestPriorityParentKey = highestPriorityParentKey, highestPriorityKey = highestPriorityKey } })) end
        if isUnique and type(isUnique) ~= "nil" then
            highestPriorityKey = isUnique
            highestPriorityParentKey = findIndexByKey(parse_rules, isUnique)
        end
        -- do return ngx.say(highestPriorityKey) end
        if rulePasses == true then
            local selectedRule = parse_rules[highestPriorityParentKey][highestPriorityKey]
            local globalVars = ngx.var.frontdoor_global_vars
            globalVars = cjson.decode(globalVars)
            globalVars.executableRule = selectedRule
            globalVars.proxyServerName = jsonval.proxy_server_name
            ngx.var.frontdoor_global_vars = cjson.encode(globalVars)
        else
            -- Use default error page (can be overridden via settings.json or environment secrets at deployment)
            local confMismatchHtml = getErrorPage(settingsObj, "conf_mismatch")
            ngx.header["Content-Type"] = settingsObj.nginx.content_type ~= nil and settingsObj.nginx.content_type or
                "text/html"
            ngx.status = ngx.HTTP_FORBIDDEN
            ngx.say(Base64.decode(confMismatchHtml))
        end
    else
        -- Use default error page (can be overridden via settings.json or environment secrets at deployment)
        local noRuleHtml = getErrorPage(settingsObj, "no_rule")
        ngx.header["Content-Type"] = settingsObj.nginx.content_type ~= nil and settingsObj.nginx.content_type or
        "text/html"
        ngx.say(Base64.decode(noRuleHtml))
    end
else
    -- Use default error page (can be overridden via settings.json or environment secrets at deployment)
    local noServerHtml = getErrorPage(settingsObj, "no_server")
    ngx.header["Content-Type"] = settingsObj.nginx.content_type ~= nil and settingsObj.nginx.content_type or
    "text/html"
    ngx.say(Base64.decode(noServerHtml))
end
-- ngx.var.proxy_host_override = 'test313.yourdomain.com'
-- this will replace the need for server block for each website. It will parse JSON and match host header and route to the backend server all in lua