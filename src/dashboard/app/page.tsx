"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import ApprovalQueue from "@/components/ApprovalQueue";
import AllApprovals from "@/components/AllApprovals";
import AlertFeed from "@/components/AlertFeed";
import SiteOverview from "@/components/SiteOverview";
import ConfigManager from "@/components/ConfigManager";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [pendingCount, setPendingCount] = useState(0);

  console.log("Session data:", session);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold tracking-tight">SEO Agent</span>
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm text-muted-foreground">
              Operator Dashboard
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {session?.user?.name ?? "Operator"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Tabs defaultValue="approvals" orientation="vertical">
          <TabsList className="mb-6">
            <TabsTrigger value="approvals" className="relative">
              Approvals
              {pendingCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-1.5 h-5 rounded-full px-1.5 text-xs"
                >
                  {pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="alerts">Alerts</TabsTrigger>
            <TabsTrigger value="overview">Site Overview</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
          </TabsList>

          <TabsContent value="approvals">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Approval Queue</h2>
              <p className="text-sm text-muted-foreground">
                Review and action pending SEO content before it goes live.
                Real-time updates via WebSocket.
              </p>
            </div>
            <ApprovalQueue onCountChange={setPendingCount} />
            
            <Separator className="my-10" />

            <AllApprovals />
          </TabsContent>

          <TabsContent value="alerts">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Live Alert Feed</h2>
              <p className="text-sm text-muted-foreground">
                Real-time alerts from all SEO agent modules.
              </p>
            </div>
            <AlertFeed />
          </TabsContent>

          <TabsContent value="overview">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Site Overview</h2>
              <p className="text-sm text-muted-foreground">
                Performance snapshot across all managed sites. Auto-refreshes
                every 60 minutes.
              </p>
            </div>
            <SiteOverview />
          </TabsContent>

          <TabsContent value="config">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Config Manager</h2>
              <p className="text-sm text-muted-foreground">
                Add cities, register websites, and edit orchestrator settings.
              </p>
            </div>
            <ConfigManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
