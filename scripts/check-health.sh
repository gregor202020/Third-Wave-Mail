#!/usr/bin/env bash
#
# Health Endpoint Check Script
#
# Verifies the /health endpoint returns 200 with database and redis OK.
#
# Usage:
#   bash scripts/check-health.sh [base_url]
#   UPTIME_MONITOR_URL=http://prod:3000 bash scripts/check-health.sh
#

set -euo pipefail

BASE_URL="${1:-${UPTIME_MONITOR_URL:-http://localhost:3000}}"
ENDPOINT="${BASE_URL}/health"

echo "Checking health endpoint: ${ENDPOINT}"
echo ""

# Fetch with 10s timeout, capture HTTP status and body
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 10 "${ENDPOINT}" 2>&1) || {
  echo "FAIL: Could not reach ${ENDPOINT}"
  exit 1
}

# Split response body and status code
HTTP_BODY=$(echo "$HTTP_RESPONSE" | head -n -1)
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n 1)

echo "HTTP Status: ${HTTP_STATUS}"
echo "Response:    ${HTTP_BODY}"
echo ""

# Check HTTP 200
if [ "$HTTP_STATUS" != "200" ]; then
  echo "FAIL: Expected HTTP 200, got ${HTTP_STATUS}"
  exit 1
fi
echo "PASS: HTTP status is 200"

# Check database: ok
if echo "$HTTP_BODY" | grep -q '"database"[[:space:]]*:[[:space:]]*"ok"'; then
  echo "PASS: database is ok"
else
  echo "FAIL: database check not ok"
  exit 1
fi

# Check redis: ok
if echo "$HTTP_BODY" | grep -q '"redis"[[:space:]]*:[[:space:]]*"ok"'; then
  echo "PASS: redis is ok"
else
  echo "FAIL: redis check not ok"
  exit 1
fi

echo ""
echo "All health checks passed!"
exit 0
