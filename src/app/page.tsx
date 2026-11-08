"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/mvmp/AppShell";
import { LandingPage } from "@/components/landing/LandingPage";

/**
 * Smart root router — domain-based:
 * - mvmp.customer.com (or ?site=customer for sandbox testing) → Landing Page
 * - mvmp.admin.com (or localhost without query param) → Admin Panel
 *
 * In production: deploy with domain-based middleware/rewrites in next.config.ts
 * to route mvmp.customer.com → this landing page, mvmp.admin.com → AppShell.
 * In sandbox: use localhost:3000 for admin, localhost:3000/?site=customer for landing.
 */
export default function Home() {
  const searchParams = useSearchParams();
  const [renderMode, setRenderMode] = React.useState<"admin" | "landing">("admin");

  React.useEffect(() => {
    // Check query param first (sandbox testing)
    const siteParam = searchParams.get("site");
    if (siteParam === "customer") {
      setRenderMode("landing");
      return;
    }
    // Check hostname (production)
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      // Customer-facing domains: mvmp.customer.com, customer.mvmp.com, etc.
      if (hostname.includes("customer") || hostname.includes("landing") || hostname === "mvmp.id") {
        setRenderMode("landing");
      }
    }
  }, [searchParams]);

  if (renderMode === "landing") {
    return <LandingPage />;
  }
  return <AppShell />;
}
