import type { ReactNode } from "react";

export type TabItem = Readonly<{
  key: string;
  label: ReactNode;
  count: number;
  selected: boolean;
  onSelect: () => void;
}>;

export function Tabs({ items, label, className = "" }: Readonly<{
  items: readonly TabItem[];
  label: string;
  className?: string;
}>) {
  return (
    <div aria-label={label} className={`filter-tabs${className ? ` ${className}` : ""}`} role="tablist">
      {items.map((item) => <button aria-selected={item.selected} className={item.selected ? "filter-tab selected" : "filter-tab"} key={item.key} onClick={item.onSelect} role="tab" type="button">{item.label}<span>{item.count}</span></button>)}
    </div>
  );
}
