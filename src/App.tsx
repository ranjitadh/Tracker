import { useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useTrackerStore } from "@/stores/trackerStore";
import { useSyncStore } from "@/stores/syncStore";
import { AppShell } from "@/components/layout/AppShell";
import { LoginScreen } from "@/screens/LoginScreen";
import { isTauriRuntime } from "@/services/api/client";

function App() {
  const user = useAuthStore((s) => s.user);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
    useTrackerStore.getState().initialize().catch(() => undefined);
    useSyncStore.getState().refresh();
  }, [initialize]);

  // Always render AppShell in Desktop App mode
  if (isTauriRuntime()) {
    return <AppShell />;
  }

  return user ? <AppShell /> : <LoginScreen />;
}

export default App;
