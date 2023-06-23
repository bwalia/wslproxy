
# Server and Rules APIs
This README file provides an overview and instructions for using the Servers And Rules APIs.We can utilize this document to consume these APIs using a tool like Postman.

## Authentication
The API uses API keys for authentication. To authenticate your requests, include your API key in the Authorization header as follows:
Authorization: Bearer YOUR_API_KEY

Use this API to get your API key with valid credentials: 
```http
/api/user/login
```
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

### Server APIs

```http 
  GET /api/servers
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `none` | `Retrieves a list of all servers ` | `Status Code:- 200 OK, Returned a list of all servers data.` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/GetAllServers.png" alt="Get servers" width="600" height="350">


```http
  GET /api/servers/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Retrieves information about a specific server ` | `Status Code:- 200 OK, Returned information about a specific server` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/GetSingleServer.png" alt="Get single server" width="600" height="350">


```http
  POST /api/servers/
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `Listen, server_name required in request body` | `Creates a new server. ` | `Status Code:- 200 OK, Created a new server` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/CreateServer.png" alt="create server" width="600" height="350">


```http
  PUT /api/servers/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Updates an existing server. ` | `Status Code:- 200 OK, Updated an existing server` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/UpdateServer.png" alt="update server" width="600" height="350">


```http
  DELETE /api/servers/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Delets an existing server. ` | `Status Code:- 200 OK, deleted an existing server` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/DeleteServer.png" alt="Delete server" width="600" height="350">



### Rules APIs

```http
  GET /api/rules
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `none` | `Retrieves a list of all rules ` | `Status Code:- 200 OK, Returned a list of all rules data.` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/GetAllRules.png" alt="Get rules" width="600" height="350">


```http
  GET /api/rules/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Retrieves information about a specific rule ` | `Status Code:- 200 OK, Returned information about a specific rule` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/GetSingleRule.png" alt="Get single rule" width="600" height="350">


```http
  POST /api/rules
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `Name, version and priority required in request body` | `Creates a new rule. ` | `Status Code:- 200 OK, Created a new rule` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/CreateRule.png" alt="Create rule" width="600" height="350">


```http
  PUT /api/rules/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Updates an existing rule. ` | `Status Code:- 200 OK, Updated an existing rule` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/UpdateRules.png" alt="Update rule" width="600" height="350">


```http
  DELETE /api/rules/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Delets an existing rule. ` | `Status Code:- 200 OK, deleted an existing rule` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/DeleteRules.png" alt="Delete rule" width="600" height="350">


### Using Rules with Servers
##### We can apply multiple rules for any server for allow or disallow requests from specific IPs. To do this we can follow these steps :-

#### 1. Create a server.
<img src="https://github.com/bwalia/whitefalcon/blob/main/images/CreateServer.png" alt="Create_server" width="500" height="300">

#### 2. Create the Rule.
<img src="https://github.com/bwalia/whitefalcon/blob/main/images/CreateRule.png" alt="Create_rule_UI" width="500" height="300">

#### 3. Apply the rule to the server.
<img src="https://github.com/bwalia/whitefalcon/blob/main/images/AddingRuleToServer.png" alt="Add_rule_to Server" width="500" height="300">

#### 4. Check the response.
```http
GET   /(path)
```
<img src="https://github.com/bwalia/whitefalcon/blob/main/images/RulesResponse.png" alt="Browser response" width="500" height="300">
