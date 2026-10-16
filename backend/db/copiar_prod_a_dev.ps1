# Copia la base de prod (Medilu) a DEV-Medilu, ANONIMIZADA.
#
# Uso (desde la raíz del repo):
#   powershell -ExecutionPolicy Bypass -File backend\db\copiar_prod_a_dev.ps1
#   powershell -ExecutionPolicy Bypass -File backend\db\copiar_prod_a_dev.ps1 -Reemplazar
#
# Pide (no se guardan en ningún lado, solo viven en este proceso):
#   - la contraseña del usuario "postgres" de PROD   (solo se lee de prod)
#   - la contraseña del usuario "postgres" de DEV
#   - la contraseña que van a tener las cuentas de DEV (usuarioN@medilu.test)
#
# Qué copia: esquemas public y sesiones (estructura, funciones, RLS, permisos),
# los datos de public, las cuentas de Auth (users + identities), los buckets y
# las políticas de Storage. NO copia los archivos de Storage ni las sesiones.
#
# Todo lo que se escribe en DEV va en UNA transacción: preparar, estructura,
# datos y anonimización (dev_anonimizar.sql). Si algo falla, DEV queda como
# estaba y los datos reales nunca llegan a quedar guardados ahí.
#
# Los volcados de prod (con datos reales) van a una carpeta temporal que se
# borra al terminar, salga bien o mal.
#
# Sin -Reemplazar, aborta si DEV ya tiene tablas en public. Con -Reemplazar,
# borra public, sesiones, las cuentas de Auth y los buckets de DEV y los vuelve
# a copiar (sirve para refrescar DEV desde prod).

param(
  [string]$HostDev,
  [switch]$Reemplazar
)

$ErrorActionPreference = 'Stop'

$bin = 'C:\Program Files\PostgreSQL\17\bin'
$pgDump = Join-Path $bin 'pg_dump.exe'
$psql = Join-Path $bin 'psql.exe'
foreach ($exe in @($pgDump, $psql)) {
  if (-not (Test-Path $exe)) {
    throw "No se encontró $exe. Instalalo con: winget install PostgreSQL.PostgreSQL.17"
  }
}

# Session pooler (IPv4). El host directo db.<ref>.supabase.co es solo IPv6.
$refProd  = 'rpdrgmvcxhxuwxkwixyy'
$hostProd = 'aws-0-us-east-2.pooler.supabase.com'
$refDev   = 'vnjqkegrslrgrdnxvrpy'
if ($refDev -eq $refProd) { throw 'El proyecto de destino es prod. Abortado.' }

if (-not $HostDev) {
  Write-Host 'Host del Session pooler de DEV-Medilu (Supabase > Connect > Session pooler),'
  Write-Host 'por ejemplo aws-1-us-east-2.pooler.supabase.com'
  $HostDev = (Read-Host 'Host').Trim()
}
if (-not $HostDev) { throw 'Falta el host de DEV.' }

function Leer-Clave([string]$texto) {
  $seguro = Read-Host -AsSecureString $texto
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$claveProd = Leer-Clave 'Contraseña del usuario postgres de PROD'
$claveDev  = Leer-Clave 'Contraseña del usuario postgres de DEV-Medilu'
$claveCuentas = Leer-Clave 'Contraseña para las cuentas de DEV (mínimo 10 caracteres)'
if ($claveCuentas.Length -lt 10) { throw 'La contraseña de las cuentas de DEV tiene que tener al menos 10 caracteres.' }
if ((Leer-Clave 'Repetila') -ne $claveCuentas) { throw 'Las contraseñas no coinciden.' }

# Las cuentas de PLATAFORMA_ADMIN_EMAILS conservan email y contraseña.
$admins = ''
$envFile = Join-Path $PSScriptRoot '..\.env'
if (Test-Path $envFile) {
  $linea = Get-Content $envFile | Where-Object { $_ -match '^\s*PLATAFORMA_ADMIN_EMAILS\s*=' } | Select-Object -First 1
  if ($linea) { $admins = ($linea -replace '^\s*PLATAFORMA_ADMIN_EMAILS\s*=\s*', '').Trim().Trim('"') }
}

$env:PGSSLMODE = 'require'
# Los .sql son UTF-8; sin esto psql en la consola de Windows los lee como WIN1252.
$env:PGCLIENTENCODING = 'UTF8'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
# PowerShell 5.1 escribe UTF-8 con BOM, y psql no lo entiende.
$utf8SinBom = New-Object Text.UTF8Encoding $false
$prod = @('-h', $hostProd, '-p', '5432', '-U', "postgres.$refProd", '-d', 'postgres', '--no-password')
$dev  = @('-h', $HostDev,  '-p', '5432', '-U', "postgres.$refDev",  '-d', 'postgres', '--no-password')

function Ejecutar([string]$exe, [string[]]$argumentos, [string]$clave, [string]$paso) {
  $env:PGPASSWORD = $clave
  try {
    & $exe @argumentos
    if ($LASTEXITCODE -ne 0) { throw "$paso terminó con código $LASTEXITCODE" }
  } finally {
    $env:PGPASSWORD = $null
  }
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("medilu-copia-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null

try {
  # 0. DEV tiene que ser Postgres 17 (el volcado sale de pg_dump 17).
  $env:PGPASSWORD = $claveDev
  try {
    $version = & $psql @dev -X -At -c 'SHOW server_version_num'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo conectar a DEV. Revisá el host y la contraseña.' }
  } finally { $env:PGPASSWORD = $null }
  if ([int]$version -lt 170000) { throw "DEV tiene Postgres $version; hace falta 17 o más." }

  # 1. Estructura de prod (public + sesiones).
  Write-Host 'Leyendo la estructura de prod...'
  $esquemaCrudo = Join-Path $tmp 'esquema_crudo.sql'
  Ejecutar $pgDump ($prod + @('--schema-only', '--no-owner', '-n', 'public', '-n', 'sesiones', "--file=$esquemaCrudo")) $claveProd 'pg_dump (estructura)'
  # public ya existe en DEV; los permisos por defecto de supabase_admin no los puede
  # tocar postgres (y DEV ya los tiene, son los de cualquier proyecto nuevo).
  $esquema = Join-Path $tmp 'esquema.sql'
  $lineas = Get-Content $esquemaCrudo -Encoding UTF8 |
    Where-Object { $_ -notmatch '^CREATE SCHEMA public;' -and $_ -notmatch '^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ' }
  [IO.File]::WriteAllLines($esquema, [string[]]$lineas, $utf8SinBom)

  # 2. Políticas de Storage de prod (viven en el esquema storage, que no se copia).
  Write-Host 'Leyendo las políticas de Storage de prod...'
  $genPoliticas = Join-Path $tmp 'gen_politicas.sql'
  $consultaPoliticas = @'
SELECT format(E'CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s%s%s;',
       policyname, permissive, cmd,
       (SELECT string_agg(CASE WHEN r = 'public' THEN 'PUBLIC' ELSE quote_ident(r) END, ', ') FROM unnest(roles) r),
       CASE WHEN qual IS NOT NULL THEN ' USING (' || qual || ')' ELSE '' END,
       CASE WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')' ELSE '' END)
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
'@
  [IO.File]::WriteAllText($genPoliticas, $consultaPoliticas, $utf8SinBom)
  $politicas = Join-Path $tmp 'politicas_storage.sql'
  # search_path vacío: las expresiones salen con el esquema de cada función.
  Ejecutar $psql ($prod + @('-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', "SET search_path = ''", '-f', $genPoliticas, '-o', $politicas)) $claveProd 'psql (políticas de Storage)'

  # 3. Datos de prod.
  Write-Host 'Leyendo los datos de prod...'
  $datos = Join-Path $tmp 'datos.sql'
  Ejecutar $pgDump ($prod + @('--data-only', '-t', 'public.*', '-t', 'auth.users', '-t', 'auth.identities', '-t', 'storage.buckets', "--file=$datos")) $claveProd 'pg_dump (datos)'

  # 4. Todo a DEV en una transacción.
  Write-Host 'Copiando a DEV-Medilu y anonimizando (una sola transacción)...'
  $env:MEDILU_CLAVE_DEV = $claveCuentas
  try {
    Ejecutar $psql ($dev + @(
      '-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction',
      # Los setval del volcado ensucian la consola; los errores siguen saliendo.
      '-o', (Join-Path $tmp 'salida_copia.txt'),
      '-v', ('reemplazar=' + $(if ($Reemplazar) { 'si' } else { 'no' })),
      '-v', "admins=$admins",
      '-f', (Join-Path $PSScriptRoot 'dev_preparar.sql'),
      '-f', $esquema,
      '-f', $politicas,
      '-c', 'SET session_replication_role = replica',
      '-f', $datos,
      '-f', (Join-Path $PSScriptRoot 'dev_anonimizar.sql'),
      '-c', 'SET session_replication_role = origin'
    )) $claveDev 'psql (copia a DEV)'
  } finally {
    $env:MEDILU_CLAVE_DEV = $null
  }

  # 5. Resumen de DEV (ya anonimizado).
  Write-Host ''
  Write-Host 'Copia terminada. Cuentas de DEV:'
  $resumen = @'
SELECT u.email,
       coalesce(string_agg(DISTINCT
           CASE WHEN pr.id IS NOT NULL THEN 'profesional' END, ''), '') AS profesional,
       count(DISTINCT pa.id) AS fichas_paciente,
       coalesce(string_agg(DISTINCT m.rol || ' en ' || c.nombre, ', '), '') AS membresias
FROM auth.users u
LEFT JOIN public.persona p ON p.id_auth = u.id
LEFT JOIN public.profesional pr ON pr.id_persona = p.id
LEFT JOIN public.paciente pa ON pa.id_persona = p.id
LEFT JOIN public.membresia m ON m.id_persona = p.id AND m.activo
LEFT JOIN public.clinica c ON c.id = m.clinica_id
GROUP BY u.email, u.created_at
ORDER BY u.created_at;
'@
  $env:PGPASSWORD = $claveDev
  try { & $psql @dev -X -c $resumen } finally { $env:PGPASSWORD = $null }
  Write-Host 'Las cuentas @medilu.test entran con la contraseña de DEV que elegiste.'
}
finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  $env:PGPASSWORD = $null
  $env:MEDILU_CLAVE_DEV = $null
}
