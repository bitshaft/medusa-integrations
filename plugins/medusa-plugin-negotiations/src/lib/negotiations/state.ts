import type { Status, Turn } from "./types"

/**
 * The state machine of a thread. Every move names the statuses it may be
 * made from; anything else is refused. The database update that applies a
 * move repeats the same `from` list in its WHERE clause, so a move made
 * from a status that changed in the meantime changes nothing.
 *
 * Internal notes are not moves: they never change the status, the turn,
 * the version or the last activity.
 */
export const MOVES = {
  /** Customer writes without a new price. */
  customer_message: { from: ["open", "countered"], to: null, turn: "team", activity: true },
  /** Customer sends a new target price; a pending counter-offer is withdrawn by it. */
  customer_target: { from: ["open", "countered"], to: "open", turn: "team", activity: true },
  /** Customer accepts the team's counter-offer. */
  customer_accept: { from: ["countered"], to: "accepted", turn: null, activity: true },
  customer_withdraw: { from: ["open", "countered"], to: "withdrawn", turn: null, activity: true },
  /** Team writes without a new price. */
  team_message: { from: ["open", "countered"], to: null, turn: "customer", activity: true },
  team_counter: { from: ["open", "countered"], to: "countered", turn: "customer", activity: true },
  /** Team accepts the customer's target price, or closes the deal at its own offer. */
  team_accept: { from: ["open", "countered"], to: "accepted", turn: null, activity: true },
  team_reject: { from: ["open", "countered"], to: "rejected", turn: null, activity: true },
  /** No move for `expiryDays`. */
  system_expire: { from: ["open", "countered"], to: "expired", turn: null, activity: false },
  /** The counter-offer passed its own deadline: the price lapses, the thread goes on. */
  system_offer_lapse: { from: ["countered"], to: "open", turn: "team", activity: false },
} as const satisfies Record<string, { from: readonly Status[]; to: Status | null; turn: Turn; activity: boolean }>

export type Move = keyof typeof MOVES

export const TERMINAL_STATUSES: readonly Status[] = ["accepted", "rejected", "expired", "withdrawn"]

export function canMove(status: Status, move: Move): boolean {
  return (MOVES[move].from as readonly Status[]).includes(status)
}

/** The status and turn after a move, or `null` when the move is not allowed from `status`. */
export function transition(status: Status, move: Move): { status: Status; turn: Turn } | null {
  if (!canMove(status, move)) return null
  const rule = MOVES[move]
  return { status: rule.to ?? status, turn: rule.turn }
}

/** Every move allowed from a status. */
export function allowedMoves(status: Status): Move[] {
  return (Object.keys(MOVES) as Move[]).filter((move) => canMove(status, move))
}

export const isTerminal = (status: Status) => TERMINAL_STATUSES.includes(status)
