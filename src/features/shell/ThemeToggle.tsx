import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ThemePreference } from "./theme";

type ThemeToggleProps = {
  preference: ThemePreference;
  onCycle: () => void;
};

const THEMES: Record<ThemePreference, { icon: LucideIcon; label: string }> = {
  system: { icon: Monitor, label: "시스템 설정" },
  light: { icon: Sun, label: "라이트" },
  dark: { icon: Moon, label: "다크" },
};

/** 누를 때마다 시스템 → 라이트 → 다크 순서로 테마를 바꾸는 버튼. 아이콘은 지금 고른 값을 보여 줍니다. */
export function ThemeToggle({ preference, onCycle }: ThemeToggleProps) {
  const { icon: Icon, label } = THEMES[preference];
  const description = `테마: ${label}`;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`${description}. 눌러서 바꾸기`}
      title={description}
      onClick={onCycle}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
