import { cn } from "@/lib/utils";

type RegionPlaceholderProps = {
  /** 이 자리에 들어올 것을 알리는 짧은 문구 */
  label: string;
  className?: string;
};

/** 아직 기능이 들어오지 않은 영역에 두는 안내 문구. */
export function RegionPlaceholder({
  label,
  className,
}: RegionPlaceholderProps) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>{label}</p>
  );
}
