#!/bin/sh
# Docker entrypoint script
# Ensures proper permissions before starting nginx

set -e

# Ensure log directories exist with proper permissions
mkdir -p /usr/local/openresty/nginx/logs
mkdir -p /var/log/nginx

# Create log files if they don't exist
touch /usr/local/openresty/nginx/logs/error.log
touch /usr/local/openresty/nginx/logs/access.log
touch /var/log/nginx/error.log
touch /var/log/nginx/access.log

# Set permissions - readable by all, writable by nginx
chmod 666 /usr/local/openresty/nginx/logs/error.log
chmod 666 /usr/local/openresty/nginx/logs/access.log
chmod 666 /var/log/nginx/error.log
chmod 666 /var/log/nginx/access.log

# Set directory permissions
chmod 777 /usr/local/openresty/nginx/logs
chmod 777 /var/log/nginx

echo "Log permissions configured successfully"

# Execute the main command (nginx)
exec "$@"
