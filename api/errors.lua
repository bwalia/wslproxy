local Errors = {}

-- Main error throwing function with enhanced response
function Errors.throwError(message, statusCode, details)
    ngx.status = statusCode
    local errorResponse = {
        error = {
            message = message,
            status = statusCode,
            code = Errors.getErrorCode(statusCode)
        }
    }

    -- Add details if provided
    if details then
        errorResponse.error.details = details
    end

    -- Log the error for debugging
    ngx.log(ngx.ERR, "API Error: ", message, " | Status: ", statusCode)

    ngx.say(Cjson.encode(errorResponse))
    ngx.exit(statusCode)
end

-- Get error code name from status code
function Errors.getErrorCode(statusCode)
    local codes = {
        [400] = "BAD_REQUEST",
        [401] = "UNAUTHORIZED",
        [403] = "FORBIDDEN",
        [404] = "NOT_FOUND",
        [409] = "CONFLICT",
        [422] = "VALIDATION_ERROR",
        [500] = "INTERNAL_SERVER_ERROR",
        [502] = "BAD_GATEWAY",
        [503] = "SERVICE_UNAVAILABLE"
    }
    return codes[statusCode] or "ERROR"
end

-- Validation error helper
function Errors.validationError(field, message)
    Errors.throwError(
        "Validation failed for field: " .. field,
        ngx.HTTP_BAD_REQUEST,
        { field = field, reason = message }
    )
end

-- Missing required field error
function Errors.missingField(field)
    Errors.throwError(
        "Missing required field: " .. field,
        ngx.HTTP_BAD_REQUEST,
        { field = field, reason = "This field is required" }
    )
end

-- Invalid format error
function Errors.invalidFormat(field, expectedFormat)
    Errors.throwError(
        "Invalid format for field: " .. field,
        ngx.HTTP_BAD_REQUEST,
        { field = field, expected = expectedFormat }
    )
end

-- Resource not found error
function Errors.notFound(resourceType, resourceId)
    Errors.throwError(
        resourceType .. " not found: " .. (resourceId or "unknown"),
        ngx.HTTP_NOT_FOUND,
        { resource_type = resourceType, resource_id = resourceId }
    )
end

-- Conflict error (duplicate)
function Errors.conflict(message, existingResource)
    Errors.throwError(
        message,
        ngx.HTTP_CONFLICT,
        { existing_resource = existingResource }
    )
end

return Errors