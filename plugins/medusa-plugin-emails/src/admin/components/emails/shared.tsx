import { Tabs } from "@medusajs/ui"
import type { ComponentType, CSSProperties, ReactNode } from "react"

/** Rounded like the rest of the admin (not a pill), with spacing and a coloured icon. */
export const TAB_CLASS = "gap-x-1.5 rounded-md"

export const TabTrigger = ({
  value,
  icon: Icon,
  color,
  children,
}: {
  value: string
  icon: ComponentType<{ style?: CSSProperties; color?: string }>
  color: string
  children: ReactNode
}) => (
  <Tabs.Trigger value={value} className={TAB_CLASS}>
    <Icon color={color} style={{ flexShrink: 0 }} />
    {children}
  </Tabs.Trigger>
)
