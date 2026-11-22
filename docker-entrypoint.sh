#!/usr/bin/env bash
set -e

BOT_API_PORT="${BOT_API_PORT:-8081}"
BOT_API_DATA_DIR="${BOT_API_DATA_DIR:-/opt/tgbotapi/data}"
BOT_API_TEMP_DIR="${BOT_API_TEMP_DIR:-/opt/tgbotapi/temp}"
BOT_API_LOG_FILE="${BOT_API_LOG_FILE:-/opt/tgbotapi/bot-api.log}"

# --dir و --temp-dir سرور Bot API باید از قبل وجود داشته باشند، وگرنه سرور بی‌صدا می‌میرد.
mkdir -p "$BOT_API_DATA_DIR" "$BOT_API_TEMP_DIR" "$(dirname "$BOT_API_LOG_FILE")"

API_ID="${TELEGRAM_API_ID:-${API_ID:-}}"
API_HASH="${TELEGRAM_API_HASH:-${API_HASH:-}}"

if [ "${BOT_API_ENABLED:-1}" != "0" ] && [ "${BOT_API_ENABLED:-1}" != "false" ]; then
  if [ -n "$API_ID" ] && [ -n "$API_HASH" ]; then
    BOT_API_ARGS=(
      "--api-id=${API_ID}"
      "--api-hash=${API_HASH}"
      "--http-ip-address=${BOT_API_HTTP_IP:-127.0.0.1}"
      "--http-port=${BOT_API_PORT}"
      "--dir=${BOT_API_DATA_DIR}"
      "--temp-dir=${BOT_API_TEMP_DIR}"
    )

    if [ "${BOT_API_LOCAL:-1}" = "1" ] || [ "${BOT_API_LOCAL:-1}" = "true" ]; then
      BOT_API_ARGS+=("--local")
    fi

    if [ -n "${BOT_API_MAX_WEBHOOK_CONNECTIONS:-}" ]; then
      BOT_API_ARGS+=("--max-webhook-connections=${BOT_API_MAX_WEBHOOK_CONNECTIONS}")
    fi

    echo "[entrypoint] Starting local Telegram Bot API server on port ${BOT_API_PORT} (local=${BOT_API_LOCAL:-1})..."
    telegram-bot-api "${BOT_API_ARGS[@]}" >"$BOT_API_LOG_FILE" 2>&1 &
    BOT_API_PID=$!

    sleep 0.5
    if kill -0 "$BOT_API_PID" 2>/dev/null; then
      echo "[entrypoint] Local Telegram Bot API server started (PID: ${BOT_API_PID})."
    else
      echo "[entrypoint] Warning: Local Telegram Bot API server exited early. Log output:"
      cat "$BOT_API_LOG_FILE" || true
    fi
  else
    echo "[entrypoint] TELEGRAM_API_ID / TELEGRAM_API_HASH not set; skipping local Telegram Bot API server startup."
  fi
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
else
  exec npm start
fi
