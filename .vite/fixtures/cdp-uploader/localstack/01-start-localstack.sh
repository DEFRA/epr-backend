#!/bin/bash

# Keep in sync with https://github.com/DEFRA/epr-re-ex-service/blob/main/compose/localstack/01-start-localstack.sh

echo "[INIT SCRIPT] Starting LocalStack setup" >&2

# nb. env vars set in Testcontainers withEnvironment

echo "[INIT SCRIPT] Creating buckets and queues" >&2

aws --endpoint-url=http://localhost:4566 s3 mb s3://cdp-uploader-quarantine &
aws --endpoint-url=http://localhost:4566 s3 mb s3://re-ex-summary-logs &
aws --endpoint-url=http://localhost:4566 s3 mb s3://re-ex-public-register &

# queues
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name cdp-clamav-results &
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name cdp-uploader-download-requests &
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name cdp-uploader-scan-results-callback.fifo --attributes "{\"FifoQueue\":\"true\",\"ContentBasedDeduplication\": \"true\"}" &
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name epr_backend_commands_dlq &
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name epr_backend_commands --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"arn:aws:sqs:eu-west-2:000000000000:epr_backend_commands_dlq\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" &

# test harness
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name mock-clamav &

wait

echo "[INIT SCRIPT] Configuring bucket notifications" >&2

aws --endpoint-url=http://localhost:4566 s3api put-bucket-notification-configuration --bucket cdp-uploader-quarantine --notification-configuration '{"QueueConfigurations": [{"QueueArn": "arn:aws:sqs:eu-west-2:000000000000:mock-clamav","Events": ["s3:ObjectCreated:*"]}]}'
