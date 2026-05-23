# Chiffre clos-secrets.yaml avec kubeseal
# Le fichier plain reste local, seul le SealedSecret est commité

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$SecretsPlain = Join-Path $RepoRoot "charts\clos-de-la-reine\secrets\clos-secrets.yaml"
$SealedTemplate = Join-Path $RepoRoot "charts\clos-de-la-reine\templates\sealed-secret.yaml"
$Cert = if ($env:CERT) { $env:CERT } else {
  $pubCert = Join-Path $RepoRoot "pub-cert.pem"
  $certPem = Join-Path $RepoRoot "cert.pem"
  if (Test-Path $pubCert) { $pubCert } elseif (Test-Path $certPem) { $certPem } else { $pubCert }
}

if (-not (Test-Path $SecretsPlain)) {
  Write-Error "Fichier non trouvé: $SecretsPlain"
  exit 1
}
if (-not (Test-Path $Cert)) {
  Write-Error "Certificat non trouvé. Place pub-cert.pem ou cert.pem à la racine du repo, ou définis `$env:CERT=chemin\vers\cert.pem"
  exit 1
}

Write-Host "Chiffrement de clos-secrets..."
$tempOut = Join-Path $env:TEMP "clos-sealed-$([Guid]::NewGuid().ToString('N').Substring(0,8)).yaml"
kubeseal --format yaml --cert $Cert --scope namespace-wide -f $SecretsPlain | Out-File -FilePath $tempOut -Encoding utf8
$sealed = Get-Content $tempOut -Raw
Remove-Item $tempOut -Force -ErrorAction SilentlyContinue
$sealed = $sealed -replace 'namespace: clos-de-la-reine', 'namespace: {{ include "clos.namespace" . }}'
$header = "{{- /* SealedSecret uniquement en prod : en dev le secret est créé à la main. */}}`n{{- if eq .Release.Namespace `"clos-de-la-reine`" }}`n"
$footer = "`n{{- end }}"
$sealed = $sealed -replace '^---\r?\n', ''
$final = $header + "---`n" + $sealed + $footer
[System.IO.File]::WriteAllText($SealedTemplate, $final, [System.Text.UTF8Encoding]::new($false))

Write-Host "sealed-secret.yaml mis à jour"
Write-Host "Fichier plain (ne pas committer): $SecretsPlain"
