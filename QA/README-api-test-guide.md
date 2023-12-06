# API Testing with Golang
## Introduction

This document provides guidelines and instructions for the API test suite execution. We use Golang's testing framework for API automation and leverage GitHub Actions to execute test cases on a scheduled or trigger-based basis.

## Tools and Technologies Used

- **Golang**: We utilize Golang's testing framework for API automation.
- **GitHub Actions**: We use GitHub Actions to execute test cases in scheduled or trigger-based events.

## Test Scenarios and Test Cases
### Test 1: Health Check API test
- **Description**: Verify the health check API and validate the outputs.

### Test 2: Login API
- **Description**: Ensure the login API is secure by testing it with different credential combinations.

### Test 3: Access Authentication
- **Description**: Ensure APIs have no broken authentication by testing various access token inputs.

### Test 4: Host Override
- **Description**: Verify that the request is overriding the proxy host by examining the response headers.

### Test 5: Client IP Match Rules
- **Description**: Verify client IP-based rules with valid and invalid Client IP and country input combinations.

### Test 6: Path-Based Rules
- **Description**: Verify path match rules with valid and invalid test scenarios based on path match conditions (i) starts_with, (ii) ends_with, (iii) equals.

### Test 7: Priority test for multi rules
- **Description**: Verify that higher-priority rules take precedence over lower-priority rules.

### Test 8: Redirection-Based Rules
- **Description**: Confirm that rules redirect correctly to the Target URI with the proper status codes (305 for proxy pass, 302 for temporary redirection, and 301 for permanent redirection).

### Test 9: Response Message Verification
- **Description**: Verify that the response message body works properly with base64-encoded values and returns the expected results, especially for HTML values.

### Test 10: Token Validation-Based Rules
- **Description**: Verify the functionality of token validation in the rules.

### Test 11: API CRUD Functions
- **Description**: Verify each API for rules and servers. Execute tests in a 360-degree view circle from creation to deletion using each related API in between.

## Test Data and Environment Variables
### GitHub Secrets

We use the following static environment variables stored in GitHub Secrets for test workflow execution:

- `LOGIN_EMAIL`: An authorized user's email ID.
- `LOGIN_PASSWORD`: The valid password.
- `JWT_TOKEN_KEY`: The authorization key used for the sample node app.
- `QA_EXPIRED_JWT_TOKEN_KEY`: An expired access token for test API access only, verifying the use of an active access token for API access.

### Workflow Environments
We use the following dynamic variables, which may vary for each environment:

- `TARGET_HOST`: The base URL of the environment.
- `SERVER_NAME`: The server name used to test the rules.
- `SERVER_ID_QA`: The ID of the server used for testing.
- `TARGET_ENV`: Target environment chosen from input options when executing the workflow.
- `NODE_APP_IP`: The specific IP addresss where the sample app is running to help verifying autorization based rules.
- `DELETE_TEST_DATA`: true or false to indicate whether to delete the created rules and server during workflow execution, choosen from input options when executing the workflow.

## Test Execution
### Execute Locally
To execute tests locally, follow these steps:

1. Clone the repository.
2. Export the required environment variables.
3. Run the following command:

   ```bash
   go test -v
   ```
  ### Execute Using GitHub Actions

You can trigger the test execution using GitHub Actions by following this [workflow_link](https://github.com/bwalia/whitefalcon/actions/workflows/whitefalcon-api-test.yml). Use the `workflow_dispatch` event to manually trigger the workflow. Before execution, select the target environment and choose whether to delete the rules after execution based on your test preferences. Then, click "Run workflow."

## Test Results
- **Pass**: Expected result when everything is functioning as intended.
- **Fail**: Test execution fails if unexpected issues occur.


### List of the available Environments
#### `Int`: http://api.int.whitefalcon.io/
##### Sub-environments of `int` are-
- int2 : http://api.int2.whitefalcon.io/
- int6 : http://api.int6.whitefalcon.io/
- int10 : http://api.int10.whitefalcon.io/

#### `test`: http://api.test.whitefalcon.io/
##### Sub-environments of `test` are-
- test2 : http://api.test2.whitefalcon.io/
- test6 : http://api.test6.whitefalcon.io/
