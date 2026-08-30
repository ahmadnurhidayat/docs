# CFP Description — KCD Indonesia 2026

> Sessionize Description field — broader than Abstract

---

## Description (Best Practice)

```
Live tracking and chat are critical features for any delivery and loyalty platform. When millions of users depend on real-time GPS updates and instant messaging, the networking layer must be rock solid.

In this talk, I'll share how Alfagift — one of Indonesia's retail and loyalty platforms — uses Kubernetes Gateway API to power live tracking and chat for millions of active users on production GKE.

We run a dual-gateway architecture:
- External Gateway (gke-l7-global-external-managed) serves mobile apps via WSS with TLS termination
- Internal Gateway (gke-l7-rilb) handles cross-VPC and on-premise MQTT communication
- Inside the cluster, native Kubernetes service discovery (ClusterIP + Headless) routes pod-to-pod traffic

The infrastructure runs two isolated EMQX MQTT broker clusters (3-replica StatefulSets each):
- Live Tracking: JWT authentication, open ACL for location/# and tracking/# topics
- Chat System: Webhook integration to external chat engine, HTTP-based authorization, strict ACL

GKE-native CRDs (GCPBackendPolicy, HealthCheckPolicy, GCPGatewayPolicy) provide fine-grained control — 120-second timeouts for long-lived WebSocket connections, HTTP health checks, and backend security policies.

What you'll learn:
- How Gateway API separates concerns between platform and app teams
- WebSocket routing without special controller configuration
- When to use Gateway API vs native service discovery
- Canary deployment via weight-based and header-based routing
- Real production challenges and how we solved them
```

**Characters:** ~1,750

---

## Description (Short — 800 chars alternative)

```
Alfagift powers real-time live tracking and chat for millions of users on Kubernetes. We use Gateway API with a dual-gateway architecture — external (WSS for mobile) and internal (MQTT for cross-VPC). Inside the cluster, service discovery handles pod-to-pod routing.

Two isolated EMQX clusters, JWT auth, webhook-based chat integration, GKE-native CRDs for 120s WebSocket timeouts. This talk covers the architecture, trade-offs, and practical production lessons from running real-time systems on GKE.
```

**Characters:** ~500
