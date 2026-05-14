#Requires -Version 5.1
<#
.SYNOPSIS
  Verify external API connectivity (Deepgram, Groq, Rime, LiveKit) using .env credentials.
  Safe on Windows: no /dev/null; Groq JSON via file; LiveKit Twirp POST + HS256 JWT (PyJWT).
.NOTES
  From repo root:  powershell -ExecutionPolicy Bypass -File scripts/verify-apis.ps1
  Or PowerShell 7+: pwsh -File scripts/verify-apis.ps1
  From scripts/:   powershell -File ./verify-apis.ps1
#>
[CmdletBinding()]
param(
    [string]$EnvPath = ""
)

if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent -LiteralPath $MyInvocation.MyCommand.Path
}
if ([string]::IsNullOrWhiteSpace($EnvPath)) {
    $EnvPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
}

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Env file not found: $Path"
    }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        if ($line -notmatch "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") { return }
        $name, $value = $matches[1], $matches[2].TrimEnd()
        Set-Item -Path "Env:$name" -Value $value
    }
}

function Get-CurlHttpCode {
    param([string[]]$CurlArgs)
    $out = & curl.exe -sS @CurlArgs 2>&1
    $exit = $LASTEXITCODE
    if ($exit -ne 0) { return @{ Exit = $exit; Http = ""; Text = ($out | Out-String) } }
    $text = if ($out -is [array]) { $out -join "`n" } else { [string]$out }
    return @{ Exit = 0; Http = $text.Trim(); Text = "" }
}

Import-DotEnv -Path $EnvPath

$required = @(
    "DEEPGRAM_API_KEY",
    "GROQ_API_KEY",
    "RIME_API_KEY",
    "LIVEKIT_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET"
)
foreach ($k in $required) {
    if (-not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($k))) { continue }
    throw "Missing required env var: $k (after loading $EnvPath)"
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python is required on PATH for LiveKit JWT signing."
}
$pyJwtCheck = python -c "import jwt" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Python package PyJWT is required. Install: pip install PyJWT. Details: $pyJwtCheck"
}

$tmpDir = [System.IO.Path]::GetTempPath()
$emptyAudio = Join-Path $tmpDir "awaaz-verify-empty.wav"
[System.IO.File]::WriteAllBytes($emptyAudio, [byte[]]::new(0))

$groqBodyPath = Join-Path $tmpDir "awaaz-verify-groq.json"
$groqJson = '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"hi"}]}'
[System.IO.File]::WriteAllText($groqBodyPath, $groqJson, [System.Text.UTF8Encoding]::new($false))

$jwtPy = $null
$script:VerifyFailed = $false
try {
    Write-Host "=== API connectivity (env: $EnvPath) ===`n"

    Write-Host "[1] Deepgram POST /v1/listen (empty payload -> expect ~400, proves reachability)"
    $r1 = Get-CurlHttpCode -CurlArgs @(
        "-o", "NUL",
        "-w", "%{http_code}",
        "-X", "POST", "https://api.deepgram.com/v1/listen",
        "-H", "Authorization: Token $env:DEEPGRAM_API_KEY",
        "-H", "Content-Type: audio/wav",
        "--data-binary", "@$emptyAudio"
    )
    if ($r1.Exit -ne 0) { Write-Host "  FAIL curl exit $($r1.Exit) $($r1.Text)" }
    else { Write-Host "  HTTP $($r1.Http)" }

    Write-Host "`n[2] Groq chat completions (JSON via --data-binary @file)"
    $r2 = Get-CurlHttpCode -CurlArgs @(
        "-o", "NUL",
        "-w", "%{http_code}",
        "https://api.groq.com/openai/v1/chat/completions",
        "-H", "Authorization: Bearer $env:GROQ_API_KEY",
        "-H", "Content-Type: application/json",
        "--data-binary", "@$groqBodyPath"
    )
    if ($r2.Exit -ne 0) { Write-Host "  FAIL curl exit $($r2.Exit) $($r2.Text)" }
    else { Write-Host "  HTTP $($r2.Http)" }

    Write-Host "`n[3] Rime: playbook GET /v1/voices (diagnostic; Rime returns 400 body-required - not a key check)"
    $r3legacy = Get-CurlHttpCode -CurlArgs @(
        "-o", "NUL",
        "-w", "%{http_code}",
        "-X", "GET",
        "https://users.rime.ai/v1/voices",
        "-H", "Authorization: Bearer $env:RIME_API_KEY"
    )
    if ($r3legacy.Exit -ne 0) { Write-Host "  curl exit $($r3legacy.Exit) $($r3legacy.Text)" }
    else { Write-Host "  HTTP $($r3legacy.Http) (expected 400 until Rime restores GET list)" }

    Write-Host "`n[3-pass] Rime voice catalog (docs): GET voice_details.json + Bearer - must be HTTP 200 JSON array"
    $rimeJsonPath = Join-Path $tmpDir "awaaz-verify-rime-voices.json"
    $r3 = Get-CurlHttpCode -CurlArgs @(
        "-o", $rimeJsonPath,
        "-w", "%{http_code}",
        "-X", "GET",
        "https://users.rime.ai/data/voices/voice_details.json",
        "-H", "Authorization: Bearer $env:RIME_API_KEY"
    )
    $rimePass = $false
    if ($r3.Exit -ne 0) {
        Write-Host "  FAIL curl exit $($r3.Exit) $($r3.Text)"
        $script:VerifyFailed = $true
    } elseif ($r3.Http -ne "200") {
        Write-Host "  FAIL HTTP $($r3.Http) (expected 200; check RIME_API_KEY in Rime dashboard)"
        $script:VerifyFailed = $true
    } else {
        try {
            $raw = [System.IO.File]::ReadAllText($rimeJsonPath)
            $parsed = $raw | ConvertFrom-Json
            if ($parsed -is [System.Array] -and $parsed.Length -ge 1) {
                Write-Host "  PASS HTTP 200, JSON array ($($parsed.Length) voices)"
                $rimePass = $true
            } else {
                Write-Host "  FAIL response is not a non-empty JSON array"
                $script:VerifyFailed = $true
            }
        } catch {
            Write-Host "  FAIL invalid JSON: $_"
            $script:VerifyFailed = $true
        }
    }
    Remove-Item -LiteralPath $rimeJsonPath -Force -ErrorAction SilentlyContinue

    if (-not $rimePass) {
        Write-Host "`n  Update RIME_API_KEY in .env and .env.master from the Rime dashboard, then re-run."
    }

    Write-Host "`n[4] LiveKit RoomService ListRooms (POST Twirp + HS256 JWT)"
    $lkHost = $env:LIVEKIT_URL -replace "^wss://", "https://" -replace "^ws://", "http://"
    $jwtPy = Join-Path $tmpDir "awaaz-verify-livekit-jwt.py"
    $jwtSource = @'
import os, sys, jwt, time
try:
    api_key = os.environ["LIVEKIT_API_KEY"]
    api_secret = os.environ["LIVEKIT_API_SECRET"]
except KeyError as e:
    sys.exit("missing env: " + str(e))
now = int(time.time())
claims = {
    "iss": api_key,
    "sub": "api-connectivity-test",
    "iat": now,
    "exp": now + 600,
    "nbf": now - 5,
    "video": {"roomList": True},
}
print(jwt.encode(claims, api_secret, algorithm="HS256"))
'@
    [System.IO.File]::WriteAllText($jwtPy, $jwtSource, [System.Text.UTF8Encoding]::new($false))
    $token = & python $jwtPy 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FAIL JWT: $token"
    } else {
        $token = ([string]$token).Trim()
        $r4 = Get-CurlHttpCode -CurlArgs @(
            "-o", "NUL",
            "-w", "%{http_code}",
            "-X", "POST",
            "-H", "Authorization: Bearer $token",
            "-H", "Content-Type: application/json",
            "-d", "{}",
            "$lkHost/twirp/livekit.RoomService/ListRooms"
        )
        if ($r4.Exit -ne 0) { Write-Host "  FAIL curl exit $($r4.Exit) $($r4.Text)" }
        else { Write-Host "  HTTP $($r4.Http)" }
    }
    Write-Host "`nDone."
    if ($script:VerifyFailed) {
        Write-Host "`nEXIT 1 - one or more required checks failed."
        exit 1
    }
}
finally {
    Remove-Item -LiteralPath $emptyAudio -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $groqBodyPath -Force -ErrorAction SilentlyContinue
    if ($jwtPy) {
        Remove-Item -LiteralPath $jwtPy -Force -ErrorAction SilentlyContinue
    }
}
