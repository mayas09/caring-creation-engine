import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sellxChat } from "@/lib/ai.functions";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK = [
  "Explain this lead's ordering gap",
  "What evidence is missing here?",
  "Draft a short, respectful opener",
];

export function AiChatPanel({ onClose, leadContext }: { onClose?: () => void; leadContext?: string }) {
  const chat = useServerFn(sellxChat);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "I'm sell.x — your research partner. I label every claim as Verified, Calculated, Inferred, or Unknown. Ask me about a lead, an ordering gap, or outreach copy.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await chat({ data: { messages: next, leadContext } });
      setMessages([...next, { role: "assistant", content: res.content }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI request failed");
      setMessages(messages);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-semibold">sell.x</span>
        <span className="text-xs text-muted-foreground">research partner</span>
        {onClose && (
          <Button variant="ghost" size="icon" className="ml-auto" onClick={onClose} aria-label="Close chat">
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
          {busy && <p className="text-xs text-muted-foreground">sell.x is checking the evidence…</p>}
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
            placeholder="Ask about a lead, gap, or message…"
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
