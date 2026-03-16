# Script : chiffre clos-secrets pour dev et met à jour values-dev.yaml
# Prérequis : kubeseal installé, kubectl configuré pour ton K3s
# Usage : .\scripts\seal-and-update.ps1

$ErrorActionPreference = "Stop"
$chartDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$secretPath = Join-Path $chartDir "secrets\clos-secrets.yaml"
$valuesPath = Join-Path $chartDir "values-dev.yaml"
$tempPath = [System.IO.Path]::GetTempFileName() + ".yaml"

try {
    if (-not (Test-Path $secretPath)) {
        Write-Error "Fichier introuvable : $secretPath"
    }

    Write-Host "1. Copie du secret avec namespace clos-de-la-reine-dev..."
    $content = Get-Content $secretPath -Raw
    $content = $content -replace "namespace: clos-de-la-reine\b", "namespace: clos-de-la-reine-dev"
    Set-Content $tempPath -Value $content -Encoding UTF8

    Write-Host "2. Chiffrement avec kubeseal (connexion au cluster K3s)..."
    $sealed = Get-Content $tempPath -Raw | kubeseal --format yaml --namespace clos-de-la-reine-dev
    if ($LASTEXITCODE -ne 0) {
        throw "kubeseal a échoué. Vérifie que kubectl pointe vers ton K3s."
    }

    Write-Host "3. Extraction du bloc encryptedData..."
    $sealedStr = $sealed | Out-String
    if ($sealedStr -notmatch 'encryptedData:\s*\n(.*)') {
        throw "Impossible d'extraire encryptedData de la sortie kubeseal."
    }
    $encryptedYaml = $Matches[1].TrimEnd()

    Write-Host "4. Mise à jour de values-dev.yaml..."
    $valuesContent = Get-Content $valuesPath -Raw
    $indentedBlock = ($encryptedYaml -split "`n" | ForEach-Object { "  $_" }) -join "`n"
    $newSealedBlock = "sealedSecretDev:`n  encryptedData:`n$indentedBlock"
    $valuesContent = $valuesContent -replace '(?ms)sealedSecretDev:\s*\n\s*encryptedData:\s*\{\}\s*', "$newSealedBlock`n"
    Set-Content $valuesPath -Value $valuesContent -Encoding UTF8 -NoNewline

    Write-Host "OK. values-dev.yaml mis à jour. Tu peux commit et push."
}
finally {
    if (Test-Path $tempPath) {
        Remove-Item $tempPath -Force
        Write-Host "Fichier temporaire supprimé."
    }
}
