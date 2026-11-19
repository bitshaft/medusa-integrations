import { Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { WhitelistVatStatus } from "../../lib/whitelist-vat/api"
import { OptionsCard } from "../../lib/whitelist-vat/kit/page"

type EnabledStatus = Extract<WhitelistVatStatus, { enabled: true }>

/** The registers and options in use. Read-only: they are set in medusa-config.ts. */
export const Settings = ({ status }: { status: EnabledStatus }) => {
  const { t } = useTranslation()
  const { mf, gus, vies } = status.registers
  const { options } = status

  const onOff = (value: boolean) => (
    <StatusBadge color={value ? "green" : "grey"}>
      {value ? t("whitelist-vat.settings.on") : t("whitelist-vat.settings.off")}
    </StatusBadge>
  )

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="overflow-hidden divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("whitelist-vat.settings.registers")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("whitelist-vat.settings.subtitle")}
          </Text>
        </div>

        <Register
          name={t("whitelist-vat.source.mf")}
          hint={t("whitelist-vat.settings.mfHint")}
          state={onOff(mf.enabled)}
        >
          {mf.enabled && (
            <>
              <Detail label={t("whitelist-vat.settings.environment")}>{mf.environment}</Detail>
              <Detail label={t("whitelist-vat.tiles.quota")}>
                {t("whitelist-vat.settings.mfQuota", { used: mf.requests_today, limit: mf.daily_limit })}
              </Detail>
            </>
          )}
        </Register>

        <Register
          name={t("whitelist-vat.source.gus")}
          hint={
            gus.demo
              ? t("whitelist-vat.settings.gusDemo")
              : gus.enabled
                ? t("whitelist-vat.settings.gusHint")
                : t("whitelist-vat.settings.gusOff")
          }
          state={
            gus.demo ? <StatusBadge color="orange">{t("whitelist-vat.settings.demo")}</StatusBadge> : onOff(gus.enabled)
          }
        >
          {gus.demo && (
            <Detail label={t("whitelist-vat.settings.demoNips")}>
              <span className="font-mono">1112223332</span> {t("whitelist-vat.status.inactive")},{" "}
              <span className="font-mono">9876543210</span> {t("whitelist-vat.status.not_found")}
            </Detail>
          )}
          {gus.enabled && !gus.demo && (
            <>
              <Detail label={t("whitelist-vat.settings.environment")}>{gus.environment}</Detail>
            </>
          )}
        </Register>

        <Register
          name={t("whitelist-vat.source.vies")}
          hint={
            vies.enabled && !vies.requester_vat_number
              ? t("whitelist-vat.settings.viesNoRequester")
              : t("whitelist-vat.settings.viesHint")
          }
          state={onOff(vies.enabled)}
        >
          {vies.enabled && vies.requester_vat_number && (
            <Detail label={t("whitelist-vat.settings.viesRequester")}>
              <span className="font-mono">{vies.requester_vat_number}</span>
            </Detail>
          )}
        </Register>
      </Container>

      <OptionsCard
        version={status.version}
        rows={[
          ["cacheTtlHours", options.cache_ttl_hours],
          ["timeoutMs", options.timeout_ms],
          ["defaultCountry", options.default_country],
          ["taxIdKeys", options.tax_id_keys],
          ["orders.verifyOnPlaced", options.verify_on_order_placed],
          ["checkout.rejectOnCompletion", options.reject_on_completion],
          [
            "checkout.rejectStatuses",
            options.reject_on_completion ? options.reject_statuses.map((v) => t(`whitelist-vat.status.${v}`)) : null,
          ],
          ["store.enabled", options.store_route],
          ["store.rateLimitPerMinute", options.store_route ? options.store_rate_limit_per_minute : null],
          ["demo", status.demo],
        ]}
      />
    </div>
  )
}

const Register = ({
  name,
  hint,
  state,
  children,
}: {
  name: string
  hint: string
  state: ReactNode
  children?: ReactNode
}) => (
  <div className="flex flex-col gap-y-2 px-6 py-4">
    <div className="flex items-start justify-between gap-x-4">
      <div>
        <Text size="small" weight="plus">
          {name}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {hint}
        </Text>
      </div>
      {state}
    </div>
    {children && <div className="flex flex-col gap-y-1">{children}</div>}
  </div>
)

const Detail = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-3 gap-x-4">
    <Text size="small" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" className="col-span-2">
      {children}
    </Text>
  </div>
)
