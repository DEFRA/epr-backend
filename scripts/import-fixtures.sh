#!/usr/bin/env bash
set -euo pipefail

# Import JSON fixtures from src/data/fixtures/common into MongoDB (docker compose service: mongodb).
# For each immediate subfolder inside the common folder, import all .json files in that subfolder
# into a collection named after the subfolder (override mapping: organisation -> organisations).
# Upserts on _id when present (inserts when not present).
#
# Usage:
#   ./import-fixtures.sh            # uses default: <repo>/src/data/fixtures/common
#   ./import-fixtures.sh <folder>   # optional override of the common folder path
#
# Notes:
# - Database defaults to 'epr-backend' (override with env MONGO_DATABASE).
# - compose.yml is auto-discovered by walking up from this script location.

DB_NAME="${MONGO_DATABASE:-epr-backend}"
MONGO_SERVICE="mongodb"

# --- Helpers ---
msg() { echo "[import-fixtures] $*"; }
err() { echo "[import-fixtures][ERROR] $*" 1>&2; }

usage() {
  sed -n '3,26p' "$0"
}

# Recursively search upwards for compose.yml starting from a directory
find_compose_file_up() {
  local start_dir="$1"
  local dir="$start_dir"
  while [[ "$dir" != "/" && -n "$dir" ]]; do
    if [[ -f "$dir/compose.yml" ]]; then
      echo "$dir/compose.yml"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_COMMON_DIR="$SCRIPT_DIR/../src/data/fixtures/common"

# --- Args ---
ROOT_DIR="${1:-$DEFAULT_COMMON_DIR}"
if [[ ! -d "$ROOT_DIR" ]]; then
  err "Folder not found or not a directory: $ROOT_DIR"
  exit 1
fi

# Resolve absolute path for ROOT_DIR
if [[ "$ROOT_DIR" != /* ]]; then
  ROOT_DIR="$(cd "$ROOT_DIR" 2>/dev/null && pwd)"
fi

COMPOSE_FILE=""

# Determine compose file
# Prefer git root if available
if command -v git >/dev/null 2>&1; then
  if GIT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
    if [[ -f "$GIT_ROOT/compose.yml" ]]; then
      COMPOSE_FILE="$GIT_ROOT/compose.yml"
    fi
  fi
fi
# Otherwise walk up from script dir
if [[ -z "$COMPOSE_FILE" ]]; then
  if CF="$(find_compose_file_up "$SCRIPT_DIR")"; then
    COMPOSE_FILE="$CF"
  fi
fi

if [[ -z "$COMPOSE_FILE" || ! -f "$COMPOSE_FILE" ]]; then
  err "Could not locate compose.yml"
  exit 1
fi

msg "Using compose file: $COMPOSE_FILE"
msg "Docker service: $MONGO_SERVICE"
msg "Mongo database: $DB_NAME"
msg "Common fixtures root: $ROOT_DIR"

compose_cmd=(docker compose -f "$COMPOSE_FILE")
CONTAINER_ID="$(${compose_cmd[@]} ps -q "$MONGO_SERVICE" 2>/dev/null || true)"
if [[ -z "$CONTAINER_ID" ]]; then
  err "Service '$MONGO_SERVICE' is not running. Start it with: docker compose -f '$COMPOSE_FILE' up -d $MONGO_SERVICE"
  exit 1
fi

msg "Container id: $CONTAINER_ID"

# Prepare remote directory and copy all fixtures (only the common folder) recursively
REMOTE_PARENT="/tmp/fixtures"
REMOTE_DIR="$REMOTE_PARENT/$(basename "$ROOT_DIR")"

docker exec "$CONTAINER_ID" sh -lc "rm -rf '$REMOTE_DIR' && mkdir -p '$REMOTE_DIR'"
# Copy contents of ROOT_DIR into REMOTE_DIR (not nesting an extra folder level)
docker cp "$ROOT_DIR/." "$CONTAINER_ID:$REMOTE_DIR/"

# Decide tool availability
MONGOIMPORT_PATH="$(docker exec "$CONTAINER_ID" sh -lc 'command -v mongoimport || true')"
MONGOSH_PATH="$(docker exec "$CONTAINER_ID" sh -lc 'command -v mongosh || true')"

# Build the import loop command to run inside the container
if [[ -n "$MONGOIMPORT_PATH" ]]; then
  msg "Using mongoimport at: $MONGOIMPORT_PATH"
  IMPORT_SH=$(cat <<'EOSH'
set -u
DB_NAME="$1"; ROOT="$2"
processed=0
succeeded=0
failed=0
# Iterate only immediate subfolders of ROOT
for d in "$ROOT"/*/; do
  [ -d "$d" ] || continue
  coll="$(basename "$d")"
  # Import all .json files directly within this subfolder (non-recursive)
  found=0
  for f in "$d"*.json; do
    [ -f "$f" ] || continue
    found=1
    processed=$((processed+1))
    # Detect array with leading whitespace allowance
    if grep -q -m1 '^[[:space:]]*\[' "$f"; then
      echo "[import-fixtures] mongoimport jsonArray -> $coll :: $f"
      mongoimport --db "$DB_NAME" --collection "$coll" --file "$f" --jsonArray --mode upsert --upsertFields _id
    else
      echo "[import-fixtures] mongoimport single -> $coll :: $f"
      mongoimport --db "$DB_NAME" --collection "$coll" --file "$f" --mode upsert --upsertFields _id
    fi
    rc=$?
    if [ $rc -ne 0 ]; then
      echo "[import-fixtures][WARN] import failed (rc=$rc) -> $coll :: $f"
      failed=$((failed+1))
    else
      succeeded=$((succeeded+1))
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "[import-fixtures][INFO] No .json files in subfolder: $d"
  fi
done
echo "[import-fixtures] Summary: processed=$processed, succeeded=$succeeded, failed=$failed"
# Exit non-zero if any failures occurred
[ "$failed" -eq 0 ]
EOSH
)
  docker exec -i "$CONTAINER_ID" sh -s -- "$DB_NAME" "$REMOTE_DIR" <<<"$IMPORT_SH"
elif [[ -n "$MONGOSH_PATH" ]]; then
  msg "mongoimport not found; falling back to mongosh at: $MONGOSH_PATH"
  RUN_SH=$(cat <<'EOSH'
set -u
DB_NAME="$1"; ROOT="$2"
# Pre-create a reusable JS importer script
JS_FILE="$ROOT/.import_one.js"
cat > "$JS_FILE" <<'EOJS'
const file = process.env.FILE;
const collName = process.env.COLL;
const dbName = process.env.DB;
if (!file || !collName || !dbName) { print('Missing FILE/COLL/DB env'); quit(1); }
const c = db.getSiblingDB(dbName).getCollection(collName);
const content = cat(file);
let d;
try { d = JSON.parse(content); } catch (e) { print('Failed to parse JSON for ' + file + ': ' + e); quit(1); }
const importDoc = (doc) => {
  if (doc && Object.prototype.hasOwnProperty.call(doc, '_id')) {
    c.replaceOne({ _id: doc._id }, doc, { upsert: true });
  } else {
    c.insertOne(doc);
  }
};
if (Array.isArray(d)) d.forEach(importDoc); else importDoc(d);
EOJS
processed=0
succeeded=0
failed=0
# Iterate only immediate subfolders of ROOT
for d in "$ROOT"/*/; do
  [ -d "$d" ] || continue
  coll="$(basename "$d")"
  # Map special folder names to collection names
  case "$coll" in
    organisation) coll="organisations";;
  esac
  found=0
  for f in "$d"*.json; do
    [ -f "$f" ] || continue
    found=1
    processed=$((processed+1))
    echo "[import-fixtures] mongosh import -> $coll :: $f"
    FILE="$f" COLL="$coll" DB="$DB_NAME" mongosh --quiet "$JS_FILE"
    rc=$?
    if [ $rc -ne 0 ]; then
      echo "[import-fixtures][WARN] import failed (rc=$rc) -> $coll :: $f"
      failed=$((failed+1))
    else
      succeeded=$((succeeded+1))
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "[import-fixtures][INFO] No .json files in subfolder: $d"
  fi
done
# Clean up js file
rm -f "$JS_FILE"
echo "[import-fixtures] Summary: processed=$processed, succeeded=$succeeded, failed=$failed"
# Exit non-zero if any failures occurred
[ "$failed" -eq 0 ]
EOSH
)
  docker exec -i "$CONTAINER_ID" sh -s -- "$DB_NAME" "$REMOTE_DIR" <<<"$RUN_SH"
else
  err "Neither mongoimport nor mongosh found in the mongodb container."
  exit 1
fi

msg "Import complete for '$ROOT_DIR' into database '$DB_NAME'"
