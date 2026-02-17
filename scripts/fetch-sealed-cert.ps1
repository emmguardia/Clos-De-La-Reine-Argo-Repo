# Récupère le certificat public du Sealed Secrets controller du cluster
# À exécuter avec kubectl configuré sur le cluster cible
# Puis lancer seal-secrets.ps1 pour rechiffrer clos-secrets

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$CertPath = Join-Path $RepoRoot "pub-cert.pem"

# Noms du controller (adapter si différent sur ton cluster)
$ControllerName = if ($env:SEALED_CONTROLLER) { $env:SEALED_CONTROLLER } else { "sealed-secrets-controller" }
$ControllerNamespace = if ($env:SEALED_NAMESPACE) { $env:SEALED_NAMESPACE } else { "kube-system" }

Write-Host "Récupération du certificat (controller=$ControllerName, ns=$ControllerNamespace)..."
try {
  kubeseal --fetch-cert --controller-name=$ControllerName --controller-namespace=$ControllerNamespace | Out-File -FilePath $CertPath -Encoding ascii
} catch {
  Write-Host "Essaie avec sealed-secrets..."
  kubeseal --fetch-cert --controller-name=sealed-secrets --controller-namespace=$ControllerNamespace | Out-File -FilePath $CertPath -Encoding ascii
}

Write-Host "Certificat sauvegardé: $CertPath"
Write-Host "Lance: .\scripts\seal-secrets.ps1 pour rechiffrer clos-secrets"
