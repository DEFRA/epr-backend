#!/bin/sh
set -eu

# Keep bucket/queue setup in sync with
# https://github.com/DEFRA/epr-re-ex-service/blob/main/compose/floci/init.sh

echo "[floci-init] Waiting for Floci to be ready..." >&2
until aws sqs list-queues >/dev/null 2>&1; do
  sleep 1
done
echo "[floci-init] Floci is ready" >&2

mk_bucket() {
  aws s3api create-bucket --bucket "$1" >/dev/null 2>&1 || true
}

mk_queue() {
  aws sqs create-queue --queue-name "$1" >/dev/null 2>&1 || true
}

echo "[floci-init] Creating buckets" >&2
mk_bucket cdp-uploader-quarantine
mk_bucket re-ex-summary-logs
mk_bucket re-ex-overseas-sites
mk_bucket re-ex-public-register

echo "[floci-init] Creating queues" >&2
mk_queue cdp-clamav-results
mk_queue cdp-uploader-download-requests
aws sqs create-queue \
  --queue-name cdp-uploader-scan-results-callback.fifo \
  --attributes '{"FifoQueue":"true","ContentBasedDeduplication":"true"}' >/dev/null 2>&1 || true
mk_queue epr_backend_commands_dlq
aws sqs create-queue \
  --queue-name epr_backend_commands \
  --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:eu-west-2:000000000000:epr_backend_commands_dlq\",\"maxReceiveCount\":\"3\"}"}' >/dev/null 2>&1 || true
mk_queue mock-clamav

echo "[floci-init] Configuring quarantine bucket notifications" >&2
aws s3api put-bucket-notification-configuration \
  --bucket cdp-uploader-quarantine \
  --notification-configuration '{"QueueConfigurations":[{"QueueArn":"arn:aws:sqs:eu-west-2:000000000000:mock-clamav","Events":["s3:ObjectCreated:*"]}]}'

echo "[floci-init] Done" >&2
