#!/usr/bin/env bash
set -euo pipefail

# Import JSON fixtures into a MongoDB collection running in docker compose.
# - Derives the collection name from the folder name that contains the JSON files
# - Prefers mongoimport (upserts on _id), falls back to mongosh if needed
# - Works from anywhere in the repo (auto-locates compose.yml) or accept --compose-file
#
# Usage:
#   ./import-fixtures.sh [path-to-collection-dir] [--db DB_NAME] [--service SERVICE] [--compose-file PATH] [--dry-run]
#
# Examples:
#   # Default: imports from ./organisations (next to this script) into DB epr-backend
#   ./import-fixtures.sh
#   # Explicit path:
#   ./import-fixtures.sh ./organisations
#   # Specify DB name and docker compose service name
#   ./import-fixtures.sh ./organisations --db epr-backend --service mongodb
#   # Use a compose file at a custom location
#   ./import-fixtures.sh ./organisations --compose-file "../../../../compose.yml"
#   # Just print the actions without executing container operations
#   ./import-fixtures.sh ./organisations --dry-run

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_COLLECTION_DIR="$SCRIPT_DIR/organisations"

COLLECTION_DIR=""
DB_NAME="${MONGO_DATABASE:-epr-backend}"
MONGO_SERVICE="mongodb"
COMPOSE_FILE=""
DRY_RUN="false"

# --- Helpers ---
msg() { echo "[import-fixtures] $*"; }
err() { echo "[import-fixtures][ERROR] $*" 1>&2; }

usage() {
  sed -n '2,60p' "$0"
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

# Parse args
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage; exit 0 ;;
    --db)
      DB_NAME="$2"; shift 2 ;;
    --service)
      MONGO_SERVICE="$2"; shift 2 ;;
    --compose-file)
      COMPOSE_FILE="$2"; shift 2 ;;
    --dry-run|--dryrun|-n)
      DRY_RUN="true"; shift ;;
    --)
      shift; break ;;
    -*)
      err "Unknown option: $1"; usage; exit 1 ;;
    *)
      POSITIONAL+=("$1"); shift ;;
  esac
done

if [[ ${#POSITIONAL[@]} -gt 0 ]]; then
  COLLECTION_DIR="${POSITIONAL[0]}"
else
  COLLECTION_DIR="$DEFAULT_COLLECTION_DIR"
fi

# Normalize to absolute path
if [[ ! "$COLLECTION_DIR" = /* ]]; then
  COLLECTION_DIR="$(cd "$COLLECTION_DIR" 2>/dev/null && pwd)" || true
fi

if [[ -z "$COLLECTION_DIR" || ! -d "$COLLECTION_DIR" ]]; then
  err "Collection directory not found. Tried: $COLLECTION_DIR"
  exit 1
fi

COLLECTION_NAME="$(basename "$COLLECTION_DIR")"

# Determine compose file if not supplied
if [[ -z "$COMPOSE_FILE" ]]; then
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
fi

if [[ -z "$COMPOSE_FILE" || ! -f "$COMPOSE_FILE" ]]; then
  err "Could not locate compose.yml. Provide it with --compose-file PATH"
  exit 1
fi

msg "Using compose file: $COMPOSE_FILE"
msg "Docker service: $MONGO_SERVICE"
msg "Mongo database: $DB_NAME"
msg "Collection dir: $COLLECTION_DIR"
msg "Collection name: $COLLECTION_NAME"

# Gather json files
mapfile -t JSON_FILES < <(find "$COLLECTION_DIR" -maxdepth 1 -type f -name '*.json' | sort)
if [[ ${#JSON_FILES[@]} -eq 0 ]]; then
  err "No .json files found in $COLLECTION_DIR"
  exit 1
fi

msg "Found ${#JSON_FILES[@]} JSON file(s) to import"

compose_cmd=(docker compose -f "$COMPOSE_FILE")

# Ensure the service container is running and get its container id
CONTAINER_ID=""
if [[ "$DRY_RUN" == "true" ]]; then
  CONTAINER_ID="DRYRUN-CONTAINER"
  msg "[dry-run] Skipping container lookup; using placeholder id: $CONTAINER_ID"
else
  CONTAINER_ID="$(${compose_cmd[@]} ps -q "$MONGO_SERVICE" 2>/dev/null || true)"
  if [[ -z "$CONTAINER_ID" ]]; then
    err "Service '$MONGO_SERVICE' is not running. Start it with: docker compose -f '$COMPOSE_FILE' up -d $MONGO_SERVICE"
    exit 1
  fi
fi

msg "Container id: $CONTAINER_ID"

# Prepare target folder inside container
REMOTE_BASE="/tmp/fixtures/$COLLECTION_NAME"

run_or_echo() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "+ $*"
  else
    eval "$@"
  fi
}

# Create folder and copy files into container
run_or_echo "docker exec $CONTAINER_ID sh -lc 'rm -rf "$REMOTE_BASE" && mkdir -p "$REMOTE_BASE"'"
for f in "${JSON_FILES[@]}"; do
  bn="$(basename "$f")"
  run_or_echo "docker cp \"$f\" \"$CONTAINER_ID:$REMOTE_BASE/$bn\""
done

# Determine import tools inside container (prefer mongoimport)
MONGOSH_PATH=""
MONGOIMPORT_PATH=""
if [[ "$DRY_RUN" == "true" ]]; then
  msg "[dry-run] Skipping tool discovery inside container"
else
  MONGOSH_PATH="$(docker exec "$CONTAINER_ID" sh -lc 'command -v mongosh || true')"
  MONGOIMPORT_PATH="$(docker exec "$CONTAINER_ID" sh -lc 'command -v mongoimport || true')"
fi

if [[ -n "$MONGOIMPORT_PATH" || "$DRY_RUN" == "true" ]]; then
  [[ -n "$MONGOIMPORT_PATH" ]] && msg "Using mongoimport at: $MONGOIMPORT_PATH" || msg "[dry-run] Would use mongoimport if present"
  for f in "${JSON_FILES[@]}"; do
    bn="$(basename "$f")"
    remote_file="$REMOTE_BASE/$bn"
    # If the file starts with '[' treat as JSON array
    run_or_echo "docker exec $CONTAINER_ID sh -lc 'if head -c1 \"$remote_file\" | grep -q \"\\[\"; then mongoimport --db \"$DB_NAME\" --collection \"$COLLECTION_NAME\" --file \"$remote_file\" --jsonArray --mode upsert --upsertFields _id; else mongoimport --db \"$DB_NAME\" --collection \"$COLLECTION_NAME\" --file \"$remote_file\" --mode upsert --upsertFields _id; fi'"
  done
elif [[ -n "$MONGOSH_PATH" ]]; then
  msg "mongoimport not found; falling back to mongosh at: $MONGOSH_PATH"
  for f in "${JSON_FILES[@]}"; do
    bn="$(basename "$f")"
    remote_file="$REMOTE_BASE/$bn"
    # Use a minimal JS that avoids single quotes in strings
    JS="const dbName=\"$DB_NAME\";const collName=\"$COLLECTION_NAME\";const file=\"$remote_file\";const c=db.getSiblingDB(dbName).getCollection(collName);const content=cat(file);let d;try{d=JSON.parse(content);}catch(e){print(\"Failed to parse JSON for \"+file+\": \"+e);quit(1);}const importDoc=(doc)=>{if(doc&&Object.prototype.hasOwnProperty.call(doc,\"_id\")){c.replaceOne({_id:doc._id},doc,{upsert:true});}else{c.insertOne(doc);}};if(Array.isArray(d)){d.forEach(importDoc);}else{importDoc(d);}"
    # Write JS to a temp file inside container and execute to avoid quoting issues
    run_or_echo "docker exec $CONTAINER_ID sh -lc 'JSFILE=\"$REMOTE_BASE/.import.js\"; printf %s \"$JS\" > \"$REMOTE_BASE/.import.js\" && mongosh --quiet \"$REMOTE_BASE/.import.js\" && rm -f \"$REMOTE_BASE/.import.js\"'"
  done
else
  err "Neither mongoimport nor mongosh found in the mongodb container."
  exit 1
fi

msg "Import complete for collection '$COLLECTION_NAME' into database '$DB_NAME'"
