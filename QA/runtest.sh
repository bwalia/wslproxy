#!/bin/bash
pwd
ls -al

pytest -v -s --alluredir=/app/testresults

allure generate --clean /app/testresults -o /app/testreports; chmod -R 777 /app/testreports