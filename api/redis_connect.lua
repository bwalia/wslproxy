local cjson = Cjson
local resty_md5 = require "resty.md5"

function md5_convert(str)
    local md5 = resty_md5:new()
    if not md5 then
        return false
    end

    local ok = md5:update(str)
    if not ok then
        return false
    end

    local digest = md5:final()
    local str = require "resty.string"
    return str.to_hex(digest)
    
end

txt = ''
depth = 0

function tablelength(T)
    local count = 0
    for _ in pairs(T) do count = count + 1 end
    return count
  end

function sorting_fun(json_obj,k,space)
    for i = 1, tablelength(json_obj) do
        local objj = "lua_red_"..tostring(i)
        if json_obj[objj]~= nil then
            if space==true then depth = depth + 1 end
            nested_fun(json_obj[objj],k,space) 
            if space==true then depth = depth - 1 end
        else 
            depth = depth + 1
            nested_fun(json_obj,k,space) 
            depth = depth - 1
            break 
        end
    end
end

function log_format(arr)
    txt = txt .. "   log_format "
    for k, v in pairs(arr) do 
        txt = txt .. "    " .. tostring(v) .. "\n"
    end
end

function nested_fun(json_obj,nval,space)
    -- local mytxt = ""
    -- string.rep("A", 200)
    for k,v in next,json_obj do 
        if type(k) == "number" then k = "" end       
        if nval == "server" then k = "server " end       
        if type(v) == 'table' then
            if k == 'upstream big_server_com' and nval == 'http' then txt = txt .. "  " end             
            
            if k ~= 'include' and k ~= 'server' and k ~= 'log_format' then 
                txt = txt .. string.rep(" ",depth)
                txt = txt ..k .. " { \n" 
            end


            if k == 'log_format' then log_format(v,k) elseif tablelength(v)>1 then 
                sorting_fun(v,k,true)           
            else
                depth = depth + 1
                nested_fun(v,k,true) 
                depth = depth - 1
            end

            if k == 'upstream big_server_com' and nval == 'http' then txt = txt .. "  " end             


            if k ~= 'include' and k ~= 'server' and k ~= 'log_format' then 
                txt = txt .. string.rep(" ",depth)
                txt = txt .. "}\n" 
            end

        else
            if nval == 'http' then txt = txt .. "  " end            
            if nval == 'upstream big_server_com' then txt = txt .. "  " end             

            if k ~= 'include' and k ~= 'server' and k ~= 'log_format' and space == true then 
                txt = txt .. string.rep(" ",depth) .. k .. " " .. tostring(v) ..";\n"
            else
                txt = txt .. k .. " " .. tostring(v) ..";\n"
            end
        end
    end
    -- return mytxt
end

data = ""
local redis = require("resty.redis")
local red = redis:new()

-- red:set_timeouts(1000, 1000, 1000)
local ok = red:connect("redis", 6379)

if not ok then
    ngx.say("failed to connect..")
end


local json_str
local file, err = io.open("/usr/local/openresty/nginx/html/data/nginx_conf.json")
if file == nil then
    local data = {
        error = err,
        message = "data not found!!",
        status = false
    }
    -- Encode the table as a JSON string
    json_str = cjson.encode(data)
else
    local jsonString = file:read "*a"
    file:close()
    local md5_content = md5_convert(jsonString)
    if md5_content==false then 
        ngx.say('Md5 not working')
    end
    

    local check_exist, err = red:get("nginx_file")
    local md5_exist, err = red:hget("nginx_file","md5")
    -- ngx.say(check_exist)
    if check_exist == ngx.null then
        -- ngx.say("failed to set value in nginx_file: ", err)
        local redis_json = {
            md5 = md5_content,
            json = jsonString
        }
        local inserted, err = red:hmset("nginx_file", redis_json)
        if not inserted then
            ngx.say("failed to set value in nginx_file: ", err)
            return
        else
            ngx.say("New record inserted successfully")
            -- return
        end
        return
    elseif md5_exist ~= md5_content then
        local redis_json = {
            md5 = md5_content,
            json = jsonString
        }
        local updated, err = red:hmset("nginx_file", redis_json)
        if not updated then
            ngx.say("failed to set value in nginx_file: ", err)
            --return
        else
            ngx.say("Record updated successfully")
            -- return
        end
    else
        ngx.say('No change in file')
        --return
    end

    local wfile, werr = io.open("/tmp/nginx_my.conf", "w")
    if wfile == nil then
        ngx.say('File not written:'..werr)
        return
    end

    local t = cjson.decode(tostring(jsonString))
    sorting_fun(t,'',false)
    wfile:write(txt)
    wfile:close()

    local data = {
        data = t,
        message = "File created successfully!!",
        status = true
    }
    -- Encode the table as a JSON string
    json_str = cjson.encode(data)
    -- Return the JSON string
end

ngx.say(json_str)
-- ok, err = red:set("dogyyyyy", "an animal")
-- if not ok then
--     ngx.say("failed to set dog: ", err)
--     return
-- end
-- ngx.say(data)


-- local _Response = {}
-- function _Response.CreateConf()
--     local json_str
--     local json_data = {
--         data = data,
--         message = "data not found!!",
--         status = false
--     }
--     -- Encode the table as a JSON string
--     json_str = cjson.encode(json_data)
--     return json_str
-- end
-- return _Response