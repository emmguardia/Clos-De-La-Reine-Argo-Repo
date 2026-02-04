{{/*
Labels communs Clos de la Reine
*/}}
{{- define "clos.labels" -}}
app.kubernetes.io/part-of: clos-de-la-reine
{{- end -}}

{{- define "clos.namespace" -}}
{{- .Values.namespace | default "clos-de-la-reine" -}}
{{- end -}}
