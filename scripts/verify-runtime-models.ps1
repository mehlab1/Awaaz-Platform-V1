#Requires -Version 5.1
<#
.SYNOPSIS
  Verifies the runtime provider/model IDs exposed by the app against provider APIs.

.NOTES
  From repo root:
    powershell -ExecutionPolicy Bypass -File scripts/verify-runtime-models.ps1 -EnvPath .env.master

  The script prints provider/model status only. It never prints API keys.
#>
[CmdletBinding()]
param(
    [string]$EnvPath = ".env",
    [switch]$SkipTts,
    [switch]$SkipStt
)

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
        $name, $value = $matches[1], $matches[2].Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        Set-Item -Path "Env:$name" -Value $value
    }
}

function First-Env {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }
    }
    return $null
}

function Invoke-JsonRequest {
    param(
        [string]$Uri,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [int]$TimeoutSec = 30
    )
    $params = @{
        Uri = $Uri
        Method = $Method
        Headers = $Headers
        TimeoutSec = $TimeoutSec
    }
    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
    }
    return Invoke-RestMethod @params
}

function Invoke-TextRequest {
    param(
        [string]$Uri,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [int]$TimeoutSec = 30
    )
    $params = @{
        Uri = $Uri
        Method = $Method
        Headers = $Headers
        TimeoutSec = $TimeoutSec
    }
    if ($null -ne $Body) {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
    }
    return Invoke-WebRequest @params
}

function Test-GroqChatModel {
    param(
        [string]$ApiKey,
        [string]$Model
    )
    $body = @{
        model = $Model
        stream = $true
        temperature = 0.3
        parallel_tool_calls = $false
        messages = @(
            @{
                role = "system"
                content = "You are a concise voice agent. Reply with exactly: ok"
            },
            @{
                role = "user"
                content = "Say ok."
            }
        )
        tools = @(
            @{
                type = "function"
                function = @{
                    name = "end_call"
                    description = "End the current call when the user is done."
                    parameters = @{
                        type = "object"
                        properties = @{}
                        additionalProperties = $false
                    }
                }
            },
            @{
                type = "function"
                function = @{
                    name = "transfer_to_human"
                    description = "Transfer the current call to a human team member."
                    parameters = @{
                        type = "object"
                        properties = @{}
                        additionalProperties = $false
                    }
                }
            }
        )
    }
    $bodyPath = Join-Path ([System.IO.Path]::GetTempPath()) "awaaz-verify-groq-chat.json"
    try {
        $json = $body | ConvertTo-Json -Depth 12 -Compress
        [System.IO.File]::WriteAllText(
            $bodyPath,
            $json,
            [System.Text.UTF8Encoding]::new($false)
        )
        $response = & curl.exe -sS -w "`n%{http_code}" `
            "https://api.groq.com/openai/v1/chat/completions" `
            -H "Authorization: Bearer $ApiKey" `
            -H "Content-Type: application/json" `
            --data-binary "@$bodyPath" 2>&1
        $exit = $LASTEXITCODE
        $text = if ($response -is [array]) { $response -join "`n" } else { [string]$response }
        $lines = $text -split "`n"
        $status = $lines[-1].Trim()
        $content = ($lines[0..([Math]::Max(0, $lines.Length - 2))] -join "`n")
        if (
            $exit -eq 0 `
            -and $status -eq "200" `
            -and $content.Contains("data:") `
            -and ($content -match '"content"\s*:\s*"[^"]+')
        ) {
            Write-Host "  PASS $Model streaming+tools+content"
            return $true
        }
        $preview = $content.Substring(0, [Math]::Min(500, $content.Length))
        Write-Host "  FAIL $Model curlExit=$exit HTTP $status $preview"
        return $false
    } catch {
        Write-Host "  FAIL $Model $($_.Exception.Message)"
        return $false
    } finally {
        Remove-Item -LiteralPath $bodyPath -Force -ErrorAction SilentlyContinue
    }
}

function Test-GroqWhisperModel {
    param(
        [string]$ApiKey,
        [string]$Model
    )
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "awaaz-verify-stt-silence.wav"
    try {
        $sampleRate = 16000
        $samples = $sampleRate / 2
        $dataSize = $samples * 2
        $bytes = New-Object byte[] (44 + $dataSize)
        [System.Text.Encoding]::ASCII.GetBytes("RIFF").CopyTo($bytes, 0)
        [BitConverter]::GetBytes([int](36 + $dataSize)).CopyTo($bytes, 4)
        [System.Text.Encoding]::ASCII.GetBytes("WAVEfmt ").CopyTo($bytes, 8)
        [BitConverter]::GetBytes([int]16).CopyTo($bytes, 16)
        [BitConverter]::GetBytes([int16]1).CopyTo($bytes, 20)
        [BitConverter]::GetBytes([int16]1).CopyTo($bytes, 22)
        [BitConverter]::GetBytes([int]$sampleRate).CopyTo($bytes, 24)
        [BitConverter]::GetBytes([int]($sampleRate * 2)).CopyTo($bytes, 28)
        [BitConverter]::GetBytes([int16]2).CopyTo($bytes, 32)
        [BitConverter]::GetBytes([int16]16).CopyTo($bytes, 34)
        [System.Text.Encoding]::ASCII.GetBytes("data").CopyTo($bytes, 36)
        [BitConverter]::GetBytes([int]$dataSize).CopyTo($bytes, 40)
        [System.IO.File]::WriteAllBytes($tmp, $bytes)

        $response = & curl.exe -sS -w "`n%{http_code}" `
            -X POST "https://api.groq.com/openai/v1/audio/transcriptions" `
            -H "Authorization: Bearer $ApiKey" `
            -F "model=$Model" `
            -F "file=@$tmp;type=audio/wav" 2>&1
        $exit = $LASTEXITCODE
        $text = if ($response -is [array]) { $response -join "`n" } else { [string]$response }
        $lines = $text -split "`n"
        $status = $lines[-1].Trim()
        if ($exit -eq 0 -and ($status -eq "200" -or $status -eq "400")) {
            Write-Host "  PASS $Model transcription endpoint reachable HTTP $status"
            return $true
        }
        Write-Host "  FAIL $Model curlExit=$exit HTTP $status"
        return $false
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

Import-DotEnv -Path $EnvPath

$failed = $false
Write-Host "=== Runtime model verification (env: $EnvPath) ==="

$groqKey = First-Env @("FINOVA_GROQ_API_KEY", "GROQ_API_KEY")
if (-not $groqKey) {
    Write-Host "`n[LLM] SKIP Groq: no FINOVA_GROQ_API_KEY or GROQ_API_KEY"
    $failed = $true
} else {
    Write-Host "`n[LLM] Groq available models"
    $models = Invoke-JsonRequest `
        -Uri "https://api.groq.com/openai/v1/models" `
        -Headers @{ Authorization = "Bearer $groqKey" }
    $ids = @($models.data | ForEach-Object { $_.id } | Sort-Object)
    Write-Host "  models=$($ids.Count)"
    foreach ($model in @("llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b")) {
        if ($ids -contains $model) {
            $ok = Test-GroqChatModel -ApiKey $groqKey -Model $model
            if (-not $ok) { $failed = $true }
        } else {
            Write-Host "  FAIL $model not returned by /models"
            $failed = $true
        }
    }
}

if (-not $SkipStt) {
    Write-Host "`n[STT] Provider/model checks"
    $deepgramKey = First-Env @("FINOVA_DEEPGRAM_API_KEY", "DEEPGRAM_API_KEY")
    if ($deepgramKey) {
        try {
            Invoke-JsonRequest -Uri "https://api.deepgram.com/v1/projects" -Headers @{ Authorization = "Token $deepgramKey" } | Out-Null
            Write-Host "  PASS deepgram credential/projects"
        } catch {
            Write-Host "  FAIL deepgram credential/projects $($_.Exception.Message)"
            $failed = $true
        }
    } else {
        Write-Host "  SKIP deepgram credential/projects: no key"
    }

    $assemblyKey = First-Env @("FINOVA_ASSEMBLYAI_API_KEY", "ASSEMBLYAI_API_KEY")
    if ($assemblyKey) {
        try {
            Invoke-JsonRequest -Uri "https://api.assemblyai.com/v2/transcript?limit=1" -Headers @{ Authorization = $assemblyKey } | Out-Null
            Write-Host "  PASS assemblyai credential/transcripts"
        } catch {
            Write-Host "  FAIL assemblyai credential/transcripts $($_.Exception.Message)"
            $failed = $true
        }
    } else {
        Write-Host "  SKIP assemblyai credential/transcripts: no key"
    }

    if ($groqKey) {
        foreach ($model in @("whisper-large-v3-turbo", "whisper-large-v3")) {
            $ok = Test-GroqWhisperModel -ApiKey $groqKey -Model $model
            if (-not $ok) { $failed = $true }
        }
    }
}

if (-not $SkipTts) {
    Write-Host "`n[TTS] Provider credential checks"
    $rimeKey = First-Env @("FINOVA_RIME_API_KEY", "RIME_API_KEY")
    if ($rimeKey) {
        try {
            $voices = Invoke-JsonRequest -Uri "https://users.rime.ai/data/voices/voice_details.json" -Headers @{ Authorization = "Bearer $rimeKey" }
            Write-Host "  PASS rime voice catalog count=$(@($voices).Count)"
        } catch {
            Write-Host "  FAIL rime voice catalog $($_.Exception.Message)"
            $failed = $true
        }
    } else {
        Write-Host "  SKIP rime voice catalog: no key"
    }

    $cartesiaKey = First-Env @("FINOVA_CARTESIA_API_KEY", "CARTESIA_API_KEY")
    if ($cartesiaKey) {
        try {
            Invoke-JsonRequest `
                -Uri "https://api.cartesia.ai/voices?limit=1" `
                -Headers @{
                    Authorization = "Bearer $cartesiaKey"
                    "X-API-Key" = $cartesiaKey
                    "Cartesia-Version" = "2026-03-01"
                } | Out-Null
            Write-Host "  PASS cartesia voices"
        } catch {
            Write-Host "  FAIL cartesia voices $($_.Exception.Message)"
            $failed = $true
        }
    } else {
        Write-Host "  SKIP cartesia voices: no key"
    }

    $elevenKey = First-Env @("FINOVA_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY", "ELEVEN_API_KEY")
    if ($elevenKey) {
        try {
            Invoke-JsonRequest -Uri "https://api.elevenlabs.io/v1/models" -Headers @{ "xi-api-key" = $elevenKey } | Out-Null
            Write-Host "  PASS elevenlabs models"
        } catch {
            Write-Host "  FAIL elevenlabs models $($_.Exception.Message)"
            $failed = $true
        }
    } else {
        Write-Host "  SKIP elevenlabs models: no key"
    }

    $inworldKey = First-Env @("FINOVA_INWORLD_API_KEY", "INWORLD_API_KEY")
    if ($inworldKey) {
        try {
            Invoke-JsonRequest `
                -Uri "https://api.inworld.ai/voices/v1/voices?pageSize=1" `
                -Headers @{ Authorization = "Basic $inworldKey" } | Out-Null
            Write-Host "  PASS inworld voices"
        } catch {
            Write-Host "  FAIL inworld voices $($_.Exception.Message)"
            $failed = $true
        }
    } else {
        Write-Host "  SKIP inworld voices: no key"
    }
}

if ($failed) {
    Write-Host "`nEXIT 1 - at least one runtime check failed or was missing credentials."
    exit 1
}

Write-Host "`nPASS - runtime provider/model checks completed."
