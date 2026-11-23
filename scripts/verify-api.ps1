$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$base = 'http://127.0.0.1:4100'
$token = ((Get-Content -LiteralPath (Join-Path $root '.env') | Where-Object { $_ -match '^INGEST_TOKEN=' }) -replace '^INGEST_TOKEN=', '').Trim()
if (-not $token) { throw 'Private ingestion token missing' }
$headers = @{ 'x-ingest-token' = $token }
$health = Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 8
if ($health.data.database -ne 'connected') { throw 'Health did not confirm PostgreSQL connection' }
$replications = Invoke-RestMethod -Uri "$base/api/replications" -TimeoutSec 8
$replicationId = $replications.data[0].id
$at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
$body = @{ replicationId = $replicationId; recordedAt = $at; voltage = 12.34; current = 0.321; panelTemperature = 41.2; source = 'manual' } | ConvertTo-Json
$insert = Invoke-RestMethod -Method Post -Uri "$base/api/measurements" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 8
$expectedPower = [Math]::Round(12.34 * 0.321, 6)
if ([Math]::Abs($insert.data.power - $expectedPower) -gt 0.000001) { throw 'Power was not calculated as V × I' }
$list = Invoke-RestMethod -Uri "$base/api/measurements?search=Control&limit=100" -TimeoutSec 8
if (-not ($list.data | Where-Object { $_.id -eq $insert.data.id })) { throw 'Inserted measurement was not retrieved' }
try { Invoke-RestMethod -Method Post -Uri "$base/api/measurements" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 8 | Out-Null; throw 'Duplicate was accepted' } catch { if ($_.Exception.Response.StatusCode -ne 409) { throw } }
try { Invoke-RestMethod -Method Post -Uri "$base/api/measurements" -ContentType 'application/json' -Body $body -TimeoutSec 8 | Out-Null; throw 'Unauthenticated insert was accepted' } catch { if ($_.Exception.Response.StatusCode -ne 401) { throw } }
$bad = @{ replicationId = $replicationId; recordedAt = $at; voltage = -1; current = 0.321; source = 'manual' } | ConvertTo-Json
try { Invoke-RestMethod -Method Post -Uri "$base/api/measurements" -Headers $headers -ContentType 'application/json' -Body $bad -TimeoutSec 8 | Out-Null; throw 'Invalid numerical value was accepted' } catch { if ($_.Exception.Response.StatusCode -ne 400) { throw } }
$greenhouseBody = @{ recordedAt = $at; deviceId = 'qa-verification'; source = 'manual'; temperature = 29.4; humidity = 71.2 } | ConvertTo-Json
$greenhouse = Invoke-RestMethod -Method Post -Uri "$base/api/greenhouse/readings" -Headers $headers -ContentType 'application/json' -Body $greenhouseBody -TimeoutSec 8
$latest = Invoke-RestMethod -Uri "$base/api/greenhouse/latest" -TimeoutSec 8
if ($latest.data.id -ne $greenhouse.data.id) { throw 'Inserted greenhouse reading was not retrieved' }
@{ measurementId = $insert.data.id; greenhouseId = $greenhouse.data.id } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root '.local\qa-ids.json') -Encoding utf8
Write-Output "API verified: health connected; measurement ID $($insert.data.id) inserted/retrieved; P=V×I; duplicate 409; unauthenticated 401; invalid 400; greenhouse ID $($greenhouse.data.id) inserted/retrieved."
