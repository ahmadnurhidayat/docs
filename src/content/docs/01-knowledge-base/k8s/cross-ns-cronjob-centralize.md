# Cross-Namespace CronJob Centralization in Kubernetes

## Table of Contents

| Section | Topic | Description |
| :---: | :--- | :--- |
| **01** | [The Problem](#1-the-problem) | Why distributed CronJobs across namespaces create operational overhead and what centralization solves. |
| **02** | [Architecture Overview](#2-architecture-overview) | How a single monitoring namespace drives scheduled operations across multiple target namespaces. |
| **03** | [Prerequisites](#3-prerequisites) | What must exist before deploying centralized CronJobs. |
| **04** | [RBAC: ServiceAccount with Cross-Namespace Access](#4-rbac-serviceaccount-with-cross-namespace-access) | How to create a least-privilege ClusterRole and bind it to a dedicated ServiceAccount. |
| **05** | [CronJob Manifests](#5-cronjob-manifests) | Annotated scale-up and scale-down CronJob examples with all best-practice fields. |
| **06** | [Shell Script Hardening](#6-shell-script-hardening) | Why `set -euo pipefail` is mandatory and what each flag prevents. |
| **07** | [Cluster Hygiene and Garbage Collection](#7-cluster-hygiene-and-garbage-collection) | How `ttlSecondsAfterFinished` prevents finished Job pods from accumulating. |
| **08** | [Observability and Alerting](#8-observability-and-alerting) | Prometheus rules and label conventions for detecting missed or failed CronJob executions. |
| **09** | [Tips and Best Practices](#9-tips-and-best-practices) | Concise operational guidelines for production deployments. |

---

## 1. The Problem

In multi-team Kubernetes clusters, scheduled jobs tend to proliferate across namespaces. Each team defines its own CronJobs in its own namespace — scale-up jobs, scale-down jobs, HPA patch jobs — without coordination. The result is:

- **No unified view** of what is scheduled and when.
- **Duplicated RBAC** — every namespace needs its own ServiceAccount and role bindings.
- **Inconsistent patterns** — different teams use different images, restart policies, and cleanup settings.
- **Monitoring gaps** — alerting must be configured per namespace rather than once.

Centralizing all CronJobs into a dedicated namespace (e.g., `monitoring` or `ops-jobs`) eliminates this fragmentation. Scheduled jobs live in one place, use one ServiceAccount, and are monitored through one set of alerts — while still operating on resources in any target namespace via cross-namespace RBAC.

---

## 2. Architecture Overview

All CronJob objects are defined in the `monitoring` namespace. Each job runs a `bitnami/kubectl` container and issues `kubectl` commands against whichever target namespace it manages. Access is granted via a single ClusterRoleBinding that gives the `monitoring` ServiceAccount the necessary permissions cluster-wide.

```
+-----------------------------+
|  Namespace: monitoring      |
|                             |
|  CronJob: api-team-scale-up   | ──► kubectl scale  namespace: namespace-api-team
|  CronJob: ui-team-scale-up    | ──► kubectl scale  namespace: namespace-ui-team
|  CronJob: fe-team-scale-down  | ──► kubectl scale  namespace: namespace-fe-team
+-----------------------------+
```

The CronJob itself lives in `monitoring`. The operations it performs target other namespaces. The ServiceAccount's ClusterRoleBinding is what makes cross-namespace access possible.

---

## 3. Prerequisites

Before deploying centralized CronJobs, confirm the following:

- The `monitoring` namespace already exists (`kubectl get namespace monitoring`).
- Cluster-admin or equivalent access is available to create ClusterRole and ClusterRoleBinding objects.
- `bitnami/kubectl` (or an equivalent `kubectl`-capable image) is accessible from your container registry.
- Your cluster supports `spec.timeZone` in CronJob objects (requires Kubernetes 1.27+ or the `CronJobTimeZone` feature gate enabled on earlier versions).

---

## 4. RBAC: ServiceAccount with Cross-Namespace Access

The ServiceAccount and its cluster-wide bindings are the foundation of this pattern. Define them in a single file for easy management.

```yaml
# rbac-cronjob.yaml
# ServiceAccount, ClusterRole, and ClusterRoleBinding for centralized CronJob access.
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cronjob-svc-acc
  namespace: monitoring
  labels:
    app.kubernetes.io/name: cronjob-svc-acc
    app.kubernetes.io/part-of: monitoring
    app.kubernetes.io/component: serviceaccount
    app.kubernetes.io/managed-by: platform-team
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cronjob-svc-acc
  labels:
    app.kubernetes.io/name: cronjob-svc-acc
    app.kubernetes.io/part-of: monitoring
rules:
  - apiGroups: ["apps"]
    resources: ["deployments", "deployments/scale", "deployments/status"]
    verbs: ["get", "list", "patch", "update"]
  - apiGroups: ["apps"]
    resources: ["statefulsets", "statefulsets/scale", "statefulsets/status"]
    verbs: ["get", "list", "patch", "update"]
  - apiGroups: ["autoscaling"]
    resources: ["horizontalpodautoscalers", "horizontalpodautoscalers/status"]
    verbs: ["get", "list", "watch", "patch", "update"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cronjob-svc-acc
  labels:
    app.kubernetes.io/name: cronjob-svc-acc
    app.kubernetes.io/part-of: monitoring
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cronjob-svc-acc
subjects:
  - kind: ServiceAccount
    name: cronjob-svc-acc
    namespace: monitoring
```

**Key decisions:**

- `statefulsets` is included alongside `deployments` — centralized scale jobs often target both.
- The `scale` sub-resource is listed explicitly because `kubectl scale` uses it; without it the command is denied even if `update` is granted on the parent resource.
- No `secrets` or `configmaps` verbs are included — keep the role as narrow as the actual commands require.

---

## 5. CronJob Manifests

The following example manages a single workload `[deployment_name]` in `[namespace]`. Replace the bracketed placeholders with your actual values.

```yaml
# cronjob-scale.yaml
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: [deployment_name]-scale-up
  namespace: monitoring
  labels:
    app.kubernetes.io/name: [deployment_name]-scale-up
    app.kubernetes.io/part-of: monitoring
    app.kubernetes.io/component: cronjob
    job-type: scale-up
    target-namespace: [namespace]
spec:
  # Scale up at 04:00 WIB (UTC+7)
  timeZone: Asia/Jakarta
  schedule: "0 4 * * 1-5"
  # Prevent overlapping runs — if a job is still running when the next trigger fires, skip it
  concurrencyPolicy: Forbid
  # Keep only the last 3 successful and 1 failed Job records for audit
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      # Automatically delete finished pods after 3 minutes
      ttlSecondsAfterFinished: 180
      # Retry once on failure before marking the Job as failed
      backoffLimit: 1
      template:
        metadata:
          labels:
            app.kubernetes.io/name: [deployment_name]-scale-up
            job-type: scale-up
        spec:
          serviceAccountName: cronjob-svc-acc
          restartPolicy: OnFailure
          containers:
            - name: kubectl
              image: bitnami/kubectl:1.29
              imagePullPolicy: IfNotPresent
              resources:
                requests:
                  cpu: 50m
                  memory: 64Mi
                limits:
                  cpu: 100m
                  memory: 128Mi
              command:
                - /bin/sh
                - -c
                - |
                  set -euo pipefail

                  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting scale-up for [deployment_name] in [namespace]"

                  echo "Patching HPA minReplicas to 3..."
                  kubectl patch hpa [deployment_name] \
                    -n [namespace] \
                    -p '{"spec":{"minReplicas":3}}'

                  echo "Scaling deployment to 3 replicas..."
                  kubectl scale deployment [deployment_name] \
                    -n [namespace] \
                    --replicas=3

                  echo "Scaling statefulset to 3 replicas (if present)..."
                  kubectl scale statefulset [deployment_name] \
                    -n [namespace] \
                    --replicas=3 || echo "No statefulset found — skipping"

                  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Scale-up complete"
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: [deployment_name]-scale-down
  namespace: monitoring
  labels:
    app.kubernetes.io/name: [deployment_name]-scale-down
    app.kubernetes.io/part-of: monitoring
    app.kubernetes.io/component: cronjob
    job-type: scale-down
    target-namespace: [namespace]
spec:
  # Scale down at 18:59 WIB (11:59 UTC)
  timeZone: Asia/Jakarta
  schedule: "59 18 * * 1-5"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      ttlSecondsAfterFinished: 180
      backoffLimit: 1
      template:
        metadata:
          labels:
            app.kubernetes.io/name: [deployment_name]-scale-down
            job-type: scale-down
        spec:
          serviceAccountName: cronjob-svc-acc
          restartPolicy: OnFailure
          containers:
            - name: kubectl
              image: bitnami/kubectl:1.29
              imagePullPolicy: IfNotPresent
              resources:
                requests:
                  cpu: 50m
                  memory: 64Mi
                limits:
                  cpu: 100m
                  memory: 128Mi
              command:
                - /bin/sh
                - -c
                - |
                  set -euo pipefail

                  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting scale-down for [deployment_name] in [namespace]"

                  echo "Patching HPA minReplicas to 1..."
                  kubectl patch hpa [deployment_name] \
                    -n [namespace] \
                    -p '{"spec":{"minReplicas":1}}'

                  echo "Scaling deployment to 1 replica..."
                  kubectl scale deployment [deployment_name] \
                    -n [namespace] \
                    --replicas=1

                  echo "Scaling statefulset to 1 replica (if present)..."
                  kubectl scale statefulset [deployment_name] \
                    -n [namespace] \
                    --replicas=1 || echo "No statefulset found — skipping"

                  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Scale-down complete"
```

**Notable additions over a naive manifest:**

| Field | Value | Why |
| :--- | :--- | :--- |
| `concurrencyPolicy` | `Forbid` | Prevents a slow job from overlapping the next scheduled run |
| `successfulJobsHistoryLimit` | `3` | Retains recent job records for audit without unbounded accumulation |
| `failedJobsHistoryLimit` | `1` | Keeps the most recent failure visible for debugging |
| `backoffLimit` | `1` | Retries once before marking the Job failed; avoids infinite retry loops |
| `image: bitnami/kubectl:1.29` | Pinned tag | Prevents silent image drift; update intentionally |
| `resources` | Explicit requests and limits | Prevents the kubectl pod from consuming unbounded node resources |
| `schedule: "0 4 * * 1-5"` | Weekdays only | Skips weekends; adjust to `* * *` for daily |

---

## 6. Shell Script Hardening

Every `command` block must begin with `set -euo pipefail`. Without it, a failed `kubectl` call is silently ignored and the script continues — producing incomplete scale operations with no indication of failure.

```sh
set -euo pipefail
```

| Flag | Effect |
| :--- | :--- |
| `-e` | Exit immediately if any command returns a non-zero exit code |
| `-u` | Treat unset variables as an error rather than substituting an empty string |
| `-o pipefail` | Return the exit code of the first failed command in a pipeline, not the last |

**Practical example — why `-e` matters:**

Without `-e`, if `kubectl patch hpa` fails (e.g., HPA does not exist), the script continues to `kubectl scale` with no signal that the HPA minimum is now wrong. With `-e`, the job fails immediately, the retry mechanism kicks in, and an alert fires — the operator knows something is wrong.

**Handling optional resources without disabling `-e`:**

Use `|| true` or `|| echo "..."` for genuinely optional commands rather than removing `set -e` from the entire script:

```sh
kubectl scale statefulset [deployment_name] -n [namespace] --replicas=3 \
  || echo "No statefulset found — skipping"
```

This preserves strict failure handling for mandatory commands while gracefully ignoring expected non-existence of optional resources.

---

## 7. Cluster Hygiene and Garbage Collection

Every `jobTemplate.spec` block must include `ttlSecondsAfterFinished`. Without it, finished Job pods accumulate indefinitely in the `monitoring` namespace, consuming namespace object quota and cluttering `kubectl get pods` output.

```yaml
jobTemplate:
  spec:
    ttlSecondsAfterFinished: 180  # Delete finished pods after 3 minutes
```

Combined with `successfulJobsHistoryLimit` and `failedJobsHistoryLimit` on the CronJob itself, this gives you three layers of cleanup:

| Mechanism | Cleans up | Retention |
| :--- | :--- | :--- |
| `ttlSecondsAfterFinished` | Finished Job pods | 3 minutes after completion |
| `successfulJobsHistoryLimit` | Successful Job objects | Last 3 |
| `failedJobsHistoryLimit` | Failed Job objects | Last 1 |

Do not set `ttlSecondsAfterFinished` too low (e.g., 0) if you rely on `kubectl logs` for debugging — the pods will be deleted before you can inspect them. 180 seconds is a reasonable default.

---

## 8. Observability and Alerting

### Labels for Log Searches

All Job pods inherit the labels from the pod template. Add meaningful labels that make log queries precise:

```yaml
labels:
  job-type: scale-up          # or scale-down
  target-namespace: [namespace]
  app.kubernetes.io/name: [deployment_name]-scale-up
```

These labels are queryable in Loki, Elasticsearch, and CloudWatch:

```
{namespace="monitoring", job_type="scale-up", target_namespace="namespace-api-team"}
```

### Prometheus Alerting Rules

Use `kube-state-metrics` to expose CronJob lifecycle metrics. The following rules cover the two most common failure scenarios: a job that never ran (missed schedule) and a job that ran but failed.

```yaml
groups:
  - name: cronjob.rules
    rules:
      # Alert when a CronJob has not been scheduled in over 2 hours
      # (catches suspended CronJobs, missed triggers, and controller issues)
      - alert: CronJobNotScheduled
        expr: |
          (time() - kube_cronjob_status_last_schedule_time) > 7200
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "CronJob {{ $labels.cronjob }} has not been scheduled in 2 hours"
          description: |
            CronJob {{ $labels.namespace }}/{{ $labels.cronjob }} last ran
            {{ $value | humanizeDuration }} ago. Check if the CronJob is suspended
            or if the CronJob controller is healthy.

      # Alert when the most recent Job execution failed
      - alert: CronJobLastRunFailed
        expr: |
          kube_job_status_failed > 0
          * on(job_name) group_left(cronjob)
          label_replace(
            kube_job_owner{owner_kind="CronJob"},
            "job_name", "$1", "job_name", "(.*)"
          )
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "CronJob {{ $labels.cronjob }} last execution failed"
          description: |
            The most recent Job created by CronJob {{ $labels.namespace }}/{{ $labels.cronjob }}
            has failed pods. Inspect the Job and pod logs in the monitoring namespace.
```

---

## 9. Tips and Best Practices

**Namespace**
Use a dedicated namespace (`monitoring`, `ops-jobs`, or `platform`) for all centralized CronJobs. Do not co-locate them in application namespaces — visibility is lost and RBAC becomes fragmented again.

**RBAC**
Use a single ClusterRoleBinding scoped to exactly the verbs and resources the jobs require. Audit the ClusterRole periodically. Never grant wildcard verbs (`*`) to a CronJob ServiceAccount.

**Image pinning**
Always pin `bitnami/kubectl` to a specific minor version tag (e.g., `1.29`) rather than `latest`. Unpinned tags can silently pull a new `kubectl` version that changes flag behavior or output format.

**Concurrency**
Set `concurrencyPolicy: Forbid` unless you explicitly want parallel runs. `Allow` (the default) can cause overlapping scale operations that fight each other on the same HPA or Deployment.

**Timezone**
Always set `spec.timeZone` explicitly. The default is UTC — a CronJob without a timezone will fire at unexpected local times after daylight saving changes or team location shifts.

**Secret management**
CronJobs that need credentials (API keys, database passwords) should mount them from Kubernetes Secrets or use IRSA/Workload Identity — never bake them into the command string or image.

**File organization**
Keep RBAC in one file (`rbac-cronjob.yaml`) and CronJob manifests grouped by team or function. A flat directory works for small deployments; for larger ones, organize by target namespace:

```
ops-jobs/
├── rbac-cronjob.yaml
├── api-team/
│   ├── scale-up.yaml
│   └── scale-down.yaml
└── ui-team/
    ├── scale-up.yaml
    └── scale-down.yaml
```

---

## Summary

Centralizing CronJobs in a single namespace gives platform teams:

- **Unified visibility** — one namespace to watch, one set of alerts to configure.
- **Reduced RBAC duplication** — one ServiceAccount and ClusterRoleBinding instead of one per namespace.
- **Consistent patterns** — shell hardening, resource limits, cleanup settings, and labels applied uniformly.
- **Simpler scaling** — adding a new team's scheduled job means adding a manifest to one directory, not provisioning new RBAC in a new namespace.

The tradeoff is that the `monitoring` namespace becomes a privileged namespace. Protect it accordingly — restrict who can create or modify objects there, audit changes, and treat RBAC hygiene in that namespace as a security concern.
