import { clx, Tabs } from "@medusajs/ui"
import type { ComponentType, CSSProperties, ReactNode } from "react"

import { ensureIconTileStyle, ICON_TILE_CLASS } from "./icon"

ensureIconTileStyle()

type IconComponent = ComponentType<{ style?: CSSProperties; color?: string; className?: string }>

/**
 * Tabs styled the same in every integration: rounded like the rest of the
 * admin (the Medusa default is a pill), a gap between the icon and the text,
 * and a coloured icon. The icon is optional, for small filter tabs.
 */
export const TAB_CLASS = "gap-x-1.5 rounded-md"

export const TabTrigger = ({
  value,
  icon: Icon,
  color,
  className,
  children,
}: {
  value: string
  icon?: IconComponent
  color?: string
  className?: string
  children: ReactNode
}) => (
  <Tabs.Trigger value={value} className={clx(TAB_CLASS, ICON_TILE_CLASS, className)}>
    {Icon && <Icon color={color} style={{ flexShrink: 0 }} />}
    {children}
  </Tabs.Trigger>
)

/**
 * The icon next to the page title: the sidebar tile in 32×32, so the page
 * and its menu entry look the same (and the icon is never white on white).
 */
export const PageIcon = ({ icon: Icon, color }: { icon: IconComponent; color: string }) => (
  <span
    aria-hidden
    className={clx(ICON_TILE_CLASS, "flex size-8 shrink-0 items-center justify-center rounded-lg shadow-borders-base")}
    style={{ backgroundColor: color, color: "#ffffff" }}
  >
    <Icon color="currentColor" />
  </span>
)

/**
 * A service's logo next to the page title. `fill` for logos that are a
 * coloured square themselves; otherwise the logo sits on a white tile.
 */
export const PageLogo = ({ src, fill = false }: { src: string; fill?: boolean }) => (
  <span
    aria-hidden
    className={clx(
      "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-borders-base",
      !fill && "bg-white p-1"
    )}
  >
    <img src={src} alt="" className={clx("size-full", fill ? "object-cover" : "object-contain")} />
  </span>
)
