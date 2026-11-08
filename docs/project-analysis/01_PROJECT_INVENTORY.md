# MVMP Project Inventory

## Project Metadata

| Property | Value |
|----------|-------|
| **Project Name** | MVMP (Multi VPN Management Panel) |
| **Version** | 0.2.1 |
| **Type** | Enterprise VPN Management Platform |
| **License** | Proprietary |
| **Development Status** | Active Development (Phase 14) |

## Technology Stack Inventory

### Core Frameworks & Libraries

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Frontend** | Next.js | 16.1.1 | React framework with App Router |
| **Frontend** | React | 19.0.0 | UI library |
| **Frontend** | React DOM | 19.0.0 | React DOM bindings |
| **Frontend** | TypeScript | 5.0.0 | Type safety |
| **Frontend** | Tailwind CSS | 4.0.0 | Utility-first CSS |
| **Frontend** | Zustand | 5.0.6 | State management |
| **Frontend** | TanStack Query | 5.82.0 | Server state management |
| **Frontend** | React Hook Form | 7.60.0 | Form handling |
| **Frontend** | Zod | 4.0.2 | Schema validation |
| **Frontend** | Socket.io Client | 4.8.4 | Real-time communication |
| **Frontend** | Lucide React | 0.525.0 | Icon library |
| **Frontend** | Framer Motion | 12.23.2 | Animations |
| **Frontend** | next-themes | 0.4.6 | Theme management |
| **Frontend** | next-intl | 4.3.4 | Internationalization |
| **Backend** | Prisma ORM | 6.11.1 | Database ORM |
| **Backend** | BullMQ | 6.7.1 | Job queue |
| **Backend** | ioredis | 6.0.0 | Redis client |
| **Backend** | bcryptjs | 3.0.3 | Password hashing |
| **Backend** | Socket.io | 4.8.4 | Real-time server |
| **Backend** | jspdf | 4.2.1 | PDF generation |
| **Backend** | jspdf-autotable | 5.0.9 | PDF tables |
| **Backend** | react-markdown | 10.1.0 | Markdown rendering |
| **Backend** | react-syntax-highlighter | 15.6.1 | Code syntax highlighting |
| **Backend** | uuid | 11.1.0 | Unique ID generation |
| **Backend** | date-fns | 4.1.0 | Date utilities |
| **Backend** | clsx | 2.1.1 | Conditional CSS classes |
| **Backend** | tailwind-merge | 3.3.1 | Tailwind class merging |
| **Backend** | class-variance-authority | 0.7.1 | Component variants |

### UI Component Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| Radix UI Primitives | Various (latest) | Accessible UI primitives |
| shadcn/ui | Latest | Pre-built UI components |
| Sonner | 2.0.6 | Toast notifications |
| cmdk | 1.1.1 | Command palette |

### Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| ESLint | 9.0.0 | Code linting |
| bun | 1.3.4 | Package manager & runtime |
| TypeScript | 5.0.0 | Type checking |
| bun-types | 1.3.4 | TypeScript types for Bun |

### Infrastructure & DevOps

| Component | Version | Purpose |
|-----------|---------|---------|
| Docker | Latest | Containerization |
| Docker Compose | Latest | Container orchestration |
| PostgreSQL | 16 | Primary database |
| Redis | 7 | Cache & queue backend |
| Nginx | Latest | Reverse proxy (recommended) |
| Caddy | Latest | Reverse proxy (optional) |

## File Structure Inventory

### Root Directory Structure

```
mvmp/
├── .dockerignore              # Docker ignore rules
├── .env.production.example    # Production environment template
├── .gitignore                 # Git ignore rules
├── bun.lock                   # Bun dependency lockfile
├── Caddyfile                  # Caddy reverse proxy config
├── components.json            # shadcn/ui component config
├── Dockerfile                 # Multi-stage Docker build
├── eslint.config.mjs          # ESLint configuration
├── next-env.d.ts              # Next.js environment types
├── next.config.ts             # Next.js configuration
├── package.json               # Node.js dependencies
├── postcss.config.mjs         # PostCSS configuration
├── tailwind.config.ts         # Tailwind CSS configuration
├── tsconfig.json              # TypeScript configuration
├── components/                # Shared UI components
├── docs/                      # Documentation
├── deploy/                    # Deployment scripts & configs
├── mini-services/             # Microservices
├── prisma/                    # Database schema & migrations
├── public/                    # Static assets
├── scripts/                   # Utility scripts
├── src/                       # Source code
└── worker/                    # Background worker (placeholder)
```

### Source Code Structure (`src/`)

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── ai/                   # AI agent endpoints
│   │   ├── api-keys/             # API key management
│   │   ├── audit-logs/           # Audit log endpoints
│   │   ├── auth/                 # Authentication endpoints
│   │   ├── chat/                 # Chat endpoints
│   │   ├── customers/            # Customer management
│   │   ├── dashboard/            # Dashboard endpoints
│   │   ├── email-logs/           # Email log endpoints
│   │   ├── jobs/                 # Job queue endpoints
│   │   ├── monitoring/           # Monitoring endpoints
│   │   ├── notifications/        # Notification endpoints
│   │   ├── packages/             # Package management
│   │   ├── payments/             # Payment endpoints
│   │   ├── portal/               # Portal endpoints (customer/reseller)
│   │   ├── protocols/            # Protocol management
│   │   ├── rbac/                 # RBAC endpoints
│   │   ├── resellers/            # Reseller management
│   │   ├── servers/              # Server management
│   │   ├── settings/             # Settings endpoints
│   │   ├── simulator/            # Simulator endpoints
│   │   ├── telegram/             # Telegram endpoints
│   │   ├── transactions/         # Transaction endpoints
│   │   ├── users/                # User management
│   │   └── vpn-accounts/         # VPN account endpoints
│   ├── privacy/                  # Privacy policy page
│   ├── register/                 # Registration page
│   ├── terms/                    # Terms of service page
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page (smart router)
│   └── globals.css               # Global styles
│
├── components/                   # React components
│   ├── chat/                     # Chat components
│   ├── landing/                  # Landing page components
│   ├── mvmp/                     # Main application components
│   │   ├── portal/               # Portal components
│   │   │   ├── views/            # Portal views
│   │   │   └── ...               # Portal utilities
│   │   ├── views/                # Admin views
│   │   │   ├── ai/               # AI center views
│   │   │   ├── settings/         # Settings views
│   │   │   ├── whatsapp/         # WhatsApp views
│   │   │   └── ...               # Other admin views
│   │   ├── lib.tsx               # Portal utilities
│   │   ├── LoginView.tsx         # Login component
│   │   ├── AppShell.tsx          # Main shell
│   │   ├── RealtimeBridge.tsx    # Real-time bridge
│   │   ├── StatCard.tsx          # Statistics card
│   │   └── ...                   # Other components
│   ├── ui/                       # shadcn/ui components
│   │   ├── accordion.tsx         # Accordion
│   │   ├── alert.tsx             # Alert
│   │   ├── alert-dialog.tsx      # Alert dialog
│   │   ├── avatar.tsx            # Avatar
│   │   ├── badge.tsx             # Badge
│   │   ├── button.tsx            # Button
│   │   ├── card.tsx              # Card
│   │   ├── dialog.tsx            # Dialog
│   │   ├── dropdown-menu.tsx     # Dropdown menu
│   │   ├── form.tsx              # Form
│   │   ├── input.tsx             # Input
│   │   ├── label.tsx             # Label
│   │   ├── table.tsx             # Table
│   │   ├── toast.tsx             # Toast
│   │   └── ...                   # Additional UI components
│   └── ui/                       # Additional UI components
│
├── hooks/                        # React hooks
│   ├── use-mobile.ts             # Mobile detection hook
│   └── use-toast.ts              # Toast hook
│
├── lib/                          # Core libraries
│   ├── ai-provider.ts            # AI provider integration
│   ├── auth.ts                   # Authentication & RBAC
│   ├── crypto.ts                 # Encryption utilities
│   ├── currency.ts               # Currency handling
│   ├── db.ts                     # Database connection
│   ├── env-validate.ts           # Environment validation
│   ├── mailer.ts                 # Email service
│   ├── notify.ts                 # Notification service
│   ├── otp.ts                    # OTP utilities
│   ├── pdf.ts                    # PDF generation
│   ├── provisioner.ts            # VPN provisioning
│   ├── rate-limit.ts             # Rate limiting
│   ├── rbac.ts                   # RBAC library
│   ├── realtime.ts               # Real-time utilities
│   ├── ssrf.ts                   # SSRF protection
│   ├── store.ts                  # Zustand store
│   ├── telegram.ts               # Telegram integration
│   ├── utils.ts                  # Utility functions
│   ├── utils-mvmp.ts             # MVMP-specific utilities
│   └── whatsapp.ts               # WhatsApp integration
│
├── worker/                       # Background worker (placeholder)
│
└── instrumentation.ts            # Next.js instrumentation
```

### Database Schema Inventory

**Total Models**: 48 models

#### Core Models
1. User (with roles, MFA, sessions)
2. Session
3. Customer
4. Reseller
5. Server
6. ServerGroup
7. ServerAgent
8. Protocol
9. ServerProtocol
10. ServerPort
11. FirewallRule
12. VpnAccount
13. VpnCredential
14. VpnUsage
15. Subscription
16. Package
17. PackageProtocol

#### Transaction Models
18. Transaction
19. Payment
20. ManualPaymentProof
21. Invoice
22. ResellerCommission
23. ResellerLedger

#### Monitoring Models
24. Job
25. JobLog
26. ServerMetric

#### Security Models
27. AuditLog
28. Notification
29. ApiKey
30. OtpCode
31. UserDevice
32. Role
33. Permission
34. RolePermission
35. UserPermission

#### AI Models
36. AIProvider
37. AIModel
38. AICredential
39. AIConfiguration
40. AIUsage
41. AIBudget
42. AIAgent
43. AIAgentTool
44. AIExecution
45. AIKnowledgeDocument
46. AIKnowledgeChunk
47. AIPrompt
48. AIPromptVersion

#### Communication Models
49. ChatConversation
50. ChatMessage
51. ChatAssignment
52. ChatSuggestedReply
53. ChatAuditLog

#### WhatsApp Models
54. WhatsappIntegration
55. WhatsappContact
56. WhatsappConversation
57. WhatsappMessage
58. WhatsappTemplate
59. WhatsappBroadcast
60. WhatsappBroadcastRecipient
61. WhatsappQuickReply

#### Telegram Models
62. TelegramIntegration

#### Email Models
63. EmailLog

#### System Models
64. SystemSetting

**Total**: 64 models

## API Endpoint Inventory

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Server Management Endpoints
- `GET /api/servers` - List servers
- `GET /api/servers/[id]` - Get server details
- `POST /api/servers` - Create server
- `PUT /api/servers/[id]` - Update server
- `DELETE /api/servers/[id]` - Delete server
- `GET /api/servers/map` - Get server map data
- `POST /api/servers/[id]/protocols` - Add protocol to server
- `GET /api/servers/[id]/protocols` - List server protocols
- `DELETE /api/servers/[id]/protocols/[protocolId]` - Remove protocol

### VPN Account Endpoints
- `GET /api/vpn-accounts` - List VPN accounts
- `GET /api/vpn-accounts/[id]` - Get VPN account details
- `POST /api/vpn-accounts/create` - Create VPN account
- `POST /api/vpn-accounts/bulk` - Bulk create accounts
- `POST /api/vpn-accounts/provision` - Provision VPN account
- `DELETE /api/vpn-accounts/[id]` - Delete VPN account

### Customer Management Endpoints
- `GET /api/customers` - List customers
- `GET /api/customers/[id]` - Get customer details
- `POST /api/customers` - Create customer
- `PUT /api/customers/[id]` - Update customer
- `DELETE /api/customers/[id]` - Delete customer

### Reseller Management Endpoints
- `GET /api/resellers` - List resellers
- `GET /api/resellers/[id]` - Get reseller details
- `POST /api/resellers` - Create reseller
- `PUT /api/resellers/[id]` - Update reseller
- `DELETE /api/resellers/[id]` - Delete reseller

### Package Management Endpoints
- `GET /api/packages` - List packages
- `GET /api/packages/[id]` - Get package details
- `POST /api/packages` - Create package
- `PUT /api/packages/[id]` - Update package
- `DELETE /api/packages/[id]` - Delete package

### Subscription Endpoints
- `GET /api/subscriptions` - List subscriptions
- `GET /api/subscriptions/[id]` - Get subscription details
- `POST /api/subscriptions` - Create subscription
- `PUT /api/subscriptions/[id]` - Update subscription
- `DELETE /api/subscriptions/[id]` - Delete subscription

### Payment Endpoints
- `GET /api/payments` - List payments
- `GET /api/payments/[id]` - Get payment details
- `POST /api/payments/[id]/approve` - Approve payment
- `POST /api/payments/[id]/reject` - Reject payment
- `POST /api/payments/create-gateway` - Create payment gateway
- `POST /api/payments/payout` - Process payout
- `POST /api/payments/webhook/[provider]` - Payment webhook

### Transaction Endpoints
- `GET /api/transactions` - List transactions
- `GET /api/transactions/[id]` - Get transaction details

### Protocol Management Endpoints
- `GET /api/protocols` - List protocols
- `POST /api/protocols` - Create protocol
- `PUT /api/protocols/[id]` - Update protocol
- `DELETE /api/protocols/[id]` - Delete protocol

### User Management Endpoints
- `GET /api/users` - List users
- `GET /api/users/[id]` - Get user details
- `PUT /api/users/[id]` - Update user
- `DELETE /api/users/[id]` - Delete user
- `POST /api/users/[id]/reset-password` - Reset password

### RBAC Endpoints
- `GET /api/rbac/permissions` - List all permissions
- `GET /api/rbac/roles` - List roles
- `GET /api/rbac/roles/[id]` - Get role details
- `PUT /api/rbac/roles/[id]` - Update role permissions

### AI Agent Endpoints
- `GET /api/ai/overview` - AI overview
- `GET /api/ai/providers` - List AI providers
- `GET /api/ai/providers/[id]` - Get provider details
- `POST /api/ai/providers/[id]/test` - Test provider connection
- `GET /api/ai/providers/fetch-models` - Fetch available models
- `GET /api/ai/models` - List AI models
- `GET /api/ai/models/[id]` - Get model details
- `GET /api/ai/config` - Get AI configuration
- `POST /api/ai/config` - Update AI configuration
- `GET /api/ai/prompts` - List prompts
- `GET /api/ai/prompts/[id]` - Get prompt details
- `POST /api/ai/prompts` - Create prompt
- `GET /api/ai/agent` - Get AI agent config
- `POST /api/ai/agent` - Update AI agent config
- `GET /api/ai/agent/execute` - Execute AI agent tool
- `GET /api/ai/knowledge-base` - List knowledge base documents
- `GET /api/ai/knowledge-base/[id]` - Get document details
- `GET /api/ai/conversations` - List conversations
- `GET /api/ai/conversations/[id]` - Get conversation details
- `GET /api/ai/conversations/[id]/messages` - Get conversation messages
- `POST /api/ai/conversations/[id]/handover` - Handover to human
- `GET /api/ai/conversations/[id]/suggest` - Get AI suggestions

### Chat Endpoints
- `GET /api/chat` - List chat conversations
- `POST /api/chat` - Create new chat
- `GET /api/chat/[id]` - Get chat details
- `POST /api/chat/[id]/messages` - Send message

### WhatsApp Endpoints
- `GET /api/whatsapp/integration` - Get integration config
- `POST /api/whatsapp/integration` - Update integration config
- `POST /api/whatsapp/integration/connect` - Connect WhatsApp
- `POST /api/whatsapp/integration/confirm-pair` - Confirm pairing
- `GET /api/whatsapp/contacts` - List contacts
- `GET /api/whatsapp/conversations` - List conversations
- `GET /api/whatsapp/conversations/[id]/messages` - Get messages
- `POST /api/whatsapp/conversations/[id]/messages` - Send message
- `GET /api/whatsapp/templates` - List templates
- `POST /api/whatsapp/templates` - Create template
- `GET /api/whatsapp/quick-replies` - List quick replies
- `POST /api/whatsapp/quick-replies` - Create quick reply
- `GET /api/whatsapp/broadcasts` - List broadcasts
- `POST /api/whatsapp/broadcasts` - Create broadcast

### Telegram Endpoints
- `GET /api/telegram/config` - Get config
- `POST /api/telegram/config` - Update config
- `POST /api/telegram/test` - Test connection

### Monitoring Endpoints
- `GET /api/monitoring` - Get system metrics
- `GET /api/monitoring/server/[id]` - Get server metrics
- `GET /api/monitoring/server/[id]/jobs` - Get server jobs
- `GET /api/monitoring/server/[id]/protocols` - Get server protocols
- `GET /api/monitoring/server/[id]/firewall` - Get firewall rules

### Job Queue Endpoints
- `GET /api/jobs` - List jobs
- `GET /api/jobs/[id]` - Get job details
- `POST /api/jobs/[id]/cancel` - Cancel job

### Email Log Endpoints
- `GET /api/email-logs` - List email logs
- `GET /api/email-logs/[id]` - Get email log details

### Notification Endpoints
- `GET /api/notifications` - List notifications
- `POST /api/notifications/[id]/read` - Mark as read

### Settings Endpoints
- `GET /api/settings/system` - Get system settings
- `POST /api/settings/system` - Update system settings
- `GET /api/settings/providers` - Get AI providers
- `POST /api/settings/providers` - Add AI provider
- `GET /api/settings/providers/[id]/test` - Test provider

### Dashboard Endpoints
- `GET /api/dashboard` - Get dashboard data

### Portal Endpoints (Customer/Reseller)
- `GET /api/portal/customer/dashboard` - Customer dashboard
- `GET /api/portal/customer/servers` - Customer servers
- `GET /api/portal/customer/packages` - Customer packages
- `GET /api/portal/customer/my-accounts` - Customer VPN accounts
- `GET /api/portal/customer/my-transactions` - Customer transactions
- `GET /api/portal/customer/buy` - Customer buy package
- `POST /api/portal/customer/buy` - Process purchase
- `GET /api/portal/reseller/dashboard` - Reseller dashboard
- `GET /api/portal/reseller/my-customers` - Reseller customers
- `POST /api/portal/reseller/create-account` - Create customer account
- `GET /api/portal/reseller/commissions` - Reseller commissions
- `GET /api/portal/reseller/ledger` - Reseller ledger
- `POST /api/portal/reseller/topup` - Reseller topup
- `GET /api/portal/reseller/my-accounts` - Reseller VPN accounts

### API Key Endpoints
- `GET /api/api-keys` - List API keys
- `POST /api/api-keys` - Create API key
- `GET /api/api-keys/[id]` - Get API key details
- `DELETE /api/api-keys/[id]` - Revoke API key

### Audit Log Endpoints
- `GET /api/audit-logs` - List audit logs
- `GET /api/audit-logs/[id]` - Get audit log details

### Server Agent Endpoints
- `GET /api/servers/[id]/agent` - Get agent status
- `POST /api/servers/[id]/agent` - Register agent
- `POST /api/servers/[id]/agent/heartbeat` - Send heartbeat
- `POST /api/servers/[id]/agent/command` - Send command

### Security Endpoints
- `POST /api/security/otp/request` - Request OTP
- `POST /api/security/otp/verify` - Verify OTP
- `POST /api/security/change-password` - Change password

### Payment Gateway Endpoints
- `POST /api/payments/create-gateway` - Create payment gateway
- `POST /api/payments/payout` - Process payout

### Webhook Endpoints
- `POST /api/payments/webhook/[provider]` - Payment webhook handler

## Component Inventory

### UI Components (shadcn/ui)
- Accordion, Alert, Alert Dialog
- Avatar, Badge, Breadcrumb
- Button, Calendar, Card
- Carousel, Chart, Checkbox
- Collapsible, Command, Context Menu
- Dialog, Drawer, Dropdown Menu
- Form, Hover Card, Input
- Input OTP, Label, Menubar
- Navigation Menu, Pagination, Popover
- Progress, Radio Group, Resizable
- Scroll Area, Select, Separator
- Sheet, Skeleton, Slider
- Switch, Tabs, Toggle, Toggle Group
- Toast, Tooltip

### Feature Components
- **Admin Views**:
  - DashboardView
  - ServersView
  - ServerDetailView
  - ProtocolsView
  - VpnAccountsView
  - CustomersView
  - ResellersView
  - PackagesView
  - TransactionsView
  - PaymentsView
  - MonitoringView
  - AuditLogsView
  - SettingsView
  - UsersView
  - AI Center views
  - WhatsApp views
  - Email Log View

- **Portal Views**:
  - CustomerPortal
  - ResellerPortal
  - Customer Dashboard
  - Customer Accounts
  - Customer Packages
  - Customer Transactions
  - Reseller Dashboard
  - Reseller Customers
  - Reseller Create Account
  - Reseller Commissions
  - Reseller Ledger
  - Reseller Topup

- **AI Components**:
  - AIAgentView
  - AICenterView
  - KnowledgeBaseView
  - PromptManagementView
  - AdminLiveChat

- **WhatsApp Components**:
  - WhatsappIntegration
  - WhatsappLiveChat
  - WhatsappBroadcast
  - WhatsappTemplates

- **Common Components**:
  - AppShell
  - LoginView
  - NotificationsPanel
  - ThemeToggle
  - CurrencySwitcher
  - StatCard
  - StatusBadge
  - PageHeader

## Script Inventory

### Utility Scripts
- `check-andi.js` - Check andi (AI) integration
- `check-pkg-protocols.js` - Check package protocols
- `check-wa.js` - Check WhatsApp integration
- `db-check.js` - Database check
- `find-customer.js` - Find customer by data
- `find-customer-pass.js` - Find customer with password
- `find-customer-with-accounts.js` - Find customer with accounts
- `find-sa.js` - Find super admin
- `test-delete.js` - Test delete functionality
- `test-enterprise-settings.js` - Test enterprise settings
- `test-provision.js` - Test VPN provisioning
- `test-vpn-delete.js` - Test VPN account deletion
- `test-wa-payment.js` - Test WhatsApp payment
- `verify-dropdown.js` - Verify dropdown functionality
- `verify-dropdown-v2.js` - Verify dropdown v2
- `verify-dropdown-v3.js` - Verify dropdown v3

### Deployment Scripts
- `deploy/backup.sh` - Database backup
- `deploy/health-check.sh` - Health check
- `deploy/install.sh` - Installation script
- `deploy/migrate.sh` - Database migration
- `deploy/rollback.sh` - Rollback script
- `deploy/setup-firewall.sh` - Firewall setup
- `deploy/setup-nginx.sh` - Nginx configuration
- `deploy/setup-systemd.sh` - Systemd service setup
- `deploy/audit.sh` - Audit script
- `deploy/build.sh` - Build script

### Docker Scripts
- `docker/backup-cron` - Cron backup configuration
- `docker/docker-compose.yml` - Docker compose configuration
- `docker/shared-production.env.example` - Shared environment variables

### Cron Jobs
- `deploy/docker/backup-cron` - Backup cron job

## Configuration Files Inventory

### Build Configuration
- `next.config.ts` - Next.js configuration
- `tailwind.config.ts` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.mjs` - ESLint configuration
- `postcss.config.mjs` - PostCSS configuration
- `components.json` - shadcn/ui configuration

### Database Configuration
- `prisma/schema.prisma` - SQLite schema (sandbox)
- `prisma/schema.postgres.prisma` - PostgreSQL schema (production)
- `prisma/schema.prisma.20261106-114711.bak` - Database backup

### Deployment Configuration
- `Dockerfile` - Multi-stage Docker build
- `docker/redis/redis.conf` - Redis configuration
- `docker/postgres/init.sql` - PostgreSQL initialization
- `nginx/mvmp.conf` - Nginx configuration
- `systemd/mvmp-*.service` - Systemd services

### Environment Configuration
- `.env.production.example` - Production environment template
- `docker/docker-compose.env.example` - Docker compose environment
- `deploy/docker/shared-production.env.example` - Shared environment

## Documentation Inventory

### Project Documentation
- `README.md` (assumed) - Project documentation
- `docs/project-analysis/` - This audit documentation

### Deployment Documentation
- `deploy/` - Deployment scripts and configurations
- `deploy/README.md` (assumed) - Deployment guide

## Testing Inventory

### Manual Test Scripts
- `scripts/test-*.js` - Various manual test scripts
- `scripts/verify-*.js` - Verification scripts

## Asset Inventory

### Static Assets
- `public/` - Static files (logo.svg, etc.)

### Documentation Screenshots
- `deploy/_verify-screenshots/` - UI verification screenshots
- `deploy/_verify-screenshots/verification-report*.json` - Verification reports

## Summary Statistics

### Code Statistics
- **Total Files**: ~200+ files
- **Source Code Files**: ~100+ files
- **API Endpoints**: ~120+ endpoints
- **Database Models**: 64 models
- **UI Components**: 50+ components
- **Libraries**: 40+ npm packages
- **Configuration Files**: 20+ files

### Lines of Code (Estimated)
- **Frontend**: ~15,000+ lines
- **Backend/API**: ~8,000+ lines
- **Libraries**: ~10,000+ lines
- **Configuration**: ~2,000+ lines
- **Total**: ~35,000+ lines

### Project Size
- **Node Modules**: ~500MB (not included)
- **Docker Image**: ~1.5GB (estimated)
- **Database**: ~10MB (empty), ~100MB+ (production)

---

**Last Updated**: 2026-11-07
**Audit Scope**: Complete project inventory
**Status**: Inventory complete
