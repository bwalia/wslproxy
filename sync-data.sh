#!/bin/bash
set -x

if [ -z "$1" ]
  then
    echo "No env file path supplied default env prod is set"
    TARGET_ENV_NAME="prod"
else
    echo "Using env profile: $1"
    TARGET_ENV_NAME="$1"
fi

if [ -z "$2" ]
  then
    echo "No Host Provided default https://int.brahmstra.org is set"
    FRONT_HOST="http://localhost"
else
    echo "Supplied Host name: $2"
    FRONT_HOST="$2"
fi

curl --location "${FRONT_HOST}/frontdoor/opsapi/sync?envprofile=${TARGET_ENV_NAME}&settings=false"