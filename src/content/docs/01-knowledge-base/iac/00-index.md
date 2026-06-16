# Infrastructure as Code (IaC) Knowledge Base Index

This directory contains our Infrastructure as Code (IaC) guides and practices. Please select a topic from the guides below:

| Module | Topic | Description |
| :---: | :--- | :--- |
| **01** | [IaC Paradigms, Patterns & Decisions](foundations.md) | Conceptual foundations of IaC including declarative vs imperative models, cattle vs pets, immutable infrastructure, and GitOps, combined with repository structures, state management, and real-world decision frameworks. |
| **02** | [Best Practices & Core Principles](best-practices.md) | Standard syntax rules, project structures, provider and version pinning, remote state backends, variable validation, module design, looping/dynamics, and common anti-patterns. |
| **03** | [Pre-commit & Shift-Left Validation](pre-commit-and-validation.md) | Detailed guide on configuring pre-commit hook suites locally to validate formatting, check for hardcoded secrets, lint with tflint, scan with Checkov, and enforce policy-as-code (OPA/Conftest). |
| **04** | [IaC CI/CD — Terraform & Terragrunt Pipeline](cicd.md) | Production-grade CI/CD pipeline patterns for Terraform and Terragrunt covering multi-account provisioning, OIDC federation, plan/apply gates, drift detection, module versioning, and testing strategy. |
| **05** | [Multi-Account VPC Lattice with Terraform](terraform-multi-account-vpc-lattice.md) | Complete Terraform implementation of a public-facing VPC Lattice architecture across four AWS accounts — service networks, RAM sharing, resource gateways, ALB integration, DNS, WAF, and observability — using reusable modules and `terraform_remote_state` for cross-account output resolution. |
