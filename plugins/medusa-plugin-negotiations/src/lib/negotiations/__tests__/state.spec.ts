import { allowedMoves, canMove, isTerminal, type Move, MOVES, transition } from "../state"
import { STATUSES, type Status } from "../types"

describe("state machine", () => {
  it("lists the allowed transitions explicitly", () => {
    const table = Object.fromEntries(STATUSES.map((s) => [s, allowedMoves(s)]))
    expect(table).toEqual({
      open: [
        "customer_message",
        "customer_target",
        "customer_withdraw",
        "team_message",
        "team_counter",
        "team_accept",
        "team_reject",
        "system_expire",
      ],
      countered: [
        "customer_message",
        "customer_target",
        "customer_accept",
        "customer_withdraw",
        "team_message",
        "team_counter",
        "team_accept",
        "team_reject",
        "system_expire",
        "system_offer_lapse",
      ],
      accepted: [],
      rejected: [],
      expired: [],
      withdrawn: [],
    })
  })

  it.each<[Status, Move, Status, string | null]>([
    ["open", "team_counter", "countered", "customer"],
    ["countered", "customer_accept", "accepted", null],
    ["countered", "customer_target", "open", "team"],
    ["countered", "customer_message", "countered", "team"],
    ["open", "team_message", "open", "customer"],
    ["countered", "system_offer_lapse", "open", "team"],
    ["open", "system_expire", "expired", null],
    ["countered", "team_reject", "rejected", null],
    ["open", "customer_withdraw", "withdrawn", null],
    ["open", "team_accept", "accepted", null],
  ])("%s --%s--> %s (turn %s)", (from, move, to, turn) => {
    expect(transition(from, move)).toEqual({ status: to, turn })
  })

  it("refuses moves that are not in the table", () => {
    expect(transition("open", "customer_accept")).toBeNull()
    expect(transition("open", "system_offer_lapse")).toBeNull()
    for (const status of ["accepted", "rejected", "expired", "withdrawn"] as Status[]) {
      expect(isTerminal(status)).toBe(true)
      for (const move of Object.keys(MOVES) as Move[]) expect(canMove(status, move)).toBe(false)
    }
  })

  it("only real moves reset the inactivity clock", () => {
    expect(MOVES.system_expire.activity).toBe(false)
    expect(MOVES.system_offer_lapse.activity).toBe(false)
    expect(MOVES.customer_message.activity).toBe(true)
    expect(MOVES.team_counter.activity).toBe(true)
  })
})
