import { Container, Heading, Skeleton, Table, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useDashboard } from "../../lib/loyalty/api"
import { money, points } from "../../lib/loyalty/format"
import { Tile } from "./shared"

/** "Panel": members, points in and out, open points and what they are worth, tiers, top rewards, expiring points. */
export const Dashboard = () => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { data, isLoading, isError } = useDashboard()

  if (isError) return <Text className="text-ui-fg-error">{t("loyalty.loadError")}</Text>
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label={t("loyalty.dashboard.members")} value={points(data.members, lang)} />
        <Tile label={t("loyalty.dashboard.earned")} value={points(data.earned_30d, lang)} />
        <Tile label={t("loyalty.dashboard.redeemed")} value={points(data.redeemed_30d, lang)} />
        <Tile
          label={t("loyalty.dashboard.openValue")}
          value={data.open_value != null ? money(data.open_value, data.currency_code, lang) : "—"}
          hint={
            data.open_value != null
              ? t("loyalty.dashboard.openValueHint", { points: points(data.open_points, lang) })
              : t("loyalty.dashboard.noAmountReward")
          }
        />
        <Tile label={t("loyalty.dashboard.expiring")} value={points(data.expiring_30d, lang)} />
        <Tile label={t("loyalty.dashboard.open")} value={points(data.open_points, lang)} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Container className="p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("loyalty.dashboard.tiers")}</Heading>
          </div>
          <Table>
            <Table.Body>
              {data.tiers.map((tier) => (
                <Table.Row key={tier.id ?? "none"}>
                  <Table.Cell>{tier.name ?? t("loyalty.dashboard.noTier")}</Table.Cell>
                  <Table.Cell className="text-right">{points(tier.customers, lang)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
        <Container className="p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("loyalty.dashboard.topRewards")}</Heading>
          </div>
          {data.top_rewards.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle px-6 pb-4">
              {t("loyalty.dashboard.noRedemptions")}
            </Text>
          ) : (
            <Table>
              <Table.Body>
                {data.top_rewards.map((reward) => (
                  <Table.Row key={reward.id}>
                    <Table.Cell>{reward.name}</Table.Cell>
                    <Table.Cell className="text-ui-fg-subtle">{t(`loyalty.kinds.${reward.kind}.title`)}</Table.Cell>
                    <Table.Cell className="text-right">{points(reward.redemptions, lang)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      </div>
    </div>
  )
}
