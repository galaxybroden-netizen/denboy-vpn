# MVMP Database Analysis

## Overview

MVMP uses **Prisma ORM** with **PostgreSQL 16** (production) and **SQLite** (sandbox). The database schema is comprehensive, supporting all major features including VPN management, customer/reseller system, payments, AI integration, and omnichannel communication.

## Database Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Prisma ORM | 6.11.1 | Database ORM |
| PostgreSQL | 16 | Production database |
| SQLite | Latest | Sandbox database |
| Migrations | Prisma | Schema migrations |

## Schema Overview

**Total Models**: 64 models
**Total Enums**: 8 enums
**Total Indexes**: ~50 indexes
**Total Foreign Keys**: ~60 foreign keys

## Core Models

### 1. User Model

**File**: `prisma/schema.prisma` (lines 15-59)

**Fields**:
```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  username      String   @unique
  phone         String?
  name          String
  passwordHash  String
  role          UserRole @default(CUSTOMER)
  status        UserStatus @default(ACTIVE)
  mfaEnabled    Boolean  @default(false)
  mfaSecret     String?
  recoveryCodesJson String?
  expiresAt     DateTime?
  lastLoginAt   DateTime?
  lastPasswordChangeAt DateTime?
  emailVerifiedAt   DateTime?
  phoneVerifiedAt DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  customer      Customer?
  reseller      Reseller?
  auditLogs     AuditLog[]
  notifications Notification[]
  sessions      Session[]
  apiKeys       ApiKey[]
  whatsappConversations WhatsappConversation[]
  userPermissions  UserPermission[]
  otpCodes         OtpCode[]
  userDevices      UserDevice[]
  roleId           String?
  roleRecord       Role?     @relation("roleRecord", fields: [roleId], references: [id], onDelete: SetNull)

  @@index([role])
  @@index([status])
  @@index([username])
}
```

**Indexes**:
- `role` - Fast role filtering
- `status` - Fast status filtering
- `username` - Fast username lookup

**Relationships**:
- `customer` - One-to-one with Customer
- `reseller` - One-to-one with Reseller
- `auditLogs` - One-to-many with AuditLog
- `notifications` - One-to-many with Notification
- `sessions` - One-to-many with Session
- `apiKeys` - One-to-many with ApiKey
- `whatsappConversations` - One-to-many with WhatsappConversation
- `userPermissions` - One-to-many with UserPermission
- `otpCodes` - One-to-many with OtpCode
- `userDevices` - One-to-many with UserDevice
- `roleId` - Many-to-one with Role (optional)

**Enums**:
- `UserRole`: SUPER_ADMIN, ADMIN, OPERATOR, FINANCE, CUSTOMER_SERVICE, RESELLER, CUSTOMER
- `UserStatus`: ACTIVE, INACTIVE, SUSPENDED, INVITED, PENDING_VERIFICATION, DELETED

**Security**:
- ✅ Password hashed (bcryptjs)
- ✅ Email and username unique
- ✅ MFA support (optional)
- ✅ Account expiry (optional)
- ✅ Audit timestamps

### 2. Session Model

**File**: `prisma/schema.prisma` (lines 61-75)

**Fields**:
```prisma
model Session {
  id           String   @id @default(cuid())
  userId       String
  token        String   @unique
  ipAddress    String?
  userAgent    String?
  expiresAt    DateTime
  revokedAt    DateTime?
  createdAt    DateTime @default(now())

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

**Indexes**:
- `userId` - Fast user session lookup
- `expiresAt` - Fast expired session cleanup

**Relationships**:
- `user` - Many-to-one with User (cascade delete)

**Security**:
- ✅ Token unique
- ✅ Expiration time
- ✅ Revocation support
- ✅ IP tracking
- ✅ User agent tracking

**Caveats**:
- ⚠️ Session tokens not encrypted (stored in plaintext)
- ⚠️ Session stored in database (not in-memory)

### 3. Customer Model

**File**: `prisma/schema.prisma` (lines 276-295)

**Fields**:
```prisma
model Customer {
  id            String   @id @default(cuid())
  userId        String   @unique
  resellerId    String?
  customerCode  String   @unique
  name          String
  email         String
  phone         String?
  status        String   @default("ACTIVE")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  reseller      Reseller? @relation(fields: [resellerId], references: [id])
  vpnAccounts   VpnAccount[]
  subscriptions Subscription[]
  transactions  Transaction[]

  @@index([resellerId])
}
```

**Indexes**:
- `resellerId` - Fast reseller customer lookup

**Relationships**:
- `user` - One-to-one with User
- `reseller` - Many-to-one with Reseller
- `vpnAccounts` - One-to-many with VpnAccount
- `subscriptions` - One-to-many with Subscription
- `transactions` - One-to-many with Transaction

### 4. Reseller Model

**File**: `prisma/schema.prisma` (lines 297-318)

**Fields**:
```prisma
model Reseller {
  id              String   @id @default(cuid())
  userId          String   @unique
  resellerCode    String   @unique
  parentResellerId String?
  status          String   @default("ACTIVE")
  commissionRate  Float    @default(10)
  accountLimit    Int      @default(50)
  balance         Float    @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  parentReseller  Reseller? @relation("ResellerHierarchy", fields: [parentResellerId], references: [id])
  children        Reseller[] @relation("ResellerHierarchy")
  customers       Customer[]
  ledger          ResellerLedger[]
  commissions     ResellerCommission[]
  transactions    Transaction[]

  @@index([parentResellerId])
}
```

**Indexes**:
- `parentResellerId` - Fast parent reseller lookup

**Relationships**:
- `user` - One-to-one with User
- `parentReseller` - Many-to-one with Reseller
- `children` - One-to-many with Reseller (self-referential)
- `customers` - One-to-many with Customer
- `ledger` - One-to-many with ResellerLedger
- `commissions` - One-to-many with ResellerCommission
- `transactions` - One-to-many with Transaction

### 5. Server Model

**File**: `prisma/schema.prisma` (lines 88-127)

**Fields**:
```prisma
model Server {
  id              String   @id @default(cuid())
  groupId         String?
  name            String
  hostname        String
  publicIp        String
  privateIp       String?
  sshPort         Int      @default(22)
  region          String
  countryCode     String
  osName          String   @default("Ubuntu")
  osVersion       String   @default("22.04 LTS")
  architecture    String   @default("x86_64")
  kernelVersion   String?
  firewallBackend String   @default("ufw")
  cpuCores        Int
  ramTotalBytes   BigInt
  diskTotalBytes  BigInt
  maxAccounts     Int      @default(100)
  status          ServerStatus @default(PENDING)
  maintenanceMode Boolean  @default(false)
  lastSeenAt      DateTime?
  provider        String   @default("OVH")
  monthlyCost     Float
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  group           ServerGroup?   @relation(fields: [groupId], references: [id])
  agent           ServerAgent?
  protocols       ServerProtocol[]
  vpnAccounts     VpnAccount[]
  metrics         ServerMetric[]
  jobs            Job[]
  firewallRules   FirewallRule[]
  serverPorts     ServerPort[]

  @@index([status])
  @@index([region])
  @@index([groupId])
}
```

**Indexes**:
- `status` - Fast status filtering
- `region` - Fast region filtering
- `groupId` - Fast group lookup

**Relationships**:
- `group` - Many-to-one with ServerGroup
- `agent` - One-to-one with ServerAgent
- `protocols` - One-to-many with ServerProtocol
- `vpnAccounts` - One-to-many with VpnAccount
- `metrics` - One-to-many with ServerMetric
- `jobs` - One-to-many with Job
- `firewallRules` - One-to-many with FirewallRule
- `serverPorts` - One-to-many with ServerPort

**Enums**:
- `ServerStatus`: PENDING, ONLINE, OFFLINE, DECOMMISSIONED, ERROR

### 6. VpnAccount Model

**File**: `prisma/schema.prisma` (lines 211-241)

**Fields**:
```prisma
model VpnAccount {
  id              String   @id @default(cuid())
  customerId      String
  subscriptionId  String?
  serverId        String
  protocolId      String
  username        String
  externalId      String?
  status          VpnAccountStatus @default(PENDING)
  quotaBytes      BigInt?
  uploadBytes     BigInt   @default(0)
  downloadBytes   BigInt   @default(0)
  expiresAt       DateTime?
  maxDevices      Int      @default(3)
  provisionedAt   DateTime?
  revokedAt       DateTime?
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  customer        Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  subscription    Subscription? @relation(fields: [subscriptionId], references: [id])
  server          Server   @relation(fields: [serverId], references: [id])
  protocol        Protocol @relation(fields: [protocolId], references: [id])
  credentials     VpnCredential[]
  usage           VpnUsage[]

  @@index([customerId])
  @@index([serverId])
  @@index([status])
}
```

**Indexes**:
- `customerId` - Fast customer account lookup
- `serverId` - Fast server account lookup
- `status` - Fast status filtering

**Relationships**:
- `customer` - Many-to-one with Customer
- `subscription` - One-to-one with Subscription
- `server` - Many-to-one with Server
- `protocol` - Many-to-one with Protocol
- `credentials` - One-to-many with VpnCredential
- `usage` - One-to-many with VpnUsage

**Enums**:
- `VpnAccountStatus`: PENDING, ACTIVE, SUSPENDED, EXPIRED, DEPLETED, REVOKED, ERROR

### 7. Package Model

**File**: `prisma/schema.prisma` (lines 351-371)

**Fields**:
```prisma
model Package {
  id              String   @id @default(cuid())
  name            String
  description     String?
  price           Float
  currency        String   @default("IDR")
  durationDays    Int
  quotaBytes      BigInt?
  maxDevices      Int      @default(3)
  allocationPolicy String?
  status          String   @default("ACTIVE")
  isFeatured      Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  protocols       PackageProtocol[]
  subscriptions   Subscription[]
  transactions    Transaction[]

  @@index([status])
}
```

**Indexes**:
- `status` - Fast status filtering

**Relationships**:
- `protocols` - Many-to-many with Protocol (via PackageProtocol)
- `subscriptions` - One-to-many with Subscription
- `transactions` - One-to-many with Transaction

### 8. Transaction Model

**File**: `prisma/schema.prisma` (lines 403-429)

**Fields**:
```prisma
model Transaction {
  id              String   @id @default(cuid())
  customerId      String
  resellerId      String?
  packageId       String?
  serverId        String?
  invoiceNumber   String   @unique
  type            String   @default("PURCHASE")
  amount          Float
  currency        String   @default("IDR")
  status          TransactionStatus @default(PENDING)
  idempotencyKey  String   @unique
  paidAt          DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  customer        Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  reseller        Reseller? @relation(fields: [resellerId], references: [id])
  package         Package? @relation(fields: [packageId], references: [id])
  payments        Payment[]
  commissions     ResellerCommission[]
  invoice         Invoice?

  @@index([customerId])
  @@index([status])
  @@index([packageId])
}
```

**Indexes**:
- `customerId` - Fast customer transaction lookup
- `status` - Fast status filtering
- `packageId` - Fast package transaction lookup

**Relationships**:
- `customer` - Many-to-one with Customer
- `reseller` - Many-to-one with Reseller
- `package` - Many-to-one with Package
- `payments` - One-to-many with Payment
- `commissions` - One-to-many with ResellerCommission
- `invoice` - One-to-one with Invoice

**Enums**:
- `TransactionStatus`: PENDING, PAID, FAILED, EXPIRED, CANCELLED, REFUNDED, REVIEW_REQUIRED

### 9. Payment Model

**File**: `prisma/schema.prisma` (lines 431-451)

**Fields**:
```prisma
model Payment {
  id                String   @id @default(cuid())
  transactionId     String
  provider          String   @default("MANUAL")
  providerReference String?
  paymentMethod     String
  amount            Float
  currency          String   @default("IDR")
  status            PaymentStatus @default(PENDING)
  paidAt            DateTime?
  expiresAt         DateTime?
  qrisData          String?
  vaNumber          String?
  createdAt         DateTime @default(now())

  transaction       Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  manualProofs      ManualPaymentProof[]

  @@index([status])
  @@index([transactionId])
}
```

**Indexes**:
- `status` - Fast status filtering
- `transactionId` - Fast transaction payment lookup

**Relationships**:
- `transaction` - Many-to-one with Transaction
- `manualProofs` - One-to-many with ManualPaymentProof

**Enums**:
- `PaymentStatus`: PENDING, PAID, FAILED, EXPIRED, CANCELLED, REFUNDED, REVIEW_REQUIRED

## RBAC Models

### 10. Role Model

**File**: `prisma/schema.prisma` (lines 612-626)

**Fields**:
```prisma
model Role {
  id          String   @id @default(cuid())
  key         String   @unique
  name        String
  description String?
  isSystem    Boolean  @default(false)
  color       String   @default("zinc")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  rolePermissions RolePermission[]
  users           User[]    @relation("roleRecord")
}
```

**Relationships**:
- `rolePermissions` - One-to-many with RolePermission
- `users` - One-to-many with User

### 11. Permission Model

**File**: `prisma/schema.prisma` (lines 628-644)

**Fields**:
```prisma
model Permission {
  id          String   @id @default(cuid())
  key         String   @unique
  name        String
  description String?
  category    String
  action      String
  isSensitive Boolean  @default(false)
  createdAt   DateTime @default(now())

  rolePermissions RolePermission[]
  userPermissions  UserPermission[]
}
```

**Relationships**:
- `rolePermissions` - One-to-many with RolePermission
- `userPermissions` - One-to-many with UserPermission

### 12. RolePermission Model

**File**: `prisma/schema.prisma` (lines 646-655)

**Fields**:
```prisma
model RolePermission {
  roleId       String
  permissionId String

  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
  @@index([permissionId])
}
```

**Relationships**:
- `role` - Many-to-one with Role
- `permission` - Many-to-one with Permission

### 13. UserPermission Model

**File**: `prisma/schema.prisma` (lines 657-672)

**Fields**:
```prisma
model UserPermission {
  id          String   @id @default(cuid())
  userId      String
  permissionId String
  mode        String   @default("GRANT")
  createdBy   String?
  createdAt   DateTime @default(now())

  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  permission  Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@unique([userId, permissionId])
  @@index([userId])
}
```

**Relationships**:
- `user` - Many-to-one with User
- `permission` - Many-to-one with Permission

## AI Models

### 14. AIProvider Model

**File**: `prisma/schema.prisma` (lines 743-768)

**Fields**:
```prisma
model AIProvider {
  id              String   @id @default(cuid())
  name            String   @unique
  type            String
  baseUrl         String
  apiKeyEncrypted String?
  apiKeyPrefix    String?
  orgId           String?
  apiVersion      String?
  authType        String   @default("bearer")
  timeout         Int      @default(30)
  retryCount      Int      @default(2)
  rateLimitPerMin Int      @default(60)
  priority        Int      @default(100)
  isActive        Boolean  @default(false)
  lastConnectedAt DateTime?
  lastError       String?
  metadataJson    String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  models    AIModel[]
  usage     AIUsage[]
  credentials AICredential[]
}
```

**Relationships**:
- `models` - One-to-many with AIModel
- `usage` - One-to-many with AIUsage
- `credentials` - One-to-many with AICredential

### 15. AIModel Model

**File**: `prisma/schema.prisma` (lines 770-794)

**Fields**:
```prisma
model AIModel {
  id              String   @id @default(cuid())
  providerId      String
  modelId         String
  displayName     String
  description     String?
  category        String
  contextWindow   Int      @default(4096)
  maxOutputTokens Int      @default(2048)
  inputPricePer1M Float    @default(0)
  outputPricePer1M Float   @default(0)
  currency        String   @default("USD")
  isFree          Boolean  @default(false)
  capabilities    String?
  defaultTemp     Float    @default(0.7)
  defaultMaxTokens Int     @default(2048)
  rateLimitPerMin Int      @default(60)
  recommendedUse  String?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  provider        AIProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  usage           AIUsage[]
}
```

**Relationships**:
- `provider` - Many-to-one with AIProvider
- `usage` - One-to-many with AIUsage

### 16. AICredential Model

**File**: `prisma/schema.prisma` (lines 796-808)

**Fields**:
```prisma
model AICredential {
  id              String   @id @default(cuid())
  providerId      String
  label           String
  keyEncrypted    String
  keyPrefix       String?
  isActive        Boolean  @default(true)
  createdBy       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  provider        AIProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
}
```

**Relationships**:
- `provider` - Many-to-one with AIProvider

### 17. AIConfiguration Model

**File**: `prisma/schema.prisma` (lines 810-842)

**Fields**:
```prisma
model AIConfiguration {
  id              String   @id @default(cuid())
  routingMode     String   @default("free_first")
  defaultModelId  String?
  chatbotModelId  String?
  agentModelId    String?
  reasoningModelId String?
  codingModelId   String?
  fallbackModelId String?
  dailyBudgetUsd  Float    @default(10)
  monthlyBudgetUsd Float   @default(300)
  maxCostPerRequestUsd Float @default(0.5)
  maxCostPerUserUsd Float  @default(5)
  tokenQuotaDaily Int      @default(1000000)
  requestQuotaDaily Int    @default(5000)
  chatbotEnabled  Boolean  @default(true)
  agentEnabled    Boolean  @default(false)
  defaultTemperature Float  @default(0.7)
  defaultMaxTokens  Int     @default(2048)
  streamingEnabled  Boolean @default(true)
  emergencyShutdown Boolean @default(false)
  redactPII        Boolean  @default(true)
  redactCredentials Boolean @default(true)
  updatedAt       DateTime @updatedAt
  updatedBy       String?
}
```

**Note**: Single-row config (singleton)

### 18. AIUsage Model

**File**: `prisma/schema.prisma` (lines 844-867)

**Fields**:
```prisma
model AIUsage {
  id              String   @id @default(cuid())
  providerId      String?
  modelId         String?
  feature         String
  userId          String?
  conversationId  String?
  inputTokens     Int      @default(0)
  outputTokens    Int      @default(0)
  costUsd         Float    @default(0)
  latencyMs       Int      @default(0)
  status          String   @default("success")
  errorMessage    String?
  createdAt       DateTime @default(now())

  provider        AIProvider? @relation(fields: [providerId], references: [id], onDelete: SetNull)
  model           AIModel?    @relation(fields: [modelId], references: [id], onDelete: SetNull)

  @@index([createdAt])
  @@index([feature])
  @@index([userId])
  @@index([providerId, modelId])
}
```

**Indexes**:
- `createdAt` - Fast time-based queries
- `feature` - Fast feature-based queries
- `userId` - Fast user-based queries
- `providerId, modelId` - Fast provider/model queries

## Communication Models

### 19. WhatsappIntegration Model

**File**: `prisma/schema.prisma` (lines 1235-1260)

**Fields**:
```prisma
model WhatsappIntegration {
  id              String   @id @default(cuid())
  provider        String   @default("baileys")
  status          String   @default("disconnected")
  phoneNumber     String?
  displayName     String?
  credentialsJson String?
  qrCodeData      String?
  lastConnectedAt DateTime?
  lastError       String?
  autoReplyRulesJson String?
  defaultTemplateId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

### 20. WhatsappConversation Model

**File**: `prisma/schema.prisma` (lines 1280-1301)

**Fields**:
```prisma
model WhatsappConversation {
  id            String   @id @default(cuid())
  contactId     String
  assigneeId    String?
  status        String   @default("OPEN")
  unreadCount   Int      @default(0)
  lastMessageAt DateTime?
  lastMessagePreview String?
  lastMessageDirection String?
  tagsJson      String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  contact       WhatsappContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  assignee      User?           @relation(fields: [assigneeId], references: [id], onDelete: SetNull)
  messages      WhatsappMessage[]

  @@index([status])
  @@index([assigneeId])
}
```

### 21. ChatConversation Model

**File**: `prisma/schema.prisma` (lines 1024-1066)

**Fields**:
```prisma
model ChatConversation {
  id              String   @id @default(cuid())
  channel         String
  externalRef     String?
  userId          String?
  visitorName     String?
  visitorEmail    String?
  visitorPhone    String?
  status          String   @default("AI_ACTIVE")
  assignedAdminId String?
  aiContextJson   String?
  tagsJson        String?
  internalNotes   String?
  messageCount    Int      @default(0)
  aiMessageCount  Int      @default(0)
  humanMessageCount Int    @default(0)
  lastMessageAt   DateTime?
  lastMessagePreview String?
  lastMessageDirection String?
  lockedBy        String?
  lockedAt        DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  messages        ChatMessage[]
  assignments     ChatAssignment[]
  suggestedReplies ChatSuggestedReply[]
  auditLogs       ChatAuditLog[]

  @@index([status])
  @@index([channel])
  @@index([userId])
  @@index([assignedAdminId])
}
```

## Security Models

### 22. AuditLog Model

**File**: `prisma/schema.prisma` (lines 537-554)

**Fields**:
```prisma
model AuditLog {
  id            String   @id @default(cuid())
  actorUserId   String?
  actorType     String   @default("USER")
  action        String
  resourceType  String?
  resourceId    String?
  ipAddress     String?
  userAgent     String?
  metadata      String?
  createdAt     DateTime @default(now())

  user          User?    @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([action])
  @@index([resourceType])
  @@index([createdAt])
}
```

**Indexes**:
- `action` - Fast action-based queries
- `resourceType` - Fast resource-based queries
- `createdAt` - Fast time-based queries

**Note**: Used for audit trail, compliance, and security monitoring

### 23. OtpCode Model

**File**: `prisma/schema.prisma` (lines 676-701)

**Fields**:
```prisma
model OtpCode {
  id          String   @id @default(cuid())
  userId      String
  purpose     String
  codeHash    String
  channel     String
  sentTo      String
  expiresAt   DateTime
  usedAt      DateTime?
  attempts    Int      @default(0)
  maxAttempts Int      @default(5)
  requestedIp String?
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, purpose])
  @@index([expiresAt])
}
```

**Indexes**:
- `userId, purpose` - Fast user OTP lookup
- `expiresAt` - Fast expired OTP cleanup

## Database Performance

### Indexes

**Total Indexes**: ~50 indexes

**Most Important Indexes**:
1. `User.role` - Fast role filtering
2. `User.status` - Fast status filtering
3. `User.username` - Fast username lookup
4. `Session.expiresAt` - Fast expired session cleanup
5. `VpnAccount.serverId` - Fast server account lookup
6. `VpnAccount.status` - Fast status filtering
7. `Transaction.status` - Fast status filtering
8. `Payment.status` - Fast status filtering
9. `Server.status` - Fast status filtering
10. `Server.region` - Fast region filtering

### Query Optimization

**Best Practices**:
- ✅ Use `select` to limit fields
- ✅ Use `include` only when needed
- ✅ Use `where` filters to reduce dataset
- ✅ Use pagination for large datasets
- ✅ Avoid N+1 queries

**Potential N+1 Queries**:
- ⚠️ Loading server with protocols (may cause multiple queries)
- ⚠️ Loading customer with subscriptions (may cause multiple queries)
- ⚠️ Loading user with permissions (may cause multiple queries)

**Recommendations**:
- Use `include` with `select` to limit fields
- Use `select` for list endpoints
- Use `include` for detail endpoints
- Consider using `@prisma/extension-query` for optimization

### Transactions

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

**Benefits**:
- ✅ Atomic operations
- ✅ Consistency
- ✅ Isolation

## Data Integrity

### Constraints

**Unique Constraints**:
- `User.email` - Email uniqueness
- `User.username` - Username uniqueness
- `Session.token` - Token uniqueness
- `Customer.customerCode` - Customer code uniqueness
- `Reseller.resellerCode` - Reseller code uniqueness
- `Transaction.invoiceNumber` - Invoice number uniqueness
- `Role.key` - Role key uniqueness
- `Permission.key` - Permission key uniqueness
- `PackageProtocol` - Composite unique key
- `ServerProtocol` - Composite unique key
- `ServerPort` - Composite unique key
- `ChatConversation` - Composite unique key (channel + externalRef)
- `RolePermission` - Composite unique key
- `UserPermission` - Composite unique key

### Foreign Keys

**Total Foreign Keys**: ~60 foreign keys

**Cascade Rules**:
- `User` → `Customer`: Cascade
- `User` → `Reseller`: Cascade
- `Session` → `User`: Cascade
- `VpnAccount` → `Customer`: Cascade
- `VpnAccount` → `Server`: Cascade
- `VpnAccount` → `Protocol`: Cascade
- `Subscription` → `Customer`: Cascade
- `Transaction` → `Customer`: Cascade
- `Transaction` → `Reseller`: Cascade
- `Transaction` → `Package`: Cascade
- `Payment` → `Transaction`: Cascade
- `RolePermission` → `Role`: Cascade
- `RolePermission` → `Permission`: Cascade
- `UserPermission` → `User`: Cascade
- `UserPermission` → `Permission`: Cascade

## Security Assessment

### Strengths

- ✅ Password hashing (bcryptjs)
- ✅ Unique constraints on sensitive data
- ✅ Foreign key constraints
- ✅ Cascade delete for related data
- ✅ Audit logging
- ✅ Idempotency keys

### Weaknesses

- ⚠️ Session tokens not encrypted (stored in plaintext)
- ⚠️ API keys encrypted but stored in database
- ⚠️ No database-level encryption at rest
- ⚠️ No database-level encryption for sensitive fields

## Migration Strategy

### Current Migrations

- ✅ Schema defined in Prisma
- ✅ Migrations can be generated
- ✅ Rollback support

### Recommended Migrations

1. **Add indexes** for frequently queried fields
2. **Add foreign keys** for all relationships
3. **Add constraints** for data integrity
4. **Add indexes** for performance

## Recommendations

### High Priority

1. **Add More Indexes**
   - Index on frequently queried fields
   - Composite indexes for common queries
   - Covering indexes for complex queries

2. **Optimize Queries**
   - Analyze slow queries
   - Add query hints
   - Use query optimization tools

3. **Add Database Monitoring**
   - Query performance monitoring
   - Lock contention monitoring
   - Connection pool monitoring

### Medium Priority

4. **Implement Database Encryption**
   - Encrypt sensitive fields
   - Use column-level encryption
   - Use transparent data encryption

5. **Add Database Backups**
   - Automated backups
   - Backup retention policy
   - Backup verification

6. **Implement Read Replicas**
   - Read replica for reporting
   - Load balancing
   - Failover support

### Low Priority

7. **Add Database Partitioning**
   - Partition large tables
   - Improve query performance
   - Improve backup/restore

8. **Add Database Sharding**
   - Shard by customer/reseller
   - Improve scalability
   - Improve performance

---

**Last Updated**: 2026-11-07
**Audit Scope**: Complete database analysis
**Status**: Analysis complete
