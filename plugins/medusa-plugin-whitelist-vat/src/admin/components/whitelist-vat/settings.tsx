import { Badge, Container, Heading, StatusBadge, Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { WhitelistVatStatus } from "../../lib/whitelist-vat/api"

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
          hint={gus.enabled ? t("whitelist-vat.settings.gusHint") : t("whitelist-vat.settings.gusOff")}
          state={onOff(gus.enabled)}
        >
          {gus.enabled && (
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

      <Container className="overflow-hidden divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("whitelist-vat.settings.options")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("whitelist-vat.settings.subtitle")}
          </Text>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-4 md:grid-cols-2 xl:grid-cols-3">
          <Option label={t("whitelist-vat.settings.cacheTtl")}>
            {t("whitelist-vat.settings.hours", { count: options.cache_ttl_hours })}
          </Option>
          <Option label={t("whitelist-vat.settings.timeout")}>
            {t("whitelist-vat.settings.seconds", { count: options.timeout_ms / 1000 })}
          </Option>
          <Option label={t("whitelist-vat.settings.defaultCountry")}>{options.default_country}</Option>
          <Option label={t("whitelist-vat.settings.taxIdKeys")}>
            <Tags values={options.tax_id_keys} />
          </Option>
          <Option label={t("whitelist-vat.settings.verifyOnOrder")}>{onOff(options.verify_on_order_placed)}</Option>
          <Option label={t("whitelist-vat.settings.rejectOnCompletion")}>{onOff(options.reject_on_completion)}</Option>
          {options.reject_on_completion && (
            <Option label={t("whitelist-vat.settings.rejectStatuses")}>
              <Tags values={options.reject_statuses.map((value) => t(`whitelist-vat.status.${value}`))} />
            </Option>
          )}
          <Option label={t("whitelist-vat.settings.storeRoute")}>
            <div className="flex flex-col gap-y-1">
              {onOff(options.store_route)}
              {options.store_route && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t("whitelist-vat.settings.storeLimit", { count: options.store_rate_limit_per_minute })}
                </Text>
              )}
            </div>
          </Option>
          <Option label={t("whitelist-vat.settings.version")}>{status.version}</Option>
        </div>
      </Container>
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

const Option = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-y-1">
    <Text size="xsmall" className="text-ui-fg-subtle">
      {label}
    </Text>
    <div className="txt-compact-small">{children}</div>
  </div>
)

const Tags = ({ values }: { values: string[] }) => (
  <div className="flex flex-wrap gap-1">
    {values.map((value) => (
      <Badge key={value} size="2xsmall">
        {value}
      </Badge>
    ))}
  </div>
)
