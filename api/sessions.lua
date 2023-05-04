local json = require("cjson")
local _Sessions = {}

function _Sessions.getSessions()
    local data = {
        data = {

            {
                createdAt = "2023-04-27T23:30:26.811Z",
                name = "Tiffany Hintz",
                email = "Miracle.OConner13@example.com",
                id = "1"
            },
            {
                createdAt = "2023-04-28T00:54:15.608Z",
                name = "Lela O'Reilly Sr.",
                email = "Joelle17@example.org",
                id = "2"
            },
            {
                createdAt = "2023-04-27T21:13:22.090Z",
                name = "Norma Jakubowski",
                email = "Timmothy.Ziemann45@example.net",
                id = "3"
            },
            {
                createdAt = "2023-04-27T20:12:16.963Z",
                name = "Mr. Morris Erdman",
                email = "Verdie.Goodwin@example.net",
                id = "4"
            },
            {
                createdAt = "2023-04-28T06:57:21.073Z",
                name = "Ronnie Krajcik",
                email = "Creola41@example.org",
                id = "5"
            },
            {
                createdAt = "2023-04-27T19:20:48.025Z",
                name = "Sonja Lindgren",
                email = "Ignatius.Herman58@example.com",
                id = "6"
            },
            {
                createdAt = "2023-04-27T18:18:47.774Z",
                name = "Billy Hartmann",
                email = "Cornell84@example.net",
                id = "7"
            },
            {
                createdAt = "2023-04-28T02:08:12.647Z",
                name = "Candace Sporer",
                email = "Owen_Terry@example.net",
                id = "8"
            },
            {
                createdAt = "2023-04-28T02:29:14.077Z",
                name = "Roosevelt Connelly",
                email = "Ciara84@example.net",
                id = "9"
            },
            {
                createdAt = "2023-04-28T02:39:13.251Z",
                name = "Dewey Wilkinson",
                email = "Theo33@example.net",
                id = "10"
            },
            {
                createdAt = "2023-04-28T08:16:16.925Z",
                name = "Alex Moore",
                email = "Rosa_Jast81@example.com",
                id = "11"
            },
            {
                createdAt = "2023-04-27T09:56:39.429Z",
                name = "Harold Pouros",
                email = "Rachel.Hartmann@example.net",
                id = "12"
            },
            {
                createdAt = "2023-04-27T22:25:01.699Z",
                name = "Duane Cruickshank",
                email = "Tad.Kub74@example.net",
                id = "13"
            },
            {
                createdAt = "2023-04-28T07:45:29.409Z",
                name = "Tracy Zemlak",
                email = "Susie_Dibbert@example.net",
                id = "14"
            },
            {
                createdAt = "2023-04-27T21:01:10.172Z",
                name = "Miss Alonzo Shields",
                email = "Ruthie.Kessler39@example.net",
                id = "15"
            },
            {
                createdAt = "2023-04-27T09:02:19.195Z",
                name = "Vera Maggio",
                email = "Ebony_Greenholt25@example.net",
                id = "16"
            },
            {
                createdAt = "2023-04-27T17:15:32.444Z",
                name = "Marie Stracke",
                email = "Leora21@example.org",
                id = "17"
            },
            {
                createdAt = "2023-04-28T03:25:19.186Z",
                name = "Van Torphy",
                email = "Rick.Cartwright93@example.net",
                id = "18"
            },
            {
                createdAt = "2023-04-28T06:05:13.712Z",
                name = "Dixie Grant",
                email = "Sheridan_Howell75@example.net",
                id = "19"
            },
            {
                createdAt = "2023-04-28T05:15:17.839Z",
                name = "Cody Ernser",
                email = "Leonora.Macejkovic26@example.com",
                id = "20"
            },
            {
                createdAt = "2023-04-27T09:12:18.100Z",
                name = "Alfonso Kling",
                email = "Jessica.Gleason95@example.org",
                id = "21"
            },
            {
                createdAt = "2023-04-27T15:01:18.476Z",
                name = "Theodore Upton III",
                email = "Chadrick.Cruickshank38@example.net",
                id = "22"
            },
            {
                createdAt = "2023-04-28T00:16:51.198Z",
                name = "Ted Corwin",
                email = "Graciela85@example.com",
                id = "23"
            },
            {
                createdAt = "2023-04-27T09:50:32.795Z",
                name = "Nadine Schulist Sr.",
                email = "Hunter_Ernser@example.com",
                id = "24"
            },
            {
                createdAt = "2023-04-27T13:31:33.465Z",
                name = "Harold Witting",
                email = "Burley.Berge24@example.net",
                id = "25"
            },
            {
                createdAt = "2023-04-27T17:28:41.451Z",
                name = "Sonja Kessler",
                email = "Jeffry.Bergnaum@example.org",
                id = "26"
            },
            {
                createdAt = "2023-04-28T01:34:20.627Z",
                name = "Dominic Goldner",
                email = "Cornell_Will76@example.com",
                id = "27"
            }
        },
        total = 27
    }

    -- Encode the table as a JSON string
    local json_str = json.encode(data)
    -- Return the JSON string
    return json_str
end

return _Sessions
