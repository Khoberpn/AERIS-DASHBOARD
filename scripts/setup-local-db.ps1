$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$local = Join-Path $root '.local'
$data = Join-Path $local 'pgdata'
$bin = 'C:\Program Files\PostgreSQL\18\bin'
New-Item -ItemType Directory -Path $local -Force | Out-Null
$passwordFile = Join-Path $local 'pg-pass'
$envFile = Join-Path $root '.env'
if (-not (Test-Path -LiteralPath $data)) {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $password = [Convert]::ToHexString($bytes).ToLowerInvariant()
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $ingestToken = [Convert]::ToHexString($bytes).ToLowerInvariant()
  [System.IO.File]::WriteAllText($passwordFile, $password + "`n")
  & (Join-Path $bin 'initdb.exe') -D $data -U aeris --encoding=UTF8 --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=$passwordFile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initdb failed' }
  [System.IO.File]::WriteAllText($envFile, "DATABASE_URL=postgresql://aeris:${password}@127.0.0.1:5433/aeris`nPORT=4100`nNODE_ENV=development`nWEB_ORIGIN=http://127.0.0.1:5173`nINGEST_TOKEN=$ingestToken`n")
} else {
  $password = (Get-Content -LiteralPath $passwordFile -Raw).Trim()
}
& (Join-Path $bin 'pg_isready.exe') -h 127.0.0.1 -p 5433 *> $null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $bin 'pg_ctl.exe') -D $data -o '-p 5433 -h 127.0.0.1' -l (Join-Path $local 'postgres.log') start -w | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not start' }
}
$env:PGPASSWORD = $password
try {
  & (Join-Path $bin 'psql.exe') -w -h 127.0.0.1 -p 5433 -U aeris -d postgres -tAc 'SELECT 1 FROM pg_database WHERE datname=''aeris''' | ForEach-Object {
    if ($_ -ne '1') {
      & (Join-Path $bin 'createdb.exe') -w -h 127.0.0.1 -p 5433 -U aeris aeris
      if ($LASTEXITCODE -ne 0) { throw 'Could not create AERIS database' }
    }
  }
} finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
Write-Output 'AERIS PostgreSQL local instance ready on 127.0.0.1:5433; credentials stored only in ignored .env.'

