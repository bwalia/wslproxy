
# Server and Rules APIs
This README file provides an overview and instructions for using the Servers And Rules APIs.

## Authentication
The API uses API keys for authentication. To authenticate your requests, include your API key in the Authorization header as follows:
Authorization: Bearer YOUR_API_KEY

Use this API to get your API key with valid credentials: 
```http
http://localhost:8080/api/user/login
```
## Endpoints
The servers APIs provide the following endpoints:
```http
api/servers
api/servers/{uuid}
```

The rules APIs provide the following endpoints:
```http
api/rules
api/rules/{uuid}
```

## API Reference

### Server APIs

```http
  GET /api/servers
```

| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `none` | `Retrieves a list of all servers ` | `Status Code:- 200 OK, Returns a list of all servers data.` |



```http
  GET /api/servers/{id}
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Retrieves information about a specific server ` | `Status Code:- 200 OK, Retrieves information about a specific server` |

```http
  POST /api/servers/
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `Listen, server_name and config required` | `Creates a new server. ` | `Status Code:- 200 OK, Created a new server` |

```http
  PUT /api/servers/{id}
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Updates an existing server. ` | `Status Code:- 200 OK, Updated a existing server` |

```http
  DELETE /api/servers/{id}
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Delets an existing server. ` | `Status Code:- 200 OK, deleted a existing server` |

### Rules APIs

```http
  GET /api/rules
```

| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `none` | `Retrieves a list of all rules ` | `Status Code:- 200 OK, Returns a list of all rules data.` |



```http
  GET /api/rules/{id}
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Retrieves information about a specific rule ` | `Status Code:- 200 OK, Retrieves information about a specific rule` |

```http
  POST /api/rules
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `Name, version and priority required` | `Creates a new rule. ` | `Status Code:- 200 OK, Created a new rule` |

```http
  PUT /api/rules/{id}
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Updates an existing rule. ` | `Status Code:- 200 OK, Updated a existing rule` |

```http
  DELETE /api/rules/{id}
```


| Parameter | Description     | Response                |
| :-------- | :------- | :------------------------- |
| `id` | `Delets an existing rule. ` | `Status Code:- 200 OK, deleted a existing rule` |










