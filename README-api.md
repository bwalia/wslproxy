
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


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/get_servers.png" alt="Get servers" width="600" height="350">


```http
  GET /api/servers/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Retrieves information about a specific server ` | `Status Code:- 200 OK, Returned information about a specific server` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/get_single_server.png" alt="Get single server" width="600" height="350">


```http
  POST /api/servers/
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `Listen, server_name and config required in request body` | `Creates a new server. ` | `Status Code:- 200 OK, Created a new server` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/create_server.png" alt="create server" width="600" height="350">


```http
  PUT /api/servers/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Updates an existing server. ` | `Status Code:- 200 OK, Updated an existing server` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/update_server.png" alt="update server" width="600" height="350">


```http
  DELETE /api/servers/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Delets an existing server. ` | `Status Code:- 200 OK, deleted an existing server` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/delete_server.png" alt="Delete server" width="600" height="350">



### Rules APIs

```http
  GET /api/rules
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `none` | `Retrieves a list of all rules ` | `Status Code:- 200 OK, Returned a list of all rules data.` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/get_rules.png" alt="Get rules" width="600" height="350">


```http
  GET /api/rules/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Retrieves information about a specific rule ` | `Status Code:- 200 OK, Returned information about a specific rule` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/get_single_rule.png" alt="Get single rule" width="600" height="350">


```http
  POST /api/rules
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `Name, version and priority required in request body` | `Creates a new rule. ` | `Status Code:- 200 OK, Created a new rule` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/create_rule.png" alt="Create rule" width="600" height="350">


```http
  PUT /api/rules/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Updates an existing rule. ` | `Status Code:- 200 OK, Updated an existing rule` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/update_rule.png" alt="Update rule" width="600" height="350">


```http
  DELETE /api/rules/{id}
```
| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Delets an existing rule. ` | `Status Code:- 200 OK, deleted an existing rule` |


<img src="https://github.com/bwalia/whitefalcon/blob/main/images/delete-rule.png" alt="Delete rule" width="600" height="350">


### Using Rules with Servers
##### We can apply multiple rules for any server for allow or disallow requests from specific IPs. To do this we can follow these steps :-

#### 1. Create a server.
<img src="https://github.com/bwalia/whitefalcon/blob/main/images/Create_server_UI.png" alt="Create_server_UI" width="500" height="300">

#### 2. Create the Rule.
<img src="https://github.com/bwalia/whitefalcon/blob/main/images/Create_rule_UI.png" alt="Create_rule_UI" width="500" height="300">

#### 3. Apply the rule to the server.
<img src="https://github.com/bwalia/whitefalcon/blob/main/images/add_rule_to_server.png" alt="Add_rule_to Server" width="500" height="300">

#### 4. Open the URL in browser to check the response.
```http
http://localhost:8080/
```
<img src="https://github.com/bwalia/whitefalcon/blob/main/images/browser_response.png" alt="Browser response" width="500" height="300">
