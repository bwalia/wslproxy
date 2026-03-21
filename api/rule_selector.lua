-- rule_selector.lua
-- Select the winning rule from evaluated candidates.
-- Deterministic: sort by priority > path specificity > condition count > rule_id

local M = {}

--- Check if an evaluated rule passes based on its condition mode.
---
--- AND mode (default): all conditions must pass
--- OR mode: at least one condition must pass
---
--- @param result table  Evaluation result from rule_matcher.evaluate()
--- @return bool
local function rule_passes(result)
    if result.condition_mode == "or" then
        return result.any_pass
    end
    -- Default: AND — all conditions must pass
    return result.all_pass
end

--- Compare two evaluated rules for sorting.
--- Higher priority wins. On tie: higher path specificity wins.
--- On tie: more conditions wins. Final tie-break: lexicographic rule_id.
---
--- @param a table  Evaluation result
--- @param b table  Evaluation result
--- @return bool  true if a should come before b
local function compare_rules(a, b)
    -- 1. Higher priority wins
    if a.priority ~= b.priority then
        return a.priority > b.priority
    end
    -- 2. Higher path specificity wins (longer/more specific path match)
    if a.path_specificity ~= b.path_specificity then
        return a.path_specificity > b.path_specificity
    end
    -- 3. More conditions = more specific rule
    if a.condition_count ~= b.condition_count then
        return a.condition_count > b.condition_count
    end
    -- 4. Deterministic tie-break: lexicographic rule_id
    return a.rule_id < b.rule_id
end

--- Select the winning rule from a list of evaluated rules.
---
--- 1. Filter to passing rules (respecting AND/OR mode)
--- 2. Sort deterministically by priority + specificity
--- 3. Return the winner (first after sort)
---
--- @param evaluated_rules table  List of evaluation results from rule_matcher.evaluate()
--- @return table|nil  The winning evaluation result, or nil if no rule matches
function M.select(evaluated_rules)
    if not evaluated_rules or #evaluated_rules == 0 then
        return nil
    end

    -- Filter to passing rules
    local passing = {}
    for _, result in ipairs(evaluated_rules) do
        if rule_passes(result) then
            table.insert(passing, result)
        end
    end

    if #passing == 0 then
        return nil
    end

    -- Sort deterministically
    table.sort(passing, compare_rules)

    -- Winner is the first element
    return passing[1]
end

--- Get the first non-nil error message from evaluated rules.
--- Used to show a custom error page when no rule matches.
---
--- @param evaluated_rules table  List of evaluation results
--- @return string|nil  The first message found, or nil
function M.get_fallback_message(evaluated_rules)
    if not evaluated_rules then return nil end
    for _, result in ipairs(evaluated_rules) do
        if result.message and result.message ~= "" and result.message ~= "null" then
            return result.message
        end
    end
    return nil
end

return M
