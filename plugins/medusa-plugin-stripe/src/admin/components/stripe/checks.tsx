import { Container, Heading, Skeleton, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { type Status, useChecks } from "../../lib/stripe/api"
import { errorMessage } from "../../lib/stripe/format"
import { Incomplete, Verdict } from "./shared"

/** The Checks tab: each configuration check with its verdict and how to fix it. */
export const Checks = ({ status }: { status: Status }) => {
  const { t } = useTranslation()
  const { data, isLoading, isError, error } = useChecks()
  const counts = { ok: 0, warn: 0, error: 0 }
  for (const c of data?.checks ?? []) counts[c.verdict]++

  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div>
        <Heading level="h2">{t("stripe.checks.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {data ? t("stripe.checks.summary", counts) : t("stripe.checks.hint")}
        </Text>
      </div>
      {!status.enabled && (
        <Text size="small" className="text-ui-fg-error">
          {t("stripe.disabled.title", { reason: status.disabled_reason })}
        </Text>
      )}
      {isError && <Text className="text-ui-fg-error">{errorMessage(error)}</Text>}
      {data && <Incomplete data={{ partial: data.partial, missed: data.missed, truncated: [] }} />}
      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ul className="flex flex-col divide-y divide-ui-border-base rounded-lg border border-ui-border-base">
          {data.checks.map((check) => (
            <li key={check.id} className="flex flex-col gap-y-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Verdict verdict={check.verdict} />
                <Text size="small" weight="plus">
                  {t(`stripe.checks.${check.id}.title`)}
                </Text>
              </div>
              <Text size="small">
                {t(`stripe.checks.${check.id}.${check.code}`, {
                  ...check.params,
                  interpolation: { escapeValue: false },
                })}
              </Text>
              {check.verdict !== "ok" && (
                <Text size="small" className="text-ui-fg-subtle whitespace-pre-line">
                  {t("stripe.checks.fix")}{" "}
                  {t(`stripe.checks.${check.id}.${check.code}_fix`, {
                    ...check.params,
                    defaultValue: t(`stripe.checks.${check.id}.fix`),
                    interpolation: { escapeValue: false },
                  })}
                </Text>
              )}
            </li>
          ))}
        </ul>
      )}
    </Container>
  )
}
