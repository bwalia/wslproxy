-- Shared list filter → sort → paginate used by every storage driver.
-- Extracted from api.lua listPaginationLocal so disk/redis/pgsql lists
-- return identical shapes for the same query params.

local cjson = Cjson or require("cjson")

local _M = {}

local function to_number_or_nil(v)
    if v == nil then
        return nil
    end
    return tonumber(v)
end

-- Returns (page, total) where page is the slice for pagination.page/perPage.
function _M.paginate(records, filter, sort, pagination)
    filter = filter or {}
    sort = sort or {}
    pagination = pagination or {}

    local filtered = {}
    for _, rec in ipairs(records or {}) do
        local ok = true
        for k, v in pairs(filter) do
            if k ~= "q" and rec[k] ~= nil and tostring(rec[k]) ~= tostring(v) then
                ok = false
                break
            end
        end
        if ok and filter.q and filter.q ~= "" then
            local q = string.lower(tostring(filter.q))
            local blob
            local enc_ok, encoded = pcall(cjson.encode, rec)
            if enc_ok then
                blob = string.lower(encoded)
            else
                blob = ""
            end
            if not string.find(blob, q, 1, true) then
                ok = false
            end
        end
        if ok then
            filtered[#filtered + 1] = rec
        end
    end

    local field = sort.field or "id"
    local order = string.upper(tostring(sort.order or "ASC"))
    table.sort(filtered, function(a, b)
        local av, bv = a[field], b[field]
        if av == nil then av = "" end
        if bv == nil then bv = "" end
        if type(av) == "number" and type(bv) == "number" then
            if order == "DESC" then
                return av > bv
            end
            return av < bv
        end
        av, bv = tostring(av), tostring(bv)
        if order == "DESC" then
            return av > bv
        end
        return av < bv
    end)

    local total = #filtered
    local page_size = to_number_or_nil(pagination.perPage)
    local page_number = to_number_or_nil(pagination.page)
    if not page_size or not page_number then
        return filtered, total
    end
    if page_size < 1 then page_size = 10 end
    if page_number < 1 then page_number = 1 end
    local start_index = (page_number - 1) * page_size + 1
    local end_index = math.min(start_index + page_size - 1, total)
    local page = {}
    if start_index <= total then
        for i = start_index, end_index do
            page[#page + 1] = filtered[i]
        end
    end
    return page, total
end

return _M
