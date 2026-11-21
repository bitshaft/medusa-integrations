import { ArrowUpRightOnBox, EllipsisHorizontal } from "@medusajs/icons"
import { DropdownMenu, IconButton, toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { type Advert, useAdvertCommand } from "../../lib/olx/api"
import { showResult } from "./shared"

const CAN_TAKE_DOWN = ["new", "active", "limited", "unpaid"]
const CAN_ACTIVATE = ["removed_by_user", "outdated", "limited"]

/** Take down, sold on OLX, bring back, open on OLX. Every step that changes something asks first. */
export const AdvertActions = ({ advert, onEdit }: { advert: Advert; onEdit?: () => void }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const command = useAdvertCommand()
  const onOlx = Boolean(advert.olx_advert_id)

  const run = async (name: "deactivate" | "activate" | "sold") => {
    const confirmed = await prompt({
      title: t(`olx.confirm.${name}.title`),
      description: t(`olx.confirm.${name}.body`, { title: advert.title }),
      confirmText: t(`olx.confirm.${name}.action`),
      cancelText: t("olx.form.cancel"),
    })
    if (!confirmed) return
    try {
      showResult(t, await command.mutateAsync({ id: advert.id, command: name }))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <IconButton size="small" variant="transparent" aria-label={t("olx.actions.menu")} disabled={command.isPending}>
          <EllipsisHorizontal />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {advert.url && (
          <DropdownMenu.Item asChild>
            <a href={advert.url} target="_blank" rel="noreferrer" className="flex items-center gap-x-2">
              <ArrowUpRightOnBox />
              {t("olx.actions.open")}
            </a>
          </DropdownMenu.Item>
        )}
        {onEdit && <DropdownMenu.Item onClick={onEdit}>{t("olx.actions.edit")}</DropdownMenu.Item>}
        {onOlx && !advert.sold_channel && CAN_TAKE_DOWN.includes(advert.status) && (
          <DropdownMenu.Item onClick={() => run("sold")}>{t("olx.actions.sold")}</DropdownMenu.Item>
        )}
        {onOlx && CAN_TAKE_DOWN.includes(advert.status) && (
          <DropdownMenu.Item onClick={() => run("deactivate")}>{t("olx.actions.deactivate")}</DropdownMenu.Item>
        )}
        {onOlx && CAN_ACTIVATE.includes(advert.status) && (
          <DropdownMenu.Item onClick={() => run("activate")}>{t("olx.actions.activate")}</DropdownMenu.Item>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
