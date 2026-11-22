import { Tag } from "@medusajs/icons"
import { Badge, Button, Skeleton, Table, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { AdvertActions } from "../../components/olx/advert-actions"
import { AdvertForm } from "../../components/olx/advert-form"
import { BRAND_COLOR, formatPln, StatusBadge } from "../../components/olx/shared"
import { type ProductState, type ProductVariant, useOlxStatus, useProductState } from "./api"
import { registerTab } from "./kit/integrations"
import { Empty } from "./kit/page"

export const brand = { label: "olx.title", icon: Tag, color: BRAND_COLOR }

/** The OLX tab of the product page's Integrations card: one row per variant. */
registerTab("product", {
  id: "olx",
  brand,
  order: 45,
  useState: (product) => {
    const status = useOlxStatus()
    const enabled = status.data?.enabled === true
    const state = useProductState(product.id, enabled)
    if (!enabled) {
      return { visible: false, level: "none", loading: status.isLoading }
    }
    const adverts = (state.data?.variants ?? []).flatMap((variant) => (variant.advert ? [variant.advert] : []))
    const broken = adverts.some((advert) => advert.status === "failed" || advert.pending_deactivate)
    const live = adverts.some((advert) => advert.status === "active" || advert.status === "new")
    return { visible: true, level: broken ? "error" : live ? "ok" : "none", loading: state.isLoading }
  },
  Panel: ({ entity }) => <ProductAdverts productId={entity.id} />,
})

const VariantRow = ({
  product,
  variant,
  canWrite,
}: {
  product: ProductState
  variant: ProductVariant
  canWrite: boolean
}) => {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const { advert } = variant
  // Without an OLX id the advert is not there yet: publishing again retries the same record.
  const canPublish = canWrite && (!advert || advert.status === "failed") && variant.in_stock !== false
  return (
    <Table.Row>
      <Table.Cell className="max-w-[220px]">
        <Text size="small" weight="plus" className="truncate">
          {variant.variant_title ?? variant.sku ?? product.title}
        </Text>
        {variant.in_stock === false && (
          <Badge size="2xsmall" color="grey">
            {t("olx.product.noStock")}
          </Badge>
        )}
      </Table.Cell>
      <Table.Cell>
        {advert ? (
          <div className="flex flex-col items-start gap-y-1">
            <StatusBadge advert={advert} />
            {advert.last_error && (
              <Text size="xsmall" className="text-ui-fg-error max-w-[260px] truncate" title={advert.last_error}>
                {advert.last_error}
              </Text>
            )}
          </div>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">
            {t("olx.product.notListed")}
          </Text>
        )}
      </Table.Cell>
      <Table.Cell className="whitespace-nowrap">
        <Text size="small">{formatPln(advert?.price ?? variant.store_price, i18n.language)}</Text>
        {variant.price_differs && (
          <Text size="xsmall" className="text-ui-tag-orange-text">
            {t("olx.product.priceDiffers", { price: formatPln(variant.store_price, i18n.language) })}
          </Text>
        )}
      </Table.Cell>
      <Table.Cell className="text-right">
        <div className="flex items-center justify-end gap-x-1">
          {canPublish && (
            <Button size="small" variant="secondary" onClick={() => setOpen(true)}>
              {advert ? t("olx.product.retry") : t("olx.product.publish")}
            </Button>
          )}
          {advert?.olx_advert_id && canWrite && (
            <AdvertActions
              advert={advert}
              onEdit={advert.pending_deactivate || advert.sold_channel ? undefined : () => setOpen(true)}
            />
          )}
        </div>
        {open && (
          <AdvertForm
            open={open}
            onClose={() => setOpen(false)}
            productTitle={product.title}
            images={product.images}
            variant={variant}
            advert={advert}
          />
        )}
      </Table.Cell>
    </Table.Row>
  )
}

const ProductAdverts = ({ productId }: { productId: string }) => {
  const { t } = useTranslation()
  const status = useOlxStatus()
  const { data, isLoading, isError, error } = useProductState(productId)
  const s = status.data
  const canWrite = Boolean(s?.enabled && s.connection.connected && !s.connection.needs_reconnect)
  if (isLoading) {
    return (
      <div className="px-6 py-4">
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }
  if (isError || !data) {
    return (
      <Text size="small" className="text-ui-fg-error px-6 py-4">
        {(error as Error | null)?.message ?? t("olx.loadError")}
      </Text>
    )
  }
  return (
    <div className="divide-y">
      {!canWrite && (
        <div className="px-6 py-3">
          <Link to="/olx?tab=settings" className="text-ui-fg-interactive txt-compact-small hover:underline">
            {t("olx.product.connectFirst")}
          </Link>
        </div>
      )}
      {!data.variants.length ? (
        <div className="px-6 py-4">
          <Empty>{t("olx.product.noVariants")}</Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("olx.product.variant")}</Table.HeaderCell>
                <Table.HeaderCell>{t("olx.adverts.col.status")}</Table.HeaderCell>
                <Table.HeaderCell>{t("olx.adverts.col.price")}</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.variants.map((variant) => (
                <VariantRow key={variant.variant_id} product={data} variant={variant} canWrite={canWrite} />
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </div>
  )
}
