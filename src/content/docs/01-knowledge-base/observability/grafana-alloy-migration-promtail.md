# Grafana Alloy Migration: Promtail to Alloy

Step-by-step migration guide from Promtail to Grafana Alloy for log and trace collection in Kubernetes.

## Table of Contents

| Section | Topic | Description |
| :---: | :--- | :--- |
| **01** | [Prerequisites](#1-prerequisites) | Loki running, Promtail installed, Helm repo. |
| **02** | [Phase 1: Install Alloy](#2-phase-1-install-alloy) | Deploy Grafana Alloy. |
| **03** | [Phase 2: Uninstall Promtail](#3-phase-2-uninstall-promtail) | Remove legacy Promtail. |
| **04** | [Phase 3: Verify Trace Pipeline](#4-phase-3-verify-trace-pipeline) | OTLP ports and ServiceMonitor. |
| **05** | [Troubleshooting](#5-troubleshooting) | Common issues and fixes. |
| **06** | [Before/After Comparison](#6-beforeafter-comparison) | Migration summary. |
| **07** | [Rollback Procedure](#7-rollback-procedure) | Restore Promtail if needed. |

---

## 1. Prerequisites

Before starting the migration, ensure the following are in place:

- Loki 3.6.5 running (`kubectl get pod -n observability -l app.kubernetes.io/name=loki`)
- Standalone `promtail` Helm release installed (to uninstall after Alloy is verified)
- Helm repo `grafana` already added
- Sufficient disk space on nodes for Alloy DaemonSet

### Verify Existing Stack

```bash
# Confirm Loki is running
kubectl get pods -n observability -l app.kubernetes.io/name=loki

# Confirm Promtail is running
kubectl get pods -n observability -l app.kubernetes.io/name=promtail

# Check current Promtail release
helm list -n observability | grep promtail
```

---

## 2. Phase 1: Install Alloy

### Step 1: Check chart version

```bash
helm search repo grafana/alloy --versions | head -5
```

### Step 2: Install Alloy

```bash
helm upgrade --install alloy grafana/alloy \
  --version 1.6.0 \
  --namespace observability \
  --create-namespace \
  -f values.yaml
```

### Step 3: Verify DaemonSet is running

```bash
kubectl get daemonset -n observability alloy
kubectl get pods -n observability -l app.kubernetes.io/name=alloy -o wide
```

Expected: one pod per node (3 pods), all `Running`.

### Step 4: Check Alloy logs for errors

```bash
kubectl logs -n observability -l app.kubernetes.io/name=alloy --prefix --since=2m
```

Look for:

- `msg="now listening" addr=0.0.0.0:12345` — UI/metrics server up
- `msg="Logs component started"` — log pipeline active
- No `ERROR` or `panic` lines

### Step 5: Verify logs are flowing to Loki

```bash
# Check active label sets in Loki (should be > 0)
kubectl exec -n observability -it loki-0 -- \
  wget -qO- 'http://localhost:3100/loki/api/v1/labels' | python3 -m json.tool
```

Or from outside the cluster via port-forward:

```bash
kubectl port-forward -n observability svc/loki 3100:3100 &
curl -s 'http://localhost:3100/loki/api/v1/labels' | python3 -m json.tool
```

### Step 6: Verify Loki datasource in Grafana

Open Grafana, navigate to Connections, Data sources, Loki, click "Test".

Expected: `Data source connected and labels found.`

---

## 3. Phase 2: Uninstall Promtail

### Step 7: Remove standalone Promtail

```bash
helm uninstall promtail -n observability
```

### Step 8: Confirm no Promtail pods remain

```bash
kubectl get pods -n observability | grep promtail
# Expected: no output
```

### Step 9: Confirm Loki still receiving logs after Promtail removal

```bash
# Query last 5 minutes of logs from any namespace
kubectl port-forward -n observability svc/loki 3100:3100 &
curl -s -G 'http://localhost:3100/loki/api/v1/query_range' \
  --data-urlencode 'query={cluster="production"}' \
  --data-urlencode 'limit=5' \
  --data-urlencode "start=$(date -d '5 minutes ago' +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" | python3 -m json.tool | head -40
```

---

## 4. Phase 3: Verify Trace Pipeline

### Step 10: Check OTLP ports are accessible

```bash
# Test OTLP gRPC port on one Alloy pod
kubectl exec -n observability deploy/any-workload -- \
  nc -zv alloy.observability.svc.cluster.local 4317
```

### Step 11: Check ServiceMonitor was picked up by Prometheus

```bash
kubectl get servicemonitor -n observability alloy
# Prometheus should be scraping :12345/metrics
```

### Trace Receiver Ports

| Protocol | Port | Purpose |
|----------|------|---------|
| OTLP gRPC | 4317 | OpenTelemetry native |
| OTLP HTTP | 4318 | HTTP alternative |
| Jaeger gRPC | 14250 | Legacy Jaeger support |
| Jaeger Thrift | 14268 | HTTP-based Jaeger |

---

## 5. Troubleshooting

### Alloy pods in CrashLoopBackOff

```bash
kubectl logs -n observability -l app.kubernetes.io/name=alloy --previous
```

Common cause: River config syntax error. Validate config:

```bash
kubectl exec -n observability <alloy-pod> -- alloy fmt /etc/alloy/config.alloy
```

### Logs not flowing after Promtail removal

- Check Alloy pod is on each node: `kubectl get pods -o wide -n observability -l app.kubernetes.io/name=alloy`
- Check `/var/log/pods` is mounted: `kubectl exec -n observability <alloy-pod> -- ls /var/log/pods/`

### RBAC errors in Alloy logs

```bash
kubectl get clusterrolebinding -l app.kubernetes.io/name=alloy
```

If missing, Alloy ClusterRole may not cover `pods` resource. Check:

```bash
kubectl auth can-i list pods --as=system:serviceaccount:observability:alloy
```

### Common Issues Reference

| Issue | Symptom | Resolution |
|-------|---------|------------|
| CrashLoopBackOff | Pods restarting | Check config syntax with `alloy fmt` |
| No logs in Loki | Empty query results | Verify `/var/log/pods` mount |
| RBAC errors | Permission denied in logs | Check ClusterRole bindings |
| High memory usage | OOMKilled | Increase memory limits |

---

## 6. Before/After Comparison

| Component | Before | After |
|-----------|--------|-------|
| Log agent | promtail (6.17.1) | alloy (1.6.0 / v1.13.0) |
| Traces | None | OTLP gRPC :4317, HTTP :4318, Jaeger :14250/:14268 |
| Loki push | `/loki/api/v1/push` | Same endpoint via Alloy |
| Scrape | No self-metrics | ServiceMonitor to Prometheus |
| Pipeline | Promtail stages | Alloy River components |
| Config format | YAML stages | River components |
| Multi-signal | Logs only | Logs + Traces + Metrics |

---

## 7. Rollback Procedure

If Alloy migration fails, restore Promtail:

```bash
# Reinstall Promtail with original values
helm upgrade --install promtail grafana/promtail \
  --namespace observability \
  -f promtail-values.yaml

# Uninstall Alloy
helm uninstall alloy -n observability

# Verify Promtail is running
kubectl get pods -n observability -l app.kubernetes.io/name=promtail
```
