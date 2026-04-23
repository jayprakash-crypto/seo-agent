"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ApprovalQueue from "@/components/ApprovalQueue";
import AllApprovals from "@/components/AllApprovals";
import AlertFeed from "@/components/AlertFeed";
import SiteOverview from "@/components/SiteOverview";
import ConfigManager from "@/components/ConfigManager";
import PageHeader from "@/components/PageHeader";

import { UserContext as UserProvider } from "@/providers/users.provider";

interface User {
  created_at: string;
  email: string;
  id: string;
  name: string;
  updated_at: string;
}

export default function DashboardPage() {
  const [pendingCount, setPendingCount] = useState(0);
  const [user, setUser] = useState<User | null>();

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/user");
      const json = await res.json();

      setUser(json.user ?? {});
    } catch (error) {}
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <UserProvider value={user}>
      <div className="flex min-h-screen flex-col">
        {/* Top nav */}
        <PageHeader />

        {/* Main content */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
          <Tabs defaultValue="approvals" orientation="horizontal">
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
    </UserProvider>
  );
}
