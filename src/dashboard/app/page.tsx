"use client";

import { getCookie } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardPage() {
  const router = useRouter();
  
  useEffect(() => {
    const token = getCookie("seo-token");

    if (token) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Main content */}
      <main className="mx-auto w-full max-w-7xl h-9/10 flex-1 px-4 py-6 grid place-items-center">
        Loading...
      </main>
    </div>
  );
}
