# Edictum Console -- Kubernetes Deployment

Minimal K8s manifests for dev/demo. For production, use the upcoming Helm chart
(see [Roadmap](#roadmap) below).

## Prerequisites

- Kubernetes cluster (minikube, kind, or remote)
- `kubectl` configured for the target cluster

## Deploy

### 1. Build the Docker image

```bash
docker build -t edictum-console:latest .
```

If using a remote cluster, push to your registry and update the image
reference in `server.yaml`.

### 2. Configure secrets

Generate secrets and base64-encode them:

```bash
# Generate a 32-byte hex secret
python3 -c "import secrets; print(secrets.token_hex(32))"

# Base64-encode for the K8s secret
echo -n 'your-value-here' | base64
```

Edit `secret.yaml` and replace all `REPLACE_*` placeholders with the
base64-encoded values.

### 3. Apply

```bash
kubectl apply -k deploy/k8s/
```

### 4. Access

Port-forward for local access:

```bash
kubectl port-forward svc/edictum-console 8000:80 -n edictum
```

Then open http://localhost:8000/dashboard

For ingress, uncomment `ingress.yaml` in `kustomization.yaml`, edit the
host in `ingress.yaml`, and re-apply.

## Upgrades

Alembic migrations run automatically on pod startup via `docker-entrypoint.sh`.
To upgrade:

### Option A: New image tag

```bash
# Build and push the new version
docker build -t edictum-console:0.2.0 .

# Update via kustomize image override
cd deploy/k8s
kustomize edit set image edictum-console=edictum-console:0.2.0
kubectl apply -k .
```

### Option B: Same tag, force rollout

If you rebuild `edictum-console:latest`, K8s won't re-pull by default.
Bump the `restart-trigger` annotation in `server.yaml` and re-apply:

```bash
kubectl apply -k deploy/k8s/
```

Or force a rollout directly:

```bash
kubectl rollout restart deployment/edictum-console -n edictum
```

### Rollback

```bash
kubectl rollout undo deployment/edictum-console -n edictum
```

Note: Alembic migrations are forward-only. If you need to rollback a
migration, run `alembic downgrade` manually inside the pod before
rolling back the deployment.

### What happens during an upgrade

1. The old pod terminates (Recreate strategy -- no concurrent pods)
2. New pod starts, runs `docker-entrypoint.sh`
3. Alembic runs `upgrade head` (applies any pending migrations)
4. Uvicorn starts, startup probe waits up to 120s
5. Readiness probe passes, pod receives traffic

## Roadmap

These manifests will become a **Helm chart** that you can install with:

```bash
helm repo add edictum https://charts.edictum.dev
helm install edictum-console edictum/edictum-console \
  --set secrets.secretKey=... \
  --set secrets.signingKeySecret=... \
  --set ingress.host=console.example.com
```

The Helm chart will add: configurable replicas, PodDisruptionBudget,
ServiceMonitor for Prometheus, external Postgres/Redis support, and
`values.yaml`-driven configuration. Track progress in the main repo.
