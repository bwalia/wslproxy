# Server and Rules APIs

This README file provides an overview and instructions for using the Servers And Rules APIs.We can utilize this document to consume these APIs using a tool like Postman.

## Authentication

The API uses API keys for authentication. To authenticate your requests, include your API key in the Authorization header as follows:
Authorization: Bearer YOUR_API_KEY

Use this API to get your API key with valid credentials:

```http
/api/user/login
```

<img src="https://github.com/bwalia/wslproxy/blob/main/images/auth_api.png" alt="Get the Access token" width="600" height="350">

## Endpoints

The servers APIs provide the following endpoints:

```http
/api/servers
/api/servers/{id}
```

The rules APIs provide the following endpoints:

```http
api/rules
api/rules/{id}
```

## API Reference

### API reference overview can be found below. In order to understand the structure of the API we suggest you to visit our Swagger API reference guide and you can try it out in actual API env:

`Dev env swagger page`
`http://localhost:8081/swagger/`

`Test env swagger page`
`https://wslproxy.com/swagger/`

`Prod env swagger page`
`https://wslproxy.com/swagger/`

### Server APIs

#### 1. Retrieve all the Servers data.

```http
  GET /api/servers
```

| Payload | Description                        | Response                                                     |
| :------ | :--------------------------------- | :----------------------------------------------------------- |
| `none`  | `Retrieves a list of all servers ` | `Status Code:- 200 OK, Returned a list of all servers data.` |

<img src="https://github.com/bwalia/wslproxy/blob/main/images/GetAllServers.png" alt="Get servers" width="600" height="350">

#### 2. Retrieve information about a specific Server.

```http
  GET /api/servers/{id}
```

| Payload | Description                                      | Response                                                             |
| :------ | :----------------------------------------------- | :------------------------------------------------------------------- |
| `none`  | `Retrieves information about a specific server ` | `Status Code:- 200 OK, Returned information about a specific server` |

<img src="https://github.com/bwalia/wslproxy/blob/main/images/GetSingleServer.png" alt="Get single server" width="600" height="350">

#### 3. Create a new Server.

```http
  POST /api/servers/
```

| Payload                        | Description              | Response                                     |
| :----------------------------- | :----------------------- | :------------------------------------------- |
| `Payload data available below` | `Creates a new server. ` | `Status Code:- 200 OK, Created a new server` |

```http
  Payload - {"listens":[{"listen":"80"}],"server_name":"$SERVER_NAME","profile_id":"$PROFILE_ID","root":"/var/www/html","index":"index.html","access_log":"logs/access.log","error_log":"logs/error.log","locations":[],"custom_block":[],"config":"server {\n      listen 80;  # Listen on port (HTTP)\n      server_name $SERVER_NAME;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  "}
```

```http
  Note: Please change the variables according to the actual value.
```

<img src="https://github.com/bwalia/wslproxy/blob/main/images/CreateServer.png" alt="create server" width="600" height="350">

#### 4. Update a specific Server.

```http
  PUT /api/servers/{id}
```

| Payload                        | Description                    | Response                                           |
| :----------------------------- | :----------------------------- | :------------------------------------------------- |
| `Payload data available below` | `Updates an existing server. ` | `Status Code:- 200 OK, Updated an existing server` |

```http
  Payload - {"root":"/var/www/html","index":"index.html","access_log":"logs/access.log","profile_id":"$PROFILE_ID","error_log":"logs/error.log","locations":{},"custom_block":{},"config":"server {\n      listen 82;  # Listen on port (HTTP)\n      server_name $SERVER_NAME;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  ","created_at":1693901446,"id":"$ID","proxy_pass":"","listens":[{"listen":"82"}],"server_name":"$SERVER_NAME"}
```

```http
  Note: Please change the variables according to the actual value.
```

<img src="https://github.com/bwalia/wslproxy/blob/main/images/UpdateServer.png" alt="update server" width="600" height="350">

#### 5. Delete a specific Server.

```http
  DELETE /api/servers
```

| Payload                                                    | Description                   | Response                                           |
| :--------------------------------------------------------- | :---------------------------- | :------------------------------------------------- |
| `{"ids":{"ids":["$SERVER_ID"],"envProfile":"$PROFILE_ID"}` | `Delets an existing server. ` | `Status Code:- 200 OK, deleted an existing server` |

<img src="https://github.com/bwalia/wslproxy/blob/main/images/DeleteServer.png" alt="Delete server" width="600" height="350">

### Rules APIs

#### 1. Retrieve all the Rules data.

```http
  GET /api/rules
```

| Payload | Description                      | Response                                                   |
| :------ | :------------------------------- | :--------------------------------------------------------- |
| `none`  | `Retrieves a list of all rules ` | `Status Code:- 200 OK, Returned a list of all rules data.` |

<img src="https://github.com/bwalia/wslproxy/blob/main/images/GetAllRules.png" alt="Get rules" width="600" height="350">

#### 2. Retrieve information about a specific Rule.

```http
  GET /api/rules/{id}
```

| Payload | Description                                    | Response                                                           |
| :------ | :--------------------------------------------- | :----------------------------------------------------------------- |
| `none`  | `Retrieves information about a specific rule ` | `Status Code:- 200 OK, Returned information about a specific rule` |

<img src="https://github.com/bwalia/wslproxy/blob/main/images/GetSingleRule.png" alt="Get single rule" width="600" height="350">

#### 3. Create a new Rule.

```http
  POST /api/rules
```

| Payload                        | Description            | Response                                   |
| :----------------------------- | :--------------------- | :----------------------------------------- |
| `Payload data available below` | `Creates a new rule. ` | `Status Code:- 200 OK, Created a new rule` |

```http
  Payload - {"version":1,"priority":1,"match":{"rules":{"path_key":"starts_with","path":"$RULE_PATH","country_key":"equals","client_ip_key":"equals","jwt_token_validation":"equals"},"response":{"allow":true,"code":200,"message":"$RESPONSE_MSG"}},"name":"$RULE_NAME","profile_id":"$PROFILE_ID"}
```

```http
  Note: Please change the variables according to the actual value.
```

<img src="https://github.com/bwalia/wslproxy/blob/main/images/CreateRule.png" alt="Create rule" width="600" height="350">

#### 4. Update a specific Rule.

```http
  PUT /api/rules/{id}
```

| Payload                        | Description                  | Response                                         |
| :----------------------------- | :--------------------------- | :----------------------------------------------- |
| `Payload data available below` | `Updates an existing rule. ` | `Status Code:- 200 OK, Updated an existing rule` |

```http
  Payload - {"created_at":1693902225,"version":1,"profile_id":"$PROFILE_ID","match":{"rules":{"country_key":"equals","path":"$RULE_PATH","client_ip_key":"equals","jwt_token_validation":"equals","path_key":"starts_with"},"response":{"allow":true,"code":200,"message":"$RESPONSE_MSG"}},"name":"$RULE_NAME","priority":1,"id":"$RULE_ID"}
```

```http
  Note: Please change the variables according to the actual value.
```

<img src="https://github.com/bwalia/wslproxy/blob/main/images/UpdateRule.png" alt="Update rule" width="600" height="350">

#### 5. Delete a specific Rule.

```http
  DELETE /api/rules
```

| Payload                                                   | Description                 | Response                                         |
| :-------------------------------------------------------- | :-------------------------- | :----------------------------------------------- |
| `{"ids":{"ids":["$RULE_ID"],"envProfile":"$PROFILE_ID"}}` | `Delets an existing rule. ` | `Status Code:- 200 OK, deleted an existing rule` |

<img src="https://github.com/bwalia/wslproxy/blob/main/images/DeleteRule.png" alt="Delete rule" width="600" height="350">

### Using Rules with Servers

##### We can apply multiple rules for any server for allow or disallow specifc requests. To do this we can follow these steps :-

#### 1. Create a server.

<img src="https://github.com/bwalia/wslproxy/blob/main/images/CreateServer.png" alt="Create_server" width="500" height="300">

#### 2. Create the Rule.

<img src="https://github.com/bwalia/wslproxy/blob/main/images/CreateRule.png" alt="Create_rule_UI" width="500" height="300">

#### 3. Apply the rule to the server.

<img src="https://github.com/bwalia/wslproxy/blob/main/images/AddRulesToServer.png" alt="Add_rule_to Server" width="500" height="300">

#### 4. Call the API to handle profiles.

<img src="https://github.com/bwalia/wslproxy/blob/main/images/Handle-profile-API.png" alt="Handle profile API" width="500" height="300">

#### 5. Check the response.

```http
GET   /(path)
```

<img src="https://github.com/bwalia/wslproxy/blob/main/images/RulesResponse.png" alt="Browser response" width="500" height="300">
