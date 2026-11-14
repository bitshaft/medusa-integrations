import { type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http"

import { validateQuery } from "../kit/api"
import { rateLimitCheck } from "./utils"
import {
  AdminCouponsQuery,
  AdminCouponStatus,
  AdminCreateBatch,
  AdminCreateCoupon,
  AdminExportQuery,
  AdminPreviewCoupon,
  AdminSettings,
  StoreCheckCoupon,
  StoreProgressQuery,
} from "./validators"

/**
 * Middleware routes of the coupons plugin. Kept here, not in
 * `src/api/middlewares.ts`, so an app that vendors several integrations can
 * merge them into its single middlewares file.
 */
export const couponsMiddlewares: MiddlewareRoute[] = [
  { matcher: "/admin/coupons", method: ["GET"], middlewares: [validateQuery(AdminCouponsQuery)] },
  { matcher: "/admin/coupons", method: ["POST"], middlewares: [validateAndTransformBody(AdminCreateCoupon)] },
  { matcher: "/admin/coupons/preview", method: ["POST"], middlewares: [validateAndTransformBody(AdminPreviewCoupon)] },
  { matcher: "/admin/coupons/batches", method: ["POST"], middlewares: [validateAndTransformBody(AdminCreateBatch)] },
  { matcher: "/admin/coupons/export", method: ["GET"], middlewares: [validateQuery(AdminExportQuery)] },
  { matcher: "/admin/coupons/settings", method: ["POST"], middlewares: [validateAndTransformBody(AdminSettings)] },
  // No middleware on POST /admin/coupons/:id: its matcher would also catch
  // /preview, /batches and /settings and overwrite their validated bodies.
  // That route validates its own body.
  {
    matcher: "/admin/coupons/:id/status",
    method: ["POST"],
    middlewares: [validateAndTransformBody(AdminCouponStatus)],
  },
  { matcher: "/admin/coupons/:id/codes", method: ["GET"], middlewares: [validateQuery(AdminExportQuery)] },
  {
    matcher: "/store/coupons/check",
    method: ["POST"],
    middlewares: [rateLimitCheck, validateAndTransformBody(StoreCheckCoupon)],
  },
  { matcher: "/store/coupons/progress", method: ["GET"], middlewares: [validateQuery(StoreProgressQuery)] },
]
