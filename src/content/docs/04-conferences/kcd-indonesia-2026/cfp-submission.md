# CFP Submission — KCD Indonesia 2026

> **Event:** Kubernetes Community Days Indonesia 2026
> **Date:** October 24, 2026 — Bandung, Indonesia
> **Track:** Service Mesh & Networking
> **Format:** Lightning Talk (10 min)
> **CFP Deadline:** July 15, 2026

---

## Title

**Real-Time Networking di Kubernetes: Live Tracking & Chat dengan Gateway API**

## Subtitle

Bagaimana Alfagift menggunakan Kubernetes Gateway API untuk menjalankan live tracking dan chat bagi jutaan user — arsitektur dual-gateway, EMQX WebSocket clustering, dan integrasi webhook production.

---

## Speaker Information

| Field | Value |
|---|---|
| **Name** | Ahmad Nurhidayat |
| **Role** | Platform / Infrastructure Engineer at Alfagift (GLI) |
| **Bio** | Infrastructure engineer focused on Kubernetes, networking, and real-time systems. Building and operating production clusters on GKE serving millions of users for Alfagift. |
| **Twitter / LinkedIn** | [Your handles] |
| **Location** | [Your city — mention if outside Jakarta for travel support] |

---

## Talk Summary (2-3 sentences)

Alfagift melayani jutaan user aktif dengan live tracking GPS dan chat real-time. Setiap detik ada WebSocket connections yang harus di-route dengan benar ke EMQX MQTT broker. Talk ini menjelaskan bagaimana kami menggunakan Kubernetes Gateway API — dengan dual-gateway pattern (external + internal) — untuk menjalankan infrastruktur real-time ini di production GKE, termasuk tantangan WebSocket long-lived connections, canary deployment, dan integrasi webhook untuk chat system.

---

## Abstract (Full Description)

### Problem

Alfagift membutuhkan infrastruktur networking yang handal untuk dua use case real-time kritis:

1. **Live Tracking** — Setiap driver kurir mengirim GPS coordinates setiap beberapa detik via MQTT over WebSocket. Jika WebSocket connection mati atau gateway salah config, live tracking hilang untuk semua user.

2. **Chat System** — User bisa chat dengan kurir langsung dari aplikasi. Chat system ini terintegrasi dengan EMQX via webhook ke external chat engine, dengan HTTP-based authorization.

Sebelum menggunakan Gateway API, kami menghadapi beberapa tantangan dengan Ingress:
- Ingress-nginx sudah retired (Maret 2026) — tidak ada security patches
- WebSocket long-lived connections membutuhkan timeout tuning yang sulit di Ingress
- Tidak ada native support untuk canary deployment berdasarkan weight atau header
- Sulit memisahkan concerns antara platform team (gateway config) dan app team (routing rules)

### Solution

Kami mengadopsi Kubernetes Gateway API di GKE dengan arsitektur **dual-gateway**:

**External Gateway** (`gke-l7-global-external-managed`):
- Melayani traffic publik ke `*.alfagift.id`
- TLS termination di load balancer
- HTTPRoutes mem-routing berdasarkan hostname ke service yang tepat

**Internal Gateway** (`gke-l7-rilb`):
- Melayani traffic internal ke `*.alfagift.internal`
- Regional Internal Load Balancer
- Untuk service-to-service communication dan monitoring dashboard

**EMQX MQTT Broker** (3-replica StatefulSet):
- Live Tracking: JWT authentication, ACL rules untuk `location/#` dan `tracking/#` topics
- Chat System: Webhook integration ke external chat engine, HTTP-based authorization
- WebSocket exposed via Gateway API di port 8083

**GKE-Native CRDs**:
- `GCPBackendPolicy` — timeout 120 detik untuk WebSocket connections
- `HealthCheckPolicy` — HTTP health check ke `/api/v5/status`
- `GCPGatewayPolicy` — menghubungkan backend policy ke service

### Key Takeaways

1. Gateway API bukan hanya pengganti Ingress — ini adalah role-oriented API yang memisahkan concerns antara platform team dan app team
2. WebSocket routing bisa dilakukan tanpa special controller configuration
3. Canary deployment (weight-based dan header-based) adalah native feature, bukan annotation hack
4. Dual-gateway pattern (external + internal) memberikan fleksibilitas untuk hybrid traffic patterns
5. GKE-native CRDs memberikan kontrol lebih baik dibandingkan generic annotations

---

## Technical Details

### Architecture

```
User App (Mobile)
    │
    │ WebSocket (WSS)
    │
    ▼
┌─────────────────────────────────┐
│  GKE L7 Global External LB      │
│  (Gateway API: external-gw)     │
│  *.alfagift.id                  │
└──────────────┬──────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌──────────┐      ┌──────────┐
│ Live     │      │ App Chat │
│ Tracking │      │ EMQX     │
│ EMQX     │      │          │
│ wss-     │      │ wss-app- │
│ realtime │      │ chat     │
└────┬─────┘      └────┬─────┘
     │                  │
     │ MQTT topics:     │ Webhook:
     │ location/#       │ chat-engine-svc
     │ tracking/#       │ HTTP auth
     ▼                  ▼
┌─────────────────────────────────┐
│  Backend Services               │
│  (order, driver, notification)  │
└─────────────────────────────────┘
```

### EMQX Configuration Highlights

| Setting | Live Tracking | Chat System |
|---|---|---|
| Auth | JWT (hmac-based) | HTTP webhook |
| ACL | Open publish on `location/#`, `tracking/#` | Strict deny-all, admin-only publish |
| WebSocket | Port 8083, path `/mqtt` | Port 8083, path `/mqtt` |
| Session TTL | 24 hours | 24 hours |
| Connection limit | 2M | 2M |
| GCPBackendPolicy timeout | 120s | 120s |

### Gateway API Resources Used

| Resource | Purpose |
|---|---|
| `GatewayClass` | `gke-l7-global-external-managed` (external), `gke-l7-rilb` (internal) |
| `Gateway` | Wildcard `*.alfagift.id`, TLS termination, listeners |
| `HTTPRoute` | Per-service hostname routing, path matching |
| `GCPBackendPolicy` | Timeout, security policy, rate limiting |
| `HealthCheckPolicy` | HTTP health checks for EMQX |
| `GCPGatewayPolicy` | Links backend + health check policies |

---

## Why This Talk Fits KCD Indonesia

| Criteria | Match |
|---|---|
| **Service Mesh & Networking** | Gateway API is a core networking topic |
| **Production experience** | Real production system serving millions of users |
| **Not a tutorial** | Architecture decisions, trade-offs, real challenges |
| **Indonesian context** | Alfagift is a major Indonesian fintech/loyalty platform |
| **Actionable** | Audience can apply the dual-gateway pattern to their own systems |
| **Beginner-friendly** | Lightning talk format, focused on concepts not deep code |

---

## Additional Notes for Reviewers

- This is a **production system** running on GKE in `asia-southeast1`
- The talk focuses on **networking patterns**, not EMQX internals
- No vendor-specific content — Gateway API is CNCF standard, works on any Kubernetes
- The dual-gateway pattern (external + internal) is applicable to any organization with similar requirements
- I have hands-on experience operating this system, not just reading documentation

---

## References

- [Kubernetes Gateway API](https://gateway-api.sigs.k8s.io/)
- [GKE Gateway API](https://cloud.google.com/kubernetes-engine/docs/how-to/gateway-api)
- [EMQX Documentation](https://www.emqx.io/docs/en/latest/)
- [Alfagift](https://alfagift.id)

---

**Submitted:** July 2026
**Status:** Draft — pending review
