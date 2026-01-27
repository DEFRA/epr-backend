#!/bin/bash

echo "[INIT SCRIPT] Starting LocalStack setup" >&2

export AWS_REGION=eu-west-2
export AWS_DEFAULT_REGION=eu-west-2
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test

echo "[INIT SCRIPT] Creating buckets" >&2

aws --endpoint-url=http://localhost:4566 s3 mb s3://cdp-uploader-quarantine
aws --endpoint-url=http://localhost:4566 s3 mb s3://re-ex-summary-logs

echo "[INIT SCRIPT] Creating queues" >&2

# queues
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name cdp-clamav-results
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name cdp-uploader-scan-results-callback.fifo --attributes "{\"FifoQueue\":\"true\",\"ContentBasedDeduplication\": \"true\"}"

# backend command queue and DLQ
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name epr_backend_commands-deadletter
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name epr_backend_commands --attributes "{\"VisibilityTimeout\":\"300\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"arn:aws:sqs:eu-west-2:000000000000:epr_backend_commands-deadletter\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}"

# test harness
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name mock-clamav
aws --endpoint-url=http://localhost:4566 s3api put-bucket-notification-configuration --bucket cdp-uploader-quarantine --notification-configuration '{"QueueConfigurations": [{"QueueArn": "arn:aws:sqs:eu-west-2:000000000000:mock-clamav","Events": ["s3:ObjectCreated:*"]}]}'
aws --endpoint-url=http://localhost:4566 sqs create-queue --region $AWS_REGION --queue-name cdp-uploader-download-requests
