# The Silent Data Loss Bug: How Prepared Statements Break PostgreSQL Connection Pooling

## Table of Contents

| Section | Topic | Description |
| :---: | :--- | :--- |
| **01** | [The Scalability Dilemma](#1-the-scalability-dilemma) | Why scaling PostgreSQL hits a wall. |
| **02** | [Connection Anatomy](#2-connection-anatomy) | Process-based vs thread-based, RAM cost. |
| **03** | [The Connection Bottleneck](#3-the-connection-bottleneck) | Why max_connections=100 is a trap. |
| **04** | [PgBouncer to the Rescue](#4-pgbouncer-to-the-rescue) | Session mode vs transaction mode. |
| **05** | [The Prepared Statement Trap](#5-the-prepared-statement-trap) | How your ORM silently breaks data. |
| **06** | [The Fix](#6-the-fix) | What to change and when. |

---

## 1. The Scalability Dilemma

You're scaling horizontally. Pods go from 2 to 20. Auto-scalers kick in. Serverless functions spin up on demand. Everything looks great — until your PostgreSQL database throws:

```
FATAL: too many connections for role "appuser"
```

Your database didn't suddenly get more traffic. Your **connection count** did. And that's the problem most teams discover too late.

---

## 2. Connection Anatomy

### PostgreSQL: Process-per-Connection

PostgreSQL uses `fork()` — the OS creates a **new process** for every client connection. Not a thread. A full process.

```c
// Simplified: what happens when you connect
socket = accept(server_fd);
pid = fork();  // Full process copy
if (pid == 0) {
    handle_client(socket);  // Child process handles this connection
}
```

| Aspect | PostgreSQL (Process) | MySQL (Thread) |
| :--- | :--- | :--- |
| **Model** | Process-per-connection | Thread-per-connection |
| **RAM per connection** | 10-16 MB | ~1 MB |
| **Isolation** | Full (separate memory space) | Shared (thread-local storage) |
| **Crash impact** | One connection crashes, others survive | Thread crash can affect others |
| **OS overhead** | High (process context switch) | Low (thread context switch) |

### Why Process, Not Thread?

PostgreSQL was designed in the 1990s when threads were unreliable across platforms. The `fork()` model provides:

- **Memory safety** — each connection has its own address space
- **Crash isolation** — a bad query can't corrupt another connection's state
- **Simplicity** — no locking primitives needed for connection-local data

The tradeoff: **RAM is expensive**.

### Real-World RAM Cost

```bash
# Check PostgreSQL memory usage per connection
SELECT
    pid,
    usename,
    state,
    pg_size_pretty(pg_relation_size(0)) as mem_usage
FROM pg_stat_activity;
```

| Workload | RAM per Connection |
| :--- | :--- |
| Idle connection | ~5 MB |
| Simple SELECT | ~10 MB |
| Complex JOIN + sorting | ~16 MB |
| Large result set with COPY | ~50 MB+ |

---

## 3. The Connection Bottleneck

### The Math That Kills You

```
Default max_connections = 100
RAM per connection = 10 MB (average)
Total RAM for connections = 100 × 10 MB = 1 GB
```

That's 1 GB of RAM just for connection overhead — before your application even runs a query.

### When Auto-Scaling Breaks

| Scenario | Pods/Instances | Connections per Pod | Total Connections |
| :--- | :--- | :--- | :--- |
| Normal | 2 | 10 | 20 |
| Traffic spike | 10 | 10 | 100 |
| Auto-scale | 20 | 10 | **200 → FAIL** |
| Serverless (50 concurrent) | 50 | 1 | **50 → OK, but** |

With 20 pods × 10 connections = 200 connections, but `max_connections=100`. Your database refuses connections.

### The Serverless Paradox

Serverless functions (Lambda, Cloud Run, Vercel) each open a new connection. With 50 concurrent invocations:

- 50 connections × 10 MB = **500 MB** just for connections
- Each function runs for 100ms, but the connection lives longer
- Connection pool exhaustion happens in seconds

---

## 4. PgBouncer to the Rescue

PgBouncer is a lightweight connection pooler that sits between your application and PostgreSQL. It maintains a pool of actual database connections and multiplexes client connections across them.

```mermaid
graph LR
    subgraph APP["Application"]
        c1["Client 1"]
        c2["Client 2"]
        c3["Client 3"]
        c4["Client 4"]
        c5["Client 5"]
    end

    subgraph PGBOUNCER["PgBouncer Pool"]
        p1["Pool Slot 1"]
        p2["Pool Slot 2"]
        p3["Pool Slot 3"]
    end

    subgraph PG["PostgreSQL"]
        db1["Process 1"]
        db2["Process 2"]
        db3["Process 3"]
    end

    c1 --> p1
    c2 --> p1
    c3 --> p2
    c4 --> p2
    c5 --> p3
    p1 --> db1
    p2 --> db2
    p3 --> db3
```

5 clients → 3 database connections. RAM saved: **20 MB**.

### Session Mode vs Transaction Mode

| Aspect | Session Mode | Transaction Mode |
| :--- | :--- | :--- |
| **Connection binding** | Client gets a dedicated DB connection for entire session | Client gets a DB connection only during a transaction |
| **RAM efficiency** | Low (1:1 mapping while connected) | High (N:1 multiplexing) |
| **Feature support** | Full (PREPARE, LISTEN/NOTIFY, SET) | Limited (no session-level state) |
| **Use case** | Long-running apps, psql | Serverless, auto-scaling, connection-heavy |
| **Pool size needed** | High | Low |

### PgBouncer Configuration

```ini
[databases]
appdb = host=example-rds.xxxx.ap-southeast-3.rds.amazonaws.com port=5432 dbname=appdb

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
reserve_pool_timeout = 3
server_lifetime = 3600
server_idle_timeout = 600
client_idle_timeout = 0
```

---

## 5. The Prepared Statement Trap

Here's where it gets dangerous. Your ORM or database driver might be **silently breaking your data**.

### What Are Prepared Statements?

```sql
-- Step 1: Prepare (creates a named statement on the connection)
PREPARE user_insert AS
  INSERT INTO users (name, email) VALUES ($1, $2);

-- Step 2: Execute (runs the prepared statement)
EXECUTE user_insert('Alice', 'alice@example.com');
```

Prepared statements are **bound to a specific database connection**. They exist in the server's memory space for that connection.

### The Transaction Mode Problem

In PgBouncer Transaction Mode:

1. App sends `PREPARE user_insert` → PgBouncer routes to **Connection A**
2. Transaction ends → PgBouncer releases Connection A back to pool
3. App sends `EXECUTE user_insert` → PgBouncer routes to **Connection B**
4. Connection B doesn't have `user_insert` prepared

```
ERROR: prepared statement "user_insert" does not exist
```

### The Intermittent Nature

This bug is **intermittent** because:

- It only happens when the pool reassigns connections between prepare and execute
- Under low load, the same connection might be reused (bug doesn't appear)
- Under high load, connections are reassigned frequently (bug appears)

| Load Level | Connection Reuse | Bug Frequency |
| :--- | :--- | :--- |
| Low (dev) | High | Rare (never seen in dev) |
| Medium (staging) | Medium | Intermittent |
| High (prod) | Low | Frequent |

### The Silent Data Loss

The worst part: sometimes the error is **swallowed** by the application's error handling. The INSERT appears to succeed (HTTP 200), but the data is never committed because the execute failed.

```
// Application code
try {
  const user = await db.insert(users).values({ name: 'Alice' });
  // user.id exists — but was it actually committed?
  return res.json({ id: user.id });  // HTTP 200
} catch (error) {
  // Error swallowed by generic handler
  return res.json({ id: user.id });  // Still HTTP 200, but data lost
}
```

### Which ORMs/Drivers Are Affected?

| Driver/ORM | Prepared Statement Default | Status |
| :--- | :--- | :--- |
| **Bun (bun:postgres)** | Enabled | ⚠️ Dangerous in Transaction Mode |
| **Drizzle ORM** | Enabled | ⚠️ Dangerous in Transaction Mode |
| **node-postgres (pg)** | Disabled by default | ✅ Safe |
| **Prisma** | Disabled by default | ✅ Safe |
| **SQLAlchemy** | Disabled by default | ✅ Safe |
| **Django** | Disabled by default | ✅ Safe |

### PgBouncer 1.21.0+ Fix

PgBouncer 1.21.0 introduced `max_prepared_statements` — protocol-level tracking that maps prepared statements across connections:

```ini
[pgbouncer]
pool_mode = transaction
max_prepared_statements = 100
```

But this adds overhead and isn't available on all managed PgBouncer services.

---

## 6. The Fix

### Decision Matrix

| Application Type | Pool Mode | Prepared Statements | Why |
| :--- | :--- | :--- | :--- |
| **Long-running (K8s pod)** | Session Mode | Keep enabled | Full feature support |
| **Serverless (Lambda, Cloud Run)** | Transaction Mode | **Must disable** | Connection per invocation |
| **Auto-scale (HPA)** | Transaction Mode | **Must disable** | High connection churn |
| **Connection pooler (PgBouncer 1.21+)** | Transaction Mode | Optional (with tracking) | New feature, test first |

### Disable Prepared Statements

**Node.js / Bun (pg driver):**

```typescript
// Connection string
DATABASE_URL=postgresql://user:pass@host:5432/db?prepared=false

// Or in config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  prepareThreshold: 0  // Disable prepared statements
});
```

**Drizzle ORM:**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';

const db = drizzle(process.env.DATABASE_URL, {
  prepareThreshold: 0  // Disable prepared statements
});
```

**Bun (bun:postgres):**

```typescript
import { PostgresClient } from 'bun';

const client = new PostgresClient({
  url: process.env.DATABASE_URL,
  prepareThreshold: 0  // Disable prepared statements
});
```

**Prisma:**

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Prepared statements are disabled by default in Prisma
  // No changes needed
}
```

**Python (SQLAlchemy):**

```python
from sqlalchemy import create_engine

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    # Prepared statements disabled by default
)
```

### Checklist

| Item | Session Mode | Transaction Mode |
| :--- | :--- | :--- |
| `pool_mode` | `session` | `transaction` |
| `prepared_statements` | Enabled | **Disabled** |
| `max_client_conn` | Match app connections | 10x default_pool_size |
| `default_pool_size` | Match DB max_connections | 20-50 |
| `server_lifetime` | 3600 | 3600 |
| `reserve_pool_size` | 5 | 5 |
| Application `connection_limit` | 10-20 | 3-5 |

---

## References

- [PostgreSQL Documentation: Architectural Fundamentals](https://www.postgresql.org/docs/current/tutorial-arch.html)
- [PgBouncer Documentation: Pool Modes](https://www.pgbouncer.org/config.html#pool-mode)
- [PgBouncer FAQ: Prepared Statements](https://www.pgbouncer.org/faq.html#how-to-use-prepared-statements-with-pgbouncer)
- [PgBouncer 1.21.0 Release Notes](https://www.pgbouncer.org/changelog.html#version-1-21-0)
- [PlanetScale: Why Connection Pooling Matters](https://planetscale.com/blog/why-connection-pooling-matters)
- [Crunchy Data: PgBouncer Prepared Statements](https://www.crunchydata.com/blog/pgbouncer-prepared-statements)
- [Tiger Data: PostgreSQL Connection Pooling](https://www.tigerdata.com/blog/postgresql-connection-pooling)
