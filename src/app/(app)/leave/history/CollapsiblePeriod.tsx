"use client";

import { useState, type ReactNode } from "react";
import { Panel } from "@/components/ui";

export default function CollapsiblePeriod({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <Panel title={title} hint={hint} collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)}>
      {children}
    </Panel>
  );
}
