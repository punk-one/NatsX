#!/usr/bin/env bash

set -euo pipefail

NSIS_UNUSED="${NSIS_UNUSED:-}"
VERSION="${1:-}"
OUTPUT_DIR="${OUTPUT_DIR:-}"
SKIP_TAR="${SKIP_TAR:-0}"

write_step() {
  echo "==> $1"
}

assert_path_exists() {
  local path="$1"
  local description="$2"
  if [[ ! -e "$path" ]]; then
    echo "$description not found: $path" >&2
    exit 1
  fi
}

new_checksum_file() {
  local destination="$1"
  shift

  : > "$destination"
  for path in "$@"; do
    [[ -e "$path" && ! -d "$path" ]] || continue
    sha256sum "$path" >> "$destination"
  done
}

new_release_asset_list() {
  local product_name="$1"
  local product_version="$2"
  local platform_tag="$3"
  local staging_dir="$4"
  local tar_path="$5"
  local checksum_path="$6"
  local destination="$7"

  {
    echo "# $product_name $product_version Release Assets"
    echo
    echo "## Attach to GitHub Release"
    echo
    if [[ -f "$tar_path" ]]; then
      echo "- \`$(basename "$tar_path")\` - Portable tar.gz package ($(stat -c%s "$tar_path") bytes)"
    fi
    if [[ -f "$checksum_path" ]]; then
      echo "- \`$(basename "$checksum_path")\` - SHA256 checksum file ($(stat -c%s "$checksum_path") bytes)"
    fi
    echo
    echo "## Staging Directory"
    echo
    echo "- \`$(basename "$staging_dir")\` - Expanded release folder for manual inspection"
    echo
    echo "## Recommended Release Title"
    echo
    echo "- Tag: \`v$product_version\`"
    echo "- Title: \`$product_name v$product_version\`"
    echo
    echo "## Recommended Release Body"
    echo
    echo "- Use the final publish copy from \`docs/release-publish-final.md\`"
    echo "- Use \`docs/release-github-bilingual.md\` when you want a shorter bilingual body"
    echo "- Use \`RELEASE_NOTES.md\` for the concise feature summary"
    echo
    echo "## Publish Checklist"
    echo
    echo "- Upload the portable \`.tar.gz\` package"
    echo "- Upload the matching \`.sha256.txt\` file"
    echo "- Mark this release as a Linux desktop release"
    echo "- Add the project URL: \`https://github.com/punk-one/NatsX\`"
    echo
    echo "## Notes"
    echo
    echo "- Version: \`$product_version\`"
    echo "- Platform: \`$platform_tag\`"
    echo "- Include the generated \`.sha256.txt\` file alongside uploaded assets"
  } > "$destination"
}

new_github_release_draft() {
  local product_name="$1"
  local product_version="$2"
  local tar_path="$3"
  local checksum_path="$4"
  local destination="$5"

  {
    echo "# $product_name v$product_version"
    echo
    echo 'Linux Desktop Release for `NATS / JetStream`'
    echo
    echo "\`$product_name $product_version\` is a Linux desktop client for \`NATS / JetStream\`, built with \`Go + Wails + React + Ant Design\`."
    echo
    echo "## Highlights"
    echo
    echo "- Connection management with local persistence"
    echo "- \`No Auth\`, \`Username / Password\`, \`Token\`, \`TLS / mTLS\`, \`NKey\`, and \`Credentials\`"
    echo "- Publish, subscribe, reply, republish, and payload inspection"
    echo "- \`Request / Reply\` replay and compare workflow"
    echo "- JetStream Stream / Consumer tools with \`Ack / Nak / Term\`"
    echo "- Pure-Go \`SQLite\` persistence for settings, connections, update state, and logs"
    echo "- Chinese and English UI support with saved language preference"
    echo
    echo "## Downloads"
    echo
    [[ -f "$tar_path" ]] && echo "- \`$(basename "$tar_path")\` ($(stat -c%s "$tar_path") bytes)"
    [[ -f "$checksum_path" ]] && echo "- \`$(basename "$checksum_path")\` ($(stat -c%s "$checksum_path") bytes)"
    echo
    echo "## Project"
    echo
    echo '- Repository: `https://github.com/punk-one/NatsX`'
    echo '- Homepage: `https://github.com/punk-one/NatsX`'
    echo '- Release notes: see `RELEASE_NOTES.md` in the package'
  } > "$destination"
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export GOMODCACHE="$ROOT/.cache/gomod"
export GOCACHE="$ROOT/.cache/gobuild-linux"
export CGO_ENABLED=1

PRODUCT_NAME="$(python3 - <<'PY'
import json
with open('wails.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('info', {}).get('productName') or data.get('name') or '')
PY
)"

DEFAULT_VERSION="$(python3 - <<'PY'
import json
with open('wails.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
print(data.get('info', {}).get('productVersion') or '')
PY
)"

PRODUCT_VERSION="${VERSION:-$DEFAULT_VERSION}"

if [[ -z "$PRODUCT_NAME" ]]; then
  echo "Unable to determine product name from wails.json" >&2
  exit 1
fi

if [[ -z "$PRODUCT_VERSION" ]]; then
  echo "Unable to determine product version from wails.json" >&2
  exit 1
fi

PLATFORM_TAG="linux-amd64"
BINARY_NAME="$PRODUCT_NAME"
RELEASE_NAME="$PRODUCT_NAME-$PRODUCT_VERSION-$PLATFORM_TAG"
RELEASE_ROOT="${OUTPUT_DIR:-$ROOT/release}"
STAGING_DIR="$RELEASE_ROOT/$RELEASE_NAME"
TAR_PATH="$RELEASE_ROOT/$RELEASE_NAME.tar.gz"
CHECKSUM_PATH="$RELEASE_ROOT/$RELEASE_NAME.sha256.txt"
ASSET_LIST_PATH="$RELEASE_ROOT/$RELEASE_NAME-assets.md"
GITHUB_DRAFT_PATH="$RELEASE_ROOT/$RELEASE_NAME-github-release.md"

mkdir -p "$RELEASE_ROOT"

write_step "Running Linux desktop build"
go run github.com/wailsapp/wails/v2/cmd/wails@v2.9.3 build \
  -nosyncgomod \
  -m \
  -platform linux/amd64 \
  -nopackage \
  -tags webkit2_41 \
  -o "$PRODUCT_NAME"

BINARY_PATH="$ROOT/build/bin/$BINARY_NAME"
assert_path_exists "$BINARY_PATH" "Desktop binary"

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/docs"

ROOT_FILES=(
  "LICENSE"
  "CHANGELOG.md"
  "RELEASE_NOTES.md"
  "README.md"
  "README.zh.md"
)

DOC_FILES=(
  "docs/release-checklist.md"
  "docs/release-copy.md"
  "docs/release-github-bilingual.md"
  "docs/release-package-layout.md"
  "docs/release-publish-final.md"
  "docs/screenshot.png"
)

write_step "Copying Linux release artifacts"
cp "$BINARY_PATH" "$STAGING_DIR/$BINARY_NAME"
chmod +x "$STAGING_DIR/$BINARY_NAME"

for file in "${ROOT_FILES[@]}"; do
  assert_path_exists "$ROOT/$file" "Release file"
  cp "$ROOT/$file" "$STAGING_DIR/$(basename "$file")"
done

for file in "${DOC_FILES[@]}"; do
  assert_path_exists "$ROOT/$file" "Release document"
  cp "$ROOT/$file" "$STAGING_DIR/docs/$(basename "$file")"
done

MANIFEST_PATH="$STAGING_DIR/release-manifest.txt"
{
  echo "Product: $PRODUCT_NAME"
  echo "Version: $PRODUCT_VERSION"
  echo "Platform: $PLATFORM_TAG"
  echo "BuiltAt: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo
  echo "Files:"
  find "$STAGING_DIR" -type f | sort | while read -r path; do
    rel="${path#$STAGING_DIR/}"
    size="$(stat -c%s "$path")"
    echo "- $rel ($size bytes)"
  done
} > "$MANIFEST_PATH"

if [[ "$SKIP_TAR" != "1" ]]; then
  write_step "Creating tar.gz package"
  rm -f "$TAR_PATH"
  tar -C "$RELEASE_ROOT" -czf "$TAR_PATH" "$RELEASE_NAME"
fi

write_step "Writing checksums"
CHECKSUM_TARGETS=()
[[ -f "$TAR_PATH" ]] && CHECKSUM_TARGETS+=("$TAR_PATH")
new_checksum_file "$CHECKSUM_PATH" "${CHECKSUM_TARGETS[@]}"

write_step "Writing release asset list"
new_release_asset_list \
  "$PRODUCT_NAME" \
  "$PRODUCT_VERSION" \
  "$PLATFORM_TAG" \
  "$STAGING_DIR" \
  "$TAR_PATH" \
  "$CHECKSUM_PATH" \
  "$ASSET_LIST_PATH"

write_step "Writing GitHub release draft"
new_github_release_draft \
  "$PRODUCT_NAME" \
  "$PRODUCT_VERSION" \
  "$TAR_PATH" \
  "$CHECKSUM_PATH" \
  "$GITHUB_DRAFT_PATH"

write_step "Linux release artifacts ready"
echo "Staging directory: $STAGING_DIR"
[[ -f "$TAR_PATH" ]] && echo "Tar package:      $TAR_PATH"
echo "Checksums:        $CHECKSUM_PATH"
echo "Asset list:       $ASSET_LIST_PATH"
echo "GitHub draft:     $GITHUB_DRAFT_PATH"
