-- functions
-- Read body being passed
-- Required for ngx.req.get_body_data()
-- ngx.req.read_body();
-- Parser for sending JSON back to the client
local cjson = require("cjson")
-- local body = ngx.req.get_body_data() ==


function os.capture(cmd, raw) -- this function cannot be local
    local handle = assert(io.popen(cmd, 'r'))
    local output = assert(handle:read('*a'))
    
    handle:close()
    
    if raw then 
        return output 
    end
   
    output = string.gsub(
        string.gsub(
            string.gsub(output, '^%s+', ''), 
            '%s+$', 
            ''
        ), 
        '[\n\r]+',
        ''
    )
   
   return output
end


local function run_command(cmd)
    result = os.execute(cmd)
                 return result
    end

    

local function run_command_output(cmd)
    result = os.capture(cmd)
    --result = str.replace(/\n/g, '');
    return result
    end
    
    local accessKeyId = tostring(os.getenv('AWS_ACCESS_KEY_ID'))
    local accessKeySecret = tostring(os.getenv('AWS_SECRET_ACCESS_KEY'))
    --ngx.say('accessKeyId: '.. accessKeyId ..', accessKeySecret: '..accessKeySecret)
    --aws s3 ls s3://bswtest --output json
                ngx.print(cjson.encode(
                    {
                        s3objects=run_command_output('aws s3api list-objects --bucket bswtest --query "Contents[].{Key: Key, Size: Size}"'),
                    }
                ))
    