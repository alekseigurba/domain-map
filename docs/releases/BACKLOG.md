# Backlog

- Presentation/Tooling layers, Actors/Users
- Slideshow mode - domain/capability postcards with metadata.
- Teams (owners, maintainers, enablers?).
- People overlays (by function? e.g. product, engineering).
- Flow draw mode - free draw with markers on top the locked map.
- Free-draw export SVG.
- Dark theme, dark palette.
- Enhance connector snap points (larger on hover, etc).
- Extend metadata.
- Metadata external links/labels.
- Apply labels (and contents?) from metadata (e.g., title, team, etc.).
- A viewer who follows a `?version=` link is turned away rather than shown the published map. Worth revisiting.
- Roles come from `OWNER_EMAILS` only. Entra ID app roles, and an in-app way to hand out rights, are still open.
- Versions carry no note or description, so the list is names, times and who saved them.

## Layers vNext - raw input, not adopted

The generic architecture stack that 2.1.0 prep started from. Kept for reference:
2.1.0 ships the layer mechanism and no prescribed stack, because most of this
describes how software is deployed rather than what a business does. Note the
original numbering skips 4.

### The stack as drafted

1. Presentation Layer (Channels & Frontends)
This layer contains the thin-client user interfaces. It holds no business logic and serves strictly to capture input and display data.
- End-Customer Channels: The iOS/Android mobile apps and consumer web portals.
- Merchant Channels: The Merchant Dashboard and embedded checkout widgets (IFrames/SDKs) injected directly into e-commerce sites (e.g., Shopify, Magento).
- Internal Back-Office Portals: Customer Service (CS) dashboards, Risk/Fraud review queues, and Treasury management tools.

2. Edge & Gateway Layer (Security & Routing)
The entry point to your cloud infrastructure. This layer protects your backend from malicious traffic, authenticates requests, and routes traffic efficiently.
- API Gateways: Routes external requests from apps or merchant sites to the correct backend microservice (often using the Backend-for-Frontend / BFF pattern).
- Authentication & IAM Providers: Handles user sessions, OAuth tokens, and strict Role-Based Access Control (RBAC) for internal operations.
- WAF & DDoS Protection: Web Application Firewalls (e.g., Cloudflare, AWS WAF) protecting against bots and fraud attacks.

3. Core Business Logic Layer (The Subdomains)
This is where the actual intelligence of your BNPL platform lives. It is split into the autonomous microservices or domain modules we discussed previously.
- Customer & Merchant Domain: Customer Profiles, Merchant Onboarding.
- Risk & Credit Domain: Underwriting Engine, Fraud Detection, Limit Management.
- Transactional Domain: Checkout Engine, Order Management, Virtual Card Issuance.
- Financial Operations Domain: Loan Management, Repayments, Disputes, Merchant Settlements.
   
5. Core Ledger & Data Layer (Systems of Record)
This layer houses the data persistence engines. In fintech, this layer is rigidly split between transactional data and analytical data.
- The Financial Ledger: An immutable, append-only double-entry bookkeeping engine (usually SQL-based, ensuring ACID compliance) tracking every single cent.
- Operational Databases: Fast-read/write databases storing customer sessions, shopping carts, and configuration settings.
- Data Lake / Warehouse: An analytical data store (e.g., Snowflake, BigQuery) where machine learning models analyze transaction history to constantly train and update the Underwriting and Fraud engines.

6. Integration Layer (External Ecosystem)
No BNPL service provider operates in a vacuum. This layer handles the secure protocols, SFTP lines, and Webhooks needed to communicate with traditional financial and regulatory institutions.
- Payment Rails & Processors: Integrations with payment gateways (Stripe, Adyen) and banking networks (ACH, SEPA, Swift) to move real money.
- Credit Bureaus & KYC Providers: Pipes to services like Experian, TransUnion, or identity verification platforms (Plair, Persona) to run checks in real-time.
- Card Networks: Direct integrations with Visa/Mastercard processing networks for virtual card generation.

7. Infrastructure & Security Utilities Layer (Foundational Services)
The underlying utility layer that supplies essential environmental configurations to the runtime modules above it.
- Secrets Management: Secure vaults (e.g., HashiCorp Vault, AWS Secrets Manager) that inject encrypted API keys, certificates, and database credentials directly into running microservices.
- Cloud Hosting & Computing: The core computing infrastructure (e.g., Kubernetes clusters, cloud instances) where the software actually executes.

8. Cross-Cutting Operational Planes
These planes do not sit in a single horizontal layer. Instead, they act as vertical structural elements that touch all layers or operate completely out-of-band.
- Observability Column (Logging & Monitoring): A vertical framework piercing through every single layer—from frontend telemetry to backend databases—aggregating logs, tracing distributed request paths, and firing operations alerts.
- Deployment Plane (CI/CD Pipelines): An out-of-band continuous integration and continuous deployment engine that automates building, testing, and shipping new code safely into the live environment.
