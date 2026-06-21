-- LLM Protocol Translator for WSLProxy
--
-- Turns wslproxy into an OpenAI-compatible edge in front of Anthropic:
-- a client speaks the OpenAI Chat Completions API, this module rewrites
-- the request into Anthropic's Messages API on the way in, and rewrites
-- Anthropic's reply (buffered OR streamed SSE) back into OpenAI shape on
-- the way out.  The client never knows it's talking to Claude.
--
-- Scope (Phase 1 MVP): OpenAI -> Anthropic, text content, streaming and
-- non-streaming.  Tool/function calling, multimodal images, and the
-- reverse direction are explicit follow-ups (see README / PR notes).
--
-- Wiring (no architectural change — uses existing pipeline phases):
--   * access phase  (gateway_resp.lua) -> _M.apply_request(cfg)
--       reads the request body, translates it, rewrites the upstream
--       URI/headers, and stashes state on ngx.ctx.llm.
--   * header_filter (nginx template)    -> _M.header_filter()
--       drops content-length (body length changes) and normalises the
--       content-type for the non-streaming case.
--   * body_filter   (nginx template)    -> _M.body_filter()
--       streaming: per-chunk SSE translation via a stateful parser;
--       non-streaming: buffer then convert on EOF.
--
-- Activation is per-rule: a rule's response carries
--   "llm_translate": { "source": "openai", "target": "anthropic",
--                      "model_map": { "gpt-4o": "claude-opus-4-8" },
--                      "anthropic_version": "2023-06-01",
--                      "default_max_tokens": 4096 }
--
-- The Anthropic API key is NOT handled here — inject it with the
-- server's custom_headers (x-api-key), keeping secrets out of code.

local _M = {}

local cjson = Cjson or require("cjson")
local cjson_safe = require("cjson.safe")

local DEFAULT_MAX_TOKENS = 4096
local DEFAULT_ANTHROPIC_VERSION = "2023-06-01"
local ANTHROPIC_PATH = "/v1/messages"

-- ============================================================
-- Pure helpers (no ngx) — unit-testable
-- ============================================================

-- Anthropic stop_reason -> OpenAI finish_reason
local FINISH_REASON = {
    end_turn = "stop",
    stop_sequence = "stop",
    max_tokens = "length",
    tool_use = "tool_calls",
}

local function map_finish_reason(stop_reason)
    if not stop_reason then return nil end
    return FINISH_REASON[stop_reason] or "stop"
end

-- Collapse an OpenAI message `content` (string OR array of parts) into
-- Anthropic-acceptable content.  For the MVP we keep text only: a plain
-- string passes through; an array contributes its text parts joined.
-- (Image parts are dropped with a marker — multimodal is Phase 3.)
local function normalize_content(content)
    if type(content) == "string" then
        return content
    end
    if type(content) == "table" then
        local parts = {}
        for _, p in ipairs(content) do
            if type(p) == "table" and (p.type == "text" or p.text) then
                parts[#parts + 1] = p.text or ""
            end
        end
        return table.concat(parts, "")
    end
    return ""
end

--- OpenAI Chat Completions request table -> Anthropic Messages request
--- table.  Returns (anthropic_tbl, meta) where meta = { stream, model }.
function _M.openai_to_anthropic(o, cfg)
    cfg = cfg or {}
    local model_map = cfg.model_map or {}
    local out = {}

    out.model = model_map[o.model] or o.model
    -- Anthropic requires max_tokens; OpenAI may omit it.
    out.max_tokens = tonumber(o.max_tokens) or tonumber(o.max_completion_tokens)
        or tonumber(cfg.default_max_tokens) or DEFAULT_MAX_TOKENS

    if o.temperature ~= nil then out.temperature = o.temperature end
    if o.top_p ~= nil then out.top_p = o.top_p end

    -- stop -> stop_sequences (string or array)
    if type(o.stop) == "string" then
        out.stop_sequences = { o.stop }
    elseif type(o.stop) == "table" then
        out.stop_sequences = o.stop
    end

    out.stream = o.stream == true

    -- Split system messages out to the top-level `system` field; keep the
    -- user/assistant turns in `messages`.
    local system_parts = {}
    local messages = {}
    if type(o.messages) == "table" then
        for _, m in ipairs(o.messages) do
            if m.role == "system" then
                system_parts[#system_parts + 1] = normalize_content(m.content)
            elseif m.role == "user" or m.role == "assistant" then
                messages[#messages + 1] = {
                    role = m.role,
                    content = normalize_content(m.content),
                }
            end
        end
    end
    if #system_parts > 0 then
        out.system = table.concat(system_parts, "\n")
    end
    -- Force array encoding so an empty list never serialises as {}.
    if cjson.array_mt then setmetatable(messages, cjson.array_mt) end
    out.messages = messages

    return out, { stream = out.stream, model = out.model }
end

--- Non-streaming Anthropic Messages response table -> OpenAI Chat
--- Completions response table.  `created` and `id_fallback` are injected
--- by the caller (ngx layer) so this stays pure/testable.
function _M.anthropic_to_openai(a, created, id_fallback)
    local text_parts = {}
    if type(a.content) == "table" then
        for _, block in ipairs(a.content) do
            if type(block) == "table" and block.type == "text" then
                text_parts[#text_parts + 1] = block.text or ""
            end
        end
    end

    local usage = a.usage or {}
    local in_tok = tonumber(usage.input_tokens) or 0
    local out_tok = tonumber(usage.output_tokens) or 0

    return {
        id = "chatcmpl-" .. tostring(a.id or id_fallback or "wslproxy"),
        object = "chat.completion",
        created = created,
        model = a.model,
        choices = {
            {
                index = 0,
                message = {
                    role = "assistant",
                    content = table.concat(text_parts, ""),
                },
                finish_reason = map_finish_reason(a.stop_reason) or "stop",
            },
        },
        usage = {
            prompt_tokens = in_tok,
            completion_tokens = out_tok,
            total_tokens = in_tok + out_tok,
        },
    }
end

-- ---------- streaming SSE ----------

-- Build one OpenAI `chat.completion.chunk` object.
local function openai_chunk(state, delta, finish_reason)
    return {
        id = state.id,
        object = "chat.completion.chunk",
        created = state.created,
        model = state.model,
        choices = {
            {
                index = 0,
                delta = delta,
                finish_reason = finish_reason,
            },
        },
    }
end

local function sse_data(obj)
    return "data: " .. cjson.encode(obj) .. "\n\n"
end

--- Fresh streaming-translation state.  `created`/`id` come from the ngx
--- layer (ngx.time / request id) so this module has no ngx dependency in
--- its core.
function _M.new_stream_state(created, id)
    return {
        buffer = "",
        created = created,
        id = "chatcmpl-" .. tostring(id or "wslproxy"),
        model = nil,
        role_sent = false,
        finish_reason = nil,
        done = false,
    }
end

-- Translate one decoded Anthropic SSE event into zero or more OpenAI
-- SSE lines, appended to `out`.
local function handle_event(state, evt, out)
    local t = evt.type
    if t == "message_start" then
        local msg = evt.message or {}
        state.model = msg.model or state.model
        if not state.role_sent then
            state.role_sent = true
            out[#out + 1] = sse_data(openai_chunk(state, { role = "assistant" }, nil))
        end
    elseif t == "content_block_delta" then
        local d = evt.delta or {}
        if d.type == "text_delta" and d.text and d.text ~= "" then
            out[#out + 1] = sse_data(openai_chunk(state, { content = d.text }, nil))
        end
        -- thinking_delta / input_json_delta intentionally ignored (Phase 3)
    elseif t == "message_delta" then
        local d = evt.delta or {}
        if d.stop_reason then
            state.finish_reason = map_finish_reason(d.stop_reason)
        end
    elseif t == "message_stop" then
        if not state.done then
            state.done = true
            out[#out + 1] = sse_data(openai_chunk(state, {}, state.finish_reason or "stop"))
            out[#out + 1] = "data: [DONE]\n\n"
        end
    end
    -- ping / content_block_start / content_block_stop: nothing to emit
end

--- Feed a raw chunk of Anthropic SSE bytes; return translated OpenAI SSE
--- bytes (possibly ""), buffering any incomplete trailing event.  Call
--- with eof=true at end of stream to flush a terminal [DONE] if the
--- upstream cut off without a clean message_stop.
function _M.sse_step(state, chunk, eof)
    if state.done then
        return ""
    end
    if chunk and chunk ~= "" then
        state.buffer = state.buffer .. chunk
    end

    local out = {}
    -- SSE events are separated by a blank line ("\n\n").  Process every
    -- complete event; keep the trailing partial in the buffer.
    while true do
        local sep_start, sep_end = state.buffer:find("\n\n", 1, true)
        if not sep_start then break end
        local block = state.buffer:sub(1, sep_start - 1)
        state.buffer = state.buffer:sub(sep_end + 1)

        -- A block may contain "event:" and one or more "data:" lines.
        -- We only need the JSON from the data line(s).
        local data_lines = {}
        for line in (block .. "\n"):gmatch("([^\n]*)\n") do
            local payload = line:match("^data:%s?(.*)$")
            if payload then data_lines[#data_lines + 1] = payload end
        end
        if #data_lines > 0 then
            local joined = table.concat(data_lines, "")
            if joined ~= "" and joined ~= "[DONE]" then
                local evt = cjson_safe.decode(joined)
                if type(evt) == "table" and evt.type then
                    handle_event(state, evt, out)
                end
            end
        end
        if state.done then break end
    end

    if eof and not state.done then
        -- Upstream ended without message_stop — emit a best-effort close.
        state.done = true
        out[#out + 1] = sse_data(openai_chunk(state, {}, state.finish_reason or "stop"))
        out[#out + 1] = "data: [DONE]\n\n"
    end

    return table.concat(out)
end

-- ============================================================
-- ngx-facing wrappers
-- ============================================================

--- Access phase: if the matched rule asks for translation, rewrite the
--- request in place and arm ngx.ctx.llm for the response filters.
--- `cfg` is the rule's `llm_translate` object.  Fails open (logs +
--- leaves the request untouched) on any error so a bad body can't 500
--- the gateway.
function _M.apply_request(cfg)
    if type(cfg) ~= "table" then return end
    -- Only the OpenAI->Anthropic direction exists in the MVP.
    local source = cfg.source or "openai"
    local target = cfg.target or "anthropic"
    if source ~= "openai" or target ~= "anthropic" then
        ngx.log(ngx.WARN, "llm_translate: unsupported pair ", source, "->", target)
        return
    end

    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    if not body then
        -- Body may be buffered to a temp file when large; for the MVP we
        -- skip translation rather than risk a partial read.
        ngx.log(ngx.WARN, "llm_translate: request body not in memory; skipping")
        return
    end

    local o = cjson_safe.decode(body)
    if type(o) ~= "table" then
        ngx.log(ngx.WARN, "llm_translate: request body is not JSON; skipping")
        return
    end

    local ok, anthropic, meta = pcall(_M.openai_to_anthropic, o, cfg)
    if not ok then
        ngx.log(ngx.ERR, "llm_translate: request translation failed: ", tostring(anthropic))
        return
    end

    local new_body = cjson.encode(anthropic)
    ngx.req.set_body_data(new_body)
    ngx.req.set_uri(ANTHROPIC_PATH)            -- /v1/chat/completions -> /v1/messages

    -- Header hygiene for Anthropic: it authenticates with x-api-key
    -- (injected via the server's custom_headers), not Bearer.
    ngx.req.clear_header("Authorization")
    ngx.req.set_header("Content-Type", "application/json")
    ngx.req.set_header("Content-Length", #new_body)
    if not ngx.var.http_anthropic_version then
        ngx.req.set_header("anthropic-version",
            cfg.anthropic_version or DEFAULT_ANTHROPIC_VERSION)
    end

    ngx.ctx.llm = {
        active = true,
        stream = meta.stream,
        state = nil,           -- lazily created in body_filter for streams
        buf = nil,             -- accumulator for the non-streaming case
    }
end

--- header_filter phase: body length/shape changes, so drop content-length
--- and fix the content-type for the non-streaming JSON case.  Streaming
--- responses keep text/event-stream.
function _M.header_filter()
    local llm = ngx.ctx.llm
    if not llm or not llm.active then return end
    ngx.header["Content-Length"] = nil          -- re-chunked downstream
    if not llm.stream then
        ngx.header["Content-Type"] = "application/json"
    end
end

--- body_filter phase: rewrite the response body.  Streaming is translated
--- incrementally; non-streaming is buffered then converted on EOF.
function _M.body_filter()
    local llm = ngx.ctx.llm
    if not llm or not llm.active then return end

    local chunk = ngx.arg[1]
    local eof = ngx.arg[2]

    if llm.stream then
        if not llm.state then
            llm.state = _M.new_stream_state(ngx.time(), ngx.var.request_id)
        end
        local ok, out = pcall(_M.sse_step, llm.state, chunk or "", eof)
        ngx.arg[1] = (ok and out) or ""
        return
    end

    -- Non-streaming: accumulate, emit nothing until EOF, then convert.
    llm.buf = (llm.buf or "") .. (chunk or "")
    if not eof then
        ngx.arg[1] = ""
        return
    end
    local a = cjson_safe.decode(llm.buf)
    if type(a) ~= "table" then
        -- Couldn't parse (e.g. an upstream error body) — pass it through
        -- untouched rather than blanking the response.
        ngx.arg[1] = llm.buf
        return
    end
    local ok, openai = pcall(_M.anthropic_to_openai, a, ngx.time(), ngx.var.request_id)
    if ok and openai then
        ngx.arg[1] = cjson.encode(openai)
    else
        ngx.arg[1] = llm.buf
    end
end

return _M
