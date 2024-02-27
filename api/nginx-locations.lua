location /clear_cache {
    content_by_lua_block {
        //file creation
        local f = assert(io.open("/newFile.txt", 'wb')) -- open in "binary" mode
        f:write(body)
        f:close()

        //Remove file
        os.remove("/newFile.txt")
    }
}
