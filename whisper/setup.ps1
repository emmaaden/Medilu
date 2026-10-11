# Descarga el motor de dictado local (whisper.cpp) y un modelo de voz.
# Uso:  powershell -ExecutionPolicy Bypass -File whisper/setup.ps1 [-Modelo small-q5_1]
# Modelos útiles: small-q5_1 (~190 MB, rápido), medium-q5_0 (~540 MB),
# large-v3-turbo-q5_0 (~550 MB, el más preciso; conviene con buena CPU o GPU).
param([string]$Modelo = 'small-q5_1')

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest es muy lento con la barra
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$bin = Join-Path $PSScriptRoot 'bin'
$models = Join-Path $PSScriptRoot 'models'
New-Item -ItemType Directory -Force $bin, $models | Out-Null

# 1. Binarios oficiales de whisper.cpp para Windows (CPU).
if (-not (Get-ChildItem $bin -Recurse -Filter whisper-server.exe -ErrorAction SilentlyContinue)) {
    Write-Host 'Descargando whisper.cpp...'
    # Los tags vX.Y.Z vienen sin binarios: están en las releases de build (bNNNN).
    $releases = Invoke-RestMethod 'https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=20' -Headers @{ 'User-Agent' = 'Medilu' }
    $rel = $releases | Where-Object { $_.assets | Where-Object { $_.name -eq 'whisper-bin-x64.zip' } } | Select-Object -First 1
    if (-not $rel) { throw 'No se encontró whisper-bin-x64.zip en las últimas releases de whisper.cpp' }
    $asset = $rel.assets | Where-Object { $_.name -eq 'whisper-bin-x64.zip' } | Select-Object -First 1
    $zip = Join-Path $env:TEMP $asset.name
    Invoke-WebRequest $asset.browser_download_url -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $bin -Force
    Remove-Item $zip
    Write-Host "whisper.cpp $($rel.tag_name) instalado."
}

# 2. Modelo de voz.
$archivo = Join-Path $models "ggml-$Modelo.bin"
if (-not (Test-Path $archivo)) {
    Write-Host "Descargando el modelo $Modelo (puede tardar)..."
    Invoke-WebRequest "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$Modelo.bin" -OutFile $archivo -UseBasicParsing
}

Write-Host 'Listo. Arrancalo con: npm run whisper (desde backend/)'
