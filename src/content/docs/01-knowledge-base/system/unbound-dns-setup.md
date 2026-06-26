# Unbound DNS Best Practice Setup

A production-grade Unbound DNS resolver configuration with modular directory structure, caching, forwarding zones, and management best practices.

## Table of Contents

| Section | Topic | Description |
| :---: | :--- | :--- |
| **01** | [Installation](#1-installation) | Package installation. |
| **02** | [Directory Structure](#2-directory-structure) | Modular config layout. |
| **03** | [Main Config](#3-main-config) | Root config file with includes. |
| **04** | [Core Server Settings](#4-core-server-settings) | Verbosity, interfaces, caching. |
| **05** | [Access Control](#5-access-control) | Private IP range permissions. |
| **06** | [Local Zones](#6-local-zones) | Static A/PTR records. |
| **07** | [Forwarding Zones](#7-forwarding-zones) | Custom internal DNS forwarding. |
| **08** | [Global Forwarding](#8-global-forwarding) | Public resolver fallback. |
| **09** | [Management Tips](#9-management-tips) | Version control, logging, health checks. |
| **10** | [CLI Reference](#10-cli-reference) | Essential commands. |

---

## 1. Installation

```bash
sudo apt update
sudo apt install unbound
```

---

## 2. Directory Structure

```
/etc/unbound/
├── unbound.conf              # Main config file
├── conf.d/
│   ├── server.conf           # Core server settings
│   ├── access-control.conf   # Client ACLs
│   ├── local-zones.conf      # Static DNS records
│   ├── forward-internal.conf # Internal DNS forwarding
│   └── forward-global.conf   # Public DNS forwarding
└── zones.d/
    ├── domain.local.zone     # Local zone files
    └── domain.internal.zone  # Internal zone files
```

---

## 3. Main Config

`/etc/unbound/unbound.conf`:

```conf
# Main Unbound configuration file
server:
  include: "/etc/unbound/conf.d/server.conf"
  include: "/etc/unbound/conf.d/access-control.conf"
  include: "/etc/unbound/conf.d/local-zones.conf"
  include: "/etc/unbound/conf.d/forward-internal.conf"
  include: "/etc/unbound/conf.d/forward-global.conf"

# Include all local zones from directory
include: "/etc/unbound/zones.d/*.zone"
```

---

## 4. Core Server Settings

`/etc/unbound/conf.d/server.conf`:

```conf
server:
  verbosity: 1
  interface: 10.4.252.39
  port: 53
  do-ip4: yes
  do-udp: yes
  do-tcp: yes
  hide-identity: yes
  hide-version: yes
  use-caps-for-id: no
  cache-min-ttl: 300
  cache-max-ttl: 300
  prefetch: yes
  prefetch-key: yes
  logfile: "/var/log/unbound.log"
```

| Setting | Value | Description |
|---------|-------|-------------|
| `verbosity` | 1 | Log level (0=quiet, 2=verbose) |
| `interface` | 10.4.252.39 | Listen IP address |
| `port` | 53 | Standard DNS port |
| `do-ip4` / `do-udp` / `do-tcp` | yes | Enable protocols |
| `hide-identity` | yes | Prevent version fingerprinting |
| `hide-version` | yes | Hide software version |
| `use-caps-for-id` | no | Disable 0x20 encoding |
| `cache-min-ttl` | 300 | Minimum cache TTL (5 min) |
| `cache-max-ttl` | 300 | Maximum cache TTL (5 min) |
| `prefetch` | yes | Refresh cache before expiry |
| `prefetch-key` | yes | Refresh DNSSEC keys |

---

## 5. Access Control

`/etc/unbound/conf.d/access-control.conf`:

```conf
access-control:
  10.0.0.0/8 allow
  172.16.0.0/12 allow
  192.168.0.0/16 allow
  127.0.0.1/32 allow
  ::1 allow
  # Deny all others
  0.0.0.0/0 refuse
```

| CIDR | Permission | Purpose |
|------|------------|---------|
| 10.0.0.0/8 | allow | Private Class A range |
| 172.16.0.0/12 | allow | Private Class B range |
| 192.168.0.0/16 | allow | Private Class C range |
| 127.0.0.1/32 | allow | Localhost |
| ::1 | allow | IPv6 localhost |
| 0.0.0.0/0 | refuse | Deny everything else |

---

## 6. Local Zones

### 6.1 Static A Records

`/etc/unbound/zones.d/gli.local.zone`:

```conf
local-zone: "gli.local." static
local-data: "kaspersky.gli.local. IN A 10.4.252.46"
local-data-ptr: "10.4.252.46 kaspersky.gli.local."
```

### 6.2 Adding More Zones

Drop new `.zone` files into `/etc/unbound/zones.d/`:

```conf
# /etc/unbound/zones.d/internal.zone
local-zone: "internal." static
local-data: "db.internal. IN A 10.4.252.50"
local-data-ptr: "10.4.252.50 db.internal."
local-data: "cache.internal. IN A 10.4.252.51"
local-data-ptr: "10.4.252.51 cache.internal."
```

---

## 7. Forwarding Zones

### 7.1 Custom Internal DNS

`/etc/unbound/conf.d/forward-internal.conf`:

```conf
forward-zone:
  name: "domain.com."
  forward-tls-upstream: no
  forward-addr: 10.0.0.10
  forward-addr: 10.0.0.11
```

### 7.2 Multiple Forward Zones

```conf
# Corporate DNS
forward-zone:
  name: "corp.example.com."
  forward-tls-upstream: no
  forward-addr: 10.0.1.53

# Partner DNS
forward-zone:
  name: "partner.net."
  forward-tls-upstream: no
  forward-addr: 10.0.2.53
  forward-addr: 10.0.2.54
```

---

## 8. Global Forwarding

### 8.1 Public Resolvers

`/etc/unbound/conf.d/forward-global.conf`:

```conf
# Forward all other queries to public DNS resolvers
forward-zone:
  name: "."
  forward-tls-upstream: no
  forward-addr: 8.8.8.8
  forward-addr: 1.1.1.1
```

### 8.2 TLS-Enabled Forwarding

```conf
forward-zone:
  name: "."
  forward-tls-upstream: yes
  forward-addr: 8.8.8.8@853
  forward-addr: 1.1.1.1@853
```

---

## 9. Management Tips

| Goal | Method |
|------|--------|
| Add new zone | Drop `.zone` or `.conf` file into `zones.d/` or `conf.d/` |
| Version control | Keep `/etc/unbound/` in Git, deploy via Ansible/Terraform |
| Centralized logging | Send `/var/log/unbound.log` to syslog or ELK |
| Health check | `unbound-control status` or enable remote-control |
| Template zones | Create `/etc/unbound/templates/zone-template.zone` |
| Auto reload | Use `inotify` or `systemd Path` unit to reload on changes |

### Systemd Auto-Reload

```ini
# /etc/systemd/system/unbound-reload.service
[Unit]
Description=Reload Unbound on config change
Requires=unbound.service

[Service]
Type=oneshot
ExecStart=/usr/sbin/unbound-control reload
```

```ini
# /etc/systemd/system/unbound-reload.path
[Unit]
Description=Watch Unbound config for changes

[Path]
PathModified=/etc/unbound/conf.d
PathModified=/etc/unbound/zones.d

[Install]
WantedBy=multi-user.target
```

---

## 10. CLI Reference

| Command | Description |
|---------|-------------|
| `unbound-control` | Remote control utility for unbound server |
| `unbound-checkconf` | Check the configuration file for errors |
| `unbound-control status` | Show server status |
| `unbound-control reload` | Reload configuration |
| `unbound-control stats_noreset` | Show cache statistics |
| `unbound-control dump_cache` | Dump cache to file |
| `unbound-control flush_zone example.com` | Flush specific zone from cache |

---

## References

- [Unbound Configuration Reference](https://unbound.net/documentation/unbound.conf.html)
- [Unbound Manual](https://unbound.net/documentation/unbound-control.html)
