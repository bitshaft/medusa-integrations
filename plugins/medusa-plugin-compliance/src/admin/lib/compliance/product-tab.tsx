import { DocumentText } from "@medusajs/icons"

import { GpsrSection } from "../../components/compliance/product-gpsr"
import { OmnibusSection } from "../../components/compliance/product-omnibus"
import { useProductSafety, useSettings } from "./api"
import { registerTab } from "./kit/integrations"

/**
 * The Compliance tab of the product page's Integrations card: GPSR data and
 * the Omnibus price history, in one place instead of two cards at the bottom.
 */
registerTab("product", {
  id: "compliance",
  brand: { label: "compliance.title", icon: DocumentText, color: "#0d9488" },
  order: 30,
  useState: (product) => {
    const settings = useSettings()
    const modules = settings.data?.enabled ? settings.data.settings.modules : null
    const gpsr = Boolean(modules?.gpsr)
    const safety = useProductSafety(product.id, gpsr)
    if (!modules || (!modules.gpsr && !modules.omnibus))
      return { visible: false, level: "none", loading: settings.isLoading }
    if (gpsr && !safety.data) return { visible: false, level: "none", loading: safety.isLoading }
    return { visible: true, level: gpsr && safety.data!.gaps.length ? "warn" : "ok" }
  },
  Panel: ({ entity }) => <ComplianceProductPanel productId={entity.id} />,
})

const ComplianceProductPanel = ({ productId }: { productId: string }) => {
  const settings = useSettings()
  const modules = settings.data?.enabled ? settings.data.settings.modules : null
  return (
    <div className="divide-y">
      {modules?.gpsr && <GpsrSection productId={productId} />}
      {modules?.omnibus && <OmnibusSection productId={productId} />}
    </div>
  )
}
