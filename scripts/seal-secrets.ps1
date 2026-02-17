# Chiffre clos-secrets.yaml avec kubeseal
# Le fichier plain reste local, seul le SealedSecret est commité

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$SecretsPlain = Join-Path $RepoRoot "charts\clos-de-la-reine\secrets\clos-secrets.yaml"
$SealedTemplate = Join-Path $RepoRoot "charts\clos-de-la-reine\templates\sealed-secret.yaml"
$Cert = if ($env:CERT) { $env:CERT } else { Join-Path $RepoRoot "pub-cert.pem" }

if (-not (Test-Path $SecretsPlain)) {
  Write-Error "Fichier non trouvé: $SecretsPlain"
  exit 1
}
if (-not (Test-Path $Cert)) {
  Write-Error "Certificat non trouvé: $Cert"
  Write-Host "Définis `$env:CERT=chemin\vers\pub-cert.pem si besoin"
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
