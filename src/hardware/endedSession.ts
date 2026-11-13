import { eq } from 'drizzle-orm'
import { db } from '@/src/db'
import { deviceState } from '@/src/db/schema'
import { getLastSideMutationAt } from './sideMutations'
import type { Side } from './types'

/** Matches deviceStateSync's window in which a poll may predate the last command. */
const MUTATION_FRESHNESS_MS = 5_000

interface SideTargets {
  targetLevel: number
  targetTemperature: number | null
  heatingDuration: number
}

/**
 * After the firmware's timer runs out it keeps reporting the old target while
 * the water drifts back to neutral, so clients read "Warming to 88°F" from a
 * side that is not regulating. Once deviceStateSync has confirmed the session
 * ended (device_state.is_powered = 0) and the countdown reads zero, present
 * the side as off. Firmware that reports heatTime=0 for a whole live session
 * keeps is_powered = 1 and is left alone, as is a side commanded moments ago.
 */
export function maskEndedSession<T extends SideTargets>(status: T, mirroredPowered: boolean | null, recentlyMutated: boolean): T {
  if (recentlyMutated || mirroredPowered !== false || status.targetLevel === 0 || status.heatingDuration > 0) return status
  return { ...status, targetLevel: 0, targetTemperature: null }
}

export function presentSideStatus<T extends SideTargets>(side: Side, status: T, now = Date.now()): T {
  let mirrored: boolean | null = null
  try {
    mirrored = db.select({ isPowered: deviceState.isPowered }).from(deviceState).where(eq(deviceState.side, side)).get()?.isPowered ?? null
  }
  catch { /* status reads must not fail on the mirror */ }
  return maskEndedSession(status, mirrored, now - getLastSideMutationAt(side) < MUTATION_FRESHNESS_MS)
}
