import { ApaczkaClient } from "./client"
import { ApaczkaApiError } from "./errors"
import type {
  ApaczkaOrderDetails,
  ApaczkaOrderInput,
  ApaczkaOrderSummary,
  ApaczkaPoint,
  ApaczkaPointsPayload,
  ApaczkaPollingStatus,
  ApaczkaService,
  ApaczkaServiceStructure,
  ApaczkaTrackingEvent,
} from "./types"

/**
 * Demo mode: an `ApaczkaClient` that answers every call itself, without
 * credentials and without any request to Apaczka. Services, prices, parcel
 * points, labels, pickups and tracking all work, so the whole flow can be
 * shown in a store that has no Apaczka account.
 *
 * Order IDs encode their creation time, so a shipment's tracking moves on
 * by itself (see `DEMO_TIMELINE`) and still works after a restart. Order
 * details are kept in memory and rebuilt from the ID when they are gone.
 */

/** Seconds since this moment make up an order ID. */
const ID_EPOCH_MS = Date.UTC(2026, 0, 1)
/** Waybill numbers of demo orders: `DEMO` + the order ID. */
const WAYBILL_PREFIX = "DEMO"

/** When each tracking step happens, in minutes after the order was created. */
export const DEMO_TIMELINE: Array<{
  minutes: number
  status: ApaczkaPollingStatus
  description: string
  place: string
}> = [
  { minutes: 0, status: "NEW", description: "Shipment registered", place: "Apaczka (demo)" },
  { minutes: 2, status: "PICKUP", description: "Picked up from the sender", place: "Warszawa" },
  { minutes: 5, status: "IN_TRANSIT", description: "At the sorting centre", place: "Stryków" },
  { minutes: 10, status: "IN_TRANSIT", description: "On the way to the receiver", place: "Kraków" },
  { minutes: 20, status: "DELIVERED", description: "Delivered", place: "Kraków" },
]
/** Every this many orders, delivery fails once before it succeeds, to show an exception. */
const EXCEPTION_EVERY = 5
const EXCEPTION_STEP = {
  minutes: 15,
  status: "EXCEPTION" as const,
  description: "Delivery attempt failed: receiver not at home",
  place: "Kraków",
}

type DemoServiceSpec = {
  service_id: number
  name: string
  supplier: string
  /** Net price of a parcel up to 1 kg, in grosze. */
  base: number
  /** Added per started kilogram above 1 kg, in grosze. */
  perKg: number
  flags: Partial<Record<"door_to_door" | "door_to_point" | "point_to_point" | "point_to_door", 1>>
  pickup_courier: 0 | 1 | 2
}

const SERVICES: DemoServiceSpec[] = [
  {
    service_id: 9101,
    name: "Paczkomat",
    supplier: "INPOST",
    base: 1199,
    perKg: 150,
    flags: { door_to_point: 1, point_to_point: 1 },
    pickup_courier: 1,
  },
  {
    service_id: 9102,
    name: "Kurier",
    supplier: "INPOST",
    base: 1499,
    perKg: 200,
    flags: { door_to_door: 1, point_to_door: 1 },
    pickup_courier: 1,
  },
  {
    service_id: 9103,
    name: "Classic",
    supplier: "DPD",
    base: 1649,
    perKg: 180,
    flags: { door_to_door: 1 },
    pickup_courier: 2,
  },
  {
    service_id: 9104,
    name: "Pickup",
    supplier: "DPD",
    base: 1099,
    perKg: 120,
    flags: { door_to_point: 1 },
    pickup_courier: 1,
  },
  {
    service_id: 9105,
    name: "Pocztex Kurier",
    supplier: "POCZTA",
    base: 1399,
    perKg: 160,
    flags: { door_to_door: 1 },
    pickup_courier: 1,
  },
]

const POINT_TYPES = ["INPOST", "DPD"]

const POINT_PLACES = [
  { city: "Warszawa", postal_code: "00-950", street: "Marszałkowska", lat: 52.2297, lng: 21.0122 },
  { city: "Warszawa", postal_code: "02-001", street: "Grójecka", lat: 52.2174, lng: 20.9827 },
  { city: "Kraków", postal_code: "30-001", street: "Długa", lat: 50.0686, lng: 19.9372 },
  { city: "Kraków", postal_code: "31-001", street: "Floriańska", lat: 50.0636, lng: 19.9398 },
  { city: "Poznań", postal_code: "60-101", street: "Głogowska", lat: 52.3943, lng: 16.8995 },
  { city: "Gdańsk", postal_code: "80-001", street: "Długa", lat: 54.3489, lng: 18.6524 },
  { city: "Wrocław", postal_code: "50-001", street: "Świdnicka", lat: 51.1059, lng: 17.0305 },
  { city: "Łódź", postal_code: "90-001", street: "Piotrkowska", lat: 51.7687, lng: 19.4569 },
]

/** Orders shared by every demo client in the process (the module and the provider each have one). */
const ORDERS_KEY = Symbol.for("bitshaft.apaczka.demo-orders.v1")
type DemoOrder = { details: ApaczkaOrderDetails; canceled: boolean; zpl?: boolean }
const orders: Map<number, DemoOrder> = ((globalThis as Record<symbol, unknown>)[ORDERS_KEY] ??= new Map()) as Map<
  number,
  DemoOrder
>

/** Forgets every demo order. For tests. */
export function resetDemoOrders(): void {
  orders.clear()
}

/** The account's real parcel points request (the `livePoints` option). */
export type LivePointsRequest = (
  type: string,
  payload: ApaczkaPointsPayload,
  signal?: AbortSignal
) => Promise<ApaczkaPoint[]>

export class DemoApaczkaClient extends ApaczkaClient {
  override readonly demo = true
  override readonly livePoints: boolean

  private readonly clock: () => number
  /**
   * A function, not a client: the real client and its keys exist only inside
   * it (see `createApaczkaClient`). Nothing that reaches this object can send
   * any other request with them, and printing or serializing it shows no key.
   */
  private readonly livePointsRequest?: LivePointsRequest

  constructor(options: { now?: () => number; livePoints?: LivePointsRequest } = {}) {
    super({ appId: "demo", appSecret: "demo", environment: "sandbox", baseUrl: "https://demo.invalid/api/v2/" })
    this.clock = options.now ?? Date.now
    this.livePointsRequest = options.livePoints
    this.livePoints = Boolean(options.livePoints)
  }

  /** Sample points, or the account's real points with `livePoints`. */
  override getPoints(type: string, payload: ApaczkaPointsPayload = {}, signal?: AbortSignal): Promise<ApaczkaPoint[]> {
    return this.livePointsRequest
      ? this.livePointsRequest(type, payload, signal)
      : super.getPoints(type, payload, signal)
  }

  /** Every API method goes through here; nothing is sent anywhere. */
  override async call<T>(route: string, payload: unknown): Promise<T> {
    const [name, id] = route.replace(/\/$/, "").split("/")
    const body = (payload ?? {}) as Record<string, unknown>
    switch (name) {
      case "service_structure":
        return serviceStructure() as T
      case "points":
        return { points: points(decodeURIComponent(id ?? "")) } as T
      case "order_valuation":
        return { price_table: valuate(body.order as ApaczkaOrderInput) } as T
      case "order_send":
        return { order: this.send(body.order as ApaczkaOrderInput) } as T
      case "order":
        return { order: this.details(Number(id)) } as T
      case "orders":
        return { orders: [...orders.values()].map((order) => this.details(order.details.id)) } as T
      case "cancel_order":
        return this.cancel(Number(id)) as T
      case "waybill":
        return this.waybill(Number(id)) as T
      case "dispatch_code":
        return { order_id: Number(id), dispatch_code: `D${String(id).slice(-6).padStart(6, "0")}` } as T
      case "turn_in":
        return {
          turn_in: pdfBase64([
            "Apaczka - DEMO",
            "Collective hand-over confirmation",
            `Orders: ${((body.order_ids as number[]) ?? []).join(", ")}`,
            "Not a real document.",
          ]),
        } as T
      case "pickup_hours":
        return { postal_code: String(body.postal_code ?? ""), hours: this.pickupDays() } as T
      case "pickup":
      case "batch_pickup":
        return { foreign_courier_id: `DEMO-PICKUP-${this.clock().toString(36).toUpperCase()}` } as T
      case "tracking":
        return { data: this.tracking(decodeURIComponent(id ?? "")), service: "demo" } as T
      default:
        throw new ApaczkaApiError(404, `Route ${route} is not available in demo mode`, route)
    }
  }

  private send(order: ApaczkaOrderInput): ApaczkaOrderSummary {
    const spec = SERVICES.find((service) => service.service_id === Number(order.service_id))
    if (!spec) {
      throw new ApaczkaApiError(400, `Unknown service_id ${order.service_id} (demo services: 9101-9105)`, "order_send/")
    }
    // Unique and increasing even for several orders in one second.
    const id = Math.max(Math.floor((this.clock() - ID_EPOCH_MS) / 1000), Math.max(0, ...orders.keys()) + 1)
    const price = priceOf(spec, order)
    const details: ApaczkaOrderDetails = {
      id,
      service_id: spec.service_id,
      service_name: `${supplierName(spec.supplier)} ${spec.name}`,
      supplier: spec.supplier,
      waybill_number: `${WAYBILL_PREFIX}${id}`,
      pickup_number: null,
      tracking_url: null,
      status: "NEW",
      shipments_count: order.shipment.length,
      content: order.content,
      comment: order.comment,
      receiver: order.address.receiver,
      sender: order.address.sender,
      created: new Date(createdAt(id)).toISOString(),
      delivered: null,
      pickup: order.pickup,
      price: toDecimal(price.price),
      price_gross: toDecimal(price.price_gross),
      cod: order.cod ? { amount: order.cod.amount } : false,
      declaration_value: order.shipment_value ?? false,
    }
    orders.set(id, { details, canceled: false, zpl: Boolean(order.is_zebra) })
    return details
  }

  private details(id: number): ApaczkaOrderDetails {
    const stored = orders.get(id)
    const details: ApaczkaOrderDetails = stored?.details ?? {
      id,
      service_id: SERVICES[0].service_id,
      service_name: `${supplierName(SERVICES[0].supplier)} ${SERVICES[0].name}`,
      supplier: SERVICES[0].supplier,
      waybill_number: `${WAYBILL_PREFIX}${id}`,
      pickup_number: null,
      tracking_url: null,
      status: "NEW",
      shipments_count: 1,
      created: new Date(createdAt(id)).toISOString(),
      price: toDecimal(SERVICES[0].base),
      price_gross: toDecimal(gross(SERVICES[0].base)),
    }
    const [latest] = this.tracking(details.waybill_number ?? "")
    return {
      ...details,
      status: latest?.status ?? "NEW",
      delivered: latest?.status === "DELIVERED" ? latest.updated_at : null,
    }
  }

  private cancel(id: number): null {
    const [latest] = this.tracking(`${WAYBILL_PREFIX}${id}`)
    if (latest && latest.status !== "NEW") {
      throw new ApaczkaApiError(
        400,
        "The carrier has already taken the parcel; it can no longer be canceled",
        "cancel_order/"
      )
    }
    const stored = orders.get(id) ?? { details: this.details(id), canceled: false }
    orders.set(id, { ...stored, canceled: true })
    return null
  }

  private waybill(id: number) {
    const details = this.details(id)
    const receiver = details.receiver
    if (orders.get(id)?.zpl) {
      const zpl =
        "^XA^CF0,40^FO40,40^FDApaczka DEMO LABEL^FS^CF0,30" +
        `^FO40,100^FD${details.service_name}^FS^FO40,150^FDWaybill: ${details.waybill_number}^FS` +
        `^FO40,200^BCN,100,Y,N,N^FD${details.waybill_number}^FS^FO40,360^FDNot a real label.^FS^XZ`
      return { type: "zpl", waybill: Buffer.from(zpl).toString("base64") }
    }
    return {
      type: "pdf",
      waybill: pdfBase64([
        "Apaczka - DEMO LABEL",
        `${details.service_name}`,
        `Waybill: ${details.waybill_number}`,
        `Apaczka order: ${details.id}`,
        receiver ? `Receiver: ${receiver.name}, ${receiver.postal_code} ${receiver.city}` : "",
        receiver?.foreign_address_id ? `Point: ${receiver.foreign_address_id}` : "",
        "Not a real label. Do not stick it on a parcel.",
      ]),
    }
  }

  /** Newest first, like the real `tracking/`. */
  private tracking(waybill: string): ApaczkaTrackingEvent[] {
    if (!waybill.startsWith(WAYBILL_PREFIX)) {
      return []
    }
    const id = Number(waybill.slice(WAYBILL_PREFIX.length))
    if (!Number.isFinite(id) || id <= 0) {
      return []
    }
    const start = createdAt(id)
    const elapsed = (this.clock() - start) / 60_000
    const failsOnce = id % EXCEPTION_EVERY === 0
    // With a failed attempt first, delivery succeeds ten minutes later.
    const steps = [...DEMO_TIMELINE, ...(failsOnce ? [EXCEPTION_STEP] : [])].map((step) => ({
      ...step,
      minutes: failsOnce && step.status === "DELIVERED" ? step.minutes + 10 : step.minutes,
    }))
    const events = steps
      // The first step is there from the start, even for an ID a second ahead of the clock.
      .filter((step) => step.minutes === 0 || step.minutes <= elapsed)
      .sort((a, b) => a.minutes - b.minutes)
      .map((step) => ({
        status: step.status,
        status_original: step.status,
        description: step.description,
        place: step.place,
        updated_at: new Date(start + step.minutes * 60_000).toISOString(),
      }))
    if (orders.get(id)?.canceled) {
      events.push({
        status: "CANCELLED",
        status_original: "CANCELLED",
        description: "Order canceled",
        place: "Apaczka (demo)",
        updated_at: new Date(Math.min(this.clock(), start + 60_000)).toISOString(),
      })
    }
    return events.reverse()
  }

  /** The next five working days. */
  private pickupDays() {
    const days: Array<{ date: string; services: Record<string, unknown> }> = []
    const date = new Date(this.clock())
    while (days.length < 5) {
      date.setUTCDate(date.getUTCDate() + 1)
      if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
        const services = Object.fromEntries(
          SERVICES.map((service) => [service.service_id, { hours_from: "09:00", hours_to: "16:00" }])
        )
        days.push({ date: date.toISOString().slice(0, 10), services })
      }
    }
    return days
  }
}

/* ------------------------------------------------------------------------ */
/* Data                                                                      */
/* ------------------------------------------------------------------------ */

function serviceStructure(): ApaczkaServiceStructure {
  const services: ApaczkaService[] = SERVICES.map((spec) => ({
    service_id: spec.service_id,
    name: spec.name,
    supplier: spec.supplier,
    domestic: 1,
    pickup_courier: spec.pickup_courier,
    door_to_door: spec.flags.door_to_door ?? 0,
    door_to_point: spec.flags.door_to_point ?? 0,
    point_to_point: spec.flags.point_to_point ?? 0,
    point_to_door: spec.flags.point_to_door ?? 0,
  }))
  return {
    services,
    options: {
      "19": { type: "bool", name: "SMS notification", desc: "Text message to the receiver" },
      "58": { type: "bool", name: "Fragile", desc: "Handle with care" },
    },
    package_type: { PACZKA: { type: "PACZKA", name: "Parcel" }, PALETA: { type: "PALETA", name: "Pallet" } },
    points_type: POINT_TYPES,
    pickup_type: {
      SELF: { type: "SELF", name: "Drop-off at a point" },
      COURIER: { type: "COURIER", name: "Courier pickup" },
    },
  }
}

function points(type: string): ApaczkaPoint[] {
  const code = type.toUpperCase()
  if (!POINT_TYPES.includes(code)) {
    return []
  }
  return POINT_PLACES.map((place, index) => {
    const number = String(index + 1).padStart(2, "0")
    const id = `${code === "INPOST" ? "DEMO" : "DPD-DEMO"}${place.city.slice(0, 3).toUpperCase()}${number}`
    return {
      type: code,
      subtype: code === "INPOST" ? "PARCEL_LOCKER" : "PUDO",
      name: id,
      foreign_address_id: id,
      address: {
        line1: `ul. ${place.street} ${10 + index * 3}`,
        street: place.street,
        house_number: String(10 + index * 3),
        postal_code: place.postal_code,
        city: place.city,
        country_code: "PL",
        latitude: place.lat.toFixed(4),
        longitude: place.lng.toFixed(4),
      },
      open_hours: code === "INPOST" ? "24/7" : "Mon-Fri 8:00-20:00, Sat 9:00-14:00",
      option_cod: index % 3 !== 2,
      option_send: true,
      option_deliver: true,
      additional_info: "Demo point (demo mode)",
    }
  })
}

function valuate(order: ApaczkaOrderInput | undefined) {
  const input = order ?? ({ shipment: [] } as unknown as ApaczkaOrderInput)
  const candidates = input.service_id
    ? SERVICES.filter((service) => service.service_id === Number(input.service_id))
    : SERVICES
  return Object.fromEntries(candidates.map((spec) => [String(spec.service_id), priceOf(spec, input)]))
}

/** Net and gross price in grosze: a base price per parcel, more per kilogram, more for COD. */
function priceOf(spec: DemoServiceSpec, order: ApaczkaOrderInput) {
  const parcels = order.shipment?.length ? order.shipment : [{ weight: 1 }]
  let net = 0
  for (const parcel of parcels) {
    const extraKg = Math.max(0, Math.ceil(Number(parcel.weight) || 0) - 1)
    net += spec.base + extraKg * spec.perKg
  }
  if (order.cod) {
    net += 350
  }
  return { price: net, price_gross: gross(net) }
}

function gross(net: number): number {
  return Math.round(net * 1.23)
}

function toDecimal(grosze: number): string {
  return (grosze / 100).toFixed(2)
}

function createdAt(id: number): number {
  return ID_EPOCH_MS + id * 1000
}

function supplierName(supplier: string): string {
  return supplier === "INPOST" ? "InPost" : supplier === "POCZTA" ? "Poczta Polska" : supplier
}

/* ------------------------------------------------------------------------ */
/* A one-page PDF with lines of text (ASCII), for labels and turn-ins        */
/* ------------------------------------------------------------------------ */

export function pdfBase64(lines: string[]): string {
  const ascii = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L")
      .replace(/[^\x20-\x7e]/g, "?")
      .replace(/([\\()])/g, "\\$1")
  const text = lines
    .filter(Boolean)
    .map((line, index) => `BT /F1 ${index === 0 ? 18 : 11} Tf 40 ${380 - index * 24} Td (${ascii(line)}) Tj ET`)
    .join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    // 100 x 150 mm, the usual label size.
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 283 425] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf).toString("base64")
}
