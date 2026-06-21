-- Standalone test for the pure core of llm_translator (no ngx needed).
-- Run with:  resty api/test_llm_translator.lua   (or on a host with cjson)
package.path = "/tmp/?.lua;./api/?.lua;" .. package.path
local cjson = require("cjson")
local T = require("llm_translator")

local failures = 0
local function check(name, cond)
    if cond then
        print("  ok   - " .. name)
    else
        print("  FAIL - " .. name)
        failures = failures + 1
    end
end

-- 1) request: OpenAI -> Anthropic
do
    local openai = {
        model = "gpt-4o",
        messages = {
            { role = "system", content = "You are terse." },
            { role = "user", content = "Hi" },
        },
        temperature = 0.5,
        stop = "STOP",
        stream = true,
    }
    local a, meta = T.openai_to_anthropic(openai, {
        model_map = { ["gpt-4o"] = "claude-opus-4-8" },
    })
    check("model mapped", a.model == "claude-opus-4-8")
    check("system extracted", a.system == "You are terse.")
    check("system removed from messages", #a.messages == 1 and a.messages[1].role == "user")
    check("max_tokens defaulted", a.max_tokens == 4096)
    check("stop -> stop_sequences", a.stop_sequences[1] == "STOP")
    check("temperature passthrough", a.temperature == 0.5)
    check("stream flag", a.stream == true and meta.stream == true)
end

-- 2) non-streaming response: Anthropic -> OpenAI
do
    local anth = {
        id = "msg_123",
        model = "claude-opus-4-8",
        content = { { type = "text", text = "Hello" }, { type = "text", text = " world" } },
        stop_reason = "end_turn",
        usage = { input_tokens = 10, output_tokens = 5 },
    }
    local o = T.anthropic_to_openai(anth, 1700000000, "req1")
    check("object type", o.object == "chat.completion")
    check("content joined", o.choices[1].message.content == "Hello world")
    check("finish_reason mapped", o.choices[1].finish_reason == "stop")
    check("usage prompt", o.usage.prompt_tokens == 10)
    check("usage total", o.usage.total_tokens == 15)
end

-- 3) streaming SSE: Anthropic events (fed in awkward chunk splits) -> OpenAI
do
    local stream =
        "event: message_start\n" ..
        'data: {"type":"message_start","message":{"id":"msg_9","model":"claude-opus-4-8"}}\n\n' ..
        "event: content_block_delta\n" ..
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}\n\n' ..
        "event: content_block_delta\n" ..
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}\n\n' ..
        "event: message_delta\n" ..
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n' ..
        "event: message_stop\n" ..
        'data: {"type":"message_stop"}\n\n'

    local st = T.new_stream_state(1700000000, "req2")
    local out = {}
    -- Feed in 7-byte slices to exercise event-boundary buffering.
    local i = 1
    while i <= #stream do
        local piece = stream:sub(i, i + 6)
        out[#out + 1] = T.sse_step(st, piece, false)
        i = i + 7
    end
    out[#out + 1] = T.sse_step(st, "", true)
    local result = table.concat(out)

    -- Parse the emitted OpenAI SSE back out.
    local contents, sawRole, sawDone, finish = {}, false, false, nil
    for line in (result):gmatch("data: ([^\n]*)\n") do
        if line == "[DONE]" then
            sawDone = true
        else
            local c = cjson.decode(line)
            local d = c.choices[1].delta
            if d.role == "assistant" then sawRole = true end
            if d.content then contents[#contents + 1] = d.content end
            if c.choices[1].finish_reason then finish = c.choices[1].finish_reason end
        end
    end
    check("stream: role chunk first", sawRole)
    check("stream: text reassembled", table.concat(contents) == "Hello")
    check("stream: finish_reason stop", finish == "stop")
    check("stream: terminated with [DONE]", sawDone)
    check("stream: idempotent after done", T.sse_step(st, "x", false) == "")
end

if failures == 0 then
    print("ALL PASS")
else
    print(failures .. " FAILURE(S)")
    os.exit(1)
end
