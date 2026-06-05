# Repository Naming Conventions & Organization Standard

Establishing clear, consistent, and structured naming conventions for source code repositories is essential for maintaining enterprise-grade organization, streamlining automated CI/CD pipelines, enhancing cross-team collaboration, and ensuring instantaneous code discoverability across large engineering organizations.

This document defines the standardized repository nomenclature across various project types, frameworks, and architecture footprints.

---

## 1. Universal Structural Rules

To maintain absolute uniformity across your version control system (e.g., GitHub, GitLab, Bitbucket), all repository names must rigidly adhere to the following baseline rules:

1. **Character Case:** All names must be strictly **lowercase**. No camelCase or PascalCase is permitted to avoid URL resolution inconsistencies across operating systems.
2. **Word Separation:** Use **slug-case** (words separated exclusively by hyphens `-`). Spaces, underscores (`_`), and special characters are entirely banned.
3. **Core Architectural Blueprint:**
   ```
   {project-or-org}-{domain-or-service}-{sub-component-or-name}-{functional-type}
   ```
   This multi-token layout allows developers, infrastructure components, and security scanners to immediately infer a repository's context, domain, boundary, and runtime nature without inspecting the source tree.

---

## 2. Classification Matrix by Project Archetype

### 2.1 Backend Frameworks & Applications
Backend codebases are stratified into unified/monolithic APIs or distributed microservices.

#### A. General / Monolithic Backend
Designed for consolidated, non-microservice architectures or primary legacy API clusters handling general request routing.
* **Pattern:** `{project}-general-api`
* **Production Example:** `alfa-general-api`
* **Production Example:** `loyalty-general-api`

#### B. Distributed Microservices
Designed for isolated, modular domain capabilities within a larger cloud-native environment. They are categorized by runtime lifecycle (synchronous web traffic vs. asynchronous background processing).
* **Pattern:** `{project}-service-{service-name}-{functional-type}`
* **API Component Example:** `alfa-service-user-api` *(Handles synchronous user HTTP/gRPC requests)*
* **Worker/Cron Component Example:** `alfa-service-user-cron` *(Handles asynchronous batch routines or event-driven jobs)*
* **Data Stream Example:** `alfa-service-payment-worker` *(Handles background queue consumer tasks)*

### 2.2 Frontend (Web) Applications
Repositories housing browser-rendered interfaces, Single Page Apps (SPAs), or Server-Side Rendered (SSR) web experiences.
* **Pattern:** `{project}-{sub-domain}-fe`
* **Production Example:** `alfa-admin-fe`
* **Production Example:** `loyalty-customer-fe`
* **Production Example:** `pos-checkout-fe`

### 2.3 Mobile Implementations
Dedicated mobile codebases must clearly define the underlying architecture, toolchain, or target Operating System boundary.
* **Pattern:** `{project}-mobile-{platform-or-framework}`
* **Cross-Platform Example:** `alfa-mobile-flutter`
* **Native iOS Example:** `alfa-mobile-ios`
* **Native Android Example:** `alfa-mobile-android`

### 2.4 Desktop Implementations
Native or containerized desktop client applications.
* **Pattern:** `{project}-desktop-{framework}`
* **Production Example:** `alfa-desktop-electron`
* **Production Example:** `loyalty-terminal-dotnet`

### 2.5 Fullstack (Monorepo or Combined) Systems
Used exclusively when frontend components and backend orchestration layers are coupled within a singular codebase (e.g., small internal internal proofs-of-concept or highly-cohesive monolithic stacks).
* **Pattern:** `{project}-app`
* **Production Example:** `alfa-analytics-app`
* **Production Example:** `courier-tracking-app`

### 2.6 Template & Boilerplate Repositories
Golden-path starter templates configured with foundational security, observability, and CI/CD parameters, acting as scaffolds for bootstrapping new services cleanly.
* **Pattern:** `{framework-or-language}-{functional-type}-template`
* **Production Example:** `vue-spa-template`
* **Production Example:** `nestjs-api-template`
* **Production Example:** `laravel-fullstack-template`
* **Production Example:** `go-grpc-service-template`

---

## 3. Quick Reference Convention Blueprint

| Archetype / Scope | Naming Structural Pattern | Concrete Real-World Example |
| :--- | :--- | :--- |
| **Backend Monolith** | `{project}-general-api` | `retail-general-api` |
| **Microservice (API)** | `{project}-service-{name}-api` | `retail-service-inventory-api` |
| **Microservice (Cron)** | `{project}-service-{name}-cron` | `retail-service-inventory-cron` |
| **Frontend Web** | `{project}-{sub-domain}-fe` | `retail-dashboard-fe` |
| **Mobile App** | `{project}-mobile-{platform}` | `retail-mobile-flutter` |
| **Desktop App** | `{project}-desktop-{framework}` | `retail-manager-electron` |
| **Fullstack Monolith** | `{project}-app` | `retail-pos-app` |
| **Boilerplate Template**| `{framework}-{type}-template` | `spring-boot-api-template` |

---

## 4. Operational & Engineering Benefits

Enforcing this standard universally across the engineering org unlocks clear structural advantages:

* 💡 **Onboarding & Clarity:** Reduces cognitive load for newly onboarded engineers, allowing them to pinpoint where specific business components live instantly.
* 🤖 **Automation and CI/CD Scalability:** Allows DevOps pipelines to parse the repository name string dynamically to infer build rules (e.g., a repo ending in `-fe` matches static SPA cloud hosting rules, while `-cron` triggers a Kubernetes CronJob configuration deployment).
* 🔍 **Precise Discoverability:** Standardizes search queries inside code search engines. Filtering across internal platforms via terms like `service-` or `-fe` seamlessly groups relevant resources together.
* 🔒 **Role-Based Access Control (RBAC):** Simplifies repository permission syncing scripts (e.g., giving the Mobile Engineering squad access to any repository matching `*-mobile-*` automatically).