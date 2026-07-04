# GKE Cluster Creation Best Practices

A production-grade guide for creating Google Kubernetes Engine clusters with security hardening, networking, node pools, and environment-specific configurations.

## Table of Contents

| Section | Topic | Description |
| :---: | :--- | :--- |
| **01** | [Prerequisites](#1-prerequisites) | Environment variables, APIs, and service accounts. |
| **02** | [Production Cluster Creation](#2-production-cluster-creation) | Full cluster command with best-practice flags. |
| **03** | [Flag Reference](#3-flag-reference) | Detailed explanation of each creation flag. |
| **04** | [Node Pool Strategies](#4-node-pool-strategies) | General, high-memory, spot, and GPU pools. |
| **05** | [Security Hardening](#5-security-hardening) | KMS, Binary Authorization, Workload Identity. |
| **06** | [Networking](#6-networking) | VPC-native, Cloud NAT, firewall rules. |
| **07** | [Environment Configs](#7-environment-configs) | Dev, staging, and production templates. |
| **08** | [Post-Creation Setup](#8-post-creation-setup) | Network Policies, Pod Security, Ingress, Quotas. |
| **09** | [Validation](#9-validation) | Commands to verify cluster health. |
| **10** | [Quick Reference](#10-quick-reference) | Checklist and common mistakes. |

---

## 1. Prerequisites

### 1.1 Set Environment Variables

```bash
# Project Configuration
export PROJECT_ID="your-project-id"
export REGION="asia-southeast1"
export ZONE="asia-southeast1-a"
export CLUSTER_NAME="your-cluster-name"

# Network Configuration
export NETWORK="your-vpc-network"
export SUBNETWORK="your-subnet"
export POD_RANGE="pods-range"
export SERVICE_RANGE="services-range"

# Service Account
export NODE_SA="gke-nodes-sa"

# Verify
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Cluster: $CLUSTER_NAME"
```

### 1.2 Enable Required APIs

```bash
gcloud services enable \
    container.googleapis.com \
    compute.googleapis.com \
    iam.googleapis.com \
    iamcredentials.googleapis.com \
    cloudresourcemanager.googleapis.com \
    logging.googleapis.com \
    monitoring.googleapis.com \
    stackdriver.googleapis.com \
    secretmanager.googleapis.com \
    artifactregistry.googleapis.com \
    --project=$PROJECT_ID
```

### 1.3 Create Dedicated Service Account for Nodes

```bash
# Create service account
gcloud iam service-accounts create $NODE_SA \
    --display-name="GKE Node Service Account" \
    --project=$PROJECT_ID

# Grant minimum required roles
ROLES=(
    "roles/logging.logWriter"
    "roles/monitoring.metricWriter"
    "roles/monitoring.viewer"
    "roles/stackdriver.resourceMetadata.writer"
    "roles/artifactregistry.reader"
    "roles/storage.objectViewer"
)

for ROLE in "${ROLES[@]}"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$NODE_SA@$PROJECT_ID.iam.gserviceaccount.com" \
        --role="$ROLE"
done

echo "Service Account: $NODE_SA@$PROJECT_ID.iam.gserviceaccount.com"
```

---

## 2. Production Cluster Creation

### Full Command

```bash
gcloud container clusters create $CLUSTER_NAME \
    --project=$PROJECT_ID \
    --region=$REGION \
    \
    # ============================================
    # CLUSTER TYPE & VERSION
    # ============================================
    --cluster-version="latest" \
    --release-channel="regular" \
    \
    # ============================================
    # NETWORKING - VPC NATIVE (Required for best practices)
    # ============================================
    --network=$NETWORK \
    --subnetwork=$SUBNETWORK \
    --enable-ip-alias \
    --cluster-secondary-range-name=$POD_RANGE \
    --services-secondary-range-name=$SERVICE_RANGE \
    --enable-private-nodes \
    --enable-private-endpoint \
    --master-ipv4-cidr="172.16.0.0/28" \
    --enable-master-authorized-networks \
    --master-authorized-networks="10.0.0.0/8,172.16.0.0/12,192.168.0.0/16" \
    \
    # ============================================
    # SECURITY
    # ============================================
    --enable-shielded-nodes \
    --shielded-secure-boot \
    --shielded-integrity-monitoring \
    --workload-pool="$PROJECT_ID.svc.id.goog" \
    --service-account="$NODE_SA@$PROJECT_ID.iam.gserviceaccount.com" \
    --enable-network-policy \
    --enable-secrets-encryption \
    --database-encryption-key="projects/$PROJECT_ID/locations/$REGION/keyRings/gke-keyring/cryptoKeys/gke-key" \
    \
    # ============================================
    # NODE CONFIGURATION
    # ============================================
    --num-nodes=1 \
    --enable-autoscaling \
    --min-nodes=1 \
    --max-nodes=10 \
    --machine-type="e2-standard-4" \
    --disk-type="pd-ssd" \
    --disk-size="100" \
    --image-type="COS_CONTAINERD" \
    --enable-autorepair \
    --enable-autoupgrade \
    --max-surge-upgrade=1 \
    --max-unavailable-upgrade=0 \
    \
    # ============================================
    # OPERATIONS & MONITORING
    # ============================================
    --logging="SYSTEM,WORKLOAD" \
    --monitoring="SYSTEM,WORKLOAD" \
    --enable-managed-prometheus \
    \
    # ============================================
    # ADDONS
    # ============================================
    --addons="HttpLoadBalancing,HorizontalPodAutoscaling,NodeLocalDNS,GcePersistentDiskCsiDriver,GcpFilestoreCsiDriver" \
    \
    # ============================================
    # MAINTENANCE
    # ============================================
    --maintenance-window-start="2024-01-01T02:00:00Z" \
    --maintenance-window-end="2024-01-01T06:00:00Z" \
    --maintenance-window-recurrence="FREQ=WEEKLY;BYDAY=SA,SU" \
    \
    # ============================================
    # LABELS & METADATA
    # ============================================
    --labels="environment=production,team=platform,cost-center=engineering"
```

---

## 3. Flag Reference

### Cluster Type and Version

| Flag | Value | Reason |
|------|-------|--------|
| `--region` | asia-southeast1 | Regional cluster provides high availability across 3 zones |
| `--cluster-version` | latest | Use the latest stable version |
| `--release-channel` | regular | Balanced between stability and features |

```bash
# Release Channel Options:
# - rapid: Newest features, less stable
# - regular: Balanced (RECOMMENDED)
# - stable: Most stable, slower updates
# - None: Manual version management
```

### Networking Flags

| Flag | Purpose | Best Practice |
|------|---------|---------------|
| `--enable-ip-alias` | VPC-native cluster | Required for private clusters |
| `--enable-private-nodes` | No public IPs on nodes | Security best practice |
| `--enable-private-endpoint` | Private control plane | For high security environments |
| `--master-ipv4-cidr` | Control plane IP range | Use /28 CIDR |
| `--enable-master-authorized-networks` | Restrict API access | Limit who can access the API server |

### Security Flags

| Flag | Purpose | Best Practice |
|------|---------|---------------|
| `--enable-shielded-nodes` | Secure boot, integrity monitoring | Always enable |
| `--workload-pool` | Workload Identity | Critical - eliminates SA key management |
| `--service-account` | Dedicated node SA | Never use the default service account |
| `--enable-network-policy` | Pod network policies | Enables microsegmentation |
| `--enable-secrets-encryption` | Encrypt secrets at rest | Use a customer-managed key |

### Node Configuration Flags

| Flag | Purpose | Recommendation |
|------|---------|----------------|
| `--enable-autoscaling` | Auto scale nodes | Always enable for cost optimization |
| `--machine-type` | VM size | Right-size for workload |
| `--disk-type` | Boot disk type | pd-ssd for production |
| `--image-type` | Node OS | COS_CONTAINERD for security |
| `--enable-autorepair` | Fix unhealthy nodes | Always enable |
| `--enable-autoupgrade` | Auto update nodes | Enable for security patches |
| `--max-surge-upgrade` | Extra nodes during upgrade | 1 for zero-downtime rolling |
| `--max-unavailable-upgrade` | Nodes unavailable during upgrade | 0 for zero-downtime rolling |

---

## 4. Node Pool Strategies

### 4.1 General Purpose Node Pool

```bash
gcloud container node-pools create "general-pool" \
    --project=$PROJECT_ID \
    --cluster=$CLUSTER_NAME \
    --region=$REGION \
    \
    --machine-type="e2-standard-4" \
    --disk-type="pd-ssd" \
    --disk-size="100" \
    --image-type="COS_CONTAINERD" \
    \
    --enable-autoscaling \
    --min-nodes=1 \
    --max-nodes=20 \
    --num-nodes=2 \
    --location-policy="BALANCED" \
    \
    --service-account="$NODE_SA@$PROJECT_ID.iam.gserviceaccount.com" \
    --workload-metadata="GKE_METADATA" \
    --shielded-secure-boot \
    --shielded-integrity-monitoring \
    \
    --enable-autorepair \
    --enable-autoupgrade \
    --max-surge-upgrade=1 \
    --max-unavailable-upgrade=0 \
    \
    --max-pods-per-node=64 \
    \
    --node-labels="pool-type=general,environment=production" \
    --metadata="disable-legacy-endpoints=true"
```

### 4.2 High-Memory Node Pool (databases, caching)

```bash
gcloud container node-pools create "high-memory-pool" \
    --project=$PROJECT_ID \
    --cluster=$CLUSTER_NAME \
    --region=$REGION \
    \
    --machine-type="n2-highmem-8" \
    --disk-type="pd-ssd" \
    --disk-size="200" \
    --image-type="COS_CONTAINERD" \
    \
    --enable-autoscaling \
    --min-nodes=0 \
    --max-nodes=10 \
    --num-nodes=1 \
    \
    --service-account="$NODE_SA@$PROJECT_ID.iam.gserviceaccount.com" \
    --workload-metadata="GKE_METADATA" \
    --shielded-secure-boot \
    --shielded-integrity-monitoring \
    \
    --enable-autorepair \
    --enable-autoupgrade \
    \
    --node-labels="pool-type=high-memory,workload=database" \
    --node-taints="dedicated=database:NoSchedule"
```

### 4.3 Spot/Preemptible Node Pool (cost savings)

```bash
gcloud container node-pools create "spot-pool" \
    --project=$PROJECT_ID \
    --cluster=$CLUSTER_NAME \
    --region=$REGION \
    \
    --spot \
    \
    --machine-type="e2-standard-4" \
    --disk-type="pd-balanced" \
    --disk-size="50" \
    --image-type="COS_CONTAINERD" \
    \
    --enable-autoscaling \
    --min-nodes=0 \
    --max-nodes=50 \
    --num-nodes=0 \
    \
    --service-account="$NODE_SA@$PROJECT_ID.iam.gserviceaccount.com" \
    --workload-metadata="GKE_METADATA" \
    --shielded-secure-boot \
    --shielded-integrity-monitoring \
    \
    --enable-autorepair \
    --enable-autoupgrade \
    \
    --node-labels="pool-type=spot,preemptible=true" \
    --node-taints="spot=true:NoSchedule"
```

### 4.4 GPU Node Pool (ML/AI workloads)

```bash
gcloud container node-pools create "gpu-pool" \
    --project=$PROJECT_ID \
    --cluster=$CLUSTER_NAME \
    --region=$REGION \
    \
    --machine-type="n1-standard-8" \
    --accelerator="type=nvidia-tesla-t4,count=1" \
    --disk-type="pd-ssd" \
    --disk-size="200" \
    --image-type="COS_CONTAINERD" \
    \
    --enable-autoscaling \
    --min-nodes=0 \
    --max-nodes=5 \
    --num-nodes=0 \
    \
    --service-account="$NODE_SA@$PROJECT_ID.iam.gserviceaccount.com" \
    --workload-metadata="GKE_METADATA" \
    --shielded-secure-boot \
    --shielded-integrity-monitoring \
    \
    --enable-autorepair \
    --enable-autoupgrade \
    \
    --node-labels="pool-type=gpu,accelerator=nvidia-tesla-t4" \
    --node-taints="nvidia.com/gpu=present:NoSchedule"
```

### Node Pool Comparison

| Pool Type | Machine | Disk | Min/Max | Use Case | Cost |
|-----------|---------|------|---------|----------|------|
| General | e2-standard-4 | pd-ssd 100GB | 1-20 | Application workloads | Medium |
| High-Memory | n2-highmem-8 | pd-ssd 200GB | 0-10 | Databases, Redis, caching | High |
| Spot | e2-standard-4 | pd-balanced 50GB | 0-50 | Batch jobs, dev/test | Low (60-91% savings) |
| GPU | n1-standard-8 + T4 | pd-ssd 200GB | 0-5 | ML inference, training | High |

---

## 5. Security Hardening

### 5.1 Create KMS Key for Secrets Encryption

```bash
# Create Key Ring
gcloud kms keyrings create "gke-keyring" \
    --location=$REGION \
    --project=$PROJECT_ID

# Create Key
gcloud kms keys create "gke-key" \
    --keyring="gke-keyring" \
    --location=$REGION \
    --purpose="encryption" \
    --project=$PROJECT_ID

# Grant GKE access to the key
gcloud kms keys add-iam-policy-binding "gke-key" \
    --keyring="gke-keyring" \
    --location=$REGION \
    --member="serviceAccount:service-$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@container-engine-robot.iam.gserviceaccount.com" \
    --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
    --project=$PROJECT_ID
```

### 5.2 Binary Authorization (Optional - High Security)

```bash
# Enable Binary Authorization
gcloud container clusters update $CLUSTER_NAME \
    --region=$REGION \
    --enable-binauthz \
    --project=$PROJECT_ID
```

### 5.3 Enable Security Posture Dashboard

```bash
# Enable Security Posture
gcloud container clusters update $CLUSTER_NAME \
    --region=$REGION \
    --security-posture=standard \
    --workload-vulnerability-scanning=standard \
    --project=$PROJECT_ID
```

### 5.4 Workload Identity Binding

After cluster creation, bind Kubernetes service accounts to GCP service accounts:

```bash
# Annotate the Kubernetes SA
kubectl annotate serviceaccount my-app-sa \
    iam.gke.io/gcp-service-account=my-app@${PROJECT_ID}.iam.gserviceaccount.com

# Grant roles to the GCP SA
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:my-app@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.objectViewer"
```

---

## 6. Networking

### 6.1 Create VPC with Secondary Ranges

```bash
# Create VPC
gcloud compute networks create $NETWORK \
    --subnet-mode=custom \
    --project=$PROJECT_ID

# Create Subnet with Secondary Ranges
gcloud compute networks subnets create $SUBNETWORK \
    --network=$NETWORK \
    --region=$REGION \
    --range="10.0.0.0/20" \
    --secondary-range="$POD_RANGE=10.4.0.0/14,$SERVICE_RANGE=10.8.0.0/20" \
    --enable-private-ip-google-access \
    --project=$PROJECT_ID
```

### 6.2 Create Cloud NAT

```bash
# Create Cloud Router
gcloud compute routers create "gke-router" \
    --network=$NETWORK \
    --region=$REGION \
    --project=$PROJECT_ID

# Create NAT Gateway
gcloud compute routers nats create "gke-nat" \
    --router="gke-router" \
    --region=$REGION \
    --nat-all-subnet-ip-ranges \
    --auto-allocate-nat-external-ips \
    --project=$PROJECT_ID
```

### 6.3 Firewall Rules

```bash
# Allow internal communication
gcloud compute firewall-rules create "gke-allow-internal" \
    --network=$NETWORK \
    --allow="tcp,udp,icmp" \
    --source-ranges="10.0.0.0/8" \
    --project=$PROJECT_ID

# Allow health checks
gcloud compute firewall-rules create "gke-allow-health-checks" \
    --network=$NETWORK \
    --allow="tcp" \
    --source-ranges="35.191.0.0/16,130.211.0.0/22" \
    --project=$PROJECT_ID
```

### Network CIDR Planning

| Range | CIDR | Purpose | Capacity |
|-------|------|---------|----------|
| Primary subnet | 10.0.0.0/20 | Node IPs | 4,094 nodes |
| Pods secondary | 10.4.0.0/14 | Pod IPs | 262,142 pods |
| Services secondary | 10.8.0.0/20 | Service ClusterIPs | 4,094 services |
| Master CIDR | 172.16.0.0/28 | Control plane | 14 IPs |

---

## 7. Environment Configs

### 7.1 Development Cluster (Cost-Optimized)

```bash
gcloud container clusters create "dev-cluster" \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    \
    --release-channel="rapid" \
    \
    --network=$NETWORK \
    --subnetwork=$SUBNETWORK \
    --enable-ip-alias \
    --enable-private-nodes \
    --master-ipv4-cidr="172.16.0.0/28" \
    \
    --enable-shielded-nodes \
    --workload-pool="$PROJECT_ID.svc.id.goog" \
    --service-account="$NODE_SA@$PROJECT_ID.iam.gserviceaccount.com" \
    \
    --machine-type="e2-medium" \
    --disk-type="pd-standard" \
    --disk-size="50" \
    --num-nodes=1 \
    --enable-autoscaling \
    --min-nodes=0 \
    --max-nodes=5 \
    \
    --logging="SYSTEM" \
    --monitoring="SYSTEM" \
    \
    --labels="environment=development"
```

### 7.2 Staging Cluster (Production-Like)

```bash
gcloud container clusters create "staging-cluster" \
    --project=$PROJECT_ID \
    --region=$REGION \
    \
    --release-channel="regular" \
    \
    --network=$NETWORK \
    --subnetwork=$SUBNETWORK \
    --enable-ip-alias \
    --cluster-secondary-range-name=$POD_RANGE \
    --services-secondary-range-name=$SERVICE_RANGE \
    --enable-private-nodes \
    --master-ipv4-cidr="172.16.1.0/28" \
    --enable-master-authorized-networks \
    --master-authorized-networks="10.0.0.0/8" \
    \
    --enable-shielded-nodes \
    --shielded-secure-boot \
    --workload-pool="$PROJECT_ID.svc.id.goog" \
    --service-account="$NODE_SA@$PROJECT_ID.iam.gserviceaccount.com" \
    --enable-network-policy \
    \
    --machine-type="e2-standard-2" \
    --disk-type="pd-ssd" \
    --disk-size="50" \
    --num-nodes=1 \
    --enable-autoscaling \
    --min-nodes=1 \
    --max-nodes=10 \
    \
    --logging="SYSTEM,WORKLOAD" \
    --monitoring="SYSTEM,WORKLOAD" \
    \
    --labels="environment=staging"
```

### 7.3 Environment Comparison

| Setting | Development | Staging | Production |
|---------|------------|---------|------------|
| Cluster type | Zonal | Regional | Regional |
| Release channel | rapid | regular | regular |
| Machine type | e2-medium | e2-standard-2 | e2-standard-4 |
| Disk type | pd-standard | pd-ssd | pd-ssd |
| Min/Max nodes | 0-5 | 1-10 | 1-10 |
| Private endpoint | No | Yes | Yes |
| Network policy | No | Yes | Yes |
| Secrets encryption | No | No | Yes |
| Logging | SYSTEM | SYSTEM,WORKLOAD | SYSTEM,WORKLOAD |
| Managed Prometheus | No | No | Yes |

---

## 8. Post-Creation Setup

### 8.1 Default Deny Network Policy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: default
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

```bash
kubectl apply -f default-deny-all.yaml
```

### 8.2 Pod Security Standards

```bash
# Label namespaces for Pod Security Standards
kubectl label namespace default pod-security.kubernetes.io/enforce=baseline
kubectl label namespace default pod-security.kubernetes.io/warn=restricted
```

### 8.3 Install Ingress Controller

```bash
# Using Helm
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx \
    --create-namespace \
    --set controller.service.type=LoadBalancer \
    --set controller.nodeSelector."pool-type"=general
```

### 8.4 Resource Quotas

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: default-quota
  namespace: default
spec:
  hard:
    requests.cpu: "10"
    requests.memory: "20Gi"
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "50"
```

```bash
kubectl apply -f resource-quota.yaml
```

### 8.5 Limit Ranges

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: default
spec:
  limits:
  - default:
      cpu: "1"
      memory: "1Gi"
    defaultRequest:
      cpu: "100m"
      memory: "128Mi"
    type: Container
```

```bash
kubectl apply -f limit-range.yaml
```

---

## 9. Validation

### 9.1 Verify Cluster Configuration

```bash
# Cluster info
gcloud container clusters describe $CLUSTER_NAME \
    --region=$REGION \
    --project=$PROJECT_ID

# Check Workload Identity
gcloud container clusters describe $CLUSTER_NAME \
    --region=$REGION \
    --format="value(workloadIdentityConfig.workloadPool)" \
    --project=$PROJECT_ID

# Check private cluster config
gcloud container clusters describe $CLUSTER_NAME \
    --region=$REGION \
    --format="yaml(privateClusterConfig)" \
    --project=$PROJECT_ID

# List node pools
gcloud container node-pools list \
    --cluster=$CLUSTER_NAME \
    --region=$REGION \
    --project=$PROJECT_ID

# Check node pool details
gcloud container node-pools describe general \
    --cluster=$CLUSTER_NAME \
    --region=$REGION \
    --format="yaml(config.workloadMetadataConfig,config.shieldedInstanceConfig)" \
    --project=$PROJECT_ID
```

### 9.2 Verify Kubernetes Resources

```bash
# Get nodes
kubectl get nodes -o wide

# Check node labels
kubectl get nodes --show-labels

# Check node taints
kubectl describe nodes | grep -A3 "Taints:"

# Verify security
kubectl auth can-i --list

# Check namespaces
kubectl get namespaces

# Check storage classes
kubectl get storageclass
```

### 9.3 Verify Networking

```bash
# Check VPC peering
gcloud compute networks peerings list \
    --project=$PROJECT_ID

# Verify Cloud NAT
gcloud compute routers nats list \
    --router=gke-router \
    --region=$REGION \
    --project=$PROJECT_ID

# Check firewall rules
gcloud compute firewall-rules list \
    --project=$PROJECT_ID \
    --filter="network=$NETWORK"
```

---

## 10. Quick Reference

### Cluster Creation Checklist

```
[ ] Enable required APIs
[ ] Create dedicated service account
[ ] Create KMS key (for secrets encryption)
[ ] Create VPC and subnets (if not exists)
[ ] Create Cloud NAT (for private nodes)
[ ] Create cluster with best practice flags
[ ] Remove default node pool
[ ] Create purpose-specific node pools
[ ] Configure network policies
[ ] Install ingress controller
[ ] Set up monitoring/alerting
[ ] Configure backup (Velero)
```

### Essential Flags Summary

| Category | Must Have | Recommended |
|----------|-----------|-------------|
| **Version** | `--release-channel` | `regular` |
| **Network** | `--enable-ip-alias` | `--enable-private-nodes` |
| **Security** | `--workload-pool` | `--enable-shielded-nodes` |
| **Security** | `--service-account` (dedicated) | `--enable-network-policy` |
| **Nodes** | `--enable-autoscaling` | `--enable-autorepair` |
| **Ops** | `--logging` | `--monitoring` |

### Common Mistakes to Avoid

| Do Not | Do Instead |
|--------|-----------|
| Use default service account | Create dedicated SA with minimal permissions |
| Skip Workload Identity | Always enable `--workload-pool` |
| Use public nodes | Enable `--enable-private-nodes` |
| Skip network policies | Enable `--enable-network-policy` |
| Use single zone | Use regional cluster for production |
| Skip autoscaling | Enable `--enable-autoscaling` |
| Use pd-standard for production | Use `--disk-type=pd-ssd` |

---

## References

- [GKE Hardening Guide](https://cloud.google.com/kubernetes-engine/docs/how-to/hardening-your-cluster)
- [GKE Security Best Practices](https://cloud.google.com/kubernetes-engine/docs/how-to/security-overview)
- [Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Private Clusters](https://cloud.google.com/kubernetes-engine/docs/how-to/private-clusters)
