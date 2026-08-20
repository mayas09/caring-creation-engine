import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Radar,
  PhoneCall,
  MessageSquare,
  Send,
  KanbanSquare,
  Inbox,
  BarChart3,
  Settings,
  ShieldCheck,
  Menu,
  LogOut,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { AiChatPanel } from "@/components/ai/AiChatPanel";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/discovery", label: "Discovery", icon: Radar },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/chat", label: "AI Chat", icon: MessageSquare },
  { to: "/campaigns", label: "Campaigns", icon: Send },
  { to: "/outbox", label: "Outbox", icon: Inbox },
  { to: "/calls", label: "Calls", icon: PhoneCall },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/compliance", label: "Compliance", icon: ShieldCheck },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileNav, setMobileNav] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileNav(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        {nav}
        <div className="border-t border-sidebar-border p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
            <Brand onClose={() => setMobileNav(false)} />
            {nav}
            <div className="border-t border-sidebar-border p-3">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
                <LogOut className="size-4" /> Sign out
              </Button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Research partner mode — signals, not truths. Every claim carries a source.
          </p>
          <Button size="sm" variant="outline" onClick={() => setChatOpen((v) => !v)}>
            <Sparkles className="size-4" /> sell.x
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {/* AI chat panel */}
      {chatOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 xl:hidden"
            onClick={() => setChatOpen(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card xl:static xl:z-auto xl:w-96">
            <AiChatPanel onClose={() => setChatOpen(false)} />
          </aside>
        </>
      )}
    </div>
  );
}

function Brand({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
      <div className="flex size-8 items-center justify-center rounded-md bg-primary/15 text-primary">
        <ShieldCheck className="size-4" />
      </div>
      <span className="text-sm font-semibold tracking-tight">sell.x</span>
      {onClose && (
        <Button variant="ghost" size="icon" className="ml-auto" onClick={onClose}>
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
