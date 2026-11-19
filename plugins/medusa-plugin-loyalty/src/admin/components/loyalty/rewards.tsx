import { PencilSquare, Plus, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  IconButton,
  Input,
  Label,
  Select,
  Switch,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type Reward,
  type RewardInput,
  type RewardKind,
  type Tier,
  useDeleteReward,
  useRewards,
  useSaveReward,
  useVariantLabel,
  useVariantOptions,
} from "../../lib/loyalty/api"
import { money, points } from "../../lib/loyalty/format"
import { errorMessage } from "../../lib/loyalty/kit/format"
import { NumberField } from "./shared"
import { Empty } from "../../lib/loyalty/kit/page"
import { useDebounced } from "../../lib/loyalty/kit/hooks"

const KINDS: RewardKind[] = ["fixed", "percentage", "free_shipping", "gift"]
const NONE = "none"

const empty = (currency: string): RewardInput => ({
  name: "",
  description: null,
  kind: "fixed",
  value: 20,
  currency_code: currency,
  variant_id: null,
  cost: 500,
  active: true,
  min_tier_id: null,
  per_customer_limit: null,
  code_valid_days: 30,
})

/** "Rewards": the catalog; rewards someone redeemed can be switched off, not deleted. */
export const Rewards = ({ tiers, currencyCode }: { tiers: Tier[]; currencyCode: string }) => {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const prompt = usePrompt()
  const { data, isLoading } = useRewards()
  const remove = useDeleteReward()
  const [editing, setEditing] = useState<Reward | "new" | null>(null)
  const tierName = (id: string | null) => tiers.find((tier) => tier.id === id)?.name ?? null

  const valueOf = (reward: Reward) =>
    reward.kind === "fixed"
      ? money(reward.value, reward.currency_code ?? currencyCode, lang)
      : reward.kind === "percentage"
        ? `${reward.value}%`
        : reward.kind === "free_shipping"
          ? t("loyalty.kinds.free_shipping.title")
          : t("loyalty.kinds.gift.title")

  const onDelete = async (reward: Reward) => {
    const ok = await prompt({
      title: t("loyalty.rewards.deleteTitle"),
      description: t("loyalty.rewards.deleteText", { name: reward.name }),
      confirmText: t("loyalty.rewards.delete"),
      cancelText: t("loyalty.cancel"),
    })
    if (ok) {
      remove.mutate(reward.id, {
        onSuccess: () => toast.success(t("loyalty.rewards.deleted")),
        onError: (error) => toast.error(errorMessage(error)),
      })
    }
  }

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">{t("loyalty.rewards.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("loyalty.rewards.subtitle")}
          </Text>
        </div>
        <Button size="small" onClick={() => setEditing("new")}>
          <Plus />
          {t("loyalty.rewards.add")}
        </Button>
      </div>
      {!isLoading && (data?.rewards ?? []).length === 0 ? (
        <div className="px-6 py-4">
          <Empty>{t("loyalty.rewards.empty")}</Empty>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("loyalty.rewards.name")}</Table.HeaderCell>
                <Table.HeaderCell>{t("loyalty.rewards.gives")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("loyalty.rewards.cost")}</Table.HeaderCell>
                <Table.HeaderCell>{t("loyalty.rewards.rules")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("loyalty.rewards.redemptions")}</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(data?.rewards ?? []).map((reward) => (
                <Table.Row key={reward.id}>
                  <Table.Cell>
                    <div className="flex flex-col">
                      <Text size="small" weight="plus">
                        {reward.name}
                      </Text>
                      <div>
                        <Badge size="2xsmall" color={reward.active ? "green" : "grey"}>
                          {reward.active ? t("loyalty.rewards.active") : t("loyalty.rewards.inactive")}
                        </Badge>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>{valueOf(reward)}</Table.Cell>
                  <Table.Cell className="text-right">
                    {t("loyalty.pointsShort", { points: points(reward.cost, lang) })}
                  </Table.Cell>
                  <Table.Cell className="whitespace-normal">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {[
                        tierName(reward.min_tier_id) &&
                          t("loyalty.rewards.fromTier", { tier: tierName(reward.min_tier_id) }),
                        reward.per_customer_limit != null &&
                          t("loyalty.rewards.limit", { count: reward.per_customer_limit }),
                        reward.kind !== "gift" &&
                          reward.code_valid_days != null &&
                          t("loyalty.rewards.validDays", { count: reward.code_valid_days }),
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell className="text-right">{reward.redemptions}</Table.Cell>
                  <Table.Cell>
                    <div className="flex justify-end gap-x-1">
                      <IconButton
                        size="small"
                        variant="transparent"
                        aria-label={t("loyalty.rewards.edit")}
                        onClick={() => setEditing(reward)}
                      >
                        <PencilSquare />
                      </IconButton>
                      <IconButton
                        size="small"
                        variant="transparent"
                        aria-label={t("loyalty.rewards.delete")}
                        disabled={reward.redemptions > 0}
                        title={reward.redemptions > 0 ? t("loyalty.rewards.cannotDelete") : undefined}
                        onClick={() => onDelete(reward)}
                      >
                        <Trash />
                      </IconButton>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
      <RewardForm
        reward={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        tiers={tiers}
        currencyCode={currencyCode}
      />
    </Container>
  )
}

const RewardForm = ({
  reward,
  open,
  onClose,
  tiers,
  currencyCode,
}: {
  reward: Reward | null
  open: boolean
  onClose: () => void
  tiers: Tier[]
  currencyCode: string
}) => {
  const { t } = useTranslation()
  const save = useSaveReward(reward?.id)
  const [form, setForm] = useState<RewardInput>(empty(currencyCode))
  const [variantSearch, setVariantSearch] = useState("")
  const variantQuery = useDebounced(variantSearch.trim())
  const variants = useVariantOptions(variantQuery)
  const variantLabel = useVariantLabel(form.variant_id)

  useEffect(() => {
    if (!open) return
    if (reward) {
      const { id: _id, redemptions: _r, ...rest } = reward
      setForm(rest)
    } else {
      setForm(empty(currencyCode))
    }
  }, [open, reward, currencyCode])

  const set = (patch: Partial<RewardInput>) => setForm((f) => ({ ...f, ...patch }))
  const valid =
    form.name.trim().length > 0 &&
    form.cost >= 1 &&
    (form.kind !== "fixed" || (form.value ?? 0) > 0) &&
    (form.kind !== "percentage" || ((form.value ?? 0) > 0 && (form.value ?? 0) <= 100)) &&
    (form.kind !== "gift" || !!form.variant_id)

  const onSave = () =>
    save.mutate(
      {
        ...form,
        value: form.kind === "fixed" || form.kind === "percentage" ? form.value : null,
        variant_id: form.kind === "gift" ? form.variant_id : null,
      },
      {
        onSuccess: () => {
          toast.success(t("loyalty.rewards.saved"))
          onClose()
        },
        onError: (error) => toast.error(errorMessage(error)),
      }
    )

  return (
    <Drawer open={open} onOpenChange={(value) => !value && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{reward ? t("loyalty.rewards.editTitle") : t("loyalty.rewards.addTitle")}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus">
              {t("loyalty.rewards.name")}
            </Label>
            <Input
              size="small"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={t("loyalty.rewards.namePlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus">
              {t("loyalty.rewards.description")}
            </Label>
            <Textarea
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => set({ description: e.target.value || null })}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus">
              {t("loyalty.rewards.kind")}
            </Label>
            <Select size="small" value={form.kind} onValueChange={(kind) => set({ kind: kind as RewardKind })}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {KINDS.map((kind) => (
                  <Select.Item key={kind} value={kind}>
                    {t(`loyalty.kinds.${kind}.title`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t(`loyalty.kinds.${form.kind}.hint`)}
            </Text>
          </div>
          {form.kind === "fixed" && (
            <NumberField
              label={t("loyalty.rewards.amount")}
              value={form.value}
              onChange={(value) => set({ value })}
              min={0}
              step={0.01}
              suffix={(form.currency_code ?? currencyCode).toUpperCase()}
            />
          )}
          {form.kind === "percentage" && (
            <NumberField
              label={t("loyalty.rewards.percent")}
              value={form.value}
              onChange={(value) => set({ value })}
              min={1}
              step={1}
              suffix="%"
            />
          )}
          {form.kind === "gift" && (
            <div className="flex flex-col gap-y-1">
              <Label size="xsmall" weight="plus">
                {t("loyalty.rewards.variant")}
              </Label>
              {form.variant_id && (
                <Badge size="2xsmall" className="self-start">
                  {variantLabel.data ?? form.variant_id}
                </Badge>
              )}
              <Input
                size="small"
                type="search"
                placeholder={t("loyalty.rewards.variantSearch")}
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
              />
              <div className="max-h-44 overflow-y-auto rounded-md border border-ui-border-base">
                {(variants.data ?? []).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => set({ variant_id: option.value })}
                    className={`block w-full px-3 py-1.5 text-left txt-compact-small hover:bg-ui-bg-base-hover ${option.value === form.variant_id ? "bg-ui-bg-highlight" : ""}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("loyalty.rewards.variantHint")}
              </Text>
            </div>
          )}
          <NumberField
            label={t("loyalty.rewards.cost")}
            value={form.cost}
            onChange={(cost) => set({ cost: cost ?? 0 })}
            min={1}
            step={1}
            suffix={t("loyalty.pointsUnit")}
          />
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus">
              {t("loyalty.rewards.minTier")}
            </Label>
            <Select
              size="small"
              value={form.min_tier_id ?? NONE}
              onValueChange={(v) => set({ min_tier_id: v === NONE ? null : v })}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={NONE}>{t("loyalty.rewards.anyTier")}</Select.Item>
                {tiers.map((tier) => (
                  <Select.Item key={tier.id} value={tier.id}>
                    {tier.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-wrap gap-4">
            <NumberField
              label={t("loyalty.rewards.perCustomer")}
              value={form.per_customer_limit}
              onChange={(per_customer_limit) => set({ per_customer_limit })}
              min={1}
              step={1}
            />
            {form.kind !== "gift" && (
              <NumberField
                label={t("loyalty.rewards.codeDays")}
                value={form.code_valid_days}
                onChange={(code_valid_days) => set({ code_valid_days })}
                min={1}
                step={1}
                suffix={t("loyalty.daysUnit")}
              />
            )}
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("loyalty.rewards.emptyMeansNoLimit")}
          </Text>
          <div className="flex items-center gap-x-2">
            <Switch id="reward-active" checked={form.active} onCheckedChange={(active) => set({ active })} />
            <Label htmlFor="reward-active" size="small">
              {t("loyalty.rewards.activeLabel")}
            </Label>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          <Button size="small" variant="secondary" onClick={onClose}>
            {t("loyalty.cancel")}
          </Button>
          <Button size="small" onClick={onSave} disabled={!valid} isLoading={save.isPending}>
            {t("loyalty.save")}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
