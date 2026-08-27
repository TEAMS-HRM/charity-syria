# Phase 4 — Domain & TLS (Milestone 2: TLS + wildcard multi-tenant routing)

Adds `global/dns`, `modules/acm` and `modules/dns`, and turns the Phase 3 HTTP
listener into a 301 redirect. End state: `https://<anything>.staging.charity-syria.com`
serves the container over TLS, and port 80 redirects to 443.

Prereqs: Phase 3 applied and green (Milestone 1), a **registered domain**, AWS
CLI + SSO profile `charityapp-admin`.

---

## What this phase creates

| Resource | Where | Notes |
|---|---|---|
| `aws_route53_zone` (`charity-syria.com`) | `global/dns` | shared by staging + prod, own state, `prevent_destroy` |
| `aws_acm_certificate` | `modules/acm` | `staging.charity-syria.com` + `*.staging.charity-syria.com`, DNS-validated |
| `aws_route53_record` (validation) | `modules/acm` | `allow_overwrite = true` — apex and wildcard share one validation record |
| `aws_acm_certificate_validation` | `modules/acm` | blocks until ACM issues; the ALB reads the ARN from here |
| `aws_lb_listener` (HTTPS :443) | `modules/alb` | TLS 1.2/1.3 policy, forwards to the Phase 3 target group |
| `aws_lb_listener` (HTTP :80) | `modules/alb` | **changed in place** from forward to a 301 redirect |
| `aws_route53_record` A alias x2 | `modules/dns` | `staging.charity-syria.com` and `*.staging.charity-syria.com` to the ALB |

### Why ACM and DNS are two modules

The plan doc sketched one `dns` module. Splitting avoids a dependency knot: the
ALB listener needs the **certificate ARN as an input**, while the alias records
need the **ALB's DNS name as an input**. Two modules keep the order strictly
one-directional:

```
acm  ->  alb  ->  dns
```

### The off switch

Everything in this phase hangs off one variable. `domain_name = ""` in
`terraform.tfvars` skips ACM, Route53 and the HTTPS listener, and the ALB stays
on plain HTTP exactly as it was in Phase 3. Use that if the domain isn't ready —
the config still applies cleanly.

---

## 1. Register the domain (once, manual)

Route53 -> Registered domains -> Register, or use any registrar you like. This is
the one step Terraform doesn't do here: domain registration is a purchase with a
year-long commitment, not a resource you want an `apply` creating or destroying.

---

## 2. Create the hosted zone

```powershell
$env:AWS_PROFILE = "charityapp-admin"
aws sso login --profile charityapp-admin
aws sts get-caller-identity      # must show account 667512624734

cd infra\terraform\global\dns
terraform init
terraform apply
terraform output nameservers
```

> **If you registered through Route53**, AWS already made the zone. Don't apply —
> import it, or the apply creates a SECOND zone for the same domain with
> different nameservers and nothing resolves:
>
> ```powershell
> aws route53 list-hosted-zones-by-name --dns-name charity-syria.com `
>   --query "HostedZones[].{Id:Id,Name:Name}"
> terraform init
> terraform import aws_route53_zone.root <ZONE_ID>     # bare id, no /hostedzone/ prefix
> terraform plan     # should show no changes
> ```

### Point the registrar at those nameservers

Copy the four `nameservers` values into the domain's NS settings at the
registrar (skip if registered through Route53 — already wired). Then confirm the
public internet agrees:

```powershell
Resolve-DnsName -Name charity-syria.com -Type NS

# If your network blocks outbound DNS to public resolvers (this one does), the
# system resolver above is the check that works. `nslookup ... 8.8.8.8` will
# time out regardless of whether the records exist.
```

**Do not move on until this returns the AWS nameservers.** ACM validation is a
public DNS lookup — if the world can't see your Route53 records the certificate
sits in `PENDING_VALIDATION` and `terraform apply` hangs for the full 10-minute
timeout before failing. Propagation is usually minutes, but a registrar's TTL can
stretch it to hours.

---

## 3. Apply staging

`terraform.tfvars` already carries:

```hcl
root_domain = "charity-syria.com"
domain_name = "staging.charity-syria.com"
```

```powershell
cd ..\..\environments\staging
terraform init
terraform plan
terraform apply
```

Expect ~6 new resources and **1 change in place** (the port 80 listener becoming
a redirect). The slow one is `aws_acm_certificate_validation` — typically 2-5
minutes while ACM polls DNS.

There is a brief window during apply where port 80 redirects to 443 before the
HTTPS listener exists. Staging, hello-world, seconds — not worth engineering
around.

---

## 4. Milestone 2 — prove TLS and wildcard routing

```powershell
$domain = terraform output -raw domain_fqdn

# TLS on the domain itself
curl.exe "https://$domain/health"                  # {"status":"ok"}

# Wildcard: any subdomain, no DNS change, same cert
curl.exe "https://acme.$domain/"
curl.exe "https://another-tenant.$domain/"

# 80 -> 443 redirect (-I shows the 301 without following it)
curl.exe -I "http://$domain/"                      # HTTP/1.1 301 ... Location: https://...

# and that the redirect actually lands
curl.exe -L "http://$domain/health"                # {"status":"ok"}
```

Inspect the certificate itself:

```powershell
curl.exe -vI "https://acme.$domain/" 2>&1 | Select-String "subject:|issuer:|SSL certificate verify"

aws acm describe-certificate --certificate-arn (terraform output -raw certificate_arn) `
  --region ap-south-1 `
  --query "Certificate.{Status:Status,Domains:SubjectAlternativeNames,NotAfter:NotAfter}"
```

Status must be `ISSUED` and the domain list must show both the apex and the `*.` form.

### Troubleshooting

| Symptom | Cause |
|---|---|
| apply hangs on `aws_acm_certificate_validation` | registrar NS not pointing at Route53 yet, or still propagating — back to step 2 |
| `curl: (6) Could not resolve host` | alias record missing, or your resolver cached NXDOMAIN. Check with `Resolve-DnsName acme.staging.charity-syria.com` |
| `SSL certificate problem` / name mismatch | you hit the **ALB DNS name** over HTTPS, not the domain. The cert covers `*.staging.charity-syria.com`, not `*.elb.amazonaws.com`. Expected — use the domain |
| 301 redirect loop | something upstream stripping `X-Forwarded-Proto`; nothing is upstream yet, so this shouldn't appear in this phase |
| 503 | not a TLS problem — the target group is unhealthy. Same checks as Phase 3 |

Useful:

```powershell
aws route53 list-resource-record-sets --hosted-zone-id <ZONE_ID> `
  --query "ResourceRecordSets[?Type=='A'].{Name:Name,Alias:AliasTarget.DNSName}"

aws elbv2 describe-listeners --load-balancer-arn (terraform output -raw alb_arn) `
  --region ap-south-1 `
  --query "Listeners[].{Port:Port,Protocol:Protocol,Cert:Certificates[0].CertificateArn}"
```

---

## 5. Optional — make the tenant visible in the response

`app/hello-world/server.js` now echoes the `Host` header and
`X-Forwarded-Proto`, which turns wildcard routing from inferred into visible. It
needs a new image (the ECR repo uses **immutable tags**, so the tag must change):

```powershell
$acct   = (aws sts get-caller-identity --query Account --output text)
$region = "ap-south-1"
$repo   = "$acct.dkr.ecr.$region.amazonaws.com/charityapp-staging-app"

aws ecr get-login-password --region $region | docker login --username AWS --password-stdin "$acct.dkr.ecr.$region.amazonaws.com"

cd ..\..\..\..\app\hello-world
docker build --platform linux/amd64 -t "${repo}:hello-world-v3" .
docker push "${repo}:hello-world-v3"
```

Then set `image_tag = "hello-world-v3"` in `terraform.tfvars` and re-apply:

```powershell
curl.exe "https://acme.staging.charity-syria.com/"
# {"message":"Hello from CharityApp","host":"acme.staging.charity-syria.com","tenant":"acme","proto":"https"}
```

`terraform.tfvars` is deliberately left at `hello-world-v2` so Phase 4 applies
with no Docker step. Skip this section entirely if you would rather keep moving.

---

## Phase 4 done when

- [ ] `Resolve-DnsName -Name charity-syria.com -Type NS` returns the AWS nameservers
- [ ] ACM certificate status is `ISSUED`, covering apex + wildcard
- [ ] `curl.exe https://staging.charity-syria.com/health` returns `{"status":"ok"}`
- [ ] `curl.exe https://<any-name>.staging.charity-syria.com/health` returns the same  <- **Milestone 2**
- [ ] `curl.exe -I http://staging.charity-syria.com/` returns a 301 to HTTPS

Next: **Phase 5 — RDS Postgres in the private subnets** (Milestone 3: DB reachable).

---

## Notes for later phases

- **Production reuses this unchanged**: same modules, `domain_name = "charity-syria.com"`,
  same hosted zone (it lives in `global/`, not in staging's state). The wildcard
  record is the entire multi-tenant routing story — a new tenant needs no DNS work.
- **ACM auto-renews** as long as the validation CNAMEs stay in the zone. Terraform
  owns those records; don't hand-delete them in the console.
- **CloudFront (frontend) will need its own cert in `us-east-1`** — a hard
  CloudFront requirement, and not something `modules/acm` handles today. It needs
  a second provider alias pinned to `us-east-1`.
- **`ssl_policy`** is exposed on the ALB module if compliance ever demands TLS 1.3 only.
- **Host-based routing** (per-tenant target groups, a separate marketing site on the
  apex) hangs off `aws_lb_listener_rule` on the HTTPS listener — its ARN is exported
  as `https_listener_arn` for exactly that.
