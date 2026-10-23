# Sessionize Submission — KCD Indonesia 2026

> **Event:** Kubernetes Community Days Indonesia 2026
> **Date:** October 24, 2026 — Bandung, Indonesia
> **Track:** Service Mesh & Networking
> **Format:** Lightning Talk (10 min)
> **Status:** Accepted — preparation draft

All fields below are copy-paste ready. No company name or production identifier is included.

---

## Title

**Architecting a Real-Time Chat Platform on GKE Using Kubernetes Gateway API and EMQX**

**Subtitle:** Scaling WebSocket chat with dual gateways, EMQX MQTT, and webhook authorization.

---

## Abstract (max 900 characters)

### Best Practice — 856 / 900

```
Real-time chat is simple until every message must reach the right user over a long-lived connection. This talk shows how we run in-app chat on GKE using Kubernetes Gateway API with a dual-gateway architecture — an external gateway for mobile WSS and an internal gateway for cross-VPC MQTT. Inside the cluster, native service discovery handles pod-to-pod routing.

We run a 3-replica EMQX cluster for chat: webhook-authenticated connections, strict topic ACLs, and HTTP-based channel authorization through an external chat service. GKE-native CRDs (GCPBackendPolicy, HealthCheckPolicy) provide 120-second timeouts for WebSockets and health checks.

Key takeaways: role separation between platform and app teams, explicit timeouts for long-lived connections, canary deployment via native weight splitting, and when to use Gateway API versus service discovery.
```

### Short — 463 / 900

```
How do you run real-time chat for millions of users on Kubernetes? We use Gateway API with a dual-gateway pattern — external (WSS for mobile) and internal (MQTT for cross-VPC). Inside the cluster, service discovery handles pod-to-pod routing.

A 3-replica EMQX cluster, webhook auth, strict ACLs, per-channel authorization, and 120s WebSocket timeouts via GCPBackendPolicy. This talk covers the architecture, trade-offs, and practical lessons from production GKE.
```

---

## Description

```
This session presents a production-proven approach to real-time in-app chat on Google Kubernetes Engine using Kubernetes Gateway API, EMQX MQTT, and GKE-native load balancing. We built a dual-gateway architecture that routes public WebSocket traffic through an external gateway and cross-VPC MQTT through an internal gateway, while native service discovery handles pod-to-pod traffic. A 3-replica EMQX cluster provides webhook authentication, strict topic ACLs, and per-channel authorization, keeping chat delivery reliable at national scale.

We'll cover the full stack: Gateway API resources, GKE backend and health-check policies for 120-second WebSocket timeouts, EMQX clustering with headless services and DNS SRV, and webhook integration with the chat service. The session includes production lessons on long-lived connection timeouts, reconnect behavior, canary rollouts, and monitoring connection health and webhook latency — the patterns we use to keep chat stable during change.
```

**Characters:** 987

---

## Speaker Bio

### Full

```
A highly driven Information Technology graduate from Universitas Jenderal Achmad Yani Yogyakarta, specializing in Cloud DevOps Engineering. Experienced in architecting and managing cloud infrastructure, containerized environments, and CI/CD pipelines with a strong focus on reliability, scalability, and performance optimization.

Proficient in leveraging leading technologies including Google Cloud Platform (GCP), Kubernetes, Terraform, and Grafana Stack to deliver resilient and observable systems. Skilled in Cloud Computing, Containerization, Orchestration, Infrastructure as Code (IaC), and Monitoring & Observability.

Currently working as a Cloud DevOps Engineer at a leading consumer platform in Indonesia, where I design and operate production GKE clusters serving millions of active users. My work includes building real-time networking infrastructure with Kubernetes Gateway API — a dual-gateway architecture powering in-app chat via EMQX MQTT brokers and WebSocket connections.

Demonstrated success in implementing DevOps best practices, automating workflows, and enabling intelligent monitoring systems to ensure operational excellence across production and non-production environments. Recognized for analytical problem-solving, cross-functional collaboration, and a commitment to continuous learning.

Passionate about innovation and automation, with a goal to design modern, efficient, and secure cloud-native solutions that drive business value and operational efficiency.
```

### Short

```
Cloud DevOps Engineer at a leading consumer platform in Indonesia with a strong background in GCP, Kubernetes, and Infrastructure as Code. Focused on building reliable, scalable cloud-native systems. Currently operating production GKE clusters serving millions of users, with hands-on experience in Kubernetes Gateway API, EMQX MQTT brokers, and real-time chat.
```

### Tagline

```
Cloud DevOps Engineer — Kubernetes, Gateway API, GKE
```

### Technical Focus

```
Cloud DevOps Engineer at a leading consumer platform in Indonesia with hands-on experience operating production GKE clusters in asia-southeast1 serving millions of active users. Specializes in Kubernetes networking, real-time systems, and infrastructure automation.

Recent work includes designing and operating a dual-gateway Kubernetes Gateway API architecture for the platform's in-app chat system — routing WebSocket and MQTT traffic via GKE-native Gateway classes (gke-l7-global-external-managed, gke-l7-rilb), with EMQX MQTT broker clusters handling millions of concurrent connections.

Technologies: GCP, GKE, Kubernetes, Gateway API, Terraform, Helm, EMQX, Prometheus, Grafana, CI/CD pipelines.
```

---

## Notes

- The talk focus is **live chat only**; tracking content has been removed.
- The company is described generically as "a national-scale consumer platform" / "a leading consumer platform in Indonesia".
- The **Technical Focus** bio is intended for CFP reviewers, not the public speaker profile.
