import { cn } from "@/lib/utils";
import {
  EVIDENCE_TYPE_CLASS,
  EVIDENCE_TYPE_LABEL,
  FRESHNESS_META,
  freshnessOf,
  formatChecked,
  type EvidenceType,
} from "@/lib/evidence";

export function EvidenceBadge({
  type,
  code,
  className,
}: {
  type: EvidenceType;
  code?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium",
        EVIDENCE_TYPE_CLASS[type],
        className,
      )}
    >
      {EVIDENCE_TYPE_LABEL[type]}
      {code && <span className="font-mono opacity-70">{code}</span>}
    </span>
  );
}

export function FreshnessTag({ checkedAt }: { checkedAt: string }) {
  const f = freshnessOf(checkedAt);
  const meta = FRESHNESS_META[f];
  return (
    <span className={cn("text-[11px]", meta.className)}>
      {meta.dot} {meta.label} · checked {formatChecked(checkedAt)}
    </span>
  );
}

export function ClaimRow({
  claim,
  type,
  source,
  code,
  checkedAt,
}: {
  claim: string;
  type: EvidenceType;
  source?: string | null;
  code?: string;
  checkedAt?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceBadge type={type} code={code} />
        <span className="text-sm">{claim}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {source && <span>Source: {source}</span>}
        {checkedAt && <FreshnessTag checkedAt={checkedAt} />}
      </div>
    </div>
  );
}
