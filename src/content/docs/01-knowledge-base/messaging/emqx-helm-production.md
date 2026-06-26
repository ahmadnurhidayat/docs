# EMQX Production Deployment via Helm

A production-grade Helm chart deployment guide for EMQX MQTT broker with enterprise security, monitoring, high availability, and backup capabilities.

## Table of Contents

| Section | Topic | Description |
| :---: | :--- | :--- |
| **01** | [Features Overview](#1-features-overview) | Security, HA, auto-scaling, monitoring, TLS, backup. |
| **02** | [Prerequisites](#2-prerequisites) | Kubernetes, cert-manager, Prometheus Operator. |
| **03** | [Quick Start](#3-quick-start) | Deploy EMQX in minutes. |
| **04** | [Security Configuration](#4-security-configuration) | Authentication methods and TLS. |
| **05** | [ACL and Access Control](#5-acl-and-access-control) | Least privilege topic authorization. |
| **06** | [Monitoring](#6-monitoring) | Prometheus metrics, alerting, health checks. |
| **07** | [Backup and Recovery](#7-backup-and-recovery) | Automated backups and restore. |
| **08** | [Scaling and Performance](#8-scaling-and-performance) | Horizontal scaling and tuning. |
| **09** | [Network Configuration](#9-network-configuration) | Ingress and internal service discovery. |
| **10** | [Troubleshooting](#10-troubleshooting) | Common issues and debug commands. |

---

## 1. Features Overview

| Feature | Description |
|---------|-------------|
| **Security First** | All secrets managed via Kubernetes secrets, no hardcoded credentials |
| **High Availability** | Multi-zone deployment with pod anti-affinity and disruption budgets |
| **Auto-scaling** | Horizontal Pod Autoscaler with CPU and memory targets |
| **Monitoring** | Prometheus metrics, alerting rules, and health checks |
| **TLS Encryption** | Full TLS encryption for MQTT, WebSocket, and dashboard access |
| **Network Security** | Network policies and ingress with rate limiting |
| **Backup and Recovery** | Automated daily backups with configurable retention |
| **Production Tuning** | Optimized resource allocation and performance settings |

---

## 2. Prerequisites

### 2.1 Kubernetes Cluster

A running Kubernetes cluster (v1.21+) with:

- At least 3 worker nodes in different zones
- Storage classes configured (`fast-ssd-prod`, `backup-storage-prod`)
- Ingress controller (nginx recommended)

### 2.2 Required Cluster Components

```bash
# cert-manager for TLS certificate management
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# prometheus-operator for monitoring (optional but recommended)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
    -n monitoring --create-namespace
```

### 2.3 Tools

| Tool | Version | Purpose |
|------|---------|---------|
| `kubectl` | 1.21+ | Cluster access and management |
| `helm` | v3.8+ | Package management |
| `openssl` | any | Certificate generation |

---

## 3. Quick Start

### 3.1 Prepare Configuration

```bash
# Copy and customize the production values
cp values-production.yaml values-custom.yaml

# Edit values-custom.yaml to match your environment:
# - Update domain names (replace 'your-production-domain.com')
# - Configure storage classes
# - Set resource limits based on your requirements
# - Configure node selectors for your cluster
```

### 3.2 Deploy EMQX

```bash
# Option A: Use the deployment script (recommended)
chmod +x scripts/deploy-production.sh
./scripts/deploy-production.sh

# Option B: Manual deployment
helm upgrade --install emqx-prod . \
  --namespace production \
  --values values-custom.yaml \
  --create-namespace \
  --wait
```

### 3.3 Verify Deployment

```bash
# Check pod status
kubectl get pods -n production -l app.kubernetes.io/name=emqx

# Check cluster status
kubectl port-forward svc/emqx-prod 18083:18083 -n production &
curl -u admin:$(kubectl get secret emqx-auth-secret -n production \
    -o jsonpath='{.data.dashboard-password}' | base64 -d) \
    http://localhost:18083/api/v5/cluster
```

---

## 4. Security Configuration

### 4.1 Authentication Methods

| Method | Use Case | Configuration |
|--------|----------|---------------|
| **JWT** (default) | Token-based auth for mobile/IoT | JWT secret in Kubernetes secret |
| **Username/Password** | Internal service accounts | Bcrypt hashed passwords |
| **X.509 Certificate** | mTLS for device authentication | CA cert in Kubernetes secret |
| **External HTTP** | Custom auth backend | HTTP endpoint URL |

### 4.2 TLS Configuration

| Port | Protocol | Purpose | Certificate |
|------|----------|---------|-------------|
| 8883 | MQTT over TLS | Secure MQTT connections | Server cert + optional client CA |
| 8084 | WebSocket over TLS | Secure WebSocket connections | Server cert |
| 18084 | Dashboard HTTPS | Web interface | Server cert |

```yaml
# Example TLS values override
tls:
  enabled: true
  certManager:
    enabled: true
    issuerRef:
      name: letsencrypt-prod
      kind: ClusterIssuer
  secretName: emqx-tls-secret
```

### 4.3 Certificate Management

Certificates can be managed via:

- **cert-manager**: Automated issuance and renewal (recommended)
- **Manual**: Pre-created TLS secrets in Kubernetes

---

## 5. ACL and Access Control

The ACL configuration implements the principle of least privilege:

| User Type | Access Level | Topic Pattern |
|-----------|-------------|---------------|
| Admin users | Full access | `#` |
| Service accounts | System topics only | `$SYS/#` |
| Application users | Scoped by username pattern | `app/{username}/#` |
| Device clients | Own telemetry and commands | `device/{clientid}/telemetry`, `device/{clientid}/commands` |
| Default policy | Deny all | N/A |

```yaml
# ACL rules in values.yaml
acl:
  rules:
    - permission: allow
      username_pattern: "admin.*"
      topic: "#"
    - permission: allow
      username_pattern: "service-.*"
      topic: "$SYS/#"
    - permission: allow
      username_pattern: "app-.*"
      topic: "app/%u/#"
    - permission: allow
      clientid_pattern: "device-.*"
      topic: "device/%c/telemetry"
    - permission: deny
      topic: "#"
```

---

## 6. Monitoring

### 6.1 Metrics Collection

| Metric Type | Source | Endpoint |
|-------------|--------|----------|
| Prometheus native | EMQX built-in | `:18083/api/v5/prometheus/stats` |
| Resource metrics | kubelet | CPU, memory, disk usage |
| Custom metrics | EMQX dashboard | Connection count, message rates |

### 6.2 Alerting Rules

Pre-configured alerts for:

| Alert | Condition | Severity |
|-------|-----------|----------|
| High CPU usage | > 80% for 5 minutes | Warning |
| High memory usage | > 85% for 5 minutes | Warning |
| Pod failures | CrashLoopBackOff | Critical |
| Cluster unhealthy | Nodes not connected | Critical |
| High connection rate | > 80% of max | Warning |
| Storage space low | < 20% free | Warning |

### 6.3 Health Checks

```yaml
# Liveness probe: ensures container is alive
livenessProbe:
  httpGet:
    path: /status
    port: 18083
  initialDelaySeconds: 60
  periodSeconds: 10

# Readiness probe: ensures pod can serve traffic
readinessProbe:
  httpGet:
    path: /status
    port: 18083
  initialDelaySeconds: 30
  periodSeconds: 5

# Startup probe: handles slow container startup
startupProbe:
  httpGet:
    path: /status
    port: 18083
  failureThreshold: 30
  periodSeconds: 10
```

---

## 7. Backup and Recovery

### 7.1 Automated Backups

| Setting | Default | Description |
|---------|---------|-------------|
| Schedule | Daily at 2 AM | Configurable via CronJob |
| Retention | 90 days | Production default |
| Contents | Configuration, cluster state, persistent data | Full backup |
| Storage | Separate PVC | Backup storage class |

### 7.2 Manual Backup

```bash
# Trigger manual backup
kubectl create job --from=cronjob/emqx-prod-backup \
    emqx-manual-backup-$(date +%s) -n production
```

### 7.3 Recovery Process

```bash
# List available backups
kubectl exec -it emqx-prod-backup-[pod-id] -n production -- ls -la /backup/

# Restore from backup
kubectl exec -it emqx-prod-0 -n production -- emqx_ctl data restore /backup/emqx-backup-YYYY-MM-DD.tar
```

### 7.4 Backup Verification

```bash
# Check CronJob status
kubectl get cronjob emqx-prod-backup -n production

# List recent backup jobs
kubectl get jobs -n production -l app=emqx-backup --sort-by=.metadata.creationTimestamp
```

---

## 8. Scaling and Performance

### 8.1 Horizontal Scaling

```bash
# Scale manually
kubectl scale statefulset emqx-prod --replicas=7 -n production

# Auto-scaling is enabled by default (5-20 replicas)
```

### 8.2 Performance Tuning

| Setting | Value | Description |
|---------|-------|-------------|
| Connection limit | 2M concurrent | Maximum simultaneous connections |
| Message throughput | 10K msg/sec | Sustained message rate |
| Session expiry | 24 hours | Persistent session retention |
| Max packet size | 1MB | Maximum MQTT packet size |

### 8.3 Resource Allocation

```yaml
resources:
  requests:
    cpu: 2000m      # Baseline CPU
    memory: 4Gi     # Baseline memory
  limits:
    cpu: 8000m      # Maximum CPU
    memory: 16Gi    # Maximum memory
```

### 8.4 Scaling Comparison

| Replicas | Connections | Throughput | Use Case |
|----------|-------------|------------|----------|
| 3 | 500K | 3K msg/sec | Small deployment |
| 5 | 1M | 6K msg/sec | Medium deployment |
| 7 | 2M | 10K msg/sec | Large production |
| 10+ | 3M+ | 15K+ msg/sec | High-throughput |

---

## 9. Network Configuration

### 9.1 Ingress Access

| Service | URL | Port |
|---------|-----|------|
| Dashboard | `https://emqx-dashboard.your-domain.com` | 443 |
| MQTT over WSS | `wss://mqtt.your-domain.com:8084/mqtt` | 8084 |
| MQTT over TLS | `mqtts://mqtt.your-domain.com:8883` | 8883 |

### 9.2 Internal Service Discovery

| Service | DNS Name | Purpose |
|---------|----------|---------|
| Cluster service | `emqx-prod.production.svc.cluster.local` | Client connections |
| Headless service | `emqx-prod-headless.production.svc.cluster.local` | Node discovery |
| Dashboard | `emqx-prod.production.svc.cluster.local:18083` | Admin access |

### 9.3 Environment-Specific Values

```bash
# Create separate values files for different environments
values-dev.yaml        # Development
values-staging.yaml    # Staging
values-production.yaml # Production
```

---

## 10. Troubleshooting

### 10.1 Pod Stuck in Pending

```bash
kubectl describe pod [pod-name] -n production
# Check for resource constraints or node selector issues
```

### 10.2 Cluster Formation Issues

```bash
kubectl logs [pod-name] -n production
# Check for DNS resolution and network connectivity
```

### 10.3 TLS Certificate Issues

```bash
kubectl describe certificate emqx-tls-certificate -n production
kubectl get certificaterequest -n production
```

### 10.4 Debug Commands

```bash
# Check overall health
kubectl get all -n production -l app.kubernetes.io/name=emqx

# View logs
kubectl logs -f statefulset/emqx-prod -n production

# Check cluster status
kubectl exec -it emqx-prod-0 -n production -- emqx_ctl cluster status

# Test MQTT connectivity
mosquitto_pub -h mqtt.your-domain.com -p 8883 -t test/topic \
    -m "hello" --cafile ca.crt
```

### 10.5 Common Issues Reference

| Issue | Symptom | Resolution |
|-------|---------|------------|
| Pod Pending | Resource constraints | Check node resources and pod requests |
| CrashLoopBackOff | Repeated restarts | Check logs for config errors |
| TLS failure | Connection refused | Verify cert-manager issuer and secrets |
| Cluster split | Nodes not connected | Check DNS and network connectivity |
| High latency | Slow message delivery | Check resource limits and network |
