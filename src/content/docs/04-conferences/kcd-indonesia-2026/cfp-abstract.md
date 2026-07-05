# CFP Abstract — KCD Indonesia 2026

> Max 900 characters for Sessionize

---

## Abstract (Best Practice)

```
Alfagift serves millions of active users with real-time GPS live tracking and in-app chat. Every second, WebSocket connections must be correctly routed to EMQX MQTT brokers.

This talk explains how we use Kubernetes Gateway API with a dual-gateway architecture — an external gateway (gke-l7-global-external-managed) for mobile apps via WSS, and an internal gateway (gke-l7-rilb) for cross-VPC MQTT communication. Inside the cluster, native Kubernetes service discovery handles pod-to-pod routing.

We run two isolated EMQX clusters (3-replica StatefulSets) — one for live tracking with JWT auth and open ACL on location/# topics, another for chat with webhook integration and HTTP-based authorization. GKE-native CRDs (GCPBackendPolicy, HealthCheckPolicy) provide 120-second timeouts for long-lived WebSocket connections and health monitoring.

Key takeaways: role separation between platform and app teams, WebSocket routing without special config, canary deployment via native weight splitting, and when to use Gateway API vs service discovery.
```

**Characters:** 897 / 900

---

## Abstract (Short — 500 chars alternative)

```
How does Alfagift power real-time live tracking and chat for millions of users on Kubernetes? We use Gateway API with a dual-gateway pattern — external (WSS for mobile) and internal (MQTT for cross-VPC). Inside the cluster, service discovery handles pod-to-pod routing.

Two isolated EMQX clusters, JWT auth, webhook-based chat integration, 120s WebSocket timeouts via GCPBackendPolicy. This talk covers the architecture, the trade-offs, and practical lessons from production GKE.
```

**Characters:** 498 / 900
