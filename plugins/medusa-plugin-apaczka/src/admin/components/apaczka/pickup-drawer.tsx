import { Button, Drawer, Input, Label, Select, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { type Shipment, useBookPickup, usePickupHours } from "../../lib/apaczka/api"
import { errorMessage } from "../../lib/apaczka/format"

type Props = {
  /** One shipment, or several from the same sender and service (one courier). */
  shipments: Shipment[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onBooked?: () => void
}

export const PickupDrawer = ({ shipments, open, onOpenChange, onBooked }: Props) => {
  const { t } = useTranslation()
  const first = shipments[0]
  const postalCode = first?.metadata?.sender_postal_code
  const hours = usePickupHours(open ? postalCode : undefined, first?.service_id)
  const book = useBookPickup()

  const [date, setDate] = useState("")
  const [hourFrom, setHourFrom] = useState("09:00")
  const [hourTo, setHourTo] = useState("16:00")

  const days = hours.data?.days ?? []
  useEffect(() => {
    if (!date && days.length) {
      setDate(days[0].date)
    }
  }, [days, date])

  const submit = () =>
    book.mutate(
      { shipment_ids: shipments.map((s) => s.id), date, hour_from: hourFrom, hour_to: hourTo },
      {
        onSuccess: () => {
          toast.success(t("apaczka.toast.pickupBooked"))
          onOpenChange(false)
          onBooked?.()
        },
        onError: (error) => toast.error(errorMessage(error)),
      }
    )

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>{t("apaczka.pickup.title")}</Drawer.Title>
          <Drawer.Description>
            {shipments.length > 1
              ? t("apaczka.pickup.descriptionMany", { count: shipments.length })
              : t("apaczka.pickup.description")}
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-2">
            <Label size="small">{t("apaczka.create.pickupDate")}</Label>
            {days.length ? (
              <Select value={date} onValueChange={setDate}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {days.map((day) => (
                    <Select.Item key={day.date} value={day.date}>
                      {day.date}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            ) : (
              <>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                {!hours.isLoading && (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("apaczka.create.noPickupDays")}
                  </Text>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <div className="flex flex-col gap-y-2">
              <Label size="small">{t("apaczka.create.hoursFrom")}</Label>
              <Input type="time" value={hourFrom} onChange={(e) => setHourFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label size="small">{t("apaczka.create.hoursTo")}</Label>
              <Input type="time" value={hourTo} onChange={(e) => setHourTo(e.target.value)} />
            </div>
          </div>
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button variant="secondary" size="small">
              {t("apaczka.actions.cancel")}
            </Button>
          </Drawer.Close>
          <Button size="small" onClick={submit} isLoading={book.isPending} disabled={!date || !shipments.length}>
            {t("apaczka.actions.book")}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
