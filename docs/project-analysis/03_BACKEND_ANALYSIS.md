# MVMP Backend Analysis

## Overview

Backend architecture of MVMP is built on **Next.js 16.1.1 API Routes** with TypeScript, providing a RESTful API with comprehensive business logic, authentication, authorization, and database operations.

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js API Routes | 16.1.1 | Backend API endpoints |
| TypeScript | 5.0.0 | Type safety |
| Prisma ORM | 6.11.1 | Database operations |
| bcryptjs | 3.0.3 | Password hashing |
| Socket.io | 4.8.4 | Real-time communication |
| BullMQ | 6.7.1 | Job queue processing |
| ioredis | 6.0.0 | Redis client |

## API Structure

### Directory Structure

```
src/app/api/
├── ai/                      # AI Agent endpoints
├── api-keys/                # API Key management
├── audit-logs/              # Audit logging
├── auth/                    # Authentication
├── chat/                    # Chat endpoints
├── customers/               # Customer management
├── dashboard/               # Dashboard data
├── email-logs/              # Email logs
├── jobs/                    # Job queue management
├── monitoring/              # Monitoring endpoints
├── notifications/           # Notifications
├── packages/                # Package management
├── payments/                # Payment processing
├── portal/                  # Portal endpoints (customer/reseller)
├── protocols/               # Protocol management
├── rbac/                    # RBAC endpoints
├── resellers/               # Reseller management
├── servers/                 # Server management
├── settings/                # Settings endpoints
├── simulator/               # Simulator endpoints
├── telegram/                # Telegram integration
├── transactions/            # Transaction endpoints
├── users/                   # User management
└── vpn-accounts/            # VPN account management
```

### Total API Endpoints: ~120 endpoints

## Authentication System

### Login Flow

**Endpoint**: `POST /api/auth/login`

**Implementation**:
```typescript
// 1. Validate input (email, password required)
// 2. Find user by email
// 3. Check user status (must be ACTIVE)
// 4. Verify password with bcryptjs
// 5. Create session with token
// 6. Update user's lastLoginAt
// 7. Audit log the login
// 8. Set session cookie (httpOnly, secure)
// 9. Return user data
```

**Security Measures**:
- ✅ Input validation
- ✅ Password hashing (bcryptjs)
- ✅ Account status check
- ✅ Session management
- ✅ Audit logging
- ✅ IP address tracking
- ✅ User agent logging

**Code Example**:
```typescript
export async function POST(req: NextRequest) {
  // Validate input
  const { email, password } = await req.json();

  // Find user
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() }
  });

  // Verify password
  const valid = await verifyPassword(password, user.passwordHash);

  // Create session
  const session = await createSession(user.id, ip, ua);

  // Set cookie
  res.cookies.set(setSessionCookie(session.token));

  return res;
}
```

### Session Management

**Session Storage**: Database (Session table)

**Session Properties**:
- `id`: Unique identifier
- `userId`: Reference to user
- `token`: Session token (unique)
- `ipAddress`: Client IP address
- `userAgent`: Browser/OS information
- `expiresAt`: Expiration timestamp
- `revokedAt`: Revocation timestamp

**Session Expiration**: 24 hours

**Session Security**:
- ✅ httpOnly cookie (XSS protection)
- ✅ Secure flag in production
- ✅ SameSite=lax (CSRF protection)
- ✅ Session stored in database
- ✅ Revocation mechanism
- ✅ Expiration check on each request

### Logout Flow

**Endpoint**: `POST /api/auth/logout`

**Implementation**:
```typescript
// 1. Get session token from cookie
// 2. Update session with revokedAt timestamp
// 3. Clear session cookie
// 4. Audit log the logout
// 5. Return success
```

**Code Example**:
```typescript
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  // Revoke session
  await destroySession();

  // Audit log
  await auditLog({
    actorUserId: user.id,
    action: "USER_LOGOUT",
    resourceType: "Session",
    resourceId: session.id,
  });

  return success();
}
```

## Authorization System

### RBAC Implementation

**Two-Layer Authorization**:

1. **Role-Based Access Control (const-based)**
2. **Database-Based RBAC** (with Role and Permission models)

**Permission Resolution Order**:
```
1. User's UserPermission DENY entries → deny
2. User's UserPermission GRANT entries → grant
3. User's Role permissions (DB) → grant
4. Fallback to ROLE_PERMISSIONS const → grant
5. SUPER_ADMIN always has full access
```

**Permission Types**:
- `dashboard.view` - View dashboard
- `servers.view` - View servers
- `servers.manage` - Manage servers
- `protocols.view` - View protocols
- `protocols.manage` - Manage protocols
- `vpn_accounts.view` - View VPN accounts
- `vpn_accounts.manage` - Manage VPN accounts
- `customers.view` - View customers
- `customers.manage` - Manage customers
- `resellers.view` - View resellers
- `resellers.manage` - Manage resellers
- `packages.view` - View packages
- `packages.manage` - Manage packages
- `transactions.view` - View transactions
- `transactions.manage` - Manage transactions
- `payments.verify` - Verify payments
- `monitoring.view` - View monitoring
- `audit.view` - View audit logs
- `settings.view` - View settings
- `settings.manage` - Manage settings
- `ai.view` - View AI features
- `ai.manage` - Manage AI features
- `whatsapp.view` - View WhatsApp
- `whatsapp.manage` - Manage WhatsApp
- `users.manage` - Manage users

**Roles**:
- `SUPER_ADMIN` - Full access
- `ADMIN` - Admin access (no reseller management)
- `RESELLER` - Reseller access
- `CUSTOMER` - Customer access

**Permission Cache**:
- Cache duration: 10 seconds
- Cache key: `userId`
- Auto-refresh: On permission/role changes
- Benefits: Reduced database queries

### Permission Check Implementation

**Function**: `hasPermission(role, permission)`

**Code**:
```typescript
export function hasPermission(role: string, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
```

**Usage**:
```typescript
const user = await getSessionUser();
if (!hasPermission(user.role, "vpn_accounts.manage" as any)) {
  return NextResponse.json(
    { success: false, error: { code: "FORBIDDEN", message: "Akses ditolak" } },
    { status: 403 }
  );
}
```

## Database Operations

### Prisma Client Setup

**File**: `src/lib/db.ts`

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

**Features**:
- ✅ Connection pooling (automatic)
- ✅ Error logging
- ✅ Global client instance (development)
- ✅ Type-safe queries

### Transaction Support

**Example**: Payment processing

```typescript
await db.$transaction(async (tx) => {
  // Create transaction
  const transaction = await tx.transaction.create({
    data: {
      customerId,
      packageId,
      type: "PURCHASE",
      status: "PENDING",
      amount: package.price,
      invoiceNumber: generateInvoiceNumber(),
      idempotencyKey: generateIdempotencyKey(),
    }
  });

  // Create payment
  await tx.payment.create({
    data: {
      transactionId: transaction.id,
      provider: "XENDIT",
      status: "PENDING",
    }
  });
});
```

### Query Optimization

**Indexes** (from schema.prisma):
```prisma
@@index([role])
@@index([status])
@@index([userId])
@@index([expiresAt])
@@index([serverId])
@@index([customerId])
@@index([status])
```

**Best Practices**:
- ✅ Use `select` to limit fields
- ✅ Use `include` only when needed
- ✅ Use `where` filters to reduce dataset
- ✅ Use pagination for large datasets
- ✅ Avoid N+1 queries

## Business Logic Layers

### 1. Authentication Module

**File**: `src/lib/auth.ts`

**Functions**:
- `verifyPassword(plain, hash)` - Password verification
- `createSession(userId, ip, ua)` - Create session
- `getSessionUser()` - Get current user
- `destroySession()` - Revoke session
- `setSessionCookie(token)` - Set session cookie
- `clearSessionCookie()` - Clear session cookie

**Security**:
- ✅ Password hashing with bcryptjs
- ✅ Session validation on each request
- ✅ IP address tracking
- ✅ User agent logging

### 2. RBAC Module

**File**: `src/lib/rbac.ts`

**Functions**:
- `getUserPermissions(userId)` - Get effective permissions
- `hasPermissionDb(userId, permissionKey)` - Check permission
- `hasAllPermissionsDb(userId, keys)` - Check multiple permissions
- `hasAnyPermissionDb(userId, keys)` - Check any permission
- `getAllPermissionsGrouped()` - Get permissions by category
- `getRolesWithPermissions()` - Get roles with permissions
- `updateRolePermissions(roleId, permissionKeys, actorUserId)` - Update role
- `setUserPermission(userId, permissionKey, mode, actorUserId)` - Set user permission
- `removeUserPermission(userId, permissionKey)` - Remove user permission

**Features**:
- ✅ Permission caching (10s TTL)
- ✅ GRANT/DENY overrides
- ✅ Role-based permissions
- ✅ User-specific permissions
- ✅ SUPER_ADMIN protection

### 3. Provisioning Module

**File**: `src/lib/provisioner.ts`

**Function**: `provisionPackageForCustomer(customerId, packageId, serverId, options)`

**Process**:
```
1. Validate inputs (customer, package, server, protocol)
2. Check server status (must be ONLINE)
3. Check protocol status (must be RUNNING)
4. Generate sequential username
5. Create Subscription record
6. Create VpnAccount record
7. Generate credentials (UUID-based)
8. Create VpnCredential record
9. Create provisioning job
10. Send welcome email
11. Broadcast status via Socket.io
12. Return result
```

**Features**:
- ✅ Protocol validation
- ✅ Username generation (sequential)
- ✅ Credential encryption
- ✅ Audit logging
- ✅ Real-time updates

### 4. Payment Module

**File**: `src/app/api/payments/`

**Endpoints**:
- `GET /api/payments` - List payments
- `GET /api/payments/[id]` - Get payment details
- `POST /api/payments/[id]/approve` - Approve payment
- `POST /api/payments/[id]/reject` - Reject payment
- `POST /api/payments/create-gateway` - Create payment gateway
- `POST /api/payments/payout` - Process payout
- `POST /api/payments/webhook/[provider]` - Webhook handler

**Payment Flow**:
```
1. Customer selects package
2. Server initializes payment gateway (Xendit/Midtrans/etc.)
3. Customer redirected to payment page
4. Customer completes payment
5. Payment gateway sends webhook
6. Webhook validates signature
7. Transaction created in database
8. Payment status updated
9. If approved → auto-provision VPN account
10. Email receipt sent
11. Status broadcast to admin
```

**Security**:
- ✅ Webhook signature validation
- ✅ Idempotency key handling
- ✅ Transaction integrity
- ✅ Audit logging

### 5. AI Module

**File**: `src/lib/ai-provider.ts`

**Features**:
- Multi-provider support (OpenAI, Anthropic, Gemini, Ollama)
- Provider testing
- Model fetching
- API key encryption
- Request/response logging

**Security**:
- ✅ API key encryption (AES-256-GCM)
- ✅ SSRF protection
- ✅ Rate limiting
- ✅ Error handling

### 6. WhatsApp Module

**File**: `src/lib/whatsapp.ts`

**Functions**:
- `normalizePhone(input)` - Normalize phone number
- `renderTemplate(body, vars)` - Render template variables
- `extractTemplateVariables(body)` - Extract template variables
- `syncWhatsappContacts()` - Sync contacts from DB
- `sendWhatsappMessage(phoneNumber, body, options)` - Send message

**Providers**:
- Meta Cloud (official WA Business API)
- Baileys (unofficial WA Web)
- API (generic third-party)

### 7. Telegram Module

**File**: `src/lib/telegram.ts`

**Functions**:
- `getMe(token)` - Test connection
- `sendMessage(token, chatId, text)` - Send message
- `setWebhook(token, url, secret)` - Set webhook
- `deleteWebhook(token)` - Delete webhook
- `getWebhookInfo(token)` - Get webhook status
- `maskBotToken(token)` - Mask token for display

### 8. Email Module

**File**: `src/lib/mailer.ts`

**Current Implementation**: Mock SMTP (storing in EmailLog table)

**Templates**:
- `WELCOME_ACCOUNT` - Welcome new VPN account
- `PAYMENT_RECEIPT` - Payment confirmation
- `EXPIRY_WARNING` - Expiry warning
- `GENERIC` - Generic email

**Features**:
- ✅ Email logging
- ✅ Real-time broadcast
- ✅ Template support
- ✅ Variables substitution

**Production Enhancement**:
- Replace mock with real SMTP provider (Resend/Mailgun/SES)

### 9. Real-time Module

**File**: `src/lib/realtime.ts`

**Events**:
- `vpn:account_created` - New account created
- `vpn:account_status_changed` - Account status updated
- `payment:verified` - Payment verified
- `email:new` - New email sent
- `notification:new` - New notification
- `server:metrics_update` - Server metrics updated

**Implementation**:
```typescript
export function broadcast(event: REALTIME_EVENTS, data: any) {
  if (typeof window !== 'undefined') {
    const socket = io(); // Connect to realtime service
    socket.emit(event, data);
  }
}
```

### 10. Rate Limiting Module

**File**: `src/lib/rate-limit.ts`

**Implementation**: In-memory token bucket

**Configuration**:
```typescript
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  chat: { maxRequests: 20, windowMs: 60_000 },
  ai_agent: { maxRequests: 10, windowMs: 60_000 },
  ai_suggest: { maxRequests: 5, windowMs: 60_000 },
  ai_provider_test: { maxRequests: 3, windowMs: 60_000 },
};
```

**Features**:
- ✅ Per-user/IP rate limiting
- ✅ Configurable limits
- ✅ Retry-after header
- ✅ Automatic cleanup

**Production Enhancement**:
- Implement Redis-based rate limiting

### 11. Security Module

**File**: `src/lib/crypto.ts`

**Features**:
- AES-256-GCM encryption for API keys
- Password hashing with bcryptjs
- Encryption key validation on startup

**Security**:
- ✅ AES-256-GCM encryption
- ✅ Authenticated encryption (GCM mode)
- ✅ Key rotation support
- ✅ Development fallback (not secure)

**File**: `src/lib/ssrf.ts`

**Features**:
- URL validation
- Private IP blocking
- Cloud metadata blocking
- DNS resolution validation

**Security**:
- ✅ SSRF protection
- ✅ IP range blocking
- ✅ Metadata endpoint blocking

## Error Handling

### Error Response Format

**Standard Response**:
```typescript
{
  success: false,
  error: {
    code: "ERROR_CODE",
    message: "Error description in Indonesian"
  }
}
```

**Error Codes**:
- `VALIDATION_ERROR` - Input validation failed
- `INVALID_CREDENTIALS` - Email/password wrong
- `ACCOUNT_DISABLED` - Account is disabled
- `UNAUTHENTICATED` - Not logged in
- `FORBIDDEN` - No permission
- `NOT_FOUND` - Resource not found
- `SERVER_OFFLINE` - Server not online
- `INTERNAL` - Internal server error
- `DUPLICATE` - Duplicate entry

### Try-Catch Pattern

**Example**:
```typescript
export async function POST(req: NextRequest) {
  try {
    // Business logic
    const result = await someOperation();
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    console.error("Error:", e);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
```

## Logging

### Current Implementation

**Console Logging**:
- Error logs with stack traces
- Warning logs for non-critical issues
- Info logs for important events

**Audit Logging**:
- All authentication actions
- All authorization checks
- All data modifications
- All external API calls

**Example**:
```typescript
await auditLog({
  actorUserId: user.id,
  actorType: user.role,
  action: "USER_LOGIN",
  resourceType: "User",
  resourceId: user.id,
  ipAddress: ip,
  userAgent: ua,
  metadata: { method: "password", email: user.email },
});
```

## API Response Examples

### Success Response
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clxxx",
      "email": "admin@example.com",
      "name": "Admin User",
      "role": "SUPER_ADMIN",
      "mfaEnabled": false
    }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Anda tidak memiliki izin"
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

## Performance Considerations

### Database Queries

**Optimized Queries**:
- ✅ Indexes on frequently queried fields
- ✅ Select only needed fields
- ✅ Pagination for large datasets
- ✅ Connection pooling

**Potential N+1 Queries**:
- ⚠️ Loading server with protocols (may cause multiple queries)
- ⚠️ Loading customer with subscriptions (may cause multiple queries)
- ⚠️ Loading user with permissions (may cause multiple queries)

**Recommendations**:
- Use `include` with `select` to limit fields
- Use `select` for list endpoints
- Use `include` for detail endpoints
- Consider using `@prisma/extension-query` for optimization

### Caching

**Current Implementation**:
- Permission cache (10s TTL)
- No application-level caching

**Recommendations**:
- Implement Redis caching for:
  - User sessions
  - API responses
  - AI provider responses
  - Server metrics
  - Frequently accessed data

### Rate Limiting

**Current Implementation**:
- In-memory token bucket

**Recommendations**:
- Implement Redis-based rate limiting for production
- Distribute rate limiting across multiple instances
- Add per-IP and per-user limits

## Security Review

### Authentication

**Strengths**:
- ✅ Password hashing with bcryptjs
- ✅ Session management with expiration
- ✅ Session revocation
- ✅ Audit logging
- ✅ IP tracking

**Weaknesses**:
- ⚠️ Session tokens not cryptographically signed
- ⚠️ Session stored in database (not in-memory)
- ⚠️ No OAuth support
- ⚠️ No 2FA enforcement (optional only)

### Authorization

**Strengths**:
- ✅ Comprehensive RBAC system
- ✅ GRANT/DENY overrides
- ✅ Permission caching
- ✅ SUPER_ADMIN protection

**Weaknesses**:
- ⚠️ No fine-grained permissions (all-or-nothing per role)
- ⚠️ No resource-based authorization
- ⚠️ No time-based access control

### Data Protection

**Strengths**:
- ✅ AES-256-GCM encryption for API keys
- ✅ Password hashing
- ✅ Audit logging
- ✅ Input validation

**Weaknesses**:
- ⚠️ Session tokens not encrypted
- ⚠️ Sensitive data in logs (may need redaction)
- ⚠️ No data encryption at rest (database encryption)

### Input Validation

**Strengths**:
- ✅ Input validation on API endpoints
- ✅ Type checking with TypeScript
- ✅ Schema validation with Zod (where used)

**Weaknesses**:
- ⚠️ No centralized input validation
- ⚠️ Some endpoints may have insufficient validation
- ⚠️ No SQL injection prevention (Prisma protects this)

### Output Encoding

**Strengths**:
- ✅ React auto-escaping (frontend)
- ✅ No direct HTML rendering

**Weaknesses**:
- ⚠️ No output encoding in API responses
- ⚠️ Potential XSS in custom email templates
- ⚠️ Potential XSS in AI responses

## Code Quality

### Strengths

- ✅ TypeScript for type safety
- ✅ Clear separation of concerns
- ✅ Comprehensive documentation in comments
- ✅ Consistent naming conventions
- ✅ Modular library structure
- ✅ Reusable utilities

### Areas for Improvement

- ⚠️ Missing unit tests
- ⚠️ No integration tests
- ⚠️ Error handling could be more consistent
- ⚠️ Some code duplication
- ⚠️ No linter configuration visible
- ⚠️ No API documentation

## Recommendations

### High Priority

1. **Add Comprehensive Testing**
   - Unit tests for business logic
   - Integration tests for API endpoints
   - E2E tests for critical flows
   - Target: 70%+ coverage

2. **Implement Redis Caching**
   - Cache API responses
   - Cache user sessions
   - Cache AI provider responses
   - Cache server metrics

3. **Add API Documentation**
   - OpenAPI/Swagger specification
   - Interactive documentation
   - Example requests/responses

4. **Centralize Error Handling**
   - Custom error classes
   - Centralized error middleware
   - Standardized error responses

### Medium Priority

5. **Improve Database Performance**
   - Optimize slow queries
   - Add more indexes
   - Implement read replicas
   - Add connection pooling

6. **Add Monitoring & Observability**
   - Structured logging
   - Metrics collection
   - Distributed tracing
   - Error tracking

7. **Improve Security**
   - Add CSRF protection
   - Implement data encryption at rest
   - Add request signing for webhooks
   - Add rate limiting (Redis-based)

8. **Add API Versioning**
   - Version API endpoints
   - Support multiple versions
   - Deprecation strategy

---

**Last Updated**: 2026-11-07
**Audit Scope**: Complete backend analysis
**Status**: Analysis complete
