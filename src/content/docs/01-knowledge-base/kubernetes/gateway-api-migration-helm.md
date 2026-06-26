# Gateway API Migration Helm Chart

Helm chart to simplify migration from Ingress to Gateway API (GKE Gateway). Automatically creates HTTPRoutes and HealthCheckPolicies for multiple apps in one deploy.

## Table of Contents

| Section | Topic | Description |
| :---: | :--- | :--- |
| **01** | [What the Chart Does](#1-what-the-chart-does) | Auto-creates HTTPRoutes and HealthCheckPolicies. |
| **02** | [Installation](#2-installation) | Helm repo and install command. |
| **03** | [Values Structure](#3-values-structure) | Multi-application configuration. |
| **04** | [Dry-Run and Verify](#4-dry-run-and-verify) | Template rendering and resource verification. |
| **05** | [Use Case: Migration at Scale](#5-use-case-migration-at-scale) | Migrating from Ingress to Gateway API. |
| **06** | [Comparison](#6-comparison) | Manual vs Helm chart HTTPRoute creation. |

---

## 1. What the Chart Does

This chart solves the problem of migrating multiple applications from Ingress to Gateway API at scale. Instead of manually creating HTTPRoutes for each application, you define all applications in a single `values.yaml` and the chart generates:

- **HTTPRoutes** for each application (host, paths, backend refs)
- **HealthCheckPolicies** for GKE health check configuration

### Key Benefits

| Benefit | Description |
|---------|-------------|
| Single deployment | One Helm install creates all routes |
| Centralized config | All apps defined in one values file |
| Consistent patterns | Same route structure across apps |
| Easy rollback | Single Helm release manages all routes |

---

## 2. Installation

```bash
helm repo add gateway-api-migration https://your-org.github.io/gateway-api-migration

helm upgrade --install gateway gateway-api-migration/gateway-api-migration \
    -n gateway-api \
    -f values.yaml
```

---

## 3. Values Structure

The chart supports defining multiple applications in a single values file:

```yaml
# values.yaml
applications:
  - name: frontend
    host: frontend.your-domain.com
    paths:
      - path: /
        pathType: Prefix
        service: frontend-service
        port: 80

  - name: api
    host: api.your-domain.com
    paths:
      - path: /
        pathType: Prefix
        service: api-service
        port: 8080
      - path: /webhook
        pathType: Prefix
        service: api-service
        port: 8080

  - name: admin
    host: admin.your-domain.com
    paths:
      - path: /
        pathType: Prefix
        service: admin-service
        port: 3000

gateway:
  name: production-gateway
  namespace: gateway-system
```

---

## 4. Dry-Run and Verify

### Render templates

```bash
helm template . -f values.yaml
```

### Install the chart

```bash
helm install gateway-api . -n gateway-api
```

### Verify created resources

```bash
kubectl get httproutes,healthcheckpolicies -A
```

### Expected output

```
NAME                    HOSTS                      AGE
frontend-route          frontend.your-domain.com   5s
api-route               api.your-domain.com        5s
admin-route             admin.your-domain.com      5s

NAME                    AGE
frontend-healthcheck    5s
api-healthcheck         5s
admin-healthcheck       5s
```

---

## 5. Use Case: Migration at Scale

### Migration Workflow

| Step | Action | Command |
|------|--------|---------|
| 1 | Deploy chart with existing apps | `helm install gateway-api . -f values.yaml` |
| 2 | Verify routes are created | `kubectl get httproutes -A` |
| 3 | Test routing works | `curl -H "Host: app.example.com" https://gateway-ip/` |
| 4 | Remove old Ingress | `kubectl delete ingress <name>` |
| 5 | Update DNS to point to Gateway | Update A/CNAME records |

### Before Migration

```yaml
# Old Ingress resource (manual, per-app)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: frontend
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: frontend.your-domain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 80
```

### After Migration

```yaml
# Chart-managed values.yaml (centralized)
applications:
  - name: frontend
    host: frontend.your-domain.com
    paths:
      - path: /
        pathType: Prefix
        service: frontend-service
        port: 80
```

---

## 6. Comparison

| Approach | HTTPRoute Creation | Maintenance | Rollback |
|----------|-------------------|-------------|----------|
| **Manual** | One YAML per app | Update each individually | Delete each individually |
| **Helm chart** | Single values.yaml | Single values file update | `helm rollback` |
| **Operator** | CRD per app | Custom controller needed | Operator-specific |

### When to Use the Helm Chart

| Scenario | Recommendation |
|----------|----------------|
| Migrating 5+ Ingress resources | Use Helm chart |
| Single Ingress resource | Manual is simpler |
| Dynamic routes (CI/CD pipeline) | Use Helm chart |
| Static routes, rarely change | Either works |
