import { useNavStore } from "@/stores/navStore";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Dashboard } from "@/screens/Dashboard";
import { Timesheet } from "@/screens/Timesheet";
import { Screenshots } from "@/screens/Screenshots";
import { Projects } from "@/screens/Projects";
import { Settings } from "@/screens/Settings";
import { AdminPanel } from "@/screens/AdminPanel";

import { motion, AnimatePresence } from "framer-motion";

function ViewSwitch() {
  const view = useNavStore((s) => s.view);
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        {(() => {
          switch (view) {
            case "dashboard":
              return <Dashboard />;
            case "timesheet":
              return <Timesheet />;
            case "screenshots":
              return <Screenshots />;
            case "projects":
              return <Projects />;
            case "admin":
              return <AdminPanel />;
            case "settings":
              return <Settings />;
          }
        })()}
      </motion.div>
    </AnimatePresence>
  );
}

export function AppShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-white text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <TopBar />
        <main className="flex-1 overflow-y-auto px-6 pt-2 pb-6 bg-slate-50/40">
          <div className="mx-auto max-w-6xl">
            <ViewSwitch />
          </div>
        </main>
      </div>
    </div>
  );
}
