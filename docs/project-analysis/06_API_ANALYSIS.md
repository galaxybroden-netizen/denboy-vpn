# MVMP API Analysis

## Overview

MVMP provides a comprehensive RESTful API with **~120 endpoints** covering all major features including VPN management, customer/reseller system, payments, AI integration, WhatsApp/Telegram integration, and monitoring.

## Base URL

**Development**: `http://localhost:3000/api`
**Production**: `https://api.mvmp.example.com/api`

## Authentication

### Session-Based Authentication

**Cookie**: `mvmp_session`

**Headers**:
```
Cookie: mvmp_session=<session_token>
```

**Example**:
```typescript
fetch('http://localhost:3000/api/servers', {
  headers: {
    'Cookie': `mvmp_session=${token}`,
  },
});
```

### Response Format

**Success Response**:
```json
{
  "success": true,
  "data": <data>
}
```

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
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

## API Endpoints Inventory

### Authentication Endpoints

#### 1. Login
```
POST /api/auth/login
```

**Request**:
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Response**:
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

**Security**:
- ✅ Input validation
- ✅ Password hashing
- ✅ Session creation
- ✅ Audit logging
- ✅ IP tracking

#### 2. Logout
```
POST /api/auth/logout
```

**Response**:
```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Security**:
- ✅ Session revocation
- ✅ Cookie clearing
- ✅ Audit logging

#### 3. Get Current User
```
GET /api/auth/me
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clxxx",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "SUPER_ADMIN",
    "mfaEnabled": false
  }
}
```

### Server Management Endpoints

#### 4. List Servers
```
GET /api/servers?page=1&limit=20&status=ONLINE&region=ID
```

**Query Parameters**:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `status` - Filter by status
- `region` - Filter by region

**Response**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clxxx",
        "name": "Server 1",
        "hostname": "server1.example.com",
        "publicIp": "192.168.1.1",
        "status": "ONLINE",
        "cpuCores": 4,
        "ramTotalBytes": 8589934592,
        "diskTotalBytes": 53687091200
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

#### 5. Get Server Details
```
GET /api/servers/[id]
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clxxx",
    "name": "Server 1",
    "hostname": "server1.example.com",
    "publicIp": "192.168.1.1",
    "privateIp": "10.0.0.1",
    "sshPort": 22,
    "region": "ID",
    "countryCode": "ID",
    "osName": "Ubuntu",
    "osVersion": "22.04 LTS",
    "architecture": "x86_64",
    "cpuCores": 4,
    "ramTotalBytes": 8589934592,
    "diskTotalBytes": 53687091200,
    "maxAccounts": 100,
    "status": "ONLINE",
    "provider": "OVH",
    "monthlyCost": 15.99,
    "protocols": [
      {
        "id": "clxxx",
        "key": "wireguard",
        "displayName": "WireGuard",
        "engine": "wg-quick",
        "status": "RUNNING",
        "port": 51820
      }
    ]
  }
}
```

#### 6. Create Server
```
POST /api/servers
```

**Request**:
```json
{
  "name": "Server 1",
  "hostname": "server1.example.com",
  "publicIp": "192.168.1.1",
  "privateIp": "10.0.0.1",
  "region": "ID",
  "countryCode": "ID",
  "cpuCores": 4,
  "ramTotalBytes": 8589934592,
  "diskTotalBytes": 53687091200,
  "maxAccounts": 100
}
```

#### 7. Update Server
```
PUT /api/servers/[id]
```

**Request**:
```json
{
  "name": "Server 1 (Updated)",
  "status": "ONLINE"
}
```

#### 8. Delete Server
```
DELETE /api/servers/[id]
```

### VPN Account Endpoints

#### 9. List VPN Accounts
```
GET /api/vpn-accounts?page=1&limit=20&status=ACTIVE&customerId=clxxx
```

**Response**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clxxx",
        "username": "mvmp-00001",
        "status": "ACTIVE",
        "protocol": {
          "key": "wireguard",
          "displayName": "WireGuard"
        },
        "server": {
          "id": "clxxx",
          "name": "Server 1",
          "publicIp": "192.168.1.1"
        },
        "customer": {
          "id": "clxxx",
          "name": "Customer 1"
        },
        "expiresAt": "2026-12-31T23:59:59.000Z",
        "downloadBytes": 10737418240,
        "uploadBytes": 5368709120
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

#### 10. Create VPN Account
```
POST /api/vpn-accounts/create
```

**Request**:
```json
{
  "customerId": "clxxx",
  "packageId": "clxxx",
  "protocolId": "clxxx",
  "serverId": "clxxx",
  "durationDays": 30,
  "notes": "Additional account"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "accountId": "clxxx",
    "username": "mvmp-00001",
    "status": "PENDING",
    "expiresAt": "2026-12-31T23:59:59.000Z"
  }
}
```

#### 11. Delete VPN Account
```
DELETE /api/vpn-accounts/[id]
```

### Payment Endpoints

#### 12. List Payments
```
GET /api/payments?page=1&limit=20&status=PAID&provider=XENDIT
```

**Response**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clxxx",
        "transactionId": "clxxx",
        "provider": "XENDIT",
        "status": "PAID",
        "amount": 50000,
        "currency": "IDR",
        "paidAt": "2026-11-07T10:00:00.000Z",
        "transaction": {
          "id": "clxxx",
          "invoiceNumber": "INV-20261107-001",
          "amount": 50000,
          "currency": "IDR",
          "customer": {
            "id": "clxxx",
            "name": "Customer 1"
          }
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

#### 13. Verify Payment
```
POST /api/payments/[id]/approve
```

**Request**:
```json
{
  "notes": "Verified manually"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "paymentId": "clxxx",
    "status": "PAID",
    "transaction": {
      "id": "clxxx",
      "status": "PAID",
      "paidAt": "2026-11-07T10:00:00.000Z"
    }
  }
}
```

### AI Agent Endpoints

#### 14. Get AI Overview
```
GET /api/ai/overview
```

**Response**:
```json
{
  "success": true,
  "data": {
    "totalProviders": 4,
    "totalModels": 15,
    "totalConversations": 50,
    "totalUsage": {
      "inputTokens": 1000000,
      "outputTokens": 500000,
      "costUsd": 1.50
    }
  }
}
```

#### 15. List AI Providers
```
GET /api/ai/providers
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "clxxx",
      "name": "OpenAI",
      "type": "cloud",
      "baseUrl": "https://api.openai.com/v1",
      "isActive": true,
      "lastConnectedAt": "2026-11-07T10:00:00.000Z",
      "models": [
        {
          "id": "clxxx",
          "modelId": "gpt-4o",
          "displayName": "GPT-4o",
          "category": "paid",
          "isActive": true
        }
      ]
    }
  ]
}
```

#### 16. Test AI Provider
```
POST /api/ai/providers/[id]/test
```

**Response**:
```json
{
  "success": true,
  "data": {
    "connected": true,
    "modelCount": 5,
    "responseTime": 150
  }
}
```

### WhatsApp Endpoints

#### 17. Get WhatsApp Integration
```
GET /api/whatsapp/integration
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "clxxx",
    "provider": "baileys",
    "status": "disconnected",
    "phoneNumber": null,
    "displayName": null,
    "lastConnectedAt": null
  }
}
```

#### 18. Connect WhatsApp
```
POST /api/whatsapp/integration/connect
```

**Request**:
```json
{
  "provider": "baileys",
  "phoneNumber": "6281234567890",
  "credentials": {
    "sessionId": "session1",
    "qrCodeData": "data:image/png;base64,..."
  }
}
```

### Chat Endpoints

#### 19. List Chat Conversations
```
GET /api/chat?page=1&limit=20&status=AI_ACTIVE&channel=customer
```

**Response**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "clxxx",
        "channel": "customer",
        "userId": "clxxx",
        "status": "AI_ACTIVE",
        "messageCount": 10,
        "aiMessageCount": 8,
        "humanMessageCount": 2,
        "lastMessageAt": "2026-11-07T10:00:00.000Z",
        "lastMessagePreview": "Hello, I need help with...",
        "assignedAdminId": null
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

#### 20. Send Chat Message
```
POST /api/chat/[id]/messages
```

**Request**:
```json
{
  "content": "Hello, I need help with VPN configuration",
  "sender": "user"
}
```

### Monitoring Endpoints

#### 21. Get Server Metrics
```
GET /api/monitoring/server/[id]?interval=5m
```

**Response**:
```json
{
  "success": true,
  "data": {
    "serverId": "clxxx",
    "cpuPercent": 45.2,
    "ramUsedBytes": 3858759680,
    "ramTotalBytes": 8589934592,
    "diskUsedBytes": 32212254720,
    "diskTotalBytes": 53687091200,
    "networkRxBytes": 10737418240,
    "networkTxBytes": 5368709120,
    "activeAccounts": 45,
    "bandwidthMbps": 100.5,
    "recordedAt": "2026-11-07T10:00:00.000Z",
    "metrics": [
      {
        "cpuPercent": 45.2,
        "ramUsedBytes": 3858759680,
        "recordedAt": "2026-11-07T10:00:00.000Z"
      }
    ]
  }
}
```

### Portal Endpoints

#### 22. Customer Dashboard
```
GET /api/portal/customer/dashboard
```

**Response**:
```json
{
  "success": true,
  "data": {
    "totalServers": 2,
    "activeAccounts": 5,
    "totalTransactions": 3,
    "pendingPayments": 0,
    "totalSpending": 150000,
    "currentSubscription": {
      "id": "clxxx",
      "package": {
        "name": "Premium Package",
        "durationDays": 30
      },
      "expiresAt": "2026-12-07T23:59:59.000Z"
    }
  }
}
```

## Rate Limiting

### Current Implementation

**In-memory token bucket** (not production-ready)

### Configuration

```typescript
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  chat: { maxRequests: 20, windowMs: 60_000 },
  ai_agent: { maxRequests: 10, windowMs: 60_000 },
  ai_suggest: { maxRequests: 5, windowMs: 60_000 },
  ai_provider_test: { maxRequests: 3, windowMs: 60_000 },
};
```

### Rate Limit Headers

**Response Headers**:
```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 18
X-RateLimit-Reset: 1699320000
Retry-After: 2
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later."
  }
}
```

## Error Handling

### Common Errors

1. **UNAUTHENTICATED** (401)
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Tidak terotentikasi"
  }
}
```

2. **FORBIDDEN** (403)
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Anda tidak memiliki izin"
  }
}
```

3. **NOT_FOUND** (404)
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Data tidak ditemukan"
  }
}
```

4. **INTERNAL** (500)
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL",
    "message": "Terjadi kesalahan server"
  }
}
```

## Security Features

### 1. Authentication

**Strengths**:
- ✅ Session-based authentication
- ✅ Password hashing (bcryptjs)
- ✅ Session expiration (24 hours)
- ✅ Session revocation
- ✅ IP tracking

**Weaknesses**:
- ⚠️ Session tokens not cryptographically signed
- ⚠️ Session stored in database

### 2. Authorization

**Strengths**:
- ✅ Comprehensive RBAC
- ✅ Role-based permissions
- ✅ User-specific permissions
- ✅ Permission caching

**Weaknesses**:
- ⚠️ No resource-based authorization
- ⚠️ No fine-grained permissions

### 3. Data Validation

**Strengths**:
- ✅ Input validation on endpoints
- ✅ TypeScript type safety
- ✅ Zod validation (where used)

**Weaknesses**:
- ⚠️ No centralized validation
- ⚠️ Some endpoints may have insufficient validation

### 4. Rate Limiting

**Strengths**:
- ✅ Rate limiting configured
- ✅ Configurable limits

**Weaknesses**:
- ⚠️ In-memory implementation (not production-ready)
- ⚠️ No distributed rate limiting

### 5. SSRF Protection

**Strengths**:
- ✅ SSRF protection for AI provider URLs
- ✅ Private IP blocking
- ✅ Cloud metadata endpoint blocking

**Implementation** (`src/lib/ssrf.ts`):
```typescript
export function validateProviderUrl(urlStr: string): SSRFValidationResult {
  // Validate URL format
  // Check protocol (HTTPS only in production)
  // Block private IPs
  // Block cloud metadata endpoints
  // Validate DNS resolution
}
```

## API Documentation

### Current Status

- ❌ No OpenAPI/Swagger specification
- ❌ No interactive documentation
- ❌ No example requests/responses

### Recommended

1. **Add OpenAPI Specification**
   - Define API schema
   - Document all endpoints
   - Include examples
   - Generate interactive documentation

2. **Add API Documentation**
   - Document authentication
   - Document request/response formats
   - Document error codes
   - Provide examples

## Performance Considerations

### Database Queries

**Optimizations**:
- ✅ Indexes on frequently queried fields
- ✅ Select only needed fields
- ✅ Pagination for large datasets

**Potential Issues**:
- ⚠️ N+1 query problems in some views
- ⚠️ No query optimization tools

### Caching

**Current Implementation**:
- Permission cache (10s TTL)

**Recommendations**:
- Add Redis caching
- Cache API responses
- Cache frequently accessed data

### Rate Limiting

**Current Implementation**:
- In-memory token bucket

**Recommendations**:
- Implement Redis-based rate limiting
- Distribute rate limiting across instances
- Add per-IP and per-user limits

## API Versioning

**Current Status**:
- ❌ No API versioning
- ❌ No deprecation strategy

**Recommendations**:
- Add API versioning (v1, v2)
- Support multiple versions
- Implement deprecation strategy

## Recommendations

### High Priority

1. **Add Comprehensive Testing**
   - Unit tests for API endpoints
   - Integration tests for critical flows
   - E2E tests for API calls
   - Target: 70%+ coverage

2. **Implement Redis Rate Limiting**
   - Replace in-memory with Redis
   - Distributed rate limiting
   - Configurable limits

3. **Add API Documentation**
   - OpenAPI/Swagger specification
   - Interactive documentation
   - Example requests/responses

4. **Add API Versioning**
   - Version API endpoints
   - Support multiple versions
   - Deprecation strategy

### Medium Priority

5. **Improve Error Handling**
   - Centralized error handling
   - Standardized error responses
   - Error logging and monitoring

6. **Add Caching Layer**
   - Redis caching
   - API response caching
   - Cache invalidation

7. **Add Request Validation**
   - Centralized validation
   - Schema validation
   - Input sanitization

8. **Add API Monitoring**
   - Request/response logging
   - Performance monitoring
   - Error tracking

### Low Priority

9. **Add API Rate Limiting**
   - Per-endpoint limits
   - Per-user limits
   - Per-IP limits

10. **Add API Analytics**
    - Request volume tracking
    - Response time monitoring
    - Error rate tracking

---

**Last Updated**: 2026-11-07
**Audit Scope**: Complete API analysis
**Status**: Analysis complete
