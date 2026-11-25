import type { ComponentType, CSSProperties, ReactNode } from "react"

import { ensureIconTileStyle, ICON_TILE_CLASS } from "./icon"

type IconComponent = ComponentType<{ style?: CSSProperties; color?: string }>

export const NAV_TILE_CLASS = "bitshaft-nav-tile"

const STYLE_ID = "bitshaft-nav-tile-style"

/**
 * The admin puts extension icons in a 15×15 box with `overflow: hidden`,
 * centred in its 20×20 sidebar tile. The tile stays in the normal flow (so it
 * scrolls with the sidebar) and one CSS rule lets that box show it whole: a
 * 20×20 box moved by -2.5px then fills the sidebar tile exactly. Where `:has`
 * is not supported the tile is only cut to the inner 15×15, still in place.
 */
function ensureNavTileStyle(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `:has(> .${NAV_TILE_CLASS}) { overflow: visible !important; }`
  document.head.appendChild(style)
}

const NAV_TILE_STYLE: CSSProperties = {
  width: 20,
  height: 20,
  margin: -2.5,
  borderRadius: 4,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}

/** A tile covering the whole 20×20 sidebar square, for custom `defineRouteConfig` icons. */
export const NavTile = ({
  background,
  className,
  children,
}: {
  background?: string
  className?: string
  children: ReactNode
}) => {
  ensureNavTileStyle()
  return (
    <span
      className={[NAV_TILE_CLASS, className].filter(Boolean).join(" ")}
      style={{ ...NAV_TILE_STYLE, backgroundColor: background }}
    >
      {children}
    </span>
  )
}

/** A sidebar icon for `defineRouteConfig`: a white icon on a colored tile. */
export function navIcon(Icon: IconComponent, background: string): ComponentType {
  ensureIconTileStyle()
  const NavIcon = () => (
    <NavTile background={background} className={ICON_TILE_CLASS}>
      <span style={{ display: "flex", color: "#ffffff" }}>
        <Icon color="currentColor" style={{ width: 14, height: 14, flexShrink: 0 }} />
      </span>
    </NavTile>
  )
  NavIcon.displayName = "NavIcon"
  return NavIcon
}
