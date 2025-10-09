#!/bin/bash

# Script to replace production URLs with test URLs in form JSON files
# Usage: ./update-defra-prod-forms.sh <directory>

PROD_URL="epr-backend.prod.cdp-int.defra.cloud"
TEST_URL="epr-backend.test.cdp-int.defra.cloud"
DIR="${1:-./prod_forms_download}"

# Check directory exists
if [ ! -d "$DIR" ]; then
    echo " Error: Directory $DIR does not exist"
    exit 1
fi

# Find JSON files
json_files=$(find "$DIR" -name "*.json" -type f)
if [ -z "$json_files" ]; then
    echo "Error: No JSON files found in $DIR"
    exit 1
fi

echo "Updating URLs in JSON files..."
echo "Replacing: $PROD_URL → $TEST_URL"
echo ""

# Replace URLs
for file in $json_files; do
    if grep -q "$PROD_URL" "$file"; then
        sed -i "s|$PROD_URL|$TEST_URL|g" "$file"
        echo "Updated $(basename "$file")"
    fi
done

echo ""
echo "Checking for remaining production URLs..."

# Check for remaining prod URLs
files_with_prod_urls=$(grep -l "$PROD_URL" "$DIR"/*.json 2>/dev/null || true)

if [ -n "$files_with_prod_urls" ]; then
    echo ""
    echo " FAILURE: Production URLs still found in:"
    for file in $files_with_prod_urls; do
        count=$(grep -c "$PROD_URL" "$file")
        echo "  - $(basename "$file"): $count occurrence(s)"
    done
    exit 1
fi

echo "SUCCESS: No production URLs remaining"
exit 0
