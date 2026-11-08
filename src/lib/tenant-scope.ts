// MVMP — Tenant scope resolution
//
// Converts the session user into the data boundary that every query must respect.
// Staff roles see everything; RESELLER sees its own subtree; CUSTOMER sees itself.
//
// This is intentionally explicit rather than inferred from the permission string:
// holding `<module>.view` means "may use this module", never "may read every row".

import { db } from "@/lib/db";

export type TenantScope =
  | { kind: "all" }
  | { kind: "reseller"; resellerId: string; resellerIds: string[] }
  | { kind: "customer"; customerId: string }
  | { kind: "none" };

const STAFF_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "OPERATOR",
  "FINANCE",
  "CUSTOMER_SERVICE",
]);

/** Maximum reseller hierarchy depth walked when building a subtree. */
const MAX_HIERARCHY_DEPTH = 5;

export async function resolveTenantScope(user: {
  id: string;
  role: string;
}): Promise<TenantScope> {
  if (STAFF_ROLES.has(user.role)) return { kind: "all" };

  if (user.role === "CUSTOMER") {
    const customer = await db.customer.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    return customer ? { kind: "customer", customerId: customer.id } : { kind: "none" };
  }

  if (user.role === "RESELLER") {
    const reseller = await db.reseller.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!reseller) return { kind: "none" };

    const resellerIds = [reseller.id];
    let frontier = [reseller.id];

    for (let depth = 0; depth < MAX_HIERARCHY_DEPTH && frontier.length > 0; depth++) {
      const children = await db.reseller.findMany({
        where: { parentResellerId: { in: frontier } },
        select: { id: true },
      });
      frontier = children.map((c) => c.id).filter((id) => !resellerIds.includes(id));
      resellerIds.push(...frontier);
    }

    return { kind: "reseller", resellerId: reseller.id, resellerIds };
  }

  return { kind: "none" };
}

/** Prisma `where` fragment for the Customer model. */
export function customerScopeWhere(scope: TenantScope): Record<string, any> {
  switch (scope.kind) {
    case "all":
      return {};
    case "customer":
      return { id: scope.customerId };
    case "reseller":
      return { resellerId: { in: scope.resellerIds } };
    default:
      return { id: { in: [] } };
  }
}

/** Prisma `where` fragment for models reachable through `customer`. */
export function customerOwnedScopeWhere(scope: TenantScope): Record<string, any> {
  switch (scope.kind) {
    case "all":
      return {};
    case "customer":
      return { customerId: scope.customerId };
    case "reseller":
      return { customer: { resellerId: { in: scope.resellerIds } } };
    default:
      return { id: { in: [] } };
  }
}

export function canAccessCustomer(
  scope: TenantScope,
  customer: { id: string; resellerId?: string | null }
): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "customer") return customer.id === scope.customerId;
  if (scope.kind === "reseller") {
    return !!customer.resellerId && scope.resellerIds.includes(customer.resellerId);
  }
  return false;
}

export function canAccessVpnAccount(
  scope: TenantScope,
  account: { customerId: string; customer?: { resellerId?: string | null } | null }
): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "customer") return account.customerId === scope.customerId;
  if (scope.kind === "reseller") {
    const resellerId = account.customer?.resellerId ?? null;
    return !!resellerId && scope.resellerIds.includes(resellerId);
  }
  return false;
}

export function canAccessTransaction(
  scope: TenantScope,
  tx: {
    customerId: string;
    resellerId?: string | null;
    customer?: { resellerId?: string | null } | null;
  }
): boolean {
  if (scope.kind === "all") return true;
  if (scope.kind === "customer") return tx.customerId === scope.customerId;
  if (scope.kind === "reseller") {
    const resellerId = tx.resellerId ?? tx.customer?.resellerId ?? null;
    return !!resellerId && scope.resellerIds.includes(resellerId);
  }
  return false;
}
