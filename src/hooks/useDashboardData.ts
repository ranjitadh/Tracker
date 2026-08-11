import { useEffect, useState } from "react";
import { api } from "@/services/api/client";
import { useTrackerStore } from "@/stores/trackerStore";
import { useAuthStore } from "@/stores/authStore";
import type { DashboardData } from "@/types";

export function useDashboardData(refreshMs = 5000) {
  const [data, setData] = useState<DashboardData | null>(null);
  const session = useTrackerStore((s) => s.session);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await api.getDashboard();
        if (active) setData(result);
      } catch {
        // ignore transient failures
      }
    }
    load();
    const interval = setInterval(load, refreshMs);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [session?.id, user?.id, refreshMs]);

  return { data };
}
