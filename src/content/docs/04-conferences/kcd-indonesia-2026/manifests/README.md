# Sample Manifests — Real-Time Chat on GKE with Gateway API

Illustrative, copy-and-adapt Kubernetes manifests that accompany the talk
*"Architecting a Real-Time Chat Platform on GKE Using Kubernetes Gateway API and EMQX."*

> These are **samples for the talk**, not production config. Names, hostnames
> (`example.com`), and images (`registry.example.com/...`) are placeholders.
> No real company or cluster details are included.

## Files

| # | File | What it defines |
|---|---|---|
| 01 | `01-gateway-external.yaml` | External Gateway (`gke-l7-global-external-managed`) + HTTP→HTTPS redirect — public WSS entry |
| 02 | `02-gateway-internal.yaml` | Internal Gateway (`gke-l7-rilb`) — cross-VPC MQTT + EMQX dashboard |
| 03 | `03-emqx-chat-service.yaml` | EMQX `ClusterIP` Service + headless Service (DNS SRV clustering) |
| 04 | `04-httproute-chat-wss.yaml` | WSS HTTPRoute + `GCPBackendPolicy` (120s timeout) + `HealthCheckPolicy` |
| 05 | `05-chat-service.yaml` | Chat Service `stable` + `canary` Deployments and Services |
| 06 | `06-httproute-chat-canary.yaml` | Canary HTTPRoute — header-based + weight-based split |

## Traffic path

```
Mobile App  --WSS:443-->  prod-external-gw  --/mqtt-->  emqx-chat:8083
On-prem/VPC --MQTT:1883--> prod-internal-gw --------->  emqx-chat:1883
EMQX webhook ---------------------------------------->  chat-service (stable/canary)
```

## Apply (against a GKE cluster with Gateway API enabled)

```bash
# Prereqs: namespaces + the Gateway API CRDs / GKE gateway controller
kubectl create namespace gateway-api   --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace infrastructure --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace backend        --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f .
```

## Canary rollout (file 06)

Change the weights in `06-httproute-chat-canary.yaml` and re-apply:

| Stage | stable | canary | Action |
|---|---|---|---|
| Baseline | 100 | 0 | All traffic on the old version |
| Canary 10% | 90 | 10 | Watch error rate + webhook p99 latency |
| Ramp 50% | 50 | 50 | Validate under real load |
| Promote | 0 | 100 | Canary becomes stable |

Internal testers can always reach the canary with the header `x-canary: true`
(no user traffic affected). Rollback = revert the weights — effectively instant,
no redeploy.

## Validate locally (no cluster needed)

```bash
# syntax only
kubectl apply --dry-run=client -f .

# or lint with yamllint
yamllint .
```
