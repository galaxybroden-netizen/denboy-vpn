# Denboy VPN

Multi-server VPN management panel built with Next.js, PostgreSQL, and Redis.

## Overview

Denboy VPN is a comprehensive VPN management system that allows administrators to:

- Manage multiple VPN servers across different protocols
- Create and manage customer accounts
- Handle reseller hierarchies with commission tracking
- Process payments and manage subscriptions
- Provision VPN accounts automatically based on purchased packages
- Monitor server health and usage metrics
- Integrate with AI assistants for operational support
- Support real-time communication via WebSocket

## Technology Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui components |
| Backend | Next.js API Routes |
| Database | PostgreSQL with Prisma ORM |
| Cache/Queue | Redis with BullMQ |
| Realtime | Socket.IO |
| Authentication | Session-based with bcrypt password hashing |
| Containerization | Docker, Docker Compose |
| Reverse Proxy | Nginx or Caddy |

## Prerequisites

- Node.js 18+ or Bun runtime
- PostgreSQL 16+
- Redis 7+
- npm or bun package manager

## Project Structure

```
.
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API endpoints
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Landing page
│   │   └── ...                # Other pages
│   ├── components/            # React components
│   │   ├── mvmp/              # MVMP-specific components
│   │   └── ui/                # Shared UI components
│   ├── lib/                   # Utility libraries
│   │   ├── auth.ts            # Authentication helpers
│   │   ├── db.ts              # Prisma client
│   │   ├── crypto.ts          # Encryption utilities
│   │   └── ...
│   └── ...
├── prisma/
│   ├── schema.prisma          # Primary database schema
│   └── schema.postgres.prisma # PostgreSQL-specific schema
├── deploy/
│   ├── docker/               # Docker deployment configs
│   ├── nginx/                # Nginx configuration
│   └── systemd/              # Systemd service files
├── public/                   # Static assets
├── tests/                    # Test files
├── package.json              # Dependencies and scripts
├── bun.lock                  # Lockfile for Bun package manager
└── next.config.ts            # Next.js configuration
```

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/galaxybroden-netizen/denboy-vpn.git
cd denboy-vpn

# Install dependencies with Bun
bun install

# Or with npm
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your actual values
```

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `AI_ENCRYPTION_KEY` - 64-character hex key for encryption

### 3. Database Setup

```bash
# Generate Prisma client
bun run db:generate

# Push schema to database (development only)
bun run db:push

# Or run migrations
bun run db:migrate
```

### 4. Run Development Server

```bash
bun run dev
```

The application will be available at http://localhost:3000

## API Endpoints

The application provides a comprehensive REST API organized by domain:

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Dashboard & Monitoring
- `GET /api/dashboard` - Dashboard statistics
- `GET /api/monitoring` - Server monitoring data
- `GET /api/servers` - List VPN servers
- `GET /api/servers/[id]` - Server details

### User Management
- `GET /api/users` - List users (SUPER_ADMIN)
- `GET /api/users/[id]` - User details
- `PATCH /api/users/[id]` - Update user
- `DELETE /api/users/[id]` - Delete user
- `POST /api/security/change-password` - Change password
- `POST /api/security/otp/request` - Request OTP
- `POST /api/security/otp/verify` - Verify OTP

### Customers
- `GET /api/customers` - List customers
- `GET /api/customers/[id]` - Customer details
- `POST /api/customers` - Create customer

### Resellers
- `GET /api/resellers` - List resellers
- `GET /api/resellers/[id]` - Reseller details
- `POST /api/resellers` - Create reseller

### Portal (Customer/Reseller Self-Service)
- `GET /api/portal/customer/dashboard` - Customer dashboard
- `GET /api/portal/customer/my-accounts` - Customer's VPN accounts
- `GET /api/portal/reseller/dashboard` - Reseller dashboard
- `GET /api/portal/reseller/my-customers` - Reseller's customers

### VPN Accounts
- `GET /api/vpn-accounts` - List VPN accounts
- `POST /api/vpn-accounts/create` - Create VPN account
- `GET /api/vpn-accounts/[id]` - Account details
- `DELETE /api/vpn-accounts/bulk` - Bulk delete

### Packages & Subscriptions
- `GET /api/packages` - List packages
- `GET /api/packages/[id]` - Package details
- `GET /api/transactions` - List transactions
- `GET /api/transactions/[id]` - Transaction details

### Payments
- `GET /api/payments` - List payments
- `POST /api/payments/create-gateway` - Create payment gateway
- `POST /api/payments/webhook/[provider]` - Handle payment webhook
- `POST /api/payments/[id]/approve` - Approve payment
- `POST /api/payments/[id]/reject` - Reject payment

### Settings
- `GET /api/settings/system` - System settings
- `GET /api/settings/providers` - Provider settings
- `POST /api/settings/providers/test` - Test provider connection

### AI Center
- `GET /api/ai/overview` - AI usage overview
- `GET /api/ai/providers` - AI providers
- `POST /api/ai/providers` - Create provider
- `GET /api/ai/models` - AI models
- `GET /api/ai/conversations` - Chat conversations
- `GET /api/ai/knowledge-base` - Knowledge base

### WhatsApp Integration
- `GET /api/whatsapp/integration` - WhatsApp integration status
- `POST /api/whatsapp/integration/connect` - Connect WhatsApp
- `GET /api/whatsapp/conversations` - WhatsApp conversations

### RBAC (Role-Based Access Control)
- `GET /api/rbac/roles` - List roles
- `GET /api/rbac/permissions` - List permissions

### API Keys
- `GET /api/api-keys` - List API keys
- `POST /api/api-keys` - Create API key
- `DELETE /api/api-keys/[id]` - Delete API key

## Deployment

### Docker Deployment

```bash
# Copy environment file
cp deploy/docker/docker-compose.env.example .env
# Edit .env with real values

# Start all services
docker compose up -d

# View logs
docker compose logs -f
```

Services included:
- **postgres** - PostgreSQL 16 database
- **redis** - Redis 7 cache/queue
- **api** - Next.js application (port 3001)
- **worker** - BullMQ background worker
- **realtime** - Socket.IO gateway (port 3005)
- **backup** - Backup service (manual/cron)

### Native Deployment

See `docs/deployment/NATIVE_UBUNTU_INSTALLATION.md` for detailed instructions.

### Reverse Proxy

Configure Nginx or Caddy to proxy public traffic to the application:

- Nginx config: `deploy/nginx/mvmp.conf`
- Caddy config: `Caddyfile`

## Security Considerations

### Secrets Management

This project uses the following secrets that must be configured:
- Database password
- Redis password
- AI encryption key (for encrypting sensitive data at rest)
- Session secret (for signed cookies)
- SMTP credentials
- Payment gateway API keys
- Third-party service tokens

**Never commit secrets to version control.** Use environment variables or a secrets manager.

### Encryption

The application encrypts sensitive data at rest using AES-256-GCM:
- VPN credentials are encrypted in the database
- API keys are encrypted
- The `AI_ENCRYPTION_KEY` environment variable is required in production

### Authentication

- Passwords are hashed using bcrypt
- Sessions are stored in the database
- Role-based access control (RBAC) protects API endpoints
- OTP-based verification for sensitive operations

## License

This project is proprietary software. All rights reserved.

## Contributing

This is a personal/foundation project. Contributions are not accepted at this time.

## Support

For issues and questions, please contact the project maintainer.
