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

new_combined_checksum_file() {
  local release_root="$1"
  local product_name="$2"
  local product_version="$3"
  local destination="$4"

  local patterns=(
    "$product_name-$product_version-*.zip"
    "$product_name-$product_version-*.tar.gz"
    "$product_name-$product_version-*.exe"
    "$product_name-$product_version-*.msi"
    "$product_name-$product_version-*.AppImage"
    "$product_name-$product_version-*.deb"
    "$product_name-$product_version-*.rpm"
  )

  : > "$destination"
  (
    shopt -s nullglob
    for pattern in "${patterns[@]}"; do
      for path in "$release_root"/$pattern; do
        [[ -f "$path" ]] || continue
        sha256sum "$path"
      done
    done
  ) | awk '!seen[$2]++' > "$destination"
}

get_asset_kind() {
  local name
  name="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  case "$name" in
    *.exe|*.msi)
      echo "installer"
      ;;
    *.zip|*.tar.gz|*.appimage|*.deb|*.rpm)
      echo "archive"
      ;;
    *)
      echo "asset"
      ;;
  esac
}

new_release_manifest() {
  local product_name="$1"
  local product_version="$2"
  local platform_tag="$3"
  local release_notes="$4"
  local destination="$5"
  shift 5
  local asset_paths=("$@")

  python3 - "$product_name" "$product_version" "$platform_tag" "$release_notes" "$destination" "${asset_paths[@]}" <<'PY'
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

product_name = sys.argv[1]
product_version = sys.argv[2]
platform_tag = sys.argv[3]
release_notes = sys.argv[4]
destination = sys.argv[5]
asset_paths = sys.argv[6:]

def asset_kind(name: str) -> str:
    lowered = name.lower()
    if lowered.endswith((".exe", ".msi")):
        return "installer"
    if lowered.endswith((".zip", ".tar.gz", ".appimage", ".deb", ".rpm")):
        return "archive"
    return "asset"

assets = []
for path in asset_paths:
    if not path or not os.path.isfile(path):
        continue
    with open(path, "rb") as file:
        sha256 = hashlib.sha256(file.read()).hexdigest()
    name = os.path.basename(path)
    assets.append({
        "platform": platform_tag,
        "name": name,
        "kind": asset_kind(name),
        "downloadUrl": f"https://github.com/punk-one/NatsX/releases/download/v{product_version}/{name}",
        "sha256": sha256,
        "size": os.path.getsize(path),
    })

existing_assets = []
if os.path.exists(destination):
    try:
        with open(destination, "r", encoding="utf-8-sig") as file:
            existing = json.load(file)
        existing_assets = [
            item for item in existing.get("assets", [])
            if item.get("platform") != platform_tag
        ]
    except Exception:
        existing_assets = []

manifest = {
    "schemaVersion": 1,
    "product": product_name,
    "version": product_version,
    "tag": f"v{product_version}",
    "releaseUrl": f"https://github.com/punk-one/NatsX/releases/tag/v{product_version}",
    "publishedAt": datetime.now(timezone.utc).isoformat(),
    "releaseNotes": release_notes,
    "assets": existing_assets + assets,
}

with open(destination, "w", encoding="utf-8") as file:
    json.dump(manifest, file, ensure_ascii=False, indent=2)
    file.write("\n")
PY
}

new_release_asset_list() {
  local product_name="$1"
  local product_version="$2"
  local platform_tag="$3"
  local staging_dir="$4"
  local tar_path="$5"
  local checksum_path="$6"
  local combined_checksum_path="$7"
  local latest_manifest_path="$8"
  local destination="$9"

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
    if [[ -f "$combined_checksum_path" ]]; then
      echo "- \`$(basename "$combined_checksum_path")\` - Combined SHA256 checksum file ($(stat -c%s "$combined_checksum_path") bytes)"
    fi
    if [[ -f "$latest_manifest_path" ]]; then
      echo "- \`$(basename "$latest_manifest_path")\` - Structured release manifest ($(stat -c%s "$latest_manifest_path") bytes)"
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
    echo "- Upload \`SHA256SUMS\` and \`latest.json\`"
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
  local combined_checksum_path="$5"
  local latest_manifest_path="$6"
  local destination="$7"

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
    [[ -f "$combined_checksum_path" ]] && echo "- \`$(basename "$combined_checksum_path")\` ($(stat -c%s "$combined_checksum_path") bytes)"
    [[ -f "$latest_manifest_path" ]] && echo "- \`$(basename "$latest_manifest_path")\` ($(stat -c%s "$latest_manifest_path") bytes)"
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
COMBINED_CHECKSUM_PATH="$RELEASE_ROOT/SHA256SUMS"
LATEST_MANIFEST_PATH="$RELEASE_ROOT/latest.json"
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

RELEASE_NOTES_CONTENT="$(cat "$ROOT/RELEASE_NOTES.md")"

if [[ "$SKIP_TAR" != "1" ]]; then
  write_step "Creating tar.gz package"
  rm -f "$TAR_PATH"
  tar -C "$RELEASE_ROOT" -czf "$TAR_PATH" "$RELEASE_NAME"
fi

write_step "Writing checksums"
CHECKSUM_TARGETS=()
[[ -f "$TAR_PATH" ]] && CHECKSUM_TARGETS+=("$TAR_PATH")
new_checksum_file "$CHECKSUM_PATH" "${CHECKSUM_TARGETS[@]}"
new_combined_checksum_file "$RELEASE_ROOT" "$PRODUCT_NAME" "$PRODUCT_VERSION" "$COMBINED_CHECKSUM_PATH"
new_release_manifest \
  "$PRODUCT_NAME" \
  "$PRODUCT_VERSION" \
  "$PLATFORM_TAG" \
  "$RELEASE_NOTES_CONTENT" \
  "$LATEST_MANIFEST_PATH" \
  "${CHECKSUM_TARGETS[@]}"

write_step "Writing release asset list"
new_release_asset_list \
  "$PRODUCT_NAME" \
  "$PRODUCT_VERSION" \
  "$PLATFORM_TAG" \
  "$STAGING_DIR" \
  "$TAR_PATH" \
  "$CHECKSUM_PATH" \
  "$COMBINED_CHECKSUM_PATH" \
  "$LATEST_MANIFEST_PATH" \
  "$ASSET_LIST_PATH"

write_step "Writing GitHub release draft"
new_github_release_draft \
  "$PRODUCT_NAME" \
  "$PRODUCT_VERSION" \
  "$TAR_PATH" \
  "$CHECKSUM_PATH" \
  "$COMBINED_CHECKSUM_PATH" \
  "$LATEST_MANIFEST_PATH" \
  "$GITHUB_DRAFT_PATH"

write_step "Linux release artifacts ready"
echo "Staging directory: $STAGING_DIR"
[[ -f "$TAR_PATH" ]] && echo "Tar package:      $TAR_PATH"
echo "Checksums:        $CHECKSUM_PATH"
echo "SHA256SUMS:       $COMBINED_CHECKSUM_PATH"
echo "Latest manifest:  $LATEST_MANIFEST_PATH"
echo "Asset list:       $ASSET_LIST_PATH"
echo "GitHub draft:     $GITHUB_DRAFT_PATH"
