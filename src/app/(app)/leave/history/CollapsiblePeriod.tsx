"use client";

import { useState, type ReactNode } from "react";
import { Panel } from "@/components/ui";

export default function CollapsiblePeriod({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  return (
    <Panel title={title} hint={hint} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)}>
      {children}
    </Panel>
  );
}
