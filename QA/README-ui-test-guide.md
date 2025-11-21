# UI Testing with Selenium

## Introduction

The purpose of this document is to provide the guidelines and instruction to conduct the UI test with selenium.

## Tools and Technologies Used

- **Selenium**: We are using UI testing tool Selenium webdriver with python for the UI automation.
- **Docker**: We are using docker to handle the packages and dependencies in a bundle.
- **Pytest**: We are using pytest testing framework for our UI automation.
- **Github Actions**: we are using Github actions for execute all these test cases in a scheduled or trigger based events.

## Test Data and Environment Variables

### GitHub Secrets

We are using 3 static environment variable which is stored in the github secrets for the test workflow execution and those variable are:-

- `LOGIN_EMAIL`: An authorized user's email ID.
- `LOGIN_PASSWORD`: The valid password.
- `JWT_TOKEN_KEY`: The authorization key used for the sample node app.

### Workflow Environments

We are using 2 dynamic variables which are different for each environment. These environment are-

- `TARGET_HOST`: The base URL of the environment.
- `SERVER_NAME`: The server name used to test the rules.
- `STORAGE_TYPE`: The data storage type selected during the workflow execution. We have 2 types of data storage - (i) redis (ii) disk.

### Note:-

To run the tests on the local machine with the Non-headless mode, export the variable HEADLESSMODEDISABLE="true", By default it will run in the headless mode. The test execution with docker or github workflow doesn’t support the Non-headless mode.

## Test Execution

### Execute Locally

Clone the repo and run the commands:-

1. Export the environment variables.
2. Run - docker build --no-cache -t selenium-tests -f Dockerfile_qa .
3. Run - docker run -e LOGIN_EMAIL=$LOGIN_EMAIL -e LOGIN_PASSWORD=$LOGIN_PASSWORD -e JWT_TOKEN_KEY=$JWT_TOKEN_KEY -e TARGET_HOST=$TARGET_HOST -e SERVER_NAME=$SERVER_NAME -e STORAGE_TYPE=$STORAGE_TYPE selenium-tests

### Execute Using GitHub Actions

https://github.com/bwalia/wslproxy/actions/workflows/Selenium-tests.yml
With the workflow_dispatch event trigger, we can manually trigger the workflow execution. Before the execution, choose the target environment and the data storage type according to the test preferences and click on the Run workflow.

## Test Results

- **Pass**: Expected result when everything is functioning as intended.
- **Fail**: Test execution fails if unexpected issues occur.

### List of the available Environments

#### `Int`: http://api-int.wslproxy.com/

##### Sub-environments of `int` are-

- int2 : http://api-int.wslproxy.com/
- int6 : http://api-int.wslproxy.com/
- int10 : http://api-int.wslproxy.com/

#### `test`: http://api.wslproxy.com/

##### Sub-environments of `test` are-

- int2 : http://api.test2.wslproxy.com/
- int6 : http://api.test6.wslproxy.com/
