# From Traditional Ingress to Gateway API in AWS EKS

## Table of Contents

| Section | Topic | Description |
| :---: | :--- | :--- |
| **01** | [The Problem with Traditional Ingress](#1-the-problem-with-traditional-ingress) | How Ingress resources became overloaded and why the model breaks down at scale. |
| **02** | [The Ownership Conflict](#2-the-ownership-conflict) | Platform teams vs application teams — the fundamental tension Ingress cannot resolve. |
| **03** | [Gateway API Architecture](#3-gateway-api-architecture) | GatewayClass, Gateway, ListenerSet, and HTTPRoute — the resources and their clear ownership boundaries. |
| **04** | [Gateway API on AWS EKS](#4-gateway-api-on-aws-eks) | How the AWS Load Balancer Controller provisions ALBs, listeners, and target groups from Gateway resources. |
| **05** | [Multi-Team Routing in Practice](#5-multi-team-routing-in-practice) | Complete YAML walkthrough: platform Gateway plus independent HTTPRoutes for Payments and Orders teams. |
| **06** | [Production Patterns](#6-production-patterns) | Four battle-tested patterns: shared external Gateway, dedicated per-environment Gateways, internal+external split, and centralized TLS. |
| **07** | [What Gateway API Doesn't Solve](#7-what-gateway-api-doesnt-solve) | The honest boundaries — networking design, security practices, latency, and DNS complexity. |
| **08** | [Migration Strategy](#8-migration-strategy) | When to adopt, when Ingress is still fine, and the organizational changes required. |

---

## 1. The Problem with Traditional Ingress

For years, the Kubernetes Ingress resource was the only native way to expose HTTP applications to external traffic. A single Ingress object defined everything: the hostname, TLS configuration, path-based routing rules, backend service references, and controller-specific behavior through annotations. It worked — for a while.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  labels:
    app.kubernetes.io/name: platform-ingress
    app.kubernetes.io/instance: app-ingress-v1
    app.kubernetes.io/component: traffic-gateway
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/ssl-redirect: "443"
    alb.ingress.kubernetes.io/healthcheck-path: /healthz
    alb.ingress.kubernetes.io/group.name: shared-alb
spec:
  ingressClassName: alb
  tls:
  - hosts:
    - api.example.com
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /payments
        pathType: Prefix
        backend:
          service:
            name: payment-service
            port:
              number: 80
      - path: /orders
        pathType: Prefix
        backend:
          service:
            name: order-service
            port:
              number: 80
```

The problem is not the syntax — it is that **one YAML object carries the concerns of two distinct roles**. The platform team (which owns the ALB, TLS certificates, security groups, and WAF rules) and the application team (which owns routing rules and backend services) both need to modify the same resource. There is no boundary.

As platforms grow, this creates cascading issues:

- **Annotation sprawl.** Every Ingress controller requires its own set of annotations (`alb.ingress.kubernetes.io/*`, `nginx.ingress.kubernetes.io/*`, `haproxy.org/*`). These annotations are not portable, not validated at apply-time, and not governed by any schema.
- **No multi-tenancy model.** An Ingress is a single resource in a single namespace. If two teams want to share an ALB, someone must merge their routing rules into one Ingress object — or use controller-specific annotation hacks like `alb.ingress.kubernetes.io/group.name`.
- **No role separation.** RBAC can control who creates Ingress resources, but once created, there is no way to say "the platform team owns the TLS config, the app team owns the path rules." It is a single write boundary.
- **Limited extensibility.** Adding features like traffic splitting, header-based routing, or route-level timeouts requires controller-specific annotations or CRDs — there is no standard extension point in the Ingress spec.

The Kubernetes community recognized these limitations and designed the Gateway API as a successor — not an incremental fix, but a fundamentally different model.

---

## 2. The Ownership Conflict

The central tension with traditional Ingress is ownership. Consider a real-world EKS platform with these actors:

| Role | Responsibility |
|------|---------------|
| **Platform Team** | Shared ALBs, TLS certificates, security policies, WAF rules, VPC networking, compliance guardrails |
| **Application Team A** | Payment service, its routing rules, canary deployments, rate limiting on `/payments` |
| **Application Team B** | Order service, its routing rules, header-based routing, authentication on `/orders` |

With traditional Ingress, all of these concerns land in a single Ingress object — or, at best, multiple Ingress resources that must be carefully annotated to share an ALB. Either way, the platform team and application teams are editing the same objects. A misconfigured annotation by an application developer can break TLS for the entire ALB. A platform-level change to the WAF configuration requires touching every team's Ingress.

Gateway API resolves this by splitting the resource model along ownership lines:

```
┌─────────────────────────────────────────────┐
│                 GatewayClass                │  ← "Which controller?" (infra)
│  (AWS Load Balancer Controller)             │
├─────────────────────────────────────────────┤
│                 Gateway                     │  ← "Where traffic enters?" (platform)
│  (Public ALB, TLS, listeners)               │
├──────────────────┬──────────────────────────┤
│    HTTPRoute     │      HTTPRoute           │  ← "How traffic routes?" (apps)
│  /payments → Svc │  /orders → Svc           │
│  (Team A owns)   │  (Team B owns)           │
└──────────────────┴──────────────────────────┘
```

This is not just a cosmetic change. It means the platform team can enforce that only they can create Gateways (via RBAC), while application teams can create HTTPRoutes that attach to those Gateways — without ever touching infrastructure configuration.

---

## 3. Gateway API Architecture

The Gateway API introduces four core resources, each with a distinct purpose and owner. As of **v1.5 (February 2026)** — the latest stable release — six features graduated from Experimental to Standard: ListenerSet, TLSRoute, HTTPRoute CORS Filter, Client Certificate Validation, Certificate Selection for Gateway TLS Origination, and ReferenceGrant.

> **Important:** The AWS Load Balancer Controller implements a **subset** of Gateway API features. Several v1.5 features (CORS, BackendTLS, timeouts) are not yet supported by the AWS LBC. TLS certificates are configured through a custom `LoadBalancerConfiguration` CRD — not through the standard Gateway `certificateRefs`. See [Section 4](#4-gateway-api-on-aws-eks) for the full compatibility matrix.

### GatewayClass

A GatewayClass defines **which controller implements the Gateway**. It is the cluster-scoped resource that maps to a specific ingress controller or service mesh. Think of it as answering the question: "Which infrastructure powers this traffic layer?"

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: aws-alb
  labels:
    app.kubernetes.io/name: aws-lb-controller
    app.kubernetes.io/instance: aws-alb-gatewayclass
    app.kubernetes.io/component: traffic-controller
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  controllerName: gateway.k8s.aws/alb
```

The `controllerName` tells Kubernetes which controller should handle Gateways of this class. On EKS, `gateway.k8s.aws/alb` maps to the AWS Load Balancer Controller (v2.9+). The controller is an open-source project under `kubernetes-sigs`, not an EKS-specific component. Other controllers use different names — `istio.io/gateway-controller` for Istio, `projectcontour.io/contour` for Contour, `konghq.com/kic-gateway-controller` for Kong.

**Key property:** GatewayClass is a cluster-scoped resource. Only cluster administrators (typically the platform team) should create and manage GatewayClasses. This is the first layer of governance.

### Gateway

A Gateway represents **the actual network entry point** — the infrastructure that accepts traffic. On EKS, a Gateway provisions a real AWS Application Load Balancer (ALB) or Network Load Balancer (NLB). The platform team owns Gateways because they represent shared infrastructure.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: shared-gateway
  namespace: gateway-system
  labels:
    app.kubernetes.io/name: platform-gateway
    app.kubernetes.io/instance: shared-gateway-prod
    app.kubernetes.io/component: traffic-gateway
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  gatewayClassName: aws-alb
  infrastructure:
    parametersRef:
      kind: LoadBalancerConfiguration
      name: shared-gateway-lbconfig
      group: gateway.k8s.aws
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            gateway-access: "true"
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            gateway-access: "true"
```

> **Critical:** The AWS Load Balancer Controller does **not** use the standard Gateway API `listeners[].tls.certificateRefs` for TLS configuration. Certificates, security groups, WAF, access logs, and other ALB-specific settings are configured through a custom CRD — `LoadBalancerConfiguration` — referenced via `infrastructure.parametersRef`. This is a key architectural difference from the generic Gateway API spec.

Every field on a Gateway represents an infrastructure decision:

| Field | What It Controls |
|-------|-----------------|
| `gatewayClassName` | Which controller provisions the infrastructure |
| `listeners[].protocol` | HTTP vs HTTPS — a security decision |
| `listeners[].port` | Which port the ALB listens on |
| `listeners[].allowedRoutes` | Which namespaces can attach routes to this Gateway — the multi-tenancy boundary |
| `infrastructure.parametersRef` | References a `LoadBalancerConfiguration` CRD for ALB-specific settings (TLS certs, WAF, security groups, access logs) |

### LoadBalancerConfiguration (AWS LBC Custom CRD)

Since the AWS LBC does not use the standard Gateway API TLS fields, all ALB-specific customization lives in a separate `LoadBalancerConfiguration` resource. This is a custom CRD provided by the AWS LBC (`gateway.k8s.aws/v1beta1`), not part of the Gateway API spec.

```yaml
apiVersion: gateway.k8s.aws/v1beta1
kind: LoadBalancerConfiguration
metadata:
  name: shared-gateway-lbconfig
  namespace: gateway-system
  labels:
    app.kubernetes.io/name: platform-gateway
    app.kubernetes.io/instance: shared-gateway-lbconfig
    app.kubernetes.io/component: lb-configuration
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  scheme: internet-facing        # or "internal" for private ALB
  listenerConfigurations:
  - protocolPort: HTTPS:443
    defaultCertificate: arn:aws:acm:ap-southeast-1:123456789012:certificate/uuid
    listenerAttributes:
    - key: routing.http.drop_invalid_header_fields.enabled
      value: "true"
    - key: routing.http.response.access_control_allow_origin.header_value
      value: "https://app.example.com"
  loadBalancerAttributes:
  - key: idle_timeout.timeout_seconds
    value: "60"
  - key: deletion_protection.enabled
    value: "true"
  - key: access_logs.s3.enabled
    value: "true"
  - key: access_logs.s3.bucket
    value: "my-alb-logs-bucket"
```

**Key `LoadBalancerConfiguration` fields:**

| Field | Purpose |
|-------|---------|
| `spec.scheme` | `internet-facing` or `internal` (replaces the old Ingress annotation) |
| `listenerConfigurations[].defaultCertificate` | ACM certificate ARN for TLS termination on this listener port |
| `listenerConfigurations[].listenerAttributes` | ALB listener-level attributes (CORS headers, header field validation, etc.) |
| `loadBalancerAttributes` | ALB-level attributes (idle timeout, deletion protection, access logs, HTTP/2, etc.) |
| `spec.securityGroups` | Custom security group IDs (otherwise auto-discovered) |
| `spec.subnetSelector` | Tag-based subnet selection (otherwise auto-discovered via `kubernetes.io/role/elb` tags) |

The `allowedRoutes` field is especially powerful. It lets the platform team control which application namespaces can use a Gateway. Without this, any team could attach routes to any Gateway, recreating the ownership problem. With it, the platform team explicitly grants access:

```yaml
allowedRoutes:
  namespaces:
    from: Selector
    selector:
      matchLabels:
        gateway-access: "true"
```

Only namespaces labeled `gateway-access: "true"` can attach HTTPRoutes to this Gateway. The platform team controls the label — application teams cannot grant themselves access.

### ListenerSet (Stable in v1.5)

ListenerSet is one of the major features that graduated to Standard in Gateway API v1.5. Before v1.5, all listeners had to be specified directly on the Gateway object. This created challenges:

- **Multi-tenant coordination.** Teams had to coordinate to add listeners to a shared Gateway.
- **Safe delegation.** No way to delegate individual listener management without granting access to the entire Gateway.
- **Extending existing Gateways.** Adding a new listener required modifying the Gateway resource itself.
- **64-listener limit.** A single Gateway is capped at 64 listeners.

ListenerSet solves these problems by allowing listeners to be defined in separate namespaced resources that attach to a parent Gateway. The Gateway controller merges listeners from the Gateway resource and any attached ListenerSets.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: example-gateway
  namespace: infra
  labels:
    app.kubernetes.io/name: platform-gateway
    app.kubernetes.io/instance: example-gateway-prod
    app.kubernetes.io/component: traffic-gateway
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  gatewayClassName: aws-alb
  listeners:
  - name: http
    protocol: HTTP
    port: 80
---
apiVersion: gateway.networking.k8s.io/v1
kind: ListenerSet
metadata:
  name: team-a-listeners
  namespace: team-a
  labels:
    app.kubernetes.io/name: team-a-gateway-listeners
    app.kubernetes.io/instance: team-a-https
    app.kubernetes.io/component: traffic-listener
    app.kubernetes.io/part-of: team-a-services
    app.kubernetes.io/managed-by: kubectl
spec:
  parentRef:
    name: example-gateway
    namespace: infra
  listeners:
  - name: https-a
    protocol: HTTPS
    port: 443
    hostname: a.example.com
    tls:
      certificateRefs:
      - name: a-cert
---
apiVersion: gateway.networking.k8s.io/v1
kind: ListenerSet
metadata:
  name: team-b-listeners
  namespace: team-b
  labels:
    app.kubernetes.io/name: team-b-gateway-listeners
    app.kubernetes.io/instance: team-b-https
    app.kubernetes.io/component: traffic-listener
    app.kubernetes.io/part-of: team-b-services
    app.kubernetes.io/managed-by: kubectl
spec:
  parentRef:
    name: example-gateway
    namespace: infra
  listeners:
  - name: https-b
    protocol: HTTPS
    port: 443
    hostname: b.example.com
    tls:
      certificateRefs:
      - name: b-cert
```

**Key properties:**
- ListenerSets are namespaced — each team can own their own ListenerSet in their own namespace.
- The platform team retains control via RBAC on the Gateway and on who can create ListenerSets that reference it.
- The Gateway's `listeners` field remains mandatory — every Gateway must have at least one listener defined directly.
- The controller merges `Gateway.spec.listeners` + all attached `ListenerSet.spec.listeners` into the effective listener set.
- ListenerSets can reference the same Gateway from different namespaces, enabling true multi-tenant listener management.

> **AWS LBC note:** ListenerSet is experimental in the AWS LBC. The `tls.certificateRefs` shown in the example above follows the Gateway API spec — in practice with the AWS LBC, TLS certificates for ListenerSet-managed listeners must also be configured through the Gateway's `LoadBalancerConfiguration`, not through the ListenerSet's `certificateRefs`. Check the [AWS LBC Gateway API guide](https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/guide/gateway/l7gateway/) for current experimental feature support.

### HTTPRoute

An HTTPRoute defines **application-level routing behavior**. It specifies which paths map to which backend services, along with optional filters for header matching, traffic splitting, redirects, and more. Application teams own HTTPRoutes — they are namespaced resources that reference a Gateway via `parentRefs`.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payments-route
  namespace: payments
  labels:
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/instance: payments-route-v1
    app.kubernetes.io/component: api-routing
    app.kubernetes.io/part-of: payments
    app.kubernetes.io/managed-by: kubectl
spec:
  parentRefs:
  - name: shared-gateway
    namespace: gateway-system
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /payments
    backendRefs:
    - name: payment-service
      port: 80
```

The `parentRefs` field links the route to a Gateway. The route can only attach to Gateways in namespaces that the Gateway's `allowedRoutes` permits. An HTTPRoute referencing a Gateway that does not allow its namespace will be rejected — the controller will not program it.

**Key property:** HTTPRoutes are namespaced. Team A's route in the `payments` namespace cannot interfere with Team B's route in the `orders` namespace, even though both attach to the same Gateway. Each team defines its own rules, deploys at its own pace, and owns its own failures.

### Comparison: Ingress vs Gateway API

| Dimension | Ingress | Gateway API |
|-----------|---------|-------------|
| **Resource model** | Single resource holds everything | Gateway + ListenerSet (infra) + HTTPRoute (routing) |
| **Ownership** | Shared — platform and app teams edit the same object | Separated — platform owns Gateway, apps own Routes & ListenerSets |
| **Multi-tenancy** | Controller-specific hacks (group.name annotations) | First-class via `allowedRoutes`, namespace selectors, and ListenerSet |
| **Portability** | Annotation-driven, controller-specific | Standard spec, controller-agnostic core fields |
| **Extensibility** | Ad-hoc annotations | Custom CRDs for ALB-specific features (LBC), standard filters for core routing |
| **Validation** | Annotations are opaque strings | Schema-validated fields, typed configuration |
| **Role granularity** | Create/update/delete on the whole Ingress | RBAC can distinguish Gateway, LoadBalancerConfiguration, ListenerSet, and Route creation |
| **Listener management** | Single Ingress per listener config | Gateway listeners + delegated ListenerSets (experimental in LBC) |
| **TLS Configuration** | Annotations on Ingress | `LoadBalancerConfiguration` CRD (not `certificateRefs` — AWS LBC specific) |

---

## 4. Gateway API on AWS EKS

On EKS, the **AWS Load Balancer Controller** is the primary Gateway API implementation. It watches Gateway, ListenerSet, and HTTPRoute resources and reconciles them into real AWS infrastructure: ALBs, listeners, listener rules, and target groups.

### How It Works

```
┌──────────────────────┐
│  Kubernetes API      │
│                      │
│  Gateway             │──────┐
│  ListenerSet (A)     │      │
│  HTTPRoute (A)       │      │  Watch & Reconcile
│  HTTPRoute (B)       │      │
└──────────────────────┘      │
                              ▼
┌──────────────────────────────────────┐
│  AWS Load Balancer Controller        │
│                                      │
│  Gateway + ListenerSets              │
│        ──► ALB + Listeners           │
│  HTTPRoute ──► Listener Rules        │
│  Service ──► Target Group            │
└──────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────┐
│  AWS APIs                            │
│                                      │
│  elbv2:CreateLoadBalancer            │
│  elbv2:CreateListener                │
│  elbv2:CreateRule                    │
│  elbv2:CreateTargetGroup             │
│  elbv2:RegisterTargets               │
└──────────────────────────────────────┘
```

The reconciliation flow:

1. A platform engineer creates a Gateway resource with `gatewayClassName: aws-alb` and `infrastructure.parametersRef` pointing to a `LoadBalancerConfiguration`.
2. The `LoadBalancerConfiguration` carries the scheme (`internet-facing` or `internal`), TLS certificates, security group IDs, and ALB attributes. The LBC reads this and provisions the ALB with the correct configuration.
3. Application teams create ListenerSets that attach to the Gateway for additional hostname/certificate needs (experimental in LBC, v1.5+).
4. The AWS Load Balancer Controller calls `elbv2:CreateLoadBalancer` with the scheme, subnets (auto-discovered from tags), and security groups.
5. The controller creates listeners on the ALB for every listener defined on the Gateway, attaching ACM certificates from the `LoadBalancerConfiguration`.
6. When an application engineer creates an HTTPRoute, the controller calls `elbv2:CreateRule`, creating a listener rule from the HTTPRoute's `matches` and `backendRefs`.
7. When backend Service Endpoints change, the controller updates the target group registration.

### Prerequisites

To use Gateway API on EKS, you need:

1. **EKS cluster version 1.23+** — the AWS Load Balancer Controller added Gateway API support in v2.4+. For GA Gateway API support (v1), use **AWS LBC v3.0.0+** which requires Gateway API CRDs v1.3.0+. For ListenerSet support, ensure LBC v3.0+.
2. **AWS Load Balancer Controller installed** — typically via Helm (`eks-charts/aws-load-balancer-controller`), with IRSA-configured IAM roles for ALB/NLB management.
3. **Gateway API CRDs installed** — not bundled with Kubernetes by default:

```bash
# Install Gateway API CRDs (standard channel — v1.5.1, latest stable)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
```

4. **AWS LBC Custom CRDs** — the `LoadBalancerConfiguration`, `TargetGroupConfiguration`, and `ListenerRuleConfiguration` CRDs are installed automatically with the AWS LBC Helm chart. No separate install is needed.
5. **ACM certificate** — for HTTPS, the certificate must exist in AWS Certificate Manager in the same region. Reference the ARN directly in `LoadBalancerConfiguration.listenerConfigurations[].defaultCertificate`.
6. **Subnet tags** — subnets must be tagged for auto-discovery:
   - Internet-facing: `kubernetes.io/role/elb: 1` (or `''`)
   - Internal: `kubernetes.io/role/internal-elb: 1` (or `''`)
   - Cluster-scoping (optional): `kubernetes.io/cluster/${cluster-name}: owned`

### TLS Configuration (AWS LBC-Specific)

The AWS Load Balancer Controller does **not** use the standard Gateway API `listeners[].tls.certificateRefs`. Instead, TLS certificates are specified in the `LoadBalancerConfiguration` CRD:

```yaml
apiVersion: gateway.k8s.aws/v1beta1
kind: LoadBalancerConfiguration
metadata:
  name: shared-gateway-lbconfig
  namespace: gateway-system
  labels:
    app.kubernetes.io/name: platform-gateway
    app.kubernetes.io/instance: shared-gateway-lbconfig
    app.kubernetes.io/component: lb-configuration
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  scheme: internet-facing
  listenerConfigurations:
  - protocolPort: HTTPS:443
    defaultCertificate: arn:aws:acm:ap-southeast-1:123456789012:certificate/uuid
```

No Secrets, no `certificateRefs`, no `tls.mode` on the Gateway listener. The Gateway's listener simply declares `protocol: HTTPS` and `port: 443` — all TLS parameters come from the `LoadBalancerConfiguration`.

Multi-certificate setups (different certificates per hostname) are configured with additional listener configurations or via `ListenerSet` resources (experimental).

### AWS LBC Gateway API Feature Compatibility

The AWS LBC implements a **subset** of the Gateway API specification. The table below shows what is actually supported as of AWS LBC v2.9+ and Gateway API v1.5:

| Gateway API Feature | Spec Status | AWS LBC Support | Notes |
|------|------|------|------|
| **GatewayClass** | GA | ✅ Full | `controllerName: gateway.k8s.aws/alb` |
| **Gateway — Listeners, Addresses** | GA | ✅ Full | Standard Gateway API `v1` |
| **Gateway — `infrastructure.parametersRef`** | GA | ✅ Full | Links to `LoadBalancerConfiguration` |
| **Gateway — `allowedRoutes`** | GA | ✅ Full | Namespace selector for multi-tenancy |
| **HTTPRoute — Path/Header/Query matching** | GA | ✅ Full | Multiple header values comma-OR'd |
| **HTTPRoute — BackendRefs** | GA | ✅ Full | Including weighted routing |
| **HTTPRoute — RequestRedirect filter** | GA | ✅ Full | `ReplacePrefixMatch` has caveats (see below) |
| **HTTPRoute — URLRewrite filter** | Extended | ✅ Full | Path and host rewriting |
| **HTTPRoute — ExtensionRef filter** | GA | ✅ Full | Attaches `ListenerRuleConfiguration` |
| **GRPCRoute** | GA | ✅ Full | gRPC-specific method/header matching |
| **ReferenceGrant** | GA (v1.5) | ✅ Full | Cross-namespace backend references |
| **ListenerSet** | GA (v1.5) | ✅ Experimental | Delegated listener management |
| **Gateway TLS — `certificateRefs`** | GA | ❌ **Not supported** | Use `LoadBalancerConfiguration` instead |
| **Gateway TLS — `mode: Passthrough`** | GA | ❌ **Not supported** | ALB does not support TLS passthrough; use NLB |
| **HTTPRoute — RequestHeaderModifier** | GA | ❌ **Limited** | AWS ALB restricts which headers can be modified |
| **HTTPRoute — ResponseHeaderModifier** | GA | ❌ Not supported | — |
| **HTTPRoute — RequestMirror** | Extended | ❌ Not supported | — |
| **HTTPRoute — CORS filter** | GA (v1.5) | ❌ Not supported | Use `listenerAttributes` in LB config |
| **HTTPRoute — Timeouts** | Extended | ❌ Not supported | Use `loadBalancerAttributes` for idle timeout |
| **HTTPRoute — Retry** | Extended | ❌ Not supported | — |
| **HTTPRoute — SessionPersistence** | Extended | ❌ Not supported | Use `ListenerRuleConfiguration` CRD |
| **HTTPRoute — ExternalAuth** | Experimental | ❌ Not supported | Use `ListenerRuleConfiguration` CRD |
| **BackendTLSPolicy** | GA (v1.4) | ❌ Not supported | Use target group attributes for backend encryption |
| **`UseDefaultGateways`** | Experimental | ❌ Not supported | — |
| **`AllowedListeners`** | GA (v1.5) | ❌ Not supported | — |

**Key takeaway:** The AWS LBC supports the core routing model well — Gateway + HTTPRoute + path-based routing. But when it comes to advanced filters, TLS configuration, and policies, it relies on its own custom CRDs (`LoadBalancerConfiguration`, `ListenerRuleConfiguration`, `TargetGroupConfiguration`) rather than the standard Gateway API fields. This means Gateway API configurations are **not fully portable** between the AWS LBC and other controllers (Istio, Envoy Gateway, etc.) when advanced features are in use.

> **ReplacePrefixMatch caveat:** When using `RequestRedirect` with `ReplacePrefixMatch` on the AWS LBC, you must also modify `scheme`, `port`, or `hostname` — otherwise the ALB rejects the rule with a redirect loop error. For path-only redirects, use `ReplaceFullPath` instead. If a rule fails, the controller stops processing all subsequent rules in the same HTTPRoute.

---

## 5. Multi-Team Routing in Practice

This section walks through a complete multi-team setup on EKS. The scenario: a platform team manages a shared ALB, and two application teams — Payments and Orders — independently manage their own routes.

### Step 1: Platform Team Creates the GatewayClass

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: aws-alb
  labels:
    app.kubernetes.io/name: aws-lb-controller
    app.kubernetes.io/instance: aws-alb-gatewayclass
    app.kubernetes.io/component: traffic-controller
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  controllerName: gateway.k8s.aws/alb
```

Only cluster admins create this. Application teams never need to know which controller is in use.

### Step 2: Platform Team Creates the Gateway + LoadBalancerConfiguration

**Gateway:**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: shared-gateway
  namespace: gateway-system
  labels:
    app.kubernetes.io/name: platform-gateway
    app.kubernetes.io/instance: shared-gateway-prod
    app.kubernetes.io/component: traffic-gateway
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  gatewayClassName: aws-alb
  infrastructure:
    parametersRef:
      kind: LoadBalancerConfiguration
      name: shared-gateway-lbconfig
      group: gateway.k8s.aws
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            gateway-access: "true"
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            gateway-access: "true"
```

**LoadBalancerConfiguration (TLS + ALB settings):**

```yaml
apiVersion: gateway.k8s.aws/v1beta1
kind: LoadBalancerConfiguration
metadata:
  name: shared-gateway-lbconfig
  namespace: gateway-system
  labels:
    app.kubernetes.io/name: platform-gateway
    app.kubernetes.io/instance: shared-gateway-lbconfig
    app.kubernetes.io/component: lb-configuration
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  scheme: internet-facing
  listenerConfigurations:
  - protocolPort: HTTPS:443
    defaultCertificate: arn:aws:acm:ap-southeast-1:123456789012:certificate/uuid
  loadBalancerAttributes:
  - key: idle_timeout.timeout_seconds
    value: "60"
  - key: deletion_protection.enabled
    value: "true"
```

This provisions an internet-facing ALB with an HTTPS listener using an ACM certificate. The Gateway and `LoadBalancerConfiguration` are both owned by the platform team — application teams never touch the certificate ARN or ALB attributes. Only namespaces labeled `gateway-access: "true"` can attach routes.

The platform team then grants access to the Payments and Orders namespaces:

```bash
kubectl label namespace payments gateway-access=true
kubectl label namespace orders gateway-access=true
```

### Step 3: Team A — Payments

**Namespace and Service:**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: payments
  labels:
    gateway-access: "true"
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/part-of: payments
    app.kubernetes.io/managed-by: kubectl
---
apiVersion: v1
kind: Service
metadata:
  name: payment-service
  namespace: payments
  labels:
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/instance: payment-service-v1
    app.kubernetes.io/version: "1.0.0"
    app.kubernetes.io/component: api
    app.kubernetes.io/part-of: payments
    app.kubernetes.io/managed-by: kubectl
spec:
  selector:
    app: payment
  ports:
  - port: 80
    targetPort: 8080
```

**HTTPRoute:**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payments-route
  namespace: payments
  labels:
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/instance: payments-route-v1
    app.kubernetes.io/component: api-routing
    app.kubernetes.io/part-of: payments
    app.kubernetes.io/managed-by: kubectl
spec:
  parentRefs:
  - name: shared-gateway
    namespace: gateway-system
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /payments
    backendRefs:
    - name: payment-service
      port: 80
```

The Payments team owns this entire HTTPRoute. They can add rules, modify path matching, or add header-based routing — all without coordinating with the platform team or the Orders team.

### Step 4: Team B — Orders

**Namespace and Service:**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: orders
  labels:
    gateway-access: "true"
    app.kubernetes.io/name: order-service
    app.kubernetes.io/part-of: orders
    app.kubernetes.io/managed-by: kubectl
---
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: orders
  labels:
    app.kubernetes.io/name: order-service
    app.kubernetes.io/instance: order-service-v1
    app.kubernetes.io/version: "2.1.0"
    app.kubernetes.io/component: api
    app.kubernetes.io/part-of: orders
    app.kubernetes.io/managed-by: kubectl
spec:
  selector:
    app: order
  ports:
  - port: 80
    targetPort: 8080
```

**HTTPRoute:**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: orders-route
  namespace: orders
  labels:
    app.kubernetes.io/name: order-service
    app.kubernetes.io/instance: orders-route-v1
    app.kubernetes.io/component: api-routing
    app.kubernetes.io/part-of: orders
    app.kubernetes.io/managed-by: kubectl
spec:
  parentRefs:
  - name: shared-gateway
    namespace: gateway-system
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /orders
    backendRefs:
    - name: order-service
      port: 80
```

### What Actually Happens in AWS

After both teams deploy their routes, the AWS Load Balancer Controller reconciles the following:

```
ALB (shared-gateway, internet-facing)
├── HTTPS Listener :443 (ACM cert from LoadBalancerConfiguration)
│   ├── Rule 1: path=/payments* → TargetGroup(payment-service)
│   └── Rule 2: path=/orders*   → TargetGroup(order-service)
└── HTTP Listener :80 (if configured)
    └── Redirect → HTTPS
```

Each rule was created independently. The Payments team deploying a new version of their route never touches the Orders team's rule. The platform team can rotate TLS certificates on the Gateway without either application team being involved.

### Adding Advanced Routing per Team

Each team can independently add more sophisticated routing. The Payments team might add header-based routing for a canary deployment:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payments-route
  namespace: payments
  labels:
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/instance: payments-route-v2
    app.kubernetes.io/version: "2.0.0"
    app.kubernetes.io/component: api-routing
    app.kubernetes.io/part-of: payments
    app.kubernetes.io/managed-by: kubectl
spec:
  parentRefs:
  - name: shared-gateway
    namespace: gateway-system
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /payments
      headers:
      - name: x-canary
        value: "true"
    backendRefs:
    - name: payment-service-canary
      port: 80
  - matches:
    - path:
        type: PathPrefix
        value: /payments
    backendRefs:
    - name: payment-service
      port: 80
```

The Orders team might add a redirect:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: orders-route
  namespace: orders
  labels:
    app.kubernetes.io/name: order-service
    app.kubernetes.io/instance: orders-route-v2
    app.kubernetes.io/version: "2.1.0"
    app.kubernetes.io/component: api-routing
    app.kubernetes.io/part-of: orders
    app.kubernetes.io/managed-by: kubectl
spec:
  parentRefs:
  - name: shared-gateway
    namespace: gateway-system
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /legacy-orders
    filters:
    - type: RequestRedirect
      requestRedirect:
        path:
          type: ReplacePrefixMatch
          replacePrefixMatch: /orders
        statusCode: 301
  - matches:
    - path:
        type: PathPrefix
        value: /orders
    backendRefs:
    - name: order-service
      port: 80
```

Neither team needs the other team's approval. Neither team needs the platform team's help. This is operational scalability.

---

## 6. Production Patterns

### Pattern 1: Shared External Gateway

**Best for:** Multi-team platforms where all external traffic enters through a single ALB.

```
                        ┌──────────────┐
                        │   Internet    │
                        └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │  Shared ALB   │  (platform-owned Gateway)
                        │  HTTPS :443   │
                        └──────┬───────┘
                               │
                  ┌────────────┼────────────┐
                  │            │            │
           ┌──────▼──────┐ ┌──▼───────┐ ┌──▼──────────┐
           │ /payments   │ │ /orders  │ │ /inventory  │
           │ (Team A)    │ │ (Team B) │ │ (Team C)    │
           └─────────────┘ └──────────┘ └─────────────┘
```

**Characteristics:**
- Single Gateway in a `gateway-system` namespace
- Platform team owns the Gateway, TLS, and WAF
- Application namespaces labeled `gateway-access: "true"` can attach HTTPRoutes
- Cost-efficient: one ALB shared across teams
- Requires discipline: the platform team must manage `allowedRoutes` carefully
- Teams can use ListenerSets (v1.5+) for independent hostname/cert management without modifying the shared Gateway

### Pattern 2: Dedicated Gateway per Environment

**Best for:** Environments that need strong isolation — dev, staging, and production should never share infrastructure.

```yaml
# Three separate Gateways in different namespaces
# gateway-system-dev/gateway-dev     → internet-facing ALB (dev)
# gateway-system-staging/gateway-stg → internet-facing ALB (staging)
# gateway-system-prod/gateway-prod   → internet-facing ALB (prod)
```

**Characteristics:**
- Each environment has its own Gateway, ALB, and TLS certificate
- An application team's HTTPRoute references the appropriate Gateway based on environment (typically set via Kustomize or Helm values)
- A misconfiguration in staging cannot affect production traffic
- Higher cost (three ALBs instead of one) but stronger blast-radius isolation
- Each environment can have different Gateway configurations — e.g., dev might allow HTTP, prod enforces HTTPS with stricter TLS policies

### Pattern 3: Internal + External Gateways

**Best for:** Platforms with both internet-facing APIs and internal service-to-service communication.

```
                        ┌──────────────┐
                        │   Internet    │
                        └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │ External ALB  │  (gateway-external)
                        │ Public HTTPS  │
                        └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │  API Services │  (public-facing routes)
                        └──────────────┘
                               │
                        ┌──────▼───────┐
                        │ Internal NLB  │  (gateway-internal)
                        │ Private IPs   │
                        └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │  Backend Svcs │  (internal-only routes)
                        └──────────────┘
```

**Characteristics:**
- External Gateway: internet-facing scheme, public subnets, AWS WAF attached
- Internal Gateway: internal scheme, private subnets, no public IPs
- API services (exposed publicly) attach routes to the external Gateway
- Backend services (internal only) attach routes to the internal Gateway
- Improves security posture: internal services are never reachable from the internet, even if misconfigured
- The same service can attach to both Gateways if needed — different routes for different consumers

### Pattern 4: Centralized TLS Management

**Best for:** Organizations with strict certificate policies — all TLS must use ACM certificates managed by the platform team.

The platform team defines TLS through a `LoadBalancerConfiguration` referenced by the Gateway. Application teams never see or touch certificates:

**Gateway (platform-owned):**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: shared-gateway
  namespace: gateway-system
  labels:
    app.kubernetes.io/name: platform-gateway
    app.kubernetes.io/instance: shared-gateway-prod
    app.kubernetes.io/component: traffic-gateway
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  gatewayClassName: aws-alb
  infrastructure:
    parametersRef:
      kind: LoadBalancerConfiguration
      name: shared-gateway-lbconfig
      group: gateway.k8s.aws
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    allowedRoutes:
      namespaces:
        from: All  # or Selector for tighter control
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All
```

**LoadBalancerConfiguration (platform-owned):**

```yaml
apiVersion: gateway.k8s.aws/v1beta1
kind: LoadBalancerConfiguration
metadata:
  name: shared-gateway-lbconfig
  namespace: gateway-system
  labels:
    app.kubernetes.io/name: platform-gateway
    app.kubernetes.io/instance: shared-gateway-lbconfig
    app.kubernetes.io/component: lb-configuration
    app.kubernetes.io/part-of: platform
    app.kubernetes.io/managed-by: kubectl
spec:
  scheme: internet-facing
  listenerConfigurations:
  - protocolPort: HTTPS:443
    defaultCertificate: arn:aws:acm:ap-southeast-1:123456789012:certificate/wildcard-uuid  # *.example.com
    listenerAttributes:
    - key: routing.http.drop_invalid_header_fields.enabled
      value: "true"
  loadBalancerAttributes:
  - key: deletion_protection.enabled
    value: "true"
  - key: access_logs.s3.enabled
    value: "true"
  - key: access_logs.s3.bucket
    value: "my-alb-logs-bucket"
```

Application teams then define routes that attach to the HTTPS listener. They never touch certificates:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-route
  namespace: app-team
  labels:
    app.kubernetes.io/name: app-service
    app.kubernetes.io/instance: app-route-v1
    app.kubernetes.io/version: "1.0.0"
    app.kubernetes.io/component: api-routing
    app.kubernetes.io/part-of: app-service
    app.kubernetes.io/managed-by: kubectl
spec:
  parentRefs:
  - name: shared-gateway
    namespace: gateway-system
    sectionName: https  # explicitly attach to the HTTPS listener
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /app
    backendRefs:
    - name: app-service
      port: 80
```

The `sectionName` field allows routes to target a specific listener on the Gateway. This means:
- Routes attached to `sectionName: https` get TLS termination automatically (certificate from `LoadBalancerConfiguration`)
- The platform team can enforce HTTPS-only by not creating an HTTP listener at all
- Certificate rotation happens in the `LoadBalancerConfiguration` — zero application team involvement
- Teams needing their own hostnames/certificates can use ListenerSets (experimental in LBC) without touching the shared Gateway
- All ALB-level attributes (idle timeout, deletion protection, access logs, WAF) are centralized in one `LoadBalancerConfiguration` resource

---

## 7. What Gateway API Doesn't Solve

Gateway API is a better API model — it is not a magic platform. Being explicit about what it does **not** solve prevents unrealistic expectations.

### Bad Networking Design

Gateway API provisions ALBs and configures listeners and rules. It does not design your VPC, choose your subnet strategy, or configure your security groups correctly. If your subnets don't have enough IP space, or your route tables are misconfigured, or your security groups block traffic between the ALB and your pods — Gateway API cannot fix that. The underlying network must be correct first.

### Poor Security Practices

Gateway API gives you the tools for separation of duties — but it does not enforce that you use them. If you grant every namespace `gateway-access: "true"` and allow all teams to create Gateways, you have replicated the Ingress ownership problem with a different API. Good RBAC, namespace labeling discipline, and `allowedRoutes` configuration are still human decisions.

### Application Latency

An ALB adds a hop. Whether you configure it through Ingress annotations or Gateway resources, the network path is the same: client → ALB → pod. Gateway API does not make traffic faster. If your application has latency problems, look at your code, your database queries, and your pod resource limits — not your traffic API.

### DNS Complexity

Gateway API provisions load balancers and gives you a DNS name (the ALB's auto-generated hostname). It does not create Route 53 records, configure DNS failover, or manage weighted routing. Those remain separate concerns handled by ExternalDNS, Terraform, or manual Route 53 configuration.

### What It Actually Solves

| It Solves | It Doesn't Solve |
|-----------|-----------------|
| Ownership separation between platform and app teams | VPC and subnet design |
| Standardized, portable routing API | DNS record management |
| Multi-tenant route management on shared infrastructure | Application performance and latency |
| Declarative TLS configuration with typed fields | Security group and NACL configuration |
| Controller-agnostic spec (works across ingress controllers) | Gradual migration from Ingress (you still need to rewrite) |
| Delegated listener management via ListenerSet (v1.5) | Automated certificate provisioning (still needs ACM + Secrets) |

---

## 8. Migration Strategy

### When Traditional Ingress Is Still Fine

Not every cluster needs Gateway API. Traditional Ingress remains appropriate for:

- **Single-team clusters.** If one team owns both the infrastructure and the application, the separation that Gateway API provides adds complexity without benefit.
- **Simple routing.** If all you need is `host/path → service`, Ingress is simpler and well-understood.
- **Existing investment.** If you have tooling, GitOps pipelines, and runbooks built around Ingress, the migration cost may outweigh the architectural benefits.
- **Small scale.** A cluster with 5–10 services and one or two teams does not need the multi-tenancy model Gateway API provides.

### When Gateway API Becomes Compelling

| Signal | Why Gateway API Helps |
|--------|----------------------|
| Multiple teams sharing an ALB | `allowedRoutes` provides first-class multi-tenancy |
| Platform team wants to own TLS, app teams want routing autonomy | Gateway (platform) + HTTPRoute (app) separation |
| Need standard, portable routing across controllers | Core spec is controller-agnostic |
| Growing annotation sprawl on Ingress resources | Typed fields replace opaque annotations |
| Compliance requires clear ownership of infrastructure | Gateway as a distinct resource creates an audit boundary |
| Need delegated listener management per team | ListenerSet (v1.5) decouples listener config from Gateway |

### Organizational Changes

Adopting Gateway API requires more than installing CRDs. The most important change is **rethinking ownership**:

1. **Define who owns Gateways.** This is typically the platform team. Update RBAC so only platform engineers can create Gateway resources.
2. **Define who owns HTTPRoutes and ListenerSets.** These are typically application teams. They should have RBAC to create these in their namespaces but not Gateways.
3. **Establish a namespace labeling convention.** Decide how namespaces get `gateway-access: "true"` — manually by the platform team, or automatically via a policy controller.
4. **Decide on Gateway placement.** A dedicated `gateway-system` namespace for shared Gateways keeps infrastructure resources separate from application resources.
5. **Adopt standard Kubernetes labels.** Apply `app.kubernetes.io/*` labels consistently across all resources — this enables tooling interoperability and simplifies queries across Gateway, Route, and Service objects.

### Coexistence During Migration

Gateway API and Ingress can coexist on the same cluster. The AWS Load Balancer Controller handles both. This allows incremental migration:

1. Deploy Gateway API CRDs alongside existing Ingress resources.
2. Create a Gateway and start routing a low-risk path through it.
3. Validate traffic, monitoring, and alerts.
4. Gradually migrate paths from Ingress to HTTPRoute.
5. Remove the old Ingress resource once all paths are migrated.

During coexistence, Ingress rules and Gateway routes can even reference the same backend Services — they produce different ALB listener rules on different ALBs (or the same ALB if you use Ingress group annotations). There is no conflict at the Service or pod level.

---

## References

- [Kubernetes Gateway API Specification](https://gateway-api.sigs.k8s.io/)
- [Gateway API v1.5 Release Blog — Moving Features to Stable](https://kubernetes.io/blog/2026/04/21/gateway-api-v1-5/)
- [Gateway API v1.5.1 Release](https://github.com/kubernetes-sigs/gateway-api/releases/tag/v1.5.1)
- [AWS Load Balancer Controller — L7 Gateway API Guide](https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/guide/gateway/l7gateway/)
- [AWS Load Balancer Controller — Gateway Customization](https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/guide/gateway/customization/)
- [AWS Load Balancer Controller — Subnet Discovery](https://kubernetes-sigs.github.io/aws-load-balancer-controller/latest/deploy/subnet_discovery/)
- [EKS Best Practices — Networking](https://aws.github.io/aws-eks-best-practices/networking/)
- [Kubernetes Recommended Labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)
