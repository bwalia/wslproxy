#!/bin/bash

# Check For Minio Access Key
if [ -z "$1" ]
  then
    echo "Minio Access key missing. Access key must be 1st argument"
    exit 1
else
    MINIO_ACCESS_KEY="$1"
fi

# Check For Minio Secret Key
if [ -z "$2" ]
  then
    echo "Minio Secret key missing. Secret key must be 2nd argument"
    exit 1
else
    MINIO_SECRET_KEY="$2"
fi

# Check for github token
if [ -z "$3" ]
  then
    echo "Github Token missing. Github Token must be 3rd argument."
    exit 1
else
    GITHUB_TOKEN="$3"
fi

# Check For Minio Host
if [ -z "$4" ]
  then
    echo "Minio Host missing. Host should be 4th argument. Default http://localhost:900 is set"
    MINIO_ENDPOINT="http://localhost:9000"
else
    MINIO_ENDPOINT="$4"
fi
if [ -z "$5" ]
  then
    echo "Minio Bucket Name missing. Bucket Name should be 5th argument. Default brahmstra-dashboard is set"
    MINIO_BUCKET="brahmstra-dashboard"
else
    MINIO_BUCKET="$5"
fi


# Make temporary directory to clone the project
mkdir -p /tmp/brahmstra-dashboard
cd /tmp/brahmstra-dashboard

# Clone the repo
git clone https://$GITHUB_TOKEN@github.com/bwalia/whitefalcon.git whitefalcon
cd whitefalcon

# Change directory to openresty admin
cd openresty-admin

# Run the command to install the dependencies
yarn install

# Build the project
yarn build

# Configure the Minio Client
mc config host add minio $MINIO_ENDPOINT $MINIO_ACCESS_KEY $MINIO_SECRET_KEY

# Copy dist folder to bucket
if [ -d "/tmp/brahmstra-dashboard/whitefalcon/openresty-admin/dist" ]; then
tar -czvf /tmp/openresty-admin-dist.tar.gz /tmp/brahmstra-dashboard/whitefalcon/openresty-admin/dist
mc cp -r /tmp/openresty-admin-dist.tar.gz minio/$MINIO_BUCKET

else
echo "Dist folder not found"
fi
# Remove Cloned Project
rm -rf /tmp/brahmstra-dashboard