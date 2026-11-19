import { Container, Heading, Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { type FillScope, useCurrencyStatus, useSettings } from "../../lib/currency/api"
import { FillModalButton } from "./fill-modal"

/** A small card on a Medusa page with "Fill from PLN" for its scope. Nothing when the plugin is off. */
export const ScopeCard = ({
  scope,
  title,
  name,
  children,
}: {
  scope: FillScope
  title: string
  /** What is filled, for the modal's title ("Wiertarka", "Kolekcja Lato"). */
  name: string
  children?: ReactNode
}) => {
  const { t } = useTranslation()
  const status = useCurrencyStatus()
  const enabled = status.data?.enabled === true
  const settings = useSettings(enabled)
  const store = settings.data?.store
  const base = store?.base?.code?.toUpperCase()
  const others = (store?.currencies ?? []).filter(
    (c) => c.code !== store?.base?.code && settings.data?.rules[c.code]?.enabled !== false
  )
  if (!enabled || !base || !others.length) return null
  const demo = status.data?.enabled === true && status.data.demo
  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h2">{title}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("currency.widget.targets", { codes: others.map((c) => c.code.toUpperCase()).join(", ") })}
          </Text>
        </div>
        <FillModalButton
          scope={scope}
          demo={demo}
          title={t("currency.fill.modalTitle", { name, base })}
          label={t("currency.fill.fromBase", { base })}
        />
      </div>
      {children}
    </Container>
  )
}
