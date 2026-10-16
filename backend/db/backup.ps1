# Backup de la base de Supabase (Medilu) en esta PC.
#
# Uso (desde la raíz del repo):
#   powershell -ExecutionPolicy Bypass -File backend\db\backup.ps1
#
# Pide la contraseña del usuario "postgres" del proyecto (Supabase → Project
# Settings → Database). No se guarda en ningún lado: solo vive en este proceso.
#
# Genera dos archivos en la carpeta de destino (fuera del repo, tienen datos de
# pacientes):
#   medilu_<fecha>.dump  → formato custom, para restaurar con pg_restore
#   medilu_<fecha>.sql   → SQL plano, legible con cualquier editor
#
# No incluye los archivos subidos a Storage (solo su metadata en storage.objects).

param(
  [string]$Destino = (Join-Path $HOME 'Documents\Medilu-backups')
)

$ErrorActionPreference = 'Stop'

$pgDump = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
if (-not (Test-Path $pgDump)) {
  throw "No se encontró pg_dump en $pgDump. Instalalo con: winget install PostgreSQL.PostgreSQL.17"
}

# Session pooler (IPv4). El host directo db.<ref>.supabase.co es solo IPv6.
$hostDb  = 'aws-0-us-east-2.pooler.supabase.com'
$puerto  = '5432'
$usuario = 'postgres.rpdrgmvcxhxuwxkwixyy'
$base    = 'postgres'

# Esquemas que administra Supabase y que se recrean solos en un proyecto nuevo.
$excluir = @(
  'extensions', 'graphql', 'graphql_public', 'net', 'pgbouncer', 'pgsodium',
  'pgsodium_masks', 'realtime', '_realtime', 'supabase_functions', 'vault', 'cron'
)

$seguro = Read-Host -AsSecureString "Contraseña del usuario postgres de Supabase"
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
try {
  $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
$env:PGSSLMODE = 'require'

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$fecha = Get-Date -Format 'yyyy-MM-dd_HHmm'
$comunes = @('-h', $hostDb, '-p', $puerto, '-U', $usuario, '-d', $base, '--no-password')
foreach ($esquema in $excluir) { $comunes += "--exclude-schema=$esquema" }

try {
  foreach ($formato in @(@{ Flag = 'c'; Ext = 'dump' }, @{ Flag = 'p'; Ext = 'sql' })) {
    $archivo = Join-Path $Destino "medilu_$fecha.$($formato.Ext)"
    Write-Host "Generando $archivo ..."
    & $pgDump @comunes "--format=$($formato.Flag)" "--file=$archivo"
    if ($LASTEXITCODE -ne 0) { throw "pg_dump terminó con código $LASTEXITCODE" }
    $mb = [math]::Round((Get-Item $archivo).Length / 1MB, 2)
    Write-Host "  OK ($mb MB)"
  }
  Write-Host "`nBackup listo en $Destino"
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
