# UI Testing with Cypress
## Introduction

The purpose of this document is to provide the guidelines and instruction to conduct the UI test with Cypress.

## Tools and Technologies Used

- **Cypress**: We are using UI testing tool Cypress for the UI automation.
- **Docker compose**: We are using docker compose to work with multiple browsers.
- **Github Actions**: we are using Github actions to execute all these test cases in scheduled or trigger based events.

## Test Scenarios and Test Cases
### Test 1: Login Verification
- **Description**: Verifying login with valid credentials, invalid email and valid password, valid email and invalid password, valid email and empty password, empty email and valid password, empty email and empty password, invalid email format in email field and then verifying the logout functionality.

### Test 2: Creating profile for the tests
- **Description**: Creating a dedicated profile for the test data named as ‘qa_test’.

### Test 3: Creating a new user
- **Description**: Verifying the user creation in Users module.

### Test 4: Client IP based rules validation
- **Description**: Verifying the test with both positive and negative scenarios with valid and invalid test IPs and the expected results.

### Test 5: Rule prioritization in multi-rules
- **Description**: Verifying that the higher priority rule leads over the low priority rules.

### Test 6: Redirection based rules validation
- **Description**: Verifying that the rules are redirecting properly to the Target URI with the status code 305 for proxy pass, 302 for temporary redirection and 301 for permanent redirection.

### Test 7: Token validation based rules
- **Description**: Verifying the feature of token validation in the rules module.

### Test 8: Path based rule validation
- **Description**: Verifying the rules for the path match based on the path match conditions- (i) starts_with (ii) ends_with (iii) equals. 

### Test 9: Export, Import and Search filter
- **Description**: Verifying the feature of Export and Import rules and server and the search filter in the rules module.

## Test Data and Environment Variables
### GitHub Secrets

We are using 3 static environment variable which is stored in the github secrets for the test workflow execution and those variable are:-
- `LOGIN_EMAIL`: An authorized user's email ID.
- `LOGIN_PASSWORD`: The valid password.
- `JWT_TOKEN_KEY`: The authorization key used for the sample node app.

### Other vars
We only need one dynamic variable ‘TARGET_ENV’ which is the Target environment. All other variables will be handled according to the TARGET_ENV in qa-bootstrap-cypress.sh
These required variables are:-
- `BASE_URL`: The base URL of the environment.
- `SERVER_NAME`: The server name used to test the rules.
- `FRONTEND_URL`: The URL used for the frontdoor.
- `NODEAPP_ORIGIN_HOST`: The IP address of sample Node app.
- `TARGET_PLATFORM`: The platform where the test is executing, It may be Docker or Kubernetes.
- `ENV_FILE`: The name of the env file to store the env variables.


## Test Execution
### Execute Locally
 Clone the repo and run the commands:-

1. Navigate to the directory where the ‘qa-bootstrap-cypress.sh’ file exists.
2. Run chmod +x ./qa-bootstrap-cypress.sh && sh ./qa-bootstrap-cypress.sh "${{ LOGIN_EMAIL }}" "${{ LOGIN_PASSWORD }}" "${{ TARGET_ENV }}" "${{ JWT_TOKEN_KEY }}"

### Execute Using GitHub Actions

https://github.com/bwalia/whitefalcon/actions/workflows/qa-cypress-ui-tests.yaml 
With the workflow_dispatch event trigger, we can manually trigger the workflow execution. Before the execution, choose the target environment and click on the Run workflow.



### List of the available Environments
#### `Int`: https://api-int.brahmstra.org/
##### Sub-environments of `int` are-
- int2 : https://api-int.brahmstra.org/
- int6 : https://api-int.brahmstra.org/
- int10 : https://api-int.brahmstra.org/

#### `test`: http://api.brahmstra.org/
##### Sub-environments of `test` are-
- int2 : https://api.test2.brahmstra.org/
- int6 : https://api.test6.brahmstra.org/
