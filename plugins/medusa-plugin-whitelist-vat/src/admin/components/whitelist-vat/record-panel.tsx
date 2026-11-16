import { Badge, Button, Container, Heading, Skeleton, Text, toast, Tooltip } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { useRecord, useVerifyRecord, useWhitelistVatStatus } from "../../lib/whitelist-vat/api"
import { errorMessage, formatDateTime } from "../../lib/whitelist-vat/kit/format"
import { CompanyDetails, OutcomeBadge, TaxId, VerdictBadge } from "./shared"

/**
 * The panel on order and customer pages: the record's tax ID, the verdict
 * with the business's data, the answers recorded for this record, and a
 * button to verify now. Hidden while the plugin is disabled.
 */
export const RecordPanel = ({ kind, id }: { kind: "orders" | "customers"; id: string }) => {
  const { t, i18n } = useTranslation()
  const status = useWhitelistVatStatus()
  const enabled = status.data?.enabled === true
  const record = useRecord(kind, id, enabled)
  const verify = useVerifyRecord(kind, id)

  if (!enabled) {
    return null
  }
  const keys = status.data?.enabled ? status.data.options.tax_id_keys : []
  const data = record.data
  const taxId = data?.tax_id ?? null
  const subject = data?.subject ?? null

  const onVerify = () =>
    verify.mutate(undefined, {
      onSuccess: ({ verification }) => {
        if (verification) {
          toast.info(t("whitelist-vat.record.done", { status: t(`whitelist-vat.status.${verification.status}`) }))
        }
      },
      onError: (error) => toast.error(t("whitelist-vat.record.failed", { error: errorMessage(error) })),
    })

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex items-center justify-between gap-x-4 px-6 py-4">
        <Heading level="h2">{t("whitelist-vat.record.title")}</Heading>
        {taxId && (
          <Button size="small" variant="secondary" isLoading={verify.isPending} onClick={onVerify}>
            {subject ? t("whitelist-vat.record.verifyAgain") : t("whitelist-vat.record.verify")}
          </Button>
        )}
      </div>

      {record.isLoading && (
        <div className="px-6 py-4">
          <Skeleton className="h-16 w-full" />
        </div>
      )}
      {record.isError && (
        <Text size="small" className="text-ui-fg-error px-6 py-4">
          {t("whitelist-vat.loadError")}
        </Text>
      )}

      {data && !taxId && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            {t("whitelist-vat.record.noTaxId")}
          </Text>
          <Text size="xsmall" className="text-ui-fg-muted">
            {t("whitelist-vat.record.noTaxIdHint", { keys: keys.join(", ") })}
          </Text>
        </div>
      )}

      {taxId && (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <TaxId number={taxId.valid_format ? taxId.number : taxId.input} />
            {!taxId.valid_format ? (
              <VerdictBadge status="invalid" />
            ) : subject ? (
              <VerdictBadge status={subject.status} stale={subject.stale} />
            ) : (
              <Badge size="2xsmall">{t("whitelist-vat.record.notVerified")}</Badge>
            )}
          </div>
          <Text size="xsmall" className="text-ui-fg-muted">
            {t(`whitelist-vat.record.foundIn.${taxId.location}`, { defaultValue: "" })}
            {subject?.checked_at ? ` · ${formatDateTime(subject.checked_at, i18n.language)}` : ""}
          </Text>
          {taxId.problem && (
            <Text size="small" className="text-ui-fg-error">
              {t(`whitelist-vat.problem.${taxId.problem}`)}
            </Text>
          )}
          {subject && (
            <Text size="small" className="text-ui-fg-subtle">
              {t(`whitelist-vat.statusHint.${subject.status}`)}
            </Text>
          )}
        </div>
      )}

      {subject?.company && (
        <div className="px-6 py-4">
          <CompanyDetails company={subject.company} />
        </div>
      )}

      {taxId && (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Text size="small" weight="plus">
            {t("whitelist-vat.record.history")}
          </Text>
          {!data?.checks.length && (
            <Text size="small" className="text-ui-fg-subtle">
              {t("whitelist-vat.record.noHistory")}
            </Text>
          )}
          {data?.checks.map((check) => (
            <div key={check.id} className="flex flex-col gap-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Text size="small">{t(`whitelist-vat.source.${check.source}`)}</Text>
                <OutcomeBadge outcome={check.outcome} />
                {check.from_cache && (
                  <Tooltip content={t("whitelist-vat.fromCacheHint")}>
                    <Badge size="2xsmall">{t("whitelist-vat.fromCache")}</Badge>
                  </Tooltip>
                )}
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {formatDateTime(check.checked_at, i18n.language)}
                </Text>
              </div>
              {check.request_id && (
                <Text size="xsmall" className="text-ui-fg-subtle font-mono">
                  {check.request_id}
                </Text>
              )}
              {check.error && (
                <Text size="xsmall" className="text-ui-fg-subtle whitespace-normal break-words">
                  {check.error}
                </Text>
              )}
            </div>
          ))}
          <div>
            <Link to="/whitelist-vat" className="text-ui-fg-interactive txt-compact-small hover:underline">
              {t("whitelist-vat.record.openPanel")}
            </Link>
          </div>
        </div>
      )}
    </Container>
  )
}
