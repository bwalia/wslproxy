
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
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AFCSLLP5/get_servers.png
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `none` | `Retrieves a list of all servers ` | `Status Code:- 200 OK, Returned a list of all servers data.` |



```http
  GET /api/servers/{id}
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05ACJ4NT29/get_single_server.png
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Retrieves information about a specific server ` | `Status Code:- 200 OK, Returned information about a specific server` |

```http
  POST /api/servers/
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05A8SE2VT8/create_server.png
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `Listen, server_name and config required in request body` | `Creates a new server. ` | `Status Code:- 200 OK, Created a new server` |

```http
  PUT /api/servers/{id}
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05B57PV988/update_server.png
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Updates an existing server. ` | `Status Code:- 200 OK, Updated an existing server` |

```http
  DELETE /api/servers/{id}
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AHV4RNSY/delete_server.png
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Delets an existing server. ` | `Status Code:- 200 OK, deleted an existing server` |

### Rules APIs

```http
  GET /api/rules
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AFGL88F4/get_rules.png
```

| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `none` | `Retrieves a list of all rules ` | `Status Code:- 200 OK, Returned a list of all rules data.` |



```http
  GET /api/rules/{id}
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05ACJ4F12R/get_single_rule.png
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Retrieves information about a specific rule ` | `Status Code:- 200 OK, Returned information about a specific rule` |

```http
  POST /api/rules
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AFCR3S1Z/create_rule.png
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `Name, version and priority required in request body` | `Creates a new rule. ` | `Status Code:- 200 OK, Created a new rule` |

```http
  PUT /api/rules/{id}
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AHV69E5S/update_rule.png
```

| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Updates an existing rule. ` | `Status Code:- 200 OK, Updated an existing rule` |

```http
  DELETE /api/rules/{id}
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AFCRP65R/delete-rule.png
```

| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Delets an existing rule. ` | `Status Code:- 200 OK, deleted an existing rule` |

### Using Rules with Servers
##### We can apply multiple rules for any server for allow or disallow requests from specific IPs. To do this we can follow these steps :-

#### 1. Create a server.
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AK6742AG/create_server_ui.png
```
#### 2. Create the Rule.
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AGK840MR/create_rule_ui.png
```
#### 3. Apply the rule to the server.


```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AK666S5S/add_rule_to_server.png
```
#### 4. Open the URL in browser.
```http
http://localhost:8080/router
```
```http
https://tenthmatrix.slack.com/files/U04UP2GT2HJ/F05AGK7QXMZ/browser_response.png
```









