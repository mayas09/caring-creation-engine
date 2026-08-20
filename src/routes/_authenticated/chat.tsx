import { createFileRoute } from "@tanstack/react-router";
import { AiChatPanel } from "@/components/ai/AiChatPanel";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "AI Chat — sell.x" },
      {
        name: "description",
        content:
          "Chat with sell.x, the research partner that labels every claim as Verified, Calculated, Inferred or Unknown.",
      },
      { property: "og:title", content: "AI Chat — sell.x" },
      { property: "og:description", content: "An AI research partner that never invents numbers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <div className="mx-auto h-[calc(100vh-8rem)] max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
      <AiChatPanel />
    </div>
  ),
});
