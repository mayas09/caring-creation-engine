import type { ReactNode } from "react";
import { CheckSquare2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

type MessageBlock =
  | { type: "header"; level: number; content: string }
  | { type: "paragraph"; content: string }
  | { type: "bullets"; items: string[] }
  | { type: "checklist"; items: Array<{ checked: boolean; content: string }> }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "actions"; items: string[] }
  | { type: "evidence"; items: string[] };

function cleanInline(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function parseCells(line: string) {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cleanInline);
}

function isTableDivider(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function parseMessage(content: string): MessageBlock[] {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: MessageBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    const header = /^(#{1,3})\s+(.+)$/.exec(line);
    if (header) {
      blocks.push({
        type: "header",
        level: header[1]?.length ?? 1,
        content: cleanInline(header[2] ?? ""),
      });
      index += 1;
      continue;
    }

    if (line.startsWith("|") && isTableDivider(lines[index + 1]?.trim() ?? "")) {
      const headers = parseCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index]?.trim() ?? "").startsWith("|")) {
        rows.push(parseCells(lines[index] ?? ""));
        index += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    const actionLine = /^(?:ACTIONS?|NEXT ACTIONS?):\s*(.+)$/i.exec(line);
    if (actionLine) {
      const items = Array.from((actionLine[1] ?? "").matchAll(/\[([^\]]+)\]/g), (match) =>
        cleanInline(match[1] ?? ""),
      );
      if (items.length) blocks.push({ type: "actions", items });
      index += 1;
      continue;
    }

    const evidenceLine = /^EVIDENCE(?: IDS?)?:\s*(.+)$/i.exec(line);
    if (evidenceLine) {
      const items = (evidenceLine[1] ?? "").split(/[,|]/).map(cleanInline).filter(Boolean);
      blocks.push({ type: "evidence", items });
      index += 1;
      continue;
    }

    if (/^[-*•]\s+\[[ xX]\]\s+/.test(line)) {
      const items: Array<{ checked: boolean; content: string }> = [];
      while (index < lines.length) {
        const item = /^[-*•]\s+\[([ xX])\]\s+(.+)$/.exec(lines[index]?.trim() ?? "");
        if (!item) break;
        items.push({
          checked: item[1]?.toLowerCase() === "x",
          content: cleanInline(item[2] ?? ""),
        });
        index += 1;
      }
      blocks.push({ type: "checklist", items });
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^[-*•]\s+(.+)$/.exec(lines[index]?.trim() ?? "");
        if (!item) break;
        items.push(cleanInline(item[1] ?? ""));
        index += 1;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const paragraphLine = lines[index]?.trim() ?? "";
      const nextLine = lines[index + 1]?.trim() ?? "";
      if (
        !paragraphLine ||
        /^(#{1,3})\s+/.test(paragraphLine) ||
        /^[-*•]\s+/.test(paragraphLine) ||
        /^(?:ACTIONS?|NEXT ACTIONS?|EVIDENCE(?: IDS?)?):/i.test(paragraphLine) ||
        (paragraphLine.startsWith("|") && isTableDivider(nextLine))
      ) {
        break;
      }
      paragraph.push(cleanInline(paragraphLine));
      index += 1;
      if (paragraph.length === 2) break;
    }
    if (paragraph.length) blocks.push({ type: "paragraph", content: paragraph.join(" ") });
  }

  return blocks;
}

function renderInline(content: string): ReactNode {
  const parts = content.split(/(\[(?:Verified|Calculated|Inferred|Unknown)\])/gi);
  return parts.map((part, index) => {
    const label = /^\[(Verified|Calculated|Inferred|Unknown)\]$/i.exec(part)?.[1]?.toLowerCase();
    if (!label) return part;

    const tone = {
      verified: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      calculated: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      inferred: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      unknown: "border-border bg-background/70 text-muted-foreground",
    }[label];

    return (
      <span
        key={`${part}-${index}`}
        className={`mr-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
      >
        {label}
      </span>
    );
  });
}

export function StructuredAssistantMessage({
  content,
  onAction,
  disabled = false,
}: {
  content: string;
  onAction?: (action: string) => void;
  disabled?: boolean;
}) {
  const blocks = parseMessage(content);

  return (
    <article className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="space-y-3 p-4">
        {blocks.map((block, index) => {
          if (block.type === "header") {
            const className =
              block.level === 1
                ? "text-base font-bold uppercase tracking-[0.08em] text-foreground"
                : "border-t border-border/70 pt-3 text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground";
            return (
              <h3 key={index} className={className}>
                {block.content}
              </h3>
            );
          }

          if (block.type === "paragraph") {
            return (
              <p key={index} className="text-sm leading-6 text-foreground/85">
                {renderInline(block.content)}
              </p>
            );
          }

          if (block.type === "bullets") {
            return (
              <ul key={index} className="space-y-2">
                {block.items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-5 text-foreground/85">
                    <span className="mt-1 text-primary" aria-hidden>
                      •
                    </span>
                    <span>{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );
          }

          if (block.type === "checklist") {
            return (
              <ul key={index} className="space-y-2 rounded-lg bg-muted/50 p-3">
                {block.items.map((item) => (
                  <li key={item.content} className="flex gap-2 text-sm text-foreground/85">
                    {item.checked ? (
                      <CheckSquare2 className="mt-0.5 size-4 shrink-0 text-primary" />
                    ) : (
                      <Square className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span>{renderInline(item.content)}</span>
                  </li>
                ))}
              </ul>
            );
          }

          if (block.type === "table") {
            return (
              <div key={index} className="overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full min-w-72 text-left text-xs">
                  <thead className="bg-muted/70 text-muted-foreground">
                    <tr>
                      {block.headers.map((header) => (
                        <th
                          key={header}
                          className="px-3 py-2 font-semibold uppercase tracking-wide"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`${row.join("-")}-${rowIndex}`}>
                        {block.headers.map((_, cellIndex) => (
                          <td key={cellIndex} className="px-3 py-2.5 align-top text-foreground/85">
                            {renderInline(row[cellIndex] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          if (block.type === "evidence") {
            return (
              <div
                key={index}
                className="flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-3"
              >
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Evidence
                </span>
                {block.items.map((item) => (
                  <span
                    key={item}
                    className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>
            );
          }

          return (
            <div key={index} className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
              {block.items.map((action) => (
                <Button
                  key={action}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || !onAction}
                  onClick={() => onAction?.(action)}
                >
                  {action}
                </Button>
              ))}
            </div>
          );
        })}
      </div>
    </article>
  );
}
