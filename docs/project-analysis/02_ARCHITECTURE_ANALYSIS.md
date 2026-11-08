# MVMP Architecture Analysis

## System Architecture Overview

MVMP follows a **monolithic application architecture** with **microservices-ready design patterns**. The application is built as a single Next.js codebase that serves both administrative and customer-facing portals, with clear separation between frontend, backend, and infrastructure layers.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Admin Panel │  │ Customer     │  │  Reseller Portal     │   │
│  │  (Browser)   │  │  Portal      │  │  (Browser)           │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
└─────────┼──────────────────┼──────────────────────┼──────────────┘
          │                  │                      │
          └──────────────────┼──────────────────────┘
                             │
          ┌──────────────────▼──────────────────┐
          │       Next.js Application           │
          │  ┌────────────────────────────────┐  │
          │  │    Presentation Layer           │  │
          │  │  - React Components             │  │
          │  │  - Next.js App Router           │  │
          │  │  - Server-Side Rendering        │  │
          │  └────────────┬───────────────────┘  │
          │               │                       │
          │  ┌────────────▼───────────────────┐  │
          │  │    API Layer (Next.js Routes)   │  │
          │  │  - API Routes                   │  │
          │  │  - Request Validation           │  │
          │  │  - Authentication               │  │
          │  │  - Authorization                 │  │
          │  └────────────┬───────────────────┘  │
          │               │                       │
          │  ┌────────────▼───────────────────┐  │
          │  │  Business Logic Layer          │  │
          │  │  - Services                     │  │
          │  │  - Business Rules               │  │
          │  │  - Provisioning                 │  │
          │  │  - Payment Processing           │  │
          │  └────────────┬───────────────────┘  │
          │               │                       │
          │  ┌────────────▼───────────────────┐  │
          │  │    Data Access Layer            │  │
          │  │  - Prisma ORM                   │  │
          │  │  - Database Queries             │  │
          │  │  - Transactions                 │  │
          │  └────────────┬───────────────────┘  │
          └───────────────┼───────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼─────┐   ┌───────▼──────┐   ┌──────▼───────┐
│ PostgreSQL  │   │   Redis      │   │  External    │
│   Database  │   │  (Cache/Queue)│   │  Services    │
└─────────────┘   └──────────────┘   └──────────────┘
```

## Layered Architecture

### 1. Presentation Layer

**Responsibility**: UI rendering, user interaction, routing

**Components**:
- Next.js App Router (`src/app/`)
- React Components (`src/components/`)
- Page-level components (Admin & Customer portals)
- Layout components (AppShell, LandingPage)
- Dynamic imports for code splitting

**Key Features**:
- Server-Side Rendering (SSR) for initial page load
- Client-Side Routing with Next.js
- Code splitting via dynamic imports
- Responsive design with Tailwind CSS
- Theme support (Light/Dark mode)

**Architecture Pattern**: **MVC with React Components**
- **Model**: Data fetched via API
- **View**: React components
- **Controller**: Next.js API routes

### 2. API Layer

**Responsibility**: HTTP request handling, authentication, authorization, routing

**Components**:
- Next.js API Routes (`src/app/api/`)
- Request validation
- Authentication middleware
- Authorization checks
- Response formatting

**Key Features**:
- RESTful API design
- Route parameter handling (`[id]`, `[protocolId]`)
- Query parameter parsing
- Error handling with standardized responses
- Audit logging integration

**Architecture Pattern**: **Layered Controller Pattern**
- Request → Validation → Auth → Business Logic → Database → Response

### 3. Business Logic Layer

**Responsibility**: Core business rules, domain logic, workflows

**Components**:
- Service functions (`src/lib/*.ts`)
- Provisioning logic (`provisioner.ts`)
- Payment processing
- Email handling
- AI integration logic
- WhatsApp integration logic

**Key Features**:
- Encapsulated business logic
- Reusable functions
- Transaction management
- Error handling
- Logging

**Architecture Pattern**: **Service Layer Pattern**

### 4. Data Access Layer

**Responsibility**: Database operations, ORM abstraction, query building

**Components**:
- Prisma ORM (`src/lib/db.ts`)
- Database migrations
- Schema definitions
- Query optimization

**Key Features**:
- Type-safe database queries
- Automatic migrations
- Connection pooling
- Transaction support

**Architecture Pattern**: **ORM Pattern**

## Domain Architecture

### Core Domains

#### 1. Authentication & Authorization Domain
**Models**: User, Session, Role, Permission, UserPermission, RolePermission, ApiKey, OtpCode, UserDevice

**Key Components**:
- Session-based authentication (not NextAuth)
- Role-Based Access Control (RBAC)
- Multi-Factor Authentication (MFA) support
- API key management
- OTP for sensitive actions

**Architecture Pattern**: **RBAC with Custom Session Management**

**Flow**:
```
1. User submits credentials
2. Password verification (bcryptjs)
3. Session creation with token
4. Session cookie set (httpOnly, secure)
5. Session stored in database
6. User authenticated, can proceed
```

#### 2. VPN Management Domain
**Models**: Server, ServerGroup, Protocol, ServerProtocol, ServerPort, FirewallRule, VpnAccount, VpnCredential, VpnUsage, Job, JobLog

**Key Components**:
- Server provisioning and monitoring
- Protocol installation and management
- Vpn account creation and management
- Job queue for background tasks
- Real-time status updates

**Architecture Pattern**: **Event-Driven with Job Queue**

**Provisioning Flow**:
```
1. Customer purchases package
2. Payment approved
3. Provisioning job created (BullMQ)
4. Job processed by worker
5. Server agent installed (if needed)
6. Protocol installed (if needed)
7. Vpn account created
8. Credentials generated
9. Email sent to customer
10. Status broadcast via Socket.io
```

#### 3. Customer & Reseller Domain
**Models**: Customer, Reseller, ResellerLedger, ResellerCommission, Subscription, Transaction, Payment

**Key Components**:
- Hierarchical reseller structure
- Customer management
- Subscription management
- Payment processing
- Commission calculation

**Architecture Pattern**: **Hierarchical Organization**

**Reseller Hierarchy**:
```
SUPER_ADMIN
    └── Reseller A
            ├── Reseller B
            │       └── Reseller C
            └── Reseller D
```

#### 4. Payment Domain
**Models**: Transaction, Payment, ManualPaymentProof, Invoice, PaymentGateway

**Key Components**:
- Multiple payment gateway support (Xendit, Midtrans, Doku, Ipaymu)
- QRIS support
- Virtual account integration
- Manual payment verification
- Payment proof upload
- Webhook handling

**Architecture Pattern**: **Gateway Pattern**

#### 5. AI Center Domain
**Models**: AIProvider, AIModel, AICredential, AIConfiguration, AIUsage, AIAgent, AIAgentTool, AIExecution, AIKnowledgeDocument, AIKnowledgeChunk, AIPrompt, AIPromptVersion, ChatConversation, ChatMessage, ChatAssignment, ChatSuggestedReply, ChatAuditLog

**Key Components**:
- Multi-provider AI support (OpenAI, Anthropic, Gemini, Ollama)
- Knowledge base (RAG)
- Prompt management
- Chatbot and AI agent
- Conversation management
- Tool integration

**Architecture Pattern**: **Strategy Pattern** (for multiple AI providers)

#### 6. Communication Domain
**Models**: WhatsappIntegration, WhatsappContact, WhatsappConversation, WhatsappMessage, WhatsappTemplate, WhatsappBroadcast, WhatsappBroadcastRecipient, WhatsappQuickReply, TelegramIntegration

**Key Components**:
- WhatsApp integration (3 providers: Meta Cloud, Baileys, API)
- Telegram integration
- Message templates
- Broadcast messaging
- Quick replies
- Contact synchronization

**Architecture Pattern**: **Adapter Pattern** (for multiple providers)

#### 7. Monitoring & Logging Domain
**Models**: ServerMetric, Job, JobLog, AuditLog, Notification, EmailLog

**Key Components**:
- Server metrics collection
- Job queue monitoring
- Audit logging
- Notification system
- Email logging

**Architecture Pattern**: **Observer Pattern** (real-time updates)

## Infrastructure Architecture

### Containerization Strategy

**Multi-Stage Docker Build**:

```dockerfile
Stage 1: deps
  - Install all dependencies (including devDeps)
  - Cache node_modules

Stage 2: build
  - Copy dependencies
  - Copy source code
  - Generate Prisma client
  - Build Next.js (standalone output)
  - Install production dependencies

Stage 3: runtime
  - Copy build artifacts
  - Copy worker and realtime service
  - Copy Prisma schema
  - Run as non-root user (uid 1001)
```

### Service Architecture

**Docker Compose Services**:

1. **postgres** (PostgreSQL 16)
   - Database storage
   - Persistent volume
   - Health checks
   - Resource limits

2. **redis** (Redis 7)
   - Cache storage
   - Job queue backend
   - Rate limiting
   - Persistent volume

3. **api** (Next.js standalone)
   - Main application
   - Port 3000 (internal)
   - Health checks
   - Resource limits

4. **worker** (BullMQ worker)
   - Background job processing
   - No public port
   - Health checks

5. **realtime** (Socket.io gateway)
   - Real-time communication
   - Ports 3003 (socket) + 3004 (emit)
   - Health checks

6. **backup** (PostgreSQL backup)
   - Scheduled backups
   - Profile: backup (explicitly invoked)

### Networking

**Docker Networks**:
- **mvmp-net**: Bridge network
  - Internal networking between services
  - No outbound internet access (except for AI provider calls)

**Service Communication**:
- All services communicate via internal network
- No service is exposed to public internet
- External access via Nginx/Caddy reverse proxy

### Data Persistence

**Volumes**:
- **mvmp-pgdata**: PostgreSQL data
- **mvmp-redis-data**: Redis data
- **mvmp-backups**: Backup artifacts

**Backup Strategy**:
- pg_dump for database backups
- Scheduled backups via cron
- Retention policy (30 days)
- Backup artifacts stored in persistent volume

## Real-Time Architecture

### Socket.io Architecture

**Services**:
1. **Realtime Service** (`mini-services/realtime-service/`)
   - Socket.io server (port 3003)
   - Internal emit endpoint (port 3004)
   - Broadcast functionality

2. **Client Integration** (`src/components/mvmp/RealtimeBridge.tsx`)
   - Socket.io client connection
   - Real-time event handling
   - State management

**Event Flow**:
```
Client → Socket.io → Realtime Service → Broadcast → All Clients
```

**Real-time Events**:
- `realtime:hello` - Connection confirmation
- `vpn:account_created` - New account created
- `vpn:account_status_changed` - Account status updated
- `payment:verified` - Payment verified
- `email:new` - New email sent
- `notification:new` - New notification
- `server:metrics_update` - Server metrics updated

## Job Queue Architecture

### BullMQ Integration

**Queue Configuration**:
- **Queue Name**: `vpn-provisioning`
- **Job Type**: VPN account provisioning
- **Priority**: Configurable per job
- **Retries**: Configurable
- **Timeout**: Configurable

**Job Processing**:
1. Job added to queue by API
2. Worker picks up job from Redis
3. Job processed asynchronously
4. Result stored in database
5. Status broadcast via Socket.io

**Job Types**:
- VPN account provisioning
- Protocol installation
- Server agent registration
- Email sending
- Backup operations

## Security Architecture

### Authentication Flow

```
1. User submits login form
2. Server validates credentials
3. Password hashed with bcryptjs
4. Session created with unique token
5. Session stored in database
6. Session cookie set (httpOnly, secure, sameSite=lax)
7. User authenticated, redirected to dashboard
8. All subsequent requests include session cookie
9. Server validates session on each request
10. Session expires after 24 hours
```

### Authorization Flow

```
1. User makes request
2. Session validated
3. User permissions fetched (cached for 10s)
4. Permission check performed
5. If authorized → proceed
6. If not authorized → return 403
```

### Data Protection

**Encryption**:
- API keys: AES-256-GCM encryption
- Passwords: bcryptjs hashing (salt rounds: 10)
- Sessions: Not encrypted (stored in database)
- Sensitive data: Redacted in logs

**Rate Limiting**:
- In-memory token bucket (Redis-ready)
- Per-user/IP rate limits
- Configurable per endpoint
- Retry-after header

**SSRF Protection**:
- Validates provider URLs
- Blocks private IPs
- Blocks cloud metadata endpoints
- DNS resolution validation

## Data Flow Architecture

### User Registration Flow

```
1. User submits registration form
2. Server validates input
3. Password hashed with bcryptjs
4. User created in database
5. Email verification sent
6. User created with CUSTOMER role
7. Account created in Customer table
8. Welcome email sent
9. User redirected to login
```

### Payment Processing Flow

```
1. Customer selects package
2. Customer clicks "Beli" button
3. Server validates selection
4. Payment gateway initialized (Xendit/Midtrans/etc.)
5. Customer redirected to payment page
6. Customer completes payment
7. Payment gateway webhook received
8. Webhook validates signature
9. Transaction created in database
10. Payment status updated
11. If approved → auto-provision VPN account
12. Provisioning job added to queue
13. Email receipt sent
14. Status broadcast to admin
```

### VPN Provisioning Flow

```
1. Provisioning job added to queue
2. Worker picks up job
3. Validates inputs (customer, package, server, protocol)
4. Checks server status (must be ONLINE)
5. Checks protocol status (must be RUNNING)
6. Generates sequential username (mvmp-00001, mvmp-00002, etc.)
7. Creates Subscription record
8. Creates VpnAccount record
9. Generates credentials (UUID-based)
10. Creates VpnCredential record
11. Sends welcome email to customer
12. Broadcasts status via Socket.io
13. Job marked as completed
14. Returns result to caller
```

## Scalability Architecture

### Horizontal Scaling

**API Service**:
- Stateless design enables horizontal scaling
- Multiple API instances can run
- Load balancing via Nginx
- Redis for session sharing (recommended)

**Worker Service**:
- Stateless job processing
- Multiple workers can process jobs in parallel
- Redis queue ensures job fairness

**Database**:
- Read replicas possible
- Connection pooling via Prisma
- Query optimization with indexes

### Vertical Scaling

**Resource Limits** (Docker Compose):
- PostgreSQL: 1GB memory
- Redis: 256MB memory
- API: 1GB memory
- Worker: 512MB memory
- Realtime: 256MB memory

### Caching Strategy

**Current Implementation**:
- Permission cache (10-second TTL)
- No application-level caching (Redis-ready)

**Recommended Enhancements**:
- Redis for session storage
- Redis for rate limiting
- Redis for frequently accessed data
- CDN for static assets

## Event-Driven Architecture

### Event Sources

1. **Database Events**:
   - Triggers for audit logging
   - Real-time updates via polling or Socket.io

2. **Job Events**:
   - Job completed
   - Job failed
   - Job cancelled

3. **External Events**:
   - Payment webhook
   - WhatsApp message received
   - Telegram webhook

### Event Consumers

1. **Socket.io**:
   - Broadcast updates to clients
   - Real-time notifications

2. **Email Service**:
   - Send emails on events
   - Log email status

3. **Notification System**:
   - Create notifications
   - Store in database

4. **Audit Logging**:
   - Log all actions
   - Store in database

## Deployment Architecture

### Development Environment

**Configuration**:
- SQLite database (sandbox)
- In-memory rate limiting
- Mock email service
- Mock WhatsApp service
- Hot reload with Turbopack

**Port Configuration**:
- Next.js: 3000
- Socket.io: 3003 (via Caddy)

### Production Environment

**Configuration**:
- PostgreSQL 16 database
- Redis 7 cache/queue
- SMTP email service
- Real WhatsApp integration
- Docker containerization
- Nginx reverse proxy

**Port Configuration**:
- Nginx/Caddy: 80/443 (public)
- Next.js API: 3000 (internal)
- Socket.io: 3003 (internal)

**Security**:
- Non-root user in containers
- HTTP-only, secure cookies
- Database credentials in environment variables
- Encrypted API keys

## Key Architectural Decisions

### 1. Monolithic vs Microservices

**Decision**: Monolithic with microservices-ready design

**Rationale**:
- Faster development and deployment
- Easier debugging and testing
- Shared codebase for common functionality
- Microservices can be extracted later if needed

**Benefits**:
- Reduced complexity
- Better performance (no network overhead)
- Easier data consistency
- Simpler deployment

**Trade-offs**:
- Single point of failure (application level)
- Harder to scale individual components
- Code sharing via shared libraries

### 2. Session-Based Authentication

**Decision**: Custom session-based authentication (not NextAuth)

**Rationale**:
- Full control over session management
- Easy integration with RBAC system
- Better audit logging
- No external dependency

**Benefits**:
- Simple implementation
- Full control over session lifecycle
- Easy to extend with MFA
- No dependency on external auth providers

**Trade-offs**:
- Need to manage session expiration
- Session storage in database (not in-memory)
- No OAuth support out of the box

### 3. Prisma ORM

**Decision**: Use Prisma ORM

**Rationale**:
- Type-safe database access
- Automatic migrations
- Excellent developer experience
- Good performance
- Community support

**Benefits**:
- Reduced boilerplate code
- Type safety at compile time
- Automatic schema generation
- Easy to learn

**Trade-offs**:
- Less flexible than raw SQL
- Can't use some advanced SQL features
- Additional abstraction layer

### 4. BullMQ Job Queue

**Decision**: Use BullMQ for background jobs

**Rationale**:
- Built on Redis (already used for caching)
- Battle-tested queue implementation
- Support for priorities, retries, delays
- Excellent TypeScript support

**Benefits**:
- Asynchronous processing
- Reliable job execution
- Configurable retries
- Priority queue support

**Trade-offs**:
- Requires Redis
- Additional infrastructure component
- Learning curve for queue management

### 5. Socket.io for Real-Time

**Decision**: Use Socket.io for real-time communication

**Rationale**:
- Built on top of WebSocket
- Automatic reconnection
- Room-based messaging
- Cross-browser compatibility
- Built-in error handling

**Benefits**:
- Reliable real-time updates
- Easy to implement
- Low latency
- Good developer experience

**Trade-offs**:
- Additional service to maintain
- More complex than polling
- Requires WebSocket support on reverse proxy

### 6. shadcn/ui + Radix UI

**Decision**: Use shadcn/ui components with Radix UI primitives

**Rationale**:
- Accessible out of the box
- Highly customizable
- Modern design system
- Good documentation

**Benefits**:
- Consistent UI across application
- Accessible components
- Easy to customize
- Future-proof

**Trade-offs**:
- Requires Tailwind CSS
- Additional dependencies
- Learning curve for component composition

## Architecture Strengths

### 1. Separation of Concerns
- Clear separation between layers (presentation, API, business, data)
- Domain-driven design principles
- Reusable libraries and utilities

### 2. Type Safety
- Full TypeScript coverage
- Prisma generates type-safe queries
- Strong typing for API contracts

### 3. Security
- Comprehensive RBAC
- Encrypted sensitive data
- SSRF protection
- Rate limiting
- Audit logging

### 4. Scalability
- Stateless API design
- Horizontal scaling support
- Job queue for async operations
- Database indexing

### 5. Maintainability
- Clear code organization
- Comprehensive documentation
- Consistent naming conventions
- Modular design

### 6. Developer Experience
- Hot reload
- Type safety
- Good tooling (Prisma, Bun, ESLint)
- Clear error messages

## Architecture Weaknesses

### 1. Testing Coverage
- No unit tests visible
- No integration tests
- Only manual test scripts
- Risk of regression bugs

### 2. Caching Layer
- No application-level caching
- Permission cache is minimal
- Redis not utilized for caching
- Potential performance issues at scale

### 3. API Documentation
- No OpenAPI/Swagger documentation
- No API endpoint documentation
- Hard for external developers to integrate

### 4. Error Handling
- Error handling could be more consistent
- No centralized error handling middleware
- Some errors may not be properly caught

### 5. Configuration Management
- Environment variables scattered
- No centralized configuration management
- Hard to manage different environments

### 6. Monitoring & Observability
- No centralized logging
- No metrics collection
- No distributed tracing
- Hard to debug production issues

## Recommendations

### High Priority

1. **Add Comprehensive Testing**
   - Unit tests for critical business logic
   - Integration tests for API endpoints
   - E2E tests for critical user flows
   - Target: 70%+ code coverage

2. **Implement Redis Caching**
   - Cache frequently accessed data
   - Cache user permissions
   - Cache AI provider responses
   - Cache server metrics

3. **Add API Documentation**
   - OpenAPI/Swagger specification
   - Interactive API documentation
   - Example requests/responses

4. **Centralize Error Handling**
   - Custom error classes
   - Centralized error handling middleware
   - Standardized error responses
   - Error logging and monitoring

### Medium Priority

5. **Implement Observability**
   - Structured logging (JSON)
   - Metrics collection (Prometheus/Grafana)
   - Distributed tracing (Jaeger/Zipkin)
   - Error tracking (Sentry)

6. **Add API Rate Limiting**
   - Redis-based rate limiting
   - Per-user and per-IP limits
   - Configurable rate limits
   - Rate limit headers

7. **Improve Database Performance**
   - Add database indexes
   - Optimize slow queries
   - Implement read replicas
   - Add connection pooling

8. **Add API Versioning**
   - Version API endpoints
   - Support multiple versions
   - Deprecation strategy

### Low Priority

9. **Implement API Versioning**
   - Version API endpoints
   - Support multiple versions
   - Deprecation strategy

10. **Add API Documentation**
    - OpenAPI/Swagger specification
    - Interactive API documentation
    - Example requests/responses

11. **Implement Caching Strategy**
    - Cache frequently accessed data
    - Cache user permissions
    - Cache AI provider responses
    - Cache server metrics

12. **Add Comprehensive Logging**
    - Structured logging
    - Log aggregation
    - Log analysis tools

---

**Last Updated**: 2026-11-07
**Audit Scope**: Complete architecture analysis
**Status**: Analysis complete
