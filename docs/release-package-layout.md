# NatsX Release Package Layout

## Standard Output

Running:

```powershell
.\scripts\release-windows.ps1
```

produces:

```text
release/
- NatsX-1.0.2-windows-amd64/
  - NatsX.exe
  - LICENSE
  - CHANGELOG.md
  - RELEASE_NOTES.md
  - README.md
  - README.zh.md
  - release-manifest.txt
  - docs/
    - release-checklist.md
    - release-copy.md
    - release-github-bilingual.md
    - release-package-layout.md
    - release-publish-final.md
    - screenshot.png
- NatsX-1.0.2-windows-amd64.zip
- NatsX-1.0.2-windows-amd64.sha256.txt
- NatsX-1.0.2-windows-amd64-assets.md
- NatsX-1.0.2-windows-amd64-github-release.md
```

## NSIS Output

Running:

```powershell
.\scripts\release-windows.ps1 -Nsis
```

adds:

```text
release/
- NatsX-1.0.2-windows-amd64-setup.exe
```

## Notes

- The script reads version metadata from `wails.json`
- The recommended GitHub tag format is `v1.0.2`
- The zip package is intended for portable distribution
- The setup package is intended for installer-style Windows distribution
- The installer is optional and is not required for the current release
- The checksum file is intended for upload verification and integrity checks
- The asset list file is intended as a ready-to-use GitHub Release attachment checklist
- Both English and Simplified Chinese README files are bundled in the staging folder
- The README preview image is bundled as `docs/screenshot.png`
- All outputs are generated under the repository `release/` directory by default

