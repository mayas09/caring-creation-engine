import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sellxChat } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
export type ChatStatus = "online" | "working" | "review";

const QUICK = [
  "Find bakeries in Raleigh",
  "Draft an email for [Business Name]",
  "Export my leads to CSV",
];

const STATUS_COPY: Record<ChatStatus, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-emerald-500" },
  working: { label: "Working", dot: "bg-amber-500" },
  review: { label: "Review needed", dot: "bg-red-500" },
};

export function AiChatPanel({
  onClose,
  leadContext,
  isOpen = true,
  onStatusChange,
}: {
  onClose?: (() => void) | undefined;
  leadContext?: string | undefined;
  isOpen?: boolean;
  onStatusChange?: (status: ChatStatus) => void;
}) {
  const chat = useServerFn(sellxChat);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "I'm sell.x — your autonomous sales assistant. I can manage leads, draft and queue outreach, run discovery and verification, export leads, schedule follow-ups, and pause automation. I never send email without your approval, and I always ask before changing settings.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen && !busy) onStatusChange?.("online");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    onStatusChange?.("working");
    try {
      const res = await chat({ data: { messages: next, leadContext } });
      setMessages(
        res.clearedMemory
          ? [{ role: "assistant", content: res.content }]
          : [...next, { role: "assistant", content: res.content }],
      );
      onStatusChange?.(isOpenRef.current ? "online" : "review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed");
      setMessages(messages);
      onStatusChange?.(isOpenRef.current ? "online" : "review");
    } finally {
      setBusy(false);
    }
  }

  const status: ChatStatus = busy ? "working" : "online";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">sell.x</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", STATUS_COPY[status].dot)} aria-hidden />
          {STATUS_COPY[status].label}
        </span>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={onClose}
            aria-label="Close chat"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary/15 px-3 py-2 text-sm"
                  : "max-w-[95%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed"
              }
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <p className="text-xs text-muted-foreground">
              sell.x is checking evidence and running the requested actions…
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask sell.x to research or take action…"
            className="min-h-[44px] resize-none"
          />
          <Button size="icon" onClick={() => void send(input)} disabled={busy} aria-label="Send">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
