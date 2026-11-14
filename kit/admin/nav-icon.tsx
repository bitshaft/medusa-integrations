import type { ComponentType, CSSProperties } from "react"

type IconComponent = ComponentType<{ style?: CSSProperties; color?: string }>

/**
 * Covers the admin's whole 20×20 sidebar tile. The admin puts extension
 * icons in a 15×15 box with `overflow: hidden`, centred in that tile. An
 * absolutely positioned element is not clipped by a non-positioned
 * ancestor, and without `top`/`left` it stays where it would be in the
 * flow, so a 20×20 box moved by -2.5px fills the tile exactly.
 */
export const NAV_TILE_STYLE: CSSProperties = {
  position: "absolute",
  width: 20,
  height: 20,
  margin: -2.5,
  borderRadius: 4,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}

/** A sidebar icon for `defineRouteConfig`: a white icon on a colored tile. */
export function navIcon(Icon: IconComponent, background: string): ComponentType {
  const NavIcon = () => (
    <span style={{ ...NAV_TILE_STYLE, backgroundColor: background, color: "#ffffff" }}>
      <Icon color="currentColor" style={{ width: 14, height: 14, flexShrink: 0 }} />
    </span>
  )
  NavIcon.displayName = "NavIcon"
  return NavIcon
}
