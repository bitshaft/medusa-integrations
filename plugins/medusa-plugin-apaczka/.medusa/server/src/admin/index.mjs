import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { defineWidgetConfig, defineRouteConfig } from "@medusajs/admin-sdk";
import { toast, FocusModal, Button, Heading, Text, Label, Select, Input, Switch, IconButton, Drawer, clx, StatusBadge, Badge, Copy, DropdownMenu, Container, Skeleton, Table } from "@medusajs/ui";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash, ArrowDownTray, EllipsisHorizontal, ArrowUpRightOnBox, ArrowPath, TruckFast } from "@medusajs/icons";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import Medusa from "@medusajs/js-sdk";
const sdk = new Medusa({
  baseUrl: "/",
  debug: false,
  auth: { type: "session" }
});
function backendUrl(path) {
  const base = "".replace(/\/+$/, "");
  return `${base}${path}`;
}
const apaczkaKeys = {
  all: ["apaczka"],
  shipments: (orderId) => ["apaczka", "shipments", orderId],
  status: ["apaczka", "status"],
  services: ["apaczka", "services"],
  pickupHours: (postalCode, serviceId) => ["apaczka", "pickup-hours", postalCode, serviceId]
};
function useOrderShipments(orderId) {
  return useQuery({
    queryKey: apaczkaKeys.shipments(orderId),
    queryFn: () => sdk.client.fetch("/admin/apaczka/shipments", {
      query: { order_id: orderId, limit: 50 }
    })
  });
}
function useApaczkaStatus(refresh = false) {
  return useQuery({
    queryKey: [...apaczkaKeys.status, refresh],
    queryFn: () => sdk.client.fetch("/admin/apaczka/status", { query: refresh ? { refresh: "true" } : {} })
  });
}
function useApaczkaServices() {
  return useQuery({
    queryKey: apaczkaKeys.services,
    queryFn: () => sdk.client.fetch("/admin/apaczka/services"),
    staleTime: 5 * 6e4
  });
}
function usePickupHours(postalCode, serviceId) {
  return useQuery({
    queryKey: apaczkaKeys.pickupHours(postalCode ?? "", serviceId ?? 0),
    enabled: Boolean(postalCode && serviceId),
    queryFn: () => sdk.client.fetch("/admin/apaczka/pickup-hours", {
      query: { postal_code: postalCode, service_id: serviceId }
    })
  });
}
function useValuation(fulfillmentId) {
  return useMutation({
    mutationFn: (overrides) => sdk.client.fetch(`/admin/apaczka/fulfillments/${fulfillmentId}/valuation`, {
      method: "POST",
      body: { overrides }
    })
  });
}
function useCreateShipment(fulfillmentId, orderId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (overrides) => sdk.client.fetch(`/admin/apaczka/fulfillments/${fulfillmentId}/shipment`, {
      method: "POST",
      body: { overrides }
    }),
    onSuccess: () => invalidateOrder(queryClient, orderId)
  });
}
function useSyncShipment(orderId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shipmentId) => sdk.client.fetch(`/admin/apaczka/shipments/${shipmentId}/sync`, { method: "POST" }),
    onSuccess: () => invalidateOrder(queryClient, orderId)
  });
}
function useBookPickup(orderId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => sdk.client.fetch("/admin/apaczka/pickups", {
      method: "POST",
      body
    }),
    onSuccess: () => invalidateOrder(queryClient, orderId)
  });
}
async function fetchDispatchCode(apaczkaOrderId) {
  return sdk.client.fetch(
    `/admin/apaczka/orders/${apaczkaOrderId}/documents/dispatch_code`
  );
}
function invalidateOrder(queryClient, orderId) {
  queryClient.invalidateQueries({ queryKey: apaczkaKeys.shipments(orderId) });
  queryClient.invalidateQueries({ queryKey: ["orders"] });
}
const STATUS_COLORS = {
  pending: "orange",
  created: "blue",
  posted: "blue",
  in_transit: "blue",
  out_for_delivery: "purple",
  ready_for_pickup: "purple",
  delivered: "green",
  exception: "red",
  returned: "orange",
  canceled: "grey",
  claimed: "red",
  unknown: "grey"
};
function formatGrosze(value, locale) {
  if (value === null || value === void 0) {
    return "—";
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency: "PLN" }).format(value / 100);
}
function formatDateTime(value, locale) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function errorMessage(error) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}
const EMPTY_PARCEL = { weight: 1, length: 30, width: 20, height: 10 };
const CreateShipmentModal = ({ fulfillmentId, orderId, open, onOpenChange }) => {
  const { t, i18n } = useTranslation();
  const services = useApaczkaServices();
  const valuation = useValuation(fulfillmentId);
  const create = useCreateShipment(fulfillmentId, orderId);
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (!open) {
      setForm(null);
      valuation.reset();
      return;
    }
    valuation.mutate(void 0, {
      onSuccess: (data) => setForm({
        service_id: data.service_id,
        parcels: data.defaults.parcels.length ? data.defaults.parcels : [EMPTY_PARCEL],
        pickup_type: data.option.pickup_courier === 2 ? "COURIER" : "SELF",
        pickup_date: "",
        hours_from: "09:00",
        hours_to: "16:00",
        cod_amount: data.defaults.cod_amount ? String(data.defaults.cod_amount) : "",
        declared_value: data.defaults.declared_value ? String(data.defaults.declared_value) : "",
        point_id: data.defaults.point_id ?? "",
        content: "",
        comment: ""
      }),
      onError: (error) => toast.error(errorMessage(error))
    });
  }, [open]);
  const option = valuation.data?.option;
  const isReturn = option?.is_return ?? false;
  const serviceList = useMemo(
    () => (services.data?.services ?? []).filter((s) => !s.is_return && !s.cod),
    [services.data]
  );
  const selectedService = serviceList.find((s) => s.service_id === form?.service_id) ?? option;
  const courierAllowed = (selectedService?.pickup_courier ?? 1) !== 0;
  const needsPoint = !isReturn && selectedService?.destination === "point";
  const pickupHours = usePickupHours(
    form?.pickup_type === "COURIER" ? valuation.data?.sender_postal_code : void 0,
    form?.service_id
  );
  useEffect(() => {
    const first = pickupHours.data?.days?.[0]?.date;
    if (form && form.pickup_type === "COURIER" && !form.pickup_date && first) {
      setForm({ ...form, pickup_date: first });
    }
  }, [pickupHours.data, form]);
  const update = (patch) => setForm((current) => current ? { ...current, ...patch } : current);
  const updateParcel = (index, patch) => setForm(
    (current) => current ? { ...current, parcels: current.parcels.map((p, i) => i === index ? { ...p, ...patch } : p) } : current
  );
  const overrides = () => {
    if (!form) {
      return void 0;
    }
    return {
      service_id: form.service_id,
      parcels: form.parcels,
      pickup: form.pickup_type === "COURIER" && form.pickup_date ? { type: "COURIER", date: form.pickup_date, hours_from: form.hours_from, hours_to: form.hours_to } : { type: "SELF" },
      ...form.cod_amount !== "" ? { cod_amount: Number(form.cod_amount) } : {},
      ...form.declared_value !== "" ? { declared_value: Number(form.declared_value) } : {},
      ...form.point_id ? { point_id: form.point_id.trim() } : {},
      ...form.content ? { content: form.content } : {},
      ...form.comment ? { comment: form.comment } : {}
    };
  };
  const quote = () => valuation.mutate(overrides(), { onError: (error) => toast.error(errorMessage(error)) });
  const submit = () => create.mutate(overrides(), {
    onSuccess: () => {
      toast.success(t("apaczka.toast.created"));
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorMessage(error))
  });
  return /* @__PURE__ */ jsx(FocusModal, { open, onOpenChange, children: /* @__PURE__ */ jsxs(FocusModal.Content, { children: [
    /* @__PURE__ */ jsx(FocusModal.Header, { children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-end gap-x-2", children: [
      /* @__PURE__ */ jsx(FocusModal.Close, { asChild: true, children: /* @__PURE__ */ jsx(Button, { size: "small", variant: "secondary", children: t("apaczka.actions.cancel") }) }),
      /* @__PURE__ */ jsx(Button, { size: "small", variant: "secondary", onClick: quote, isLoading: valuation.isPending, disabled: !form, children: t("apaczka.actions.getPrice") }),
      /* @__PURE__ */ jsx(
        Button,
        {
          size: "small",
          onClick: submit,
          isLoading: create.isPending,
          disabled: !form || needsPoint && !form.point_id,
          children: t("apaczka.actions.create")
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx(FocusModal.Body, { className: "flex flex-1 flex-col items-center overflow-y-auto py-16", children: /* @__PURE__ */ jsxs("div", { className: "flex w-full max-w-[720px] flex-col gap-y-8 px-4", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(FocusModal.Title, { asChild: true, children: /* @__PURE__ */ jsx(Heading, { children: t("apaczka.create.title") }) }),
        /* @__PURE__ */ jsx(FocusModal.Description, { asChild: true, children: /* @__PURE__ */ jsx(Text, { className: "text-ui-fg-subtle", children: t("apaczka.create.description") }) })
      ] }),
      valuation.data && /* @__PURE__ */ jsxs("div", { className: "bg-ui-bg-subtle shadow-borders-base flex items-center justify-between rounded-lg px-4 py-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Text, { size: "small", weight: "plus", children: t("apaczka.create.quote") }),
          /* @__PURE__ */ jsx(Text, { size: "xsmall", className: "text-ui-fg-subtle", children: t("apaczka.create.quoteHint", { net: formatGrosze(valuation.data.price_net, i18n.language) }) })
        ] }),
        /* @__PURE__ */ jsx(Heading, { level: "h2", children: formatGrosze(valuation.data.price_gross, i18n.language) })
      ] }),
      form && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
          /* @__PURE__ */ jsx(Label, { size: "small", weight: "plus", children: t("apaczka.fields.service") }),
          /* @__PURE__ */ jsxs(Select, { value: String(form.service_id), onValueChange: (v) => update({ service_id: Number(v) }), children: [
            /* @__PURE__ */ jsx(Select.Trigger, { children: /* @__PURE__ */ jsx(Select.Value, {}) }),
            /* @__PURE__ */ jsx(Select.Content, { children: (serviceList.length ? serviceList : option ? [option] : []).map((service) => /* @__PURE__ */ jsx(Select.Item, { value: String(service.service_id), children: service.name }, service.service_id)) })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsx(Label, { size: "small", weight: "plus", children: t("apaczka.create.parcels") }),
            /* @__PURE__ */ jsxs(
              Button,
              {
                size: "small",
                variant: "transparent",
                onClick: () => update({ parcels: [...form.parcels, { ...EMPTY_PARCEL }] }),
                children: [
                  /* @__PURE__ */ jsx(Plus, {}),
                  t("apaczka.actions.addParcel")
                ]
              }
            )
          ] }),
          form.parcels.map((parcel, index) => /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[repeat(4,1fr)_auto_auto] items-end gap-x-3", children: [
            ["weight", "length", "width", "height"].map((field) => /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-1", children: [
              /* @__PURE__ */ jsx(Label, { size: "xsmall", className: "text-ui-fg-subtle", children: t(`apaczka.create.${field}`) }),
              /* @__PURE__ */ jsx(
                Input,
                {
                  size: "small",
                  type: "number",
                  min: 0,
                  step: field === "weight" ? 0.01 : 1,
                  value: parcel[field],
                  onChange: (e) => updateParcel(index, { [field]: Number(e.target.value) })
                }
              )
            ] }, field)),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-y-1 pb-1", children: [
              /* @__PURE__ */ jsx(Label, { size: "xsmall", className: "text-ui-fg-subtle", children: t("apaczka.create.nonStandard") }),
              /* @__PURE__ */ jsx(
                Switch,
                {
                  checked: Boolean(parcel.non_standard),
                  onCheckedChange: (checked) => updateParcel(index, { non_standard: checked })
                }
              )
            ] }),
            /* @__PURE__ */ jsx(
              IconButton,
              {
                size: "small",
                variant: "transparent",
                "aria-label": t("apaczka.actions.removeParcel"),
                disabled: form.parcels.length === 1,
                onClick: () => update({ parcels: form.parcels.filter((_, i) => i !== index) }),
                children: /* @__PURE__ */ jsx(Trash, {})
              }
            )
          ] }, index))
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
            /* @__PURE__ */ jsx(Label, { size: "small", weight: "plus", children: t("apaczka.fields.pickup") }),
            /* @__PURE__ */ jsxs(
              Select,
              {
                value: form.pickup_type,
                onValueChange: (v) => update({ pickup_type: v }),
                children: [
                  /* @__PURE__ */ jsx(Select.Trigger, { children: /* @__PURE__ */ jsx(Select.Value, {}) }),
                  /* @__PURE__ */ jsxs(Select.Content, { children: [
                    /* @__PURE__ */ jsx(Select.Item, { value: "SELF", disabled: selectedService?.pickup_courier === 2, children: t("apaczka.pickupType.SELF") }),
                    /* @__PURE__ */ jsx(Select.Item, { value: "COURIER", disabled: !courierAllowed, children: t("apaczka.pickupType.COURIER") })
                  ] })
                ]
              }
            )
          ] }),
          form.pickup_type === "COURIER" && /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
            /* @__PURE__ */ jsx(Label, { size: "small", weight: "plus", children: t("apaczka.create.pickupDate") }),
            /* @__PURE__ */ jsx(Input, { type: "date", value: form.pickup_date, onChange: (e) => update({ pickup_date: e.target.value }) }),
            pickupHours.isSuccess && !pickupHours.data.days.length && /* @__PURE__ */ jsx(Text, { size: "xsmall", className: "text-ui-fg-subtle", children: t("apaczka.create.noPickupDays") })
          ] }),
          form.pickup_type === "COURIER" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
              /* @__PURE__ */ jsx(Label, { size: "small", children: t("apaczka.create.hoursFrom") }),
              /* @__PURE__ */ jsx(Input, { type: "time", value: form.hours_from, onChange: (e) => update({ hours_from: e.target.value }) })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
              /* @__PURE__ */ jsx(Label, { size: "small", children: t("apaczka.create.hoursTo") }),
              /* @__PURE__ */ jsx(Input, { type: "time", value: form.hours_to, onChange: (e) => update({ hours_to: e.target.value }) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          !isReturn && /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
            /* @__PURE__ */ jsx(Label, { size: "small", weight: "plus", children: t("apaczka.fields.codAmount") }),
            /* @__PURE__ */ jsx(
              Input,
              {
                type: "number",
                min: 0,
                step: 0.01,
                value: form.cod_amount,
                onChange: (e) => update({ cod_amount: e.target.value })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
            /* @__PURE__ */ jsx(Label, { size: "small", weight: "plus", children: t("apaczka.fields.declaredValue") }),
            /* @__PURE__ */ jsx(
              Input,
              {
                type: "number",
                min: 0,
                step: 0.01,
                value: form.declared_value,
                onChange: (e) => update({ declared_value: e.target.value })
              }
            )
          ] }),
          !isReturn && /* @__PURE__ */ jsxs("div", { className: "col-span-2 flex flex-col gap-y-2", children: [
            /* @__PURE__ */ jsx(Label, { size: "small", weight: "plus", children: t("apaczka.fields.point") }),
            /* @__PURE__ */ jsx(Input, { value: form.point_id, onChange: (e) => update({ point_id: e.target.value }) }),
            needsPoint && /* @__PURE__ */ jsx(Text, { size: "xsmall", className: "text-ui-fg-subtle", children: t("apaczka.create.pointRequired") })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
            /* @__PURE__ */ jsx(Label, { size: "small", weight: "plus", children: t("apaczka.fields.content") }),
            /* @__PURE__ */ jsx(Input, { value: form.content, maxLength: 255, onChange: (e) => update({ content: e.target.value }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
            /* @__PURE__ */ jsx(Label, { size: "small", weight: "plus", children: t("apaczka.fields.comment") }),
            /* @__PURE__ */ jsx(Input, { value: form.comment, maxLength: 255, onChange: (e) => update({ comment: e.target.value }) })
          ] })
        ] })
      ] })
    ] }) })
  ] }) });
};
const PickupDrawer = ({ shipment, orderId, open, onOpenChange }) => {
  const { t } = useTranslation();
  const postalCode = shipment.metadata?.sender_postal_code;
  const hours = usePickupHours(open ? postalCode : void 0, shipment.service_id);
  const book = useBookPickup(orderId);
  const [date, setDate] = useState("");
  const [hourFrom, setHourFrom] = useState("09:00");
  const [hourTo, setHourTo] = useState("16:00");
  const days = hours.data?.days ?? [];
  useEffect(() => {
    if (!date && days.length) {
      setDate(days[0].date);
    }
  }, [days, date]);
  const submit = () => book.mutate(
    { shipment_ids: [shipment.id], date, hour_from: hourFrom, hour_to: hourTo },
    {
      onSuccess: () => {
        toast.success(t("apaczka.toast.pickupBooked"));
        onOpenChange(false);
      },
      onError: (error) => toast.error(errorMessage(error))
    }
  );
  return /* @__PURE__ */ jsx(Drawer, { open, onOpenChange, children: /* @__PURE__ */ jsxs(Drawer.Content, { children: [
    /* @__PURE__ */ jsxs(Drawer.Header, { children: [
      /* @__PURE__ */ jsx(Drawer.Title, { children: t("apaczka.pickup.title") }),
      /* @__PURE__ */ jsx(Drawer.Description, { children: t("apaczka.pickup.description") })
    ] }),
    /* @__PURE__ */ jsxs(Drawer.Body, { className: "flex flex-col gap-y-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
        /* @__PURE__ */ jsx(Label, { size: "small", children: t("apaczka.create.pickupDate") }),
        days.length ? /* @__PURE__ */ jsxs(Select, { value: date, onValueChange: setDate, children: [
          /* @__PURE__ */ jsx(Select.Trigger, { children: /* @__PURE__ */ jsx(Select.Value, {}) }),
          /* @__PURE__ */ jsx(Select.Content, { children: days.map((day) => /* @__PURE__ */ jsx(Select.Item, { value: day.date, children: day.date }, day.date)) })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Input, { type: "date", value: date, onChange: (e) => setDate(e.target.value) }),
          !hours.isLoading && /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: t("apaczka.create.noPickupDays") })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-2 gap-x-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
          /* @__PURE__ */ jsx(Label, { size: "small", children: t("apaczka.create.hoursFrom") }),
          /* @__PURE__ */ jsx(Input, { type: "time", value: hourFrom, onChange: (e) => setHourFrom(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-2", children: [
          /* @__PURE__ */ jsx(Label, { size: "small", children: t("apaczka.create.hoursTo") }),
          /* @__PURE__ */ jsx(Input, { type: "time", value: hourTo, onChange: (e) => setHourTo(e.target.value) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Drawer.Footer, { children: [
      /* @__PURE__ */ jsx(Drawer.Close, { asChild: true, children: /* @__PURE__ */ jsx(Button, { variant: "secondary", size: "small", children: t("apaczka.actions.cancel") }) }),
      /* @__PURE__ */ jsx(Button, { size: "small", onClick: submit, isLoading: book.isPending, disabled: !date, children: t("apaczka.actions.book") })
    ] })
  ] }) });
};
const DOT_COLORS = {
  green: "bg-ui-tag-green-icon",
  red: "bg-ui-tag-red-icon",
  blue: "bg-ui-tag-blue-icon",
  orange: "bg-ui-tag-orange-icon",
  purple: "bg-ui-tag-purple-icon",
  grey: "bg-ui-tag-neutral-icon"
};
const TrackingTimeline = ({ events }) => {
  const { t, i18n } = useTranslation();
  if (!events.length) {
    return /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: t("apaczka.history.empty") });
  }
  return /* @__PURE__ */ jsx("ol", { className: "flex flex-col gap-y-3", children: events.map((event, index) => /* @__PURE__ */ jsxs("li", { className: "grid grid-cols-[12px_1fr] gap-x-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center", children: [
      /* @__PURE__ */ jsx("span", { className: clx("mt-1.5 size-2 rounded-full", DOT_COLORS[STATUS_COLORS[event.status]] ?? DOT_COLORS.grey) }),
      index < events.length - 1 && /* @__PURE__ */ jsx("span", { className: "bg-ui-border-base mt-1 w-px flex-1" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col pb-1", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-x-2", children: [
        /* @__PURE__ */ jsx(Text, { size: "small", weight: "plus", leading: "compact", children: t(`apaczka.status.${event.status}`) }),
        /* @__PURE__ */ jsx(Text, { size: "xsmall", className: "text-ui-fg-muted whitespace-nowrap", children: formatDateTime(event.occurred_at, i18n.language) })
      ] }),
      (event.description || event.place) && /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: [event.description, event.place].filter(Boolean).join(" · ") }),
      /* @__PURE__ */ jsxs(Text, { size: "xsmall", className: "text-ui-fg-muted", children: [
        event.raw_status,
        " · ",
        t(`apaczka.history.source.${event.source}`)
      ] })
    ] })
  ] }, event.id)) });
};
const FINISHED = /* @__PURE__ */ new Set(["delivered", "returned", "canceled"]);
const ShipmentCard = ({ shipment, orderId }) => {
  const { t, i18n } = useTranslation();
  const sync = useSyncShipment(orderId);
  const [showHistory, setShowHistory] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pickupOpen, setPickupOpen] = useState(false);
  const isPending = shipment.status === "pending" || !shipment.apaczka_order_id;
  const labelUrl = shipment.apaczka_order_id ? backendUrl(`/admin/apaczka/orders/${shipment.apaczka_order_id}/documents/waybill`) : null;
  const refresh = () => sync.mutate(shipment.id, {
    onSuccess: () => toast.success(t("apaczka.toast.refreshed")),
    onError: (error) => toast.error(errorMessage(error))
  });
  const showDispatchCode = async () => {
    try {
      const { dispatch_code } = await fetchDispatchCode(shipment.apaczka_order_id);
      if (dispatch_code) {
        toast.info(t("apaczka.toast.dispatchCode", { code: dispatch_code }));
      } else {
        toast.info(t("apaczka.toast.noDispatchCode"));
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-3 px-6 py-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-x-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 flex-col gap-y-1", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
          /* @__PURE__ */ jsx(Text, { size: "small", weight: "plus", leading: "compact", className: "truncate", children: [shipment.supplier, shipment.service_name].filter(Boolean).join(" · ") || `#${shipment.service_id}` }),
          /* @__PURE__ */ jsx(StatusBadge, { color: STATUS_COLORS[shipment.status], children: t(`apaczka.status.${shipment.status}`) }),
          shipment.is_return && /* @__PURE__ */ jsx(Badge, { size: "2xsmall", children: t("apaczka.return") }),
          shipment.is_cod && /* @__PURE__ */ jsx(Badge, { size: "2xsmall", children: t("apaczka.cod") })
        ] }),
        shipment.waybill_number && /* @__PURE__ */ jsxs("div", { className: "text-ui-fg-subtle flex items-center gap-x-1", children: [
          /* @__PURE__ */ jsx(Text, { size: "small", className: "font-mono", children: shipment.waybill_number }),
          /* @__PURE__ */ jsx(Copy, { content: shipment.waybill_number })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-x-2", children: [
        isPending ? /* @__PURE__ */ jsx(Button, { size: "small", onClick: () => setCreateOpen(true), children: t("apaczka.actions.createShipment") }) : labelUrl && /* @__PURE__ */ jsx(Button, { size: "small", variant: "secondary", asChild: true, children: /* @__PURE__ */ jsxs("a", { href: labelUrl, target: "_blank", rel: "noreferrer", children: [
          /* @__PURE__ */ jsx(ArrowDownTray, {}),
          t("apaczka.actions.label")
        ] }) }),
        !isPending && /* @__PURE__ */ jsxs(DropdownMenu, { children: [
          /* @__PURE__ */ jsx(DropdownMenu.Trigger, { asChild: true, children: /* @__PURE__ */ jsx(IconButton, { size: "small", variant: "transparent", children: /* @__PURE__ */ jsx(EllipsisHorizontal, {}) }) }),
          /* @__PURE__ */ jsxs(DropdownMenu.Content, { align: "end", children: [
            shipment.tracking_url && /* @__PURE__ */ jsx(DropdownMenu.Item, { asChild: true, children: /* @__PURE__ */ jsxs("a", { href: shipment.tracking_url, target: "_blank", rel: "noreferrer", className: "flex items-center gap-x-2", children: [
              /* @__PURE__ */ jsx(ArrowUpRightOnBox, { className: "text-ui-fg-subtle" }),
              t("apaczka.actions.track")
            ] }) }),
            /* @__PURE__ */ jsxs(DropdownMenu.Item, { className: "flex items-center gap-x-2", onClick: refresh, disabled: sync.isPending, children: [
              /* @__PURE__ */ jsx(ArrowPath, { className: "text-ui-fg-subtle" }),
              t("apaczka.actions.refresh")
            ] }),
            /* @__PURE__ */ jsxs(DropdownMenu.Item, { className: "flex items-center gap-x-2", onClick: showDispatchCode, children: [
              /* @__PURE__ */ jsx(ArrowDownTray, { className: "text-ui-fg-subtle" }),
              t("apaczka.actions.dispatchCode")
            ] }),
            !FINISHED.has(shipment.status) && /* @__PURE__ */ jsxs(DropdownMenu.Item, { className: "flex items-center gap-x-2", onClick: () => setPickupOpen(true), children: [
              /* @__PURE__ */ jsx(TruckFast, { className: "text-ui-fg-subtle" }),
              t("apaczka.actions.bookPickup")
            ] })
          ] })
        ] })
      ] })
    ] }),
    isPending && shipment.error && /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-error", children: t("apaczka.pendingReason", { reason: shipment.error }) }),
    !isPending && /* @__PURE__ */ jsxs("dl", { className: "grid grid-cols-2 gap-x-4 gap-y-2", children: [
      /* @__PURE__ */ jsx(Field, { label: t("apaczka.fields.price"), value: formatGrosze(shipment.price_gross, i18n.language) }),
      /* @__PURE__ */ jsx(
        Field,
        {
          label: t("apaczka.fields.pickup"),
          value: shipment.pickup_type ? [t(`apaczka.pickupType.${shipment.pickup_type}`), shipment.pickup_date].filter(Boolean).join(" · ") : "—"
        }
      ),
      shipment.point_id && /* @__PURE__ */ jsx(Field, { label: t("apaczka.fields.point"), value: shipment.point_id }),
      shipment.is_cod && /* @__PURE__ */ jsx(Field, { label: t("apaczka.fields.codAmount"), value: formatGrosze(shipment.cod_amount, i18n.language) }),
      /* @__PURE__ */ jsx(Field, { label: t("apaczka.fields.lastSync"), value: formatDateTime(shipment.last_synced_at, i18n.language) })
    ] }),
    !isPending && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(Button, { size: "small", variant: "transparent", className: "-ml-2", onClick: () => setShowHistory((v) => !v), children: showHistory ? t("apaczka.actions.hideHistory") : t("apaczka.actions.showHistory") }),
      showHistory && /* @__PURE__ */ jsx("div", { className: "pt-2", children: /* @__PURE__ */ jsx(TrackingTimeline, { events: shipment.events }) })
    ] }),
    /* @__PURE__ */ jsx(
      CreateShipmentModal,
      {
        fulfillmentId: shipment.fulfillment_id,
        orderId,
        open: createOpen,
        onOpenChange: setCreateOpen
      }
    ),
    !isPending && /* @__PURE__ */ jsx(PickupDrawer, { shipment, orderId, open: pickupOpen, onOpenChange: setPickupOpen })
  ] });
};
const Field = ({ label, value }) => /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
  /* @__PURE__ */ jsx(Text, { size: "xsmall", className: "text-ui-fg-muted", children: label }),
  /* @__PURE__ */ jsx(Text, { size: "small", children: value })
] });
const OrderApaczkaShipments = ({ data: order }) => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useOrderShipments(order.id);
  const shipments = useMemo(() => {
    const known = data?.shipments ?? [];
    const knownIds = new Set(known.map((s) => s.fulfillment_id));
    const orphans = (order.fulfillments ?? []).filter((f) => f.provider_id?.startsWith("apaczka_") && !f.canceled_at && !knownIds.has(f.id)).map((f) => placeholder(f.id, order.id));
    return [...known, ...orphans];
  }, [data, order]);
  const hasApaczka = shipments.length > 0 || (order.shipping_methods ?? []).some((m) => m.shipping_option_id && isApaczkaMethod(m));
  if (!isLoading && !hasApaczka) {
    return null;
  }
  return /* @__PURE__ */ jsxs(Container, { className: "divide-y p-0", children: [
    /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between px-6 py-4", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(Heading, { level: "h2", children: t("apaczka.title") }),
      /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: t("apaczka.subtitle") })
    ] }) }),
    isLoading && /* @__PURE__ */ jsx("div", { className: "px-6 py-4", children: /* @__PURE__ */ jsx(Skeleton, { className: "h-16 w-full" }) }),
    isError && /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-error px-6 py-4", children: t("apaczka.loadError") }),
    !isLoading && !shipments.length && /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle px-6 py-4", children: t("apaczka.empty") }),
    shipments.map((shipment) => /* @__PURE__ */ jsx(ShipmentCard, { shipment, orderId: order.id }, shipment.id))
  ] });
};
function isApaczkaMethod(method) {
  const option = method.data?.apaczka_option;
  return Boolean(option?.id?.startsWith("apaczka-"));
}
function placeholder(fulfillmentId, orderId) {
  return {
    id: `pending-${fulfillmentId}`,
    fulfillment_id: fulfillmentId,
    order_id: orderId,
    apaczka_order_id: null,
    waybill_number: null,
    tracking_url: null,
    service_id: 0,
    service_name: null,
    supplier: null,
    status: "pending",
    raw_status: null,
    is_return: false,
    is_cod: false,
    point_id: null,
    label_format: "pdf",
    price_net: null,
    price_gross: null,
    cod_amount: null,
    declared_value: null,
    pickup_type: null,
    pickup_date: null,
    pickup_number: null,
    last_synced_at: null,
    error: null,
    metadata: null,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    events: []
  };
}
defineWidgetConfig({
  zone: "order.details.after"
});
const ApaczkaSettingsPage = () => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const status = useApaczkaStatus(refresh);
  const services = useApaczkaServices();
  const s = status.data;
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-3", children: [
    /* @__PURE__ */ jsxs(Container, { className: "divide-y p-0", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-6 py-4", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx(Heading, { children: t("apaczka.settings.title") }),
          /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: t("apaczka.settings.description") })
        ] }),
        /* @__PURE__ */ jsx(
          Button,
          {
            size: "small",
            variant: "secondary",
            isLoading: status.isFetching,
            onClick: () => refresh ? status.refetch() : setRefresh(true),
            children: t("apaczka.settings.recheck")
          }
        )
      ] }),
      status.isLoading || !s ? /* @__PURE__ */ jsx("div", { className: "px-6 py-4", children: /* @__PURE__ */ jsx(Skeleton, { className: "h-24 w-full" }) }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Section, { title: t("apaczka.settings.connection"), children: [
          /* @__PURE__ */ jsxs(Row, { label: t("apaczka.settings.connection"), children: [
            /* @__PURE__ */ jsx(StatusBadge, { color: s.connection.ok ? "green" : "red", children: s.connection.ok ? t("apaczka.settings.connected") : t("apaczka.settings.disconnected") }),
            s.connection.ok && /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: t("apaczka.settings.services", { count: s.connection.services }) })
          ] }),
          !s.connection.ok && /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-error", children: s.connection.authentication_error ? t("apaczka.settings.authError") : s.connection.error }),
          /* @__PURE__ */ jsxs(Row, { label: t("apaczka.settings.environment"), children: [
            /* @__PURE__ */ jsx(Badge, { size: "2xsmall", color: s.environment === "production" ? "green" : "orange", children: s.environment }),
            /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle font-mono", children: s.base_url })
          ] }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.appId"), children: /* @__PURE__ */ jsx(Text, { size: "small", className: "font-mono", children: s.app_id }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.version"), children: /* @__PURE__ */ jsx(Text, { size: "small", children: s.version }) })
        ] }),
        /* @__PURE__ */ jsxs(Section, { title: t("apaczka.settings.configuration"), hint: t("apaczka.settings.configHint"), children: [
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.shipmentCreation"), children: /* @__PURE__ */ jsx(Text, { size: "small", children: t(`apaczka.settings.${s.settings.shipment_creation}`) }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.labelFormat"), children: /* @__PURE__ */ jsx(Text, { size: "small", children: s.settings.label_format.toUpperCase() }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.defaultHandover"), children: /* @__PURE__ */ jsx(Text, { size: "small", children: t(`apaczka.pickupType.${s.settings.pickup_type}`) }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.pricingBasis"), children: /* @__PURE__ */ jsx(Text, { size: "small", children: s.settings.pricing_basis }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.insurance"), children: /* @__PURE__ */ jsx(Text, { size: "small", children: s.settings.insurance }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.codAccount"), children: /* @__PURE__ */ jsx(StatusBadge, { color: s.settings.cod_account_configured ? "green" : "grey", children: s.settings.cod_account_configured ? t("apaczka.settings.configured") : t("apaczka.settings.notConfigured") }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.senderLocations"), children: /* @__PURE__ */ jsx(Text, { size: "small", children: s.settings.sender_locations.length || "—" }) })
        ] }),
        /* @__PURE__ */ jsxs(Section, { title: t("apaczka.settings.tracking"), children: [
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.webhookUrl"), children: s.tracking.webhook_url ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-x-1", children: [
            /* @__PURE__ */ jsx(Text, { size: "small", className: "font-mono", children: s.tracking.webhook_url }),
            /* @__PURE__ */ jsx(Copy, { content: s.tracking.webhook_url })
          ] }) : /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: t("apaczka.settings.webhookMissing") }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.polling"), children: /* @__PURE__ */ jsx(OnOff, { value: s.tracking.polling }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.markShipped"), children: /* @__PURE__ */ jsx(OnOff, { value: s.tracking.mark_shipped }) }),
          /* @__PURE__ */ jsx(Row, { label: t("apaczka.settings.markDelivered"), children: /* @__PURE__ */ jsx(OnOff, { value: s.tracking.mark_delivered }) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Container, { className: "p-0", children: [
      /* @__PURE__ */ jsxs("div", { className: "px-6 py-4", children: [
        /* @__PURE__ */ jsx(Heading, { level: "h2", children: t("apaczka.settings.servicesTitle") }),
        /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: t("apaczka.settings.servicesHint") })
      ] }),
      services.isLoading ? /* @__PURE__ */ jsx("div", { className: "px-6 pb-4", children: /* @__PURE__ */ jsx(Skeleton, { className: "h-24 w-full" }) }) : /* @__PURE__ */ jsxs(Table, { children: [
        /* @__PURE__ */ jsx(Table.Header, { children: /* @__PURE__ */ jsxs(Table.Row, { children: [
          /* @__PURE__ */ jsx(Table.HeaderCell, { children: "ID" }),
          /* @__PURE__ */ jsx(Table.HeaderCell, { children: t("apaczka.fields.service") }),
          /* @__PURE__ */ jsx(Table.HeaderCell, { children: t("apaczka.settings.route") }),
          /* @__PURE__ */ jsx(Table.HeaderCell, { children: t("apaczka.settings.courier") }),
          /* @__PURE__ */ jsx(Table.HeaderCell, {})
        ] }) }),
        /* @__PURE__ */ jsx(Table.Body, { children: (services.data?.services ?? []).map((service) => /* @__PURE__ */ jsxs(Table.Row, { children: [
          /* @__PURE__ */ jsx(Table.Cell, { className: "font-mono", children: service.service_id }),
          /* @__PURE__ */ jsx(Table.Cell, { children: service.name }),
          /* @__PURE__ */ jsxs(Table.Cell, { children: [
            t(`apaczka.settings.${service.origin}`),
            " → ",
            t(`apaczka.settings.${service.destination}`)
          ] }),
          /* @__PURE__ */ jsx(Table.Cell, { children: t(
            `apaczka.settings.${service.pickup_courier === 2 ? "required" : service.pickup_courier === 1 ? "available" : "unavailable"}`
          ) }),
          /* @__PURE__ */ jsx(Table.Cell, { children: /* @__PURE__ */ jsx(Badge, { size: "2xsmall", children: service.domestic ? t("apaczka.settings.domestic") : t("apaczka.settings.international") }) })
        ] }, service.id)) })
      ] })
    ] })
  ] });
};
const Section = ({ title, hint, children }) => /* @__PURE__ */ jsxs("div", { className: "flex flex-col gap-y-3 px-6 py-4", children: [
  /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx(Text, { size: "small", weight: "plus", children: title }),
    hint && /* @__PURE__ */ jsx(Text, { size: "xsmall", className: "text-ui-fg-muted", children: hint })
  ] }),
  children
] });
const Row = ({ label, children }) => /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[200px_1fr] items-center gap-x-4", children: [
  /* @__PURE__ */ jsx(Text, { size: "small", className: "text-ui-fg-subtle", children: label }),
  /* @__PURE__ */ jsx("div", { className: "flex flex-wrap items-center gap-2", children })
] });
const OnOff = ({ value }) => {
  const { t } = useTranslation();
  return /* @__PURE__ */ jsx(StatusBadge, { color: value ? "green" : "grey", children: value ? t("apaczka.settings.on") : t("apaczka.settings.off") });
};
const config = defineRouteConfig({
  label: "Apaczka",
  icon: TruckFast
});
const apaczka$1 = { "title": "Apaczka shipments", "subtitle": "Labels, tracking and courier pickups", "empty": "No Apaczka shipments for this order yet.", "loadError": "Could not load Apaczka shipments.", "return": "Return", "cod": "COD", "status": { "pending": "Not created", "created": "Created", "posted": "Handed to carrier", "in_transit": "In transit", "out_for_delivery": "Out for delivery", "ready_for_pickup": "Ready for pickup", "delivered": "Delivered", "exception": "Needs attention", "returned": "Returned", "canceled": "Canceled", "claimed": "Complaint", "unknown": "Unknown" }, "fields": { "service": "Service", "waybill": "Tracking number", "price": "Cost (gross)", "point": "Parcel point", "pickup": "Handover", "codAmount": "Cash on delivery (PLN)", "declaredValue": "Declared value (PLN)", "content": "Content", "comment": "Comment", "lastSync": "Last update" }, "pickupType": { "SELF": "Drop-off", "COURIER": "Courier pickup" }, "actions": { "createShipment": "Create shipment", "label": "Label", "downloadLabel": "Download label", "dispatchCode": "Drop-off code", "refresh": "Refresh tracking", "bookPickup": "Book courier", "track": "Track parcel", "showHistory": "Show history", "hideHistory": "Hide history", "getPrice": "Check price", "addParcel": "Add parcel", "removeParcel": "Remove parcel", "cancel": "Cancel", "create": "Create shipment", "book": "Book pickup" }, "toast": { "created": "Shipment created in Apaczka", "refreshed": "Tracking updated", "pickupBooked": "Courier pickup booked", "dispatchCode": "Drop-off code: {{code}}", "noDispatchCode": "This carrier does not use drop-off codes" }, "pendingReason": "Shipment was not created automatically: {{reason}}", "create": { "title": "Create Apaczka shipment", "description": "Check the parcels and options, then create the shipment. The label is ready right after.", "parcels": "Parcels", "weight": "Weight (kg)", "length": "Length (cm)", "width": "Width (cm)", "height": "Height (cm)", "nonStandard": "Non-standard", "pickupDate": "Pickup date", "hoursFrom": "From", "hoursTo": "To", "noPickupDays": "No pickup days returned for this postal code; enter a date manually.", "quote": "Price for this shipment", "quoteHint": "Net {{net}} · prices in PLN", "pointRequired": "This service delivers to a parcel point." }, "pickup": { "title": "Book a courier pickup", "description": "The courier collects the parcel from the sender address in the chosen window." }, "history": { "empty": "No tracking events yet.", "source": { "webhook": "push", "polling": "poll", "system": "system" } }, "settings": { "title": "Apaczka", "description": "Connection and configuration of the Apaczka.pl integration.", "connection": "Connection", "connected": "Connected", "disconnected": "Not connected", "services": "{{count}} services available", "authError": "Apaczka rejected the credentials. Check appId and appSecret (Apaczka panel → Settings → API).", "environment": "Environment", "appId": "App ID", "version": "Plugin version", "recheck": "Check again", "configuration": "Configuration", "configHint": "These values come from the plugin options in medusa-config.ts.", "shipmentCreation": "Shipment creation", "auto": "Automatic", "manual": "Manual", "labelFormat": "Label format", "defaultHandover": "Default handover", "pricingBasis": "Pricing basis", "insurance": "Insurance", "codAccount": "COD payout account", "configured": "Configured", "notConfigured": "Not configured", "senderLocations": "Locations with custom sender", "tracking": "Tracking", "webhookUrl": "Webhook URL", "webhookMissing": "Not set. Set webhooks.backendUrl in the plugin options, or paste your backend URL + /hooks/apaczka/tracking into the Apaczka panel (Settings → WebAPI).", "polling": "Polling backup", "markShipped": "Mark fulfillments shipped", "markDelivered": "Mark fulfillments delivered", "on": "On", "off": "Off", "servicesTitle": "Services on your account", "servicesHint": "Pick these when creating a shipping option with the Apaczka provider.", "route": "Route", "courier": "Courier pickup", "required": "Required", "available": "Available", "unavailable": "Unavailable", "door": "Address", "point": "Point", "domestic": "Domestic", "international": "International" } };
const en = {
  apaczka: apaczka$1
};
const apaczka = { "title": "Przesyłki Apaczka", "subtitle": "Etykiety, śledzenie i zamawianie kuriera", "empty": "To zamówienie nie ma jeszcze przesyłek Apaczka.", "loadError": "Nie udało się wczytać przesyłek Apaczka.", "return": "Zwrot", "cod": "Pobranie", "status": { "pending": "Nieutworzona", "created": "Utworzona", "posted": "Nadana", "in_transit": "W drodze", "out_for_delivery": "W doręczeniu", "ready_for_pickup": "Do odbioru", "delivered": "Doręczona", "exception": "Wymaga uwagi", "returned": "Zwrócona", "canceled": "Anulowana", "claimed": "Reklamacja", "unknown": "Nieznany" }, "fields": { "service": "Usługa", "waybill": "Numer przesyłki", "price": "Koszt (brutto)", "point": "Punkt odbioru", "pickup": "Nadanie", "codAmount": "Pobranie (PLN)", "declaredValue": "Wartość deklarowana (PLN)", "content": "Zawartość", "comment": "Komentarz", "lastSync": "Ostatnia aktualizacja" }, "pickupType": { "SELF": "Nadanie w punkcie", "COURIER": "Odbiór przez kuriera" }, "actions": { "createShipment": "Utwórz przesyłkę", "label": "Etykieta", "downloadLabel": "Pobierz etykietę", "dispatchCode": "Kod nadania", "refresh": "Odśwież śledzenie", "bookPickup": "Zamów kuriera", "track": "Śledź przesyłkę", "showHistory": "Pokaż historię", "hideHistory": "Ukryj historię", "getPrice": "Sprawdź cenę", "addParcel": "Dodaj paczkę", "removeParcel": "Usuń paczkę", "cancel": "Anuluj", "create": "Utwórz przesyłkę", "book": "Zamów odbiór" }, "toast": { "created": "Przesyłka utworzona w Apaczce", "refreshed": "Śledzenie zaktualizowane", "pickupBooked": "Kurier zamówiony", "dispatchCode": "Kod nadania: {{code}}", "noDispatchCode": "Ten przewoźnik nie używa kodów nadania" }, "pendingReason": "Przesyłka nie została utworzona automatycznie: {{reason}}", "create": { "title": "Utwórz przesyłkę Apaczka", "description": "Sprawdź paczki i opcje, a następnie utwórz przesyłkę. Etykieta będzie gotowa od razu.", "parcels": "Paczki", "weight": "Waga (kg)", "length": "Długość (cm)", "width": "Szerokość (cm)", "height": "Wysokość (cm)", "nonStandard": "Niestandardowa", "pickupDate": "Data odbioru", "hoursFrom": "Od", "hoursTo": "Do", "noPickupDays": "Brak dostępnych dni odbioru dla tego kodu pocztowego; wpisz datę ręcznie.", "quote": "Cena tej przesyłki", "quoteHint": "Netto {{net}} · ceny w PLN", "pointRequired": "Ta usługa doręcza do punktu odbioru." }, "pickup": { "title": "Zamów kuriera", "description": "Kurier odbierze paczkę spod adresu nadawcy w wybranym przedziale godzin." }, "history": { "empty": "Brak zdarzeń śledzenia.", "source": { "webhook": "push", "polling": "odpyt.", "system": "system" } }, "settings": { "title": "Apaczka", "description": "Połączenie i konfiguracja integracji z Apaczka.pl.", "connection": "Połączenie", "connected": "Połączono", "disconnected": "Brak połączenia", "services": "Dostępnych usług: {{count}}", "authError": "Apaczka odrzuciła dane logowania. Sprawdź appId i appSecret (panel Apaczki → Ustawienia → API).", "environment": "Środowisko", "appId": "App ID", "version": "Wersja wtyczki", "recheck": "Sprawdź ponownie", "configuration": "Konfiguracja", "configHint": "Te wartości pochodzą z opcji wtyczki w medusa-config.ts.", "shipmentCreation": "Tworzenie przesyłek", "auto": "Automatyczne", "manual": "Ręczne", "labelFormat": "Format etykiet", "defaultHandover": "Domyślne nadanie", "pricingBasis": "Podstawa ceny", "insurance": "Ubezpieczenie", "codAccount": "Konto do wypłat pobrań", "configured": "Skonfigurowane", "notConfigured": "Nieskonfigurowane", "senderLocations": "Magazyny z własnym nadawcą", "tracking": "Śledzenie", "webhookUrl": "Adres webhooka", "webhookMissing": "Nie ustawiono. Ustaw webhooks.backendUrl w opcjach wtyczki albo wklej adres backendu + /hooks/apaczka/tracking w panelu Apaczki (Ustawienia → WebAPI).", "polling": "Odpytywanie zapasowe", "markShipped": "Oznaczaj wysłane", "markDelivered": "Oznaczaj doręczone", "on": "Wł.", "off": "Wył.", "servicesTitle": "Usługi na Twoim koncie", "servicesHint": "Wybierz je przy tworzeniu opcji dostawy z dostawcą Apaczka.", "route": "Trasa", "courier": "Odbiór kurierem", "required": "Wymagany", "available": "Dostępny", "unavailable": "Niedostępny", "door": "Adres", "point": "Punkt", "domestic": "Krajowa", "international": "Zagraniczna" } };
const pl = {
  apaczka
};
const i18nTranslations0 = {
  en: { translation: en },
  pl: { translation: pl }
};
const widgetModule = { widgets: [
  {
    Component: OrderApaczkaShipments,
    zone: ["order.details.after"],
    widgetId: "Widget-edb0"
  }
] };
const routeModule = {
  routes: [
    {
      Component: ApaczkaSettingsPage,
      path: "/settings/apaczka",
      handle: { label: config.label, translationNs: config.translationNs, permissions: config.permissions }
    }
  ]
};
const menuItemModule = {
  menuItems: [
    {
      label: config.label,
      icon: config.icon,
      path: "/settings/apaczka",
      nested: void 0,
      rank: void 0,
      translationNs: void 0,
      permissions: void 0
    }
  ]
};
const formModule = { customFields: {} };
const displayModule = {
  displays: {}
};
const i18nModule = { resources: i18nTranslations0 };
const cellRendererModule = {};
const layoutModule = { layouts: [] };
const searchEntityModule = {};
const plugin = {
  widgetModule,
  routeModule,
  menuItemModule,
  formModule,
  displayModule,
  i18nModule,
  cellRendererModule,
  layoutModule,
  searchEntityModule
};
export {
  plugin as default
};
