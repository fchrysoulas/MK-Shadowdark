<#
.SYNOPSIS
Builds Foundry VTT release assets for this module.

.DESCRIPTION
Creates dist/v<version>/module.json and dist/v<version>/<module-id>.zip from
the version in module.json.

With -Publish, the script also creates the matching GitHub release when it does
not exist, or updates the existing release by replacing the attached assets.

.EXAMPLE
.\release.ps1

Builds the local Foundry release assets.

.EXAMPLE
.\release.ps1 -Publish

Builds the assets, creates or updates the GitHub release, and attaches
module.json and mk-shadowdark-crafting.zip.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$OutputRoot = "dist",
  [switch]$Publish,
  [string]$Repository = "",
  [switch]$Draft,
  [switch]$Prerelease
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsSubPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Root
  )

  $comparison = [System.StringComparison]::OrdinalIgnoreCase
  $separators = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd($separators)
  $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd($separators)
  $rootPrefix = "$fullRoot$([System.IO.Path]::DirectorySeparatorChar)"

  return $fullPath.Equals($fullRoot, $comparison) -or $fullPath.StartsWith($rootPrefix, $comparison)
}

function ConvertTo-GitHubRepositorySlug {
  param(
    [AllowEmptyString()]
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  $trimmed = $Value.Trim()

  if ($trimmed -match "^https://github\.com/([^/]+/[^/]+?)(?:\.git)?/?$") {
    return $matches[1]
  }

  if ($trimmed -match "^git@github\.com:([^/]+/[^/]+?)(?:\.git)?$") {
    return $matches[1]
  }

  if ($trimmed -match "^([^/\s]+/[^/\s]+?)(?:\.git)?$") {
    return $matches[1]
  }

  return ""
}

function Get-GitHubRepository {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [AllowEmptyString()]
    [string]$ExplicitRepository
  )

  $normalized = ConvertTo-GitHubRepositorySlug -Value $ExplicitRepository
  if (-not [string]::IsNullOrWhiteSpace($normalized)) {
    return $normalized
  }

  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    return ""
  }

  $remote = (& git -C $RepoRoot config --get remote.origin.url) 2>$null
  if ($LASTEXITCODE -ne 0) {
    return ""
  }

  return ConvertTo-GitHubRepositorySlug -Value $remote
}

function Set-JsonProperty {
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Object,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [AllowNull()]
    [object]$Value
  )

  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
    return
  }

  $property.Value = $Value
}

function ConvertTo-EscapedJsonString {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyString()]
    [string]$Value
  )

  $builder = [System.Text.StringBuilder]::new()

  foreach ($character in $Value.ToCharArray()) {
    $code = [int][char]$character

    if ($character -eq '"') {
      [void]$builder.Append('\"')
    } elseif ($character -eq [char]0x5c) {
      [void]$builder.Append('\\')
    } elseif ($character -eq [char]0x08) {
      [void]$builder.Append('\b')
    } elseif ($character -eq [char]0x0c) {
      [void]$builder.Append('\f')
    } elseif ($character -eq [char]0x0a) {
      [void]$builder.Append('\n')
    } elseif ($character -eq [char]0x0d) {
      [void]$builder.Append('\r')
    } elseif ($character -eq [char]0x09) {
      [void]$builder.Append('\t')
    } elseif ($code -lt 0x20 -or $code -gt 0x7e) {
      [void]$builder.Append(('\u{0:x4}' -f $code))
    } else {
      [void]$builder.Append($character)
    }
  }

  return $builder.ToString()
}

function Test-JsonNumber {
  param(
    [AllowNull()]
    [object]$Value
  )

  return $Value -is [byte] `
    -or $Value -is [sbyte] `
    -or $Value -is [int16] `
    -or $Value -is [uint16] `
    -or $Value -is [int] `
    -or $Value -is [uint32] `
    -or $Value -is [long] `
    -or $Value -is [uint64] `
    -or $Value -is [single] `
    -or $Value -is [double] `
    -or $Value -is [decimal]
}

function Write-JsonIndent {
  param(
    [Parameter(Mandatory = $true)]
    [System.Text.StringBuilder]$Builder,

    [Parameter(Mandatory = $true)]
    [int]$Depth,

    [Parameter(Mandatory = $true)]
    [int]$IndentSize
  )

  if ($Depth -gt 0) {
    [void]$Builder.Append(" " * ($Depth * $IndentSize))
  }
}

function Write-JsonValue {
  param(
    [AllowNull()]
    [AllowEmptyString()]
    [object]$Value,

    [Parameter(Mandatory = $true)]
    [System.Text.StringBuilder]$Builder,

    [Parameter(Mandatory = $true)]
    [int]$Depth,

    [Parameter(Mandatory = $true)]
    [int]$IndentSize
  )

  $newline = "`n"

  if ($null -eq $Value) {
    [void]$Builder.Append("null")
    return
  }

  if ($Value -is [string] -or $Value -is [char]) {
    [void]$Builder.Append('"')
    [void]$Builder.Append((ConvertTo-EscapedJsonString -Value ([string]$Value)))
    [void]$Builder.Append('"')
    return
  }

  if ($Value -is [bool]) {
    if ($Value) {
      [void]$Builder.Append("true")
    } else {
      [void]$Builder.Append("false")
    }
    return
  }

  if (Test-JsonNumber -Value $Value) {
    if ($Value -is [single] -and ([single]::IsNaN($Value) -or [single]::IsInfinity($Value))) {
      throw "JSON does not support NaN or Infinity."
    }

    if ($Value -is [double] -and ([double]::IsNaN($Value) -or [double]::IsInfinity($Value))) {
      throw "JSON does not support NaN or Infinity."
    }

    [void]$Builder.Append([System.Convert]::ToString($Value, [System.Globalization.CultureInfo]::InvariantCulture))
    return
  }

  if ($Value -is [System.Collections.IDictionary]) {
    $keys = @($Value.Keys)
    if ($keys.Count -eq 0) {
      [void]$Builder.Append("{}")
      return
    }

    [void]$Builder.Append("{")
    [void]$Builder.Append($newline)

    for ($i = 0; $i -lt $keys.Count; $i++) {
      $key = [string]$keys[$i]
      Write-JsonIndent -Builder $Builder -Depth ($Depth + 1) -IndentSize $IndentSize
      [void]$Builder.Append('"')
      [void]$Builder.Append((ConvertTo-EscapedJsonString -Value $key))
      [void]$Builder.Append('": ')
      Write-JsonValue -Value $Value[$keys[$i]] -Builder $Builder -Depth ($Depth + 1) -IndentSize $IndentSize

      if ($i -lt ($keys.Count - 1)) {
        [void]$Builder.Append(",")
      }
      [void]$Builder.Append($newline)
    }

    Write-JsonIndent -Builder $Builder -Depth $Depth -IndentSize $IndentSize
    [void]$Builder.Append("}")
    return
  }

  if ($Value -is [System.Collections.IEnumerable]) {
    $items = @()
    foreach ($item in $Value) {
      $items += $item
    }

    if ($items.Count -eq 0) {
      [void]$Builder.Append("[]")
      return
    }

    [void]$Builder.Append("[")
    [void]$Builder.Append($newline)

    for ($i = 0; $i -lt $items.Count; $i++) {
      Write-JsonIndent -Builder $Builder -Depth ($Depth + 1) -IndentSize $IndentSize
      Write-JsonValue -Value $items[$i] -Builder $Builder -Depth ($Depth + 1) -IndentSize $IndentSize

      if ($i -lt ($items.Count - 1)) {
        [void]$Builder.Append(",")
      }
      [void]$Builder.Append($newline)
    }

    Write-JsonIndent -Builder $Builder -Depth $Depth -IndentSize $IndentSize
    [void]$Builder.Append("]")
    return
  }

  $properties = @($Value.PSObject.Properties | Where-Object {
    $_.MemberType -eq [System.Management.Automation.PSMemberTypes]::NoteProperty `
      -or $_.MemberType -eq [System.Management.Automation.PSMemberTypes]::Property
  })

  if ($properties.Count -eq 0) {
    [void]$Builder.Append("{}")
    return
  }

  [void]$Builder.Append("{")
  [void]$Builder.Append($newline)

  for ($i = 0; $i -lt $properties.Count; $i++) {
    $property = $properties[$i]
    Write-JsonIndent -Builder $Builder -Depth ($Depth + 1) -IndentSize $IndentSize
    [void]$Builder.Append('"')
    [void]$Builder.Append((ConvertTo-EscapedJsonString -Value $property.Name))
    [void]$Builder.Append('": ')
    Write-JsonValue -Value $property.Value -Builder $Builder -Depth ($Depth + 1) -IndentSize $IndentSize

    if ($i -lt ($properties.Count - 1)) {
      [void]$Builder.Append(",")
    }
    [void]$Builder.Append($newline)
  }

  Write-JsonIndent -Builder $Builder -Depth $Depth -IndentSize $IndentSize
  [void]$Builder.Append("}")
}

function ConvertTo-JsonText {
  param(
    [Parameter(Mandatory = $true)]
    [object]$InputObject
  )

  $builder = [System.Text.StringBuilder]::new()
  Write-JsonValue -Value $InputObject -Builder $builder -Depth 0 -IndentSize 2
  return $builder.ToString()
}

function Write-JsonFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [object]$InputObject
  )

  $json = ConvertTo-JsonText -InputObject $InputObject
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, "$json`n", $utf8NoBom)
}

function Get-ChangelogSection {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ChangelogPath,

    [Parameter(Mandatory = $true)]
    [string]$Version
  )

  if (-not (Test-Path -LiteralPath $ChangelogPath -PathType Leaf)) {
    return ""
  }

  $versionPattern = [regex]::Escape($Version)
  $headingPattern = "^\s*##\s+\[?v?$versionPattern\]?\s*$"
  $capturing = $false
  $lines = [System.Collections.Generic.List[string]]::new()

  foreach ($line in Get-Content -LiteralPath $ChangelogPath) {
    if ($line -match "^\s*##\s+") {
      if ($capturing) {
        break
      }

      if ($line -match $headingPattern) {
        $capturing = $true
        continue
      }
    }

    if ($capturing) {
      $lines.Add($line)
    }
  }

  return (($lines -join [Environment]::NewLine).Trim())
}

function Invoke-GitHubCli {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & gh @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI command failed: gh $($Arguments -join ' ')"
  }
}

function Test-GitHubReleaseExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TagName,

    [Parameter(Mandatory = $true)]
    [string]$RepositorySlug
  )

  $output = @()
  $exitCode = 0
  $previousNativeCommandUseErrorActionPreference = $false
  $hasNativeCommandUseErrorActionPreference = Test-Path Variable:\PSNativeCommandUseErrorActionPreference

  try {
    $ErrorActionPreference = "Continue"

    if ($hasNativeCommandUseErrorActionPreference) {
      $previousNativeCommandUseErrorActionPreference = $PSNativeCommandUseErrorActionPreference
      $PSNativeCommandUseErrorActionPreference = $false
    }

    $output = & gh release view $TagName --repo $RepositorySlug 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    if ($hasNativeCommandUseErrorActionPreference) {
      $PSNativeCommandUseErrorActionPreference = $previousNativeCommandUseErrorActionPreference
    }
  }

  if ($exitCode -eq 0) {
    return $true
  }

  $message = (($output | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine).Trim()
  if ($message -match "release not found") {
    return $false
  }

  if ([string]::IsNullOrWhiteSpace($message)) {
    $message = "exit code $exitCode"
  }

  throw "GitHub CLI command failed while checking release $RepositorySlug@$TagName`: $message"
}

$repoRoot = $PSScriptRoot
$manifestPath = Join-Path $repoRoot "module.json"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "module.json was not found at $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$moduleId = [string]$manifest.id
$version = [string]$manifest.version

if ([string]::IsNullOrWhiteSpace($moduleId)) {
  throw "module.json is missing the required id field."
}

if ([string]::IsNullOrWhiteSpace($version)) {
  throw "module.json is missing the required version field."
}

$zipName = "$moduleId.zip"
$tagName = "v$version"
$repositorySlug = Get-GitHubRepository -RepoRoot $repoRoot -ExplicitRepository $Repository

$releaseManifest = $manifest
if (-not [string]::IsNullOrWhiteSpace($repositorySlug)) {
  Set-JsonProperty -Object $releaseManifest -Name "url" -Value "https://github.com/$repositorySlug"
  Set-JsonProperty -Object $releaseManifest -Name "manifest" -Value "https://github.com/$repositorySlug/releases/latest/download/module.json"
  Set-JsonProperty -Object $releaseManifest -Name "download" -Value "https://github.com/$repositorySlug/releases/download/$tagName/$zipName"
}

if ($releaseManifest.download -and -not ([string]$releaseManifest.download).EndsWith("/$zipName")) {
  Write-Warning "module.json download URL does not end with /$zipName. Foundry release installs may fail if the uploaded asset name differs."
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  throw "OutputRoot cannot be empty."
}

if ([System.IO.Path]::IsPathRooted($OutputRoot)) {
  $distRoot = $OutputRoot
} else {
  $distRoot = Join-Path $repoRoot $OutputRoot
}

$releaseDir = Join-Path $distRoot $tagName
$stageDir = Join-Path $releaseDir $moduleId
$zipPath = Join-Path $releaseDir $zipName
$releaseManifestPath = Join-Path $releaseDir "module.json"

$resolvedRepoRoot = (Resolve-Path -LiteralPath $repoRoot).Path
$resolvedDistRoot = [System.IO.Path]::GetFullPath($distRoot)

if (Test-Path -LiteralPath $releaseDir) {
  $resolvedReleaseDir = (Resolve-Path -LiteralPath $releaseDir).Path
  $isInRepo = Test-IsSubPath -Path $resolvedReleaseDir -Root $resolvedRepoRoot
  $isInDistRoot = Test-IsSubPath -Path $resolvedReleaseDir -Root $resolvedDistRoot

  if (-not ($isInRepo -or $isInDistRoot)) {
    throw "Refusing to remove release directory outside the repository or output root: $resolvedReleaseDir"
  }

  Remove-Item -LiteralPath $releaseDir -Recurse -Force
}

New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

$runtimeFiles = @(
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "LICENSE.md"
)

$runtimeDirectories = @(
  "scripts",
  "styles",
  "templates",
  "lang",
  "languages",
  "packs",
  "assets",
  "icons"
)

foreach ($file in $runtimeFiles) {
  $source = Join-Path $repoRoot $file
  if (Test-Path -LiteralPath $source -PathType Leaf) {
    Copy-Item -LiteralPath $source -Destination $stageDir -Force
  }
}

foreach ($directory in $runtimeDirectories) {
  $source = Join-Path $repoRoot $directory
  if (Test-Path -LiteralPath $source -PathType Container) {
    Copy-Item -LiteralPath $source -Destination $stageDir -Recurse -Force
  }
}

Write-JsonFile -Path (Join-Path $stageDir "module.json") -InputObject $releaseManifest
Write-JsonFile -Path $releaseManifestPath -InputObject $releaseManifest

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force

Remove-Item -LiteralPath $stageDir -Recurse -Force

Write-Host "Created Foundry release assets:"
Write-Host "  $releaseManifestPath"
Write-Host "  $zipPath"

if ([string]::IsNullOrWhiteSpace($repositorySlug)) {
  Write-Warning "Could not determine a GitHub repository. Use -Repository owner/repo to generate publish-ready manifest URLs."
}

if (-not $Publish) {
  Write-Host ""
  Write-Host "Upload both files to the GitHub release tag $tagName, or rerun with -Publish."
  return
}

if ([string]::IsNullOrWhiteSpace($repositorySlug)) {
  throw "Publishing requires a GitHub repository. Pass -Repository owner/repo."
}

if (-not $PSCmdlet.ShouldProcess("GitHub release $repositorySlug@$tagName", "publish Foundry release assets")) {
  return
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "Publishing requires the GitHub CLI. Install gh and authenticate with gh auth login."
}

$releaseExists = Test-GitHubReleaseExists -TagName $tagName -RepositorySlug $repositorySlug

if ($releaseExists) {
  Write-Host ""
  Write-Host "Updating existing GitHub release $repositorySlug@$tagName..."
  Invoke-GitHubCli -Arguments @(
    "release",
    "upload",
    $tagName,
    $releaseManifestPath,
    $zipPath,
    "--repo",
    $repositorySlug,
    "--clobber"
  )
} else {
  Write-Host ""
  Write-Host "Creating GitHub release $repositorySlug@$tagName..."
  $createArgs = @(
    "release",
    "create",
    $tagName,
    $releaseManifestPath,
    $zipPath,
    "--repo",
    $repositorySlug,
    "--title",
    $tagName
  )

  if ($Draft) {
    $createArgs += "--draft"
  }

  if ($Prerelease) {
    $createArgs += "--prerelease"
  }

  $changelogNotes = Get-ChangelogSection -ChangelogPath (Join-Path $repoRoot "CHANGELOG.md") -Version $version
  $notesPath = ""
  if (-not [string]::IsNullOrWhiteSpace($changelogNotes)) {
    $notesPath = Join-Path $releaseDir "release-notes.md"
    Set-Content -LiteralPath $notesPath -Value $changelogNotes -Encoding utf8
    $createArgs += @("--notes-file", $notesPath)
  } else {
    $createArgs += "--generate-notes"
  }

  Invoke-GitHubCli -Arguments $createArgs

  if (-not [string]::IsNullOrWhiteSpace($notesPath) -and (Test-Path -LiteralPath $notesPath)) {
    Remove-Item -LiteralPath $notesPath -Force
  }
}

Write-Host ""
Write-Host "Published Foundry release assets to https://github.com/$repositorySlug/releases/tag/$tagName"
