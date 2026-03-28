param(
    [switch]$Nsis,
    [string]$Version,
    [string]$OutputDir,
    [switch]$SkipZip
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param(
        [string]$Message
    )

    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-PathExists {
    param(
        [string]$Path,
        [string]$Description
    )

    if (-not (Test-Path $Path)) {
        throw "$Description not found: $Path"
    }
}

function New-ChecksumFile {
    param(
        [string[]]$Paths,
        [string]$Destination
    )

    $lines = @()

    foreach ($path in $Paths) {
        if (-not (Test-Path $path)) {
            continue
        }

        $item = Get-Item $path
        if ($item.PSIsContainer) {
            continue
        }

        $hash = Get-FileHash -Path $item.FullName -Algorithm SHA256
        $lines += "{0} *{1}" -f $hash.Hash.ToLowerInvariant(), $item.Name
    }

    Set-Content -Path $Destination -Value $lines -Encoding UTF8
}

function Set-Utf8NoBomContent {
    param(
        [string]$Path,
        [string]$Content
    )

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function New-CombinedChecksumFile {
    param(
        [string]$ReleaseRoot,
        [string]$ProductName,
        [string]$ProductVersion,
        [string]$Destination
    )

    $patterns = @(
        "$ProductName-$ProductVersion-*.zip",
        "$ProductName-$ProductVersion-*.tar.gz",
        "$ProductName-$ProductVersion-*.exe",
        "$ProductName-$ProductVersion-*.msi",
        "$ProductName-$ProductVersion-*.AppImage",
        "$ProductName-$ProductVersion-*.deb",
        "$ProductName-$ProductVersion-*.rpm"
    )

    $items = New-Object System.Collections.Generic.List[System.IO.FileInfo]
    foreach ($pattern in $patterns) {
        Get-ChildItem -Path $ReleaseRoot -File -Filter $pattern -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notlike "*.sha256.txt" } |
            ForEach-Object { [void]$items.Add($_) }
    }

    $uniqueItems = $items |
        Sort-Object FullName -Unique

    $lines = @()
    foreach ($item in $uniqueItems) {
        $hash = Get-FileHash -Path $item.FullName -Algorithm SHA256
        $lines += "{0} *{1}" -f $hash.Hash.ToLowerInvariant(), $item.Name
    }

    Set-Content -Path $Destination -Value $lines -Encoding UTF8
}

function Get-AssetKind {
    param(
        [string]$Name
    )

    $lowerName = $Name.ToLowerInvariant()
    if ($lowerName.EndsWith(".exe") -or $lowerName.EndsWith(".msi")) {
        return "installer"
    }
    if ($lowerName.EndsWith(".zip") -or $lowerName.EndsWith(".tar.gz") -or $lowerName.EndsWith(".appimage") -or $lowerName.EndsWith(".deb") -or $lowerName.EndsWith(".rpm")) {
        return "archive"
    }
    return "asset"
}

function New-ReleaseManifest {
    param(
        [string]$ProductName,
        [string]$ProductVersion,
        [string]$PlatformTag,
        [string]$ReleaseRoot,
        [string]$ReleaseUrl,
        [string]$ReleaseNotes,
        [string[]]$AssetPaths,
        [string]$Destination
    )

    $assets = @()
    foreach ($path in $AssetPaths) {
        if (-not (Test-Path $path)) {
            continue
        }

        $item = Get-Item $path
        if ($item.PSIsContainer) {
            continue
        }

        $hash = (Get-FileHash -Path $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $assets += [ordered]@{
            platform    = $PlatformTag
            name        = $item.Name
            kind        = Get-AssetKind -Name $item.Name
            downloadUrl = "$ReleaseUrl/download/v$ProductVersion/$($item.Name)"
            sha256      = $hash
            size        = $item.Length
        }
    }

    $existingAssets = @()
    if (Test-Path $Destination) {
        try {
            $existing = Get-Content $Destination -Raw | ConvertFrom-Json
            if ($existing.assets) {
                $existingAssets = @($existing.assets | Where-Object { $_.platform -ne $PlatformTag })
            }
        }
        catch {
            $existingAssets = @()
        }
    }

    $manifest = [ordered]@{
        schemaVersion = 1
        product       = $ProductName
        version       = $ProductVersion
        tag           = "v$ProductVersion"
        releaseUrl    = "$ReleaseUrl/tag/v$ProductVersion"
        publishedAt   = [DateTimeOffset]::Now.ToString("o")
        releaseNotes  = $ReleaseNotes
        assets        = @($existingAssets + $assets)
    }

    $json = $manifest | ConvertTo-Json -Depth 6
    Set-Utf8NoBomContent -Path $Destination -Content $json
}

function New-ReleaseAssetList {
    param(
        [string]$ProductName,
        [string]$ProductVersion,
        [string]$PlatformTag,
        [string]$StagingDir,
        [string]$ZipPath,
        [string]$SetupPath,
        [string]$ChecksumPath,
        [string]$CombinedChecksumPath,
        [string]$LatestManifestPath,
        [string]$Destination
    )

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("# $ProductName $ProductVersion Release Assets")
    $lines.Add("")
    $lines.Add("## Attach to GitHub Release")
    $lines.Add("")

    if (Test-Path $ZipPath) {
        $zipItem = Get-Item $ZipPath
        $lines.Add([string]::Format('- `{0}` - Portable zip package ({1} bytes)', $zipItem.Name, $zipItem.Length))
    }

    if (Test-Path $SetupPath) {
        $setupItem = Get-Item $SetupPath
        $lines.Add([string]::Format('- `{0}` - Windows NSIS installer ({1} bytes)', $setupItem.Name, $setupItem.Length))
    }

    if (Test-Path $ChecksumPath) {
        $checksumItem = Get-Item $ChecksumPath
        $lines.Add([string]::Format('- `{0}` - SHA256 checksum file ({1} bytes)', $checksumItem.Name, $checksumItem.Length))
    }

    if (Test-Path $CombinedChecksumPath) {
        $combinedChecksumItem = Get-Item $CombinedChecksumPath
        $lines.Add([string]::Format('- `{0}` - Combined SHA256 checksum file ({1} bytes)', $combinedChecksumItem.Name, $combinedChecksumItem.Length))
    }

    if (Test-Path $LatestManifestPath) {
        $latestManifestItem = Get-Item $LatestManifestPath
        $lines.Add([string]::Format('- `{0}` - Structured release manifest ({1} bytes)', $latestManifestItem.Name, $latestManifestItem.Length))
    }

    $lines.Add("")
    $lines.Add("## Staging Directory")
    $lines.Add("")
    $lines.Add([string]::Format('- `{0}` - Expanded release folder for manual inspection', ([System.IO.Path]::GetFileName($StagingDir))))
    $lines.Add("")
    $lines.Add("## Recommended Release Title")
    $lines.Add("")
    $lines.Add([string]::Format('- Tag: `v{0}`', $ProductVersion))
    $lines.Add([string]::Format('- Title: `{0} v{1}`', $ProductName, $ProductVersion))
    $lines.Add("")
    $lines.Add("## Recommended Release Body")
    $lines.Add("")
    $lines.Add('- Use the final publish copy from `docs/release-publish-final.md`')
    $lines.Add('- Use `docs/release-github-bilingual.md` when you want a shorter bilingual body')
    $lines.Add('- Use `RELEASE_NOTES.md` for the concise feature summary')
    $lines.Add("")
    $lines.Add("## Publish Checklist")
    $lines.Add("")
    $lines.Add('- Upload the portable `.zip` package')
    $lines.Add('- Upload the matching `.sha256.txt` file')
    $lines.Add('- Upload `SHA256SUMS` and `latest.json`')
    $lines.Add('- Mark this release as a Windows desktop release')
    $lines.Add('- Add the project URL: `https://github.com/punk-one/NatsX`')
    $lines.Add("")
    $lines.Add("## Notes")
    $lines.Add("")
    $versionLine = '- Version: `' + $ProductVersion + '`'
    $platformLine = '- Platform: `' + $PlatformTag + '`'
    $lines.Add($versionLine)
    $lines.Add($platformLine)
    $lines.Add('- Include the generated `.sha256.txt` file alongside uploaded assets')

    Set-Content -Path $Destination -Value $lines -Encoding UTF8
}

function New-GitHubReleaseDraft {
    param(
        [string]$ProductName,
        [string]$ProductVersion,
        [string]$ZipPath,
        [string]$ChecksumPath,
        [string]$SetupPath,
        [string]$CombinedChecksumPath,
        [string]$LatestManifestPath,
        [string]$Destination
    )

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add([string]::Format('# {0} v{1}', $ProductName, $ProductVersion))
    $lines.Add("")
    $lines.Add('Windows Desktop Release for `NATS / JetStream`')
    $lines.Add("")
    $lines.Add([string]::Format('`{0} {1}` is a Windows desktop client for `NATS / JetStream`, built with `Go + Wails + React + Ant Design`.', $ProductName, $ProductVersion))
    $lines.Add("")
    $lines.Add("## Highlights")
    $lines.Add("")
    $lines.Add('- Connection management with local persistence')
    $lines.Add('- `No Auth`, `Username / Password`, `Token`, `TLS / mTLS`, `NKey`, and `Credentials`')
    $lines.Add('- Publish, subscribe, reply, republish, and payload inspection')
    $lines.Add('- `Request / Reply` replay and compare workflow')
    $lines.Add('- JetStream Stream / Consumer tools with `Ack / Nak / Term`')
    $lines.Add('- Pure-Go `SQLite` persistence for settings, connections, update state, and logs')
    $lines.Add('- Chinese and English UI support with saved language preference')
    $lines.Add("")
    $lines.Add("## Downloads")
    $lines.Add("")

    if (Test-Path $ZipPath) {
        $zipItem = Get-Item $ZipPath
        $lines.Add([string]::Format('- `{0}` ({1} bytes)', $zipItem.Name, $zipItem.Length))
    }

    if (Test-Path $ChecksumPath) {
        $checksumItem = Get-Item $ChecksumPath
        $lines.Add([string]::Format('- `{0}` ({1} bytes)', $checksumItem.Name, $checksumItem.Length))
    }

    if (Test-Path $CombinedChecksumPath) {
        $combinedChecksumItem = Get-Item $CombinedChecksumPath
        $lines.Add([string]::Format('- `{0}` ({1} bytes)', $combinedChecksumItem.Name, $combinedChecksumItem.Length))
    }

    if (Test-Path $LatestManifestPath) {
        $latestManifestItem = Get-Item $LatestManifestPath
        $lines.Add([string]::Format('- `{0}` ({1} bytes)', $latestManifestItem.Name, $latestManifestItem.Length))
    }

    if (Test-Path $SetupPath) {
        $setupItem = Get-Item $SetupPath
        $lines.Add([string]::Format('- `{0}` ({1} bytes)', $setupItem.Name, $setupItem.Length))
    }

    $lines.Add("")
    $lines.Add("## Project")
    $lines.Add("")
    $lines.Add('- Repository: `https://github.com/punk-one/NatsX`')
    $lines.Add('- Homepage: `https://github.com/punk-one/NatsX`')
    $lines.Add('- Release notes: see `RELEASE_NOTES.md` in the package')

    Set-Content -Path $Destination -Value $lines -Encoding UTF8
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:GOMODCACHE = Join-Path $root ".cache\gomod"
$env:GOCACHE = Join-Path $root ".cache\gobuild"
$env:CGO_ENABLED = "0"

$config = Get-Content (Join-Path $root "wails.json") -Raw | ConvertFrom-Json
$productName = if ($config.info.productName) { $config.info.productName } else { $config.name }
$productVersion = if ($Version) { $Version } else { $config.info.productVersion }

if (-not $productName) {
    throw "Unable to determine product name from wails.json"
}

if (-not $productVersion) {
    throw "Unable to determine product version from wails.json"
}

$platformTag = "windows-amd64"
$binaryName = "$productName.exe"
$releaseName = "$productName-$productVersion-$platformTag"
$releaseRoot = if ($OutputDir) { $OutputDir } else { Join-Path $root "release" }
$stagingDir = Join-Path $releaseRoot $releaseName
$zipPath = Join-Path $releaseRoot "$releaseName.zip"
$setupPath = Join-Path $releaseRoot "$productName-$productVersion-$platformTag-setup.exe"
$checksumPath = Join-Path $releaseRoot "$releaseName.sha256.txt"
$combinedChecksumPath = Join-Path $releaseRoot "SHA256SUMS"
$latestManifestPath = Join-Path $releaseRoot "latest.json"
$assetListPath = Join-Path $releaseRoot "$releaseName-assets.md"
$githubDraftPath = Join-Path $releaseRoot "$releaseName-github-release.md"

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

$buildArgs = @(
    "run",
    "github.com/wailsapp/wails/v2/cmd/wails@v2.9.3",
    "build",
    "-nosyncgomod",
    "-m",
    "-ldflags",
    "-H=windowsgui -extldflags=-Wl,--subsystem,windows"
)

if ($Nsis) {
    $makensis = Get-Command "makensis" -ErrorAction SilentlyContinue
    if (-not $makensis) {
        throw "makensis not found. Please install NSIS and ensure it is in PATH before using -Nsis."
    }
    $buildArgs += "-nsis"
}

Write-Step "Running desktop build"
Write-Host "go $($buildArgs -join ' ')" -ForegroundColor DarkGray
& go @buildArgs

$binaryPath = Join-Path $root "build\bin\$binaryName"
Assert-PathExists -Path $binaryPath -Description "Desktop binary"

if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}

Write-Step "Preparing staging directory"
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stagingDir "docs") | Out-Null

$rootFiles = @(
    "LICENSE",
    "CHANGELOG.md",
    "RELEASE_NOTES.md",
    "README.md",
    "README.zh.md"
)

$docFiles = @(
    "docs\release-checklist.md",
    "docs\release-copy.md",
    "docs\release-github-bilingual.md",
    "docs\release-package-layout.md",
    "docs\release-publish-final.md",
    "docs\screenshot.png"
)

Write-Step "Copying release artifacts"
Copy-Item $binaryPath (Join-Path $stagingDir $binaryName) -Force

foreach ($file in $rootFiles) {
    $source = Join-Path $root $file
    Assert-PathExists -Path $source -Description "Release file"
    Copy-Item $source (Join-Path $stagingDir ([System.IO.Path]::GetFileName($file))) -Force
}

foreach ($file in $docFiles) {
    $source = Join-Path $root $file
    Assert-PathExists -Path $source -Description "Release document"
    $docTarget = Join-Path (Join-Path $stagingDir "docs") ([System.IO.Path]::GetFileName($file))
    Copy-Item $source $docTarget -Force
}

$manifestPath = Join-Path $stagingDir "release-manifest.txt"
$manifestLines = @(
    "Product: $productName",
    "Version: $productVersion",
    "Platform: $platformTag",
    "BuiltAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
    "",
    "Files:"
)

Get-ChildItem -Recurse -File $stagingDir |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($stagingDir.Length + 1)
        $manifestLines += "- $relative ($($_.Length) bytes)"
    }

Set-Content -Path $manifestPath -Value $manifestLines -Encoding UTF8

$releaseNotesContent = Get-Content (Join-Path $root "RELEASE_NOTES.md") -Raw

if (-not $SkipZip) {
    Write-Step "Creating zip package"
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }
    Compress-Archive -Path $stagingDir -DestinationPath $zipPath -Force
}

if ($Nsis) {
    Write-Step "Collecting NSIS installer"
    $installer = Get-ChildItem (Join-Path $root "build\bin") -Filter "*installer.exe" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $installer) {
        throw "NSIS installer was not found in build\\bin after build."
    }

    Copy-Item $installer.FullName $setupPath -Force
}

Write-Step "Writing checksums"
$checksumTargets = @()
if (Test-Path $zipPath) {
    $checksumTargets += $zipPath
}
if (Test-Path $setupPath) {
    $checksumTargets += $setupPath
}
New-ChecksumFile -Paths $checksumTargets -Destination $checksumPath
New-CombinedChecksumFile -ReleaseRoot $releaseRoot -ProductName $productName -ProductVersion $productVersion -Destination $combinedChecksumPath
New-ReleaseManifest `
    -ProductName $productName `
    -ProductVersion $productVersion `
    -PlatformTag $platformTag `
    -ReleaseRoot $releaseRoot `
    -ReleaseUrl "https://github.com/punk-one/NatsX/releases" `
    -ReleaseNotes $releaseNotesContent `
    -AssetPaths $checksumTargets `
    -Destination $latestManifestPath

Write-Step "Writing release asset list"
New-ReleaseAssetList `
    -ProductName $productName `
    -ProductVersion $productVersion `
    -PlatformTag $platformTag `
    -StagingDir $stagingDir `
    -ZipPath $zipPath `
    -SetupPath $setupPath `
    -ChecksumPath $checksumPath `
    -CombinedChecksumPath $combinedChecksumPath `
    -LatestManifestPath $latestManifestPath `
    -Destination $assetListPath

Write-Step "Writing GitHub release draft"
New-GitHubReleaseDraft `
    -ProductName $productName `
    -ProductVersion $productVersion `
    -ZipPath $zipPath `
    -ChecksumPath $checksumPath `
    -SetupPath $setupPath `
    -CombinedChecksumPath $combinedChecksumPath `
    -LatestManifestPath $latestManifestPath `
    -Destination $githubDraftPath

Write-Step "Release artifacts ready"
Write-Host "Staging directory: $stagingDir" -ForegroundColor Green
if (-not $SkipZip) {
    Write-Host "Zip package:      $zipPath" -ForegroundColor Green
}
if ($Nsis) {
    Write-Host "NSIS installer:   $setupPath" -ForegroundColor Green
}
Write-Host "Checksums:        $checksumPath" -ForegroundColor Green
Write-Host "SHA256SUMS:       $combinedChecksumPath" -ForegroundColor Green
Write-Host "Latest manifest:  $latestManifestPath" -ForegroundColor Green
Write-Host "Asset list:       $assetListPath" -ForegroundColor Green
Write-Host "GitHub draft:     $githubDraftPath" -ForegroundColor Green
