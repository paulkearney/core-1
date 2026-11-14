import type { HardwareClient } from './client'
import type { GestureEvent } from './dacMonitor'
import type { Side } from './types'

/**
 * Pulse a tap's confirmation on the cover: one pulse for a double tap, two
 * for a triple, three for a quad. The firmware already gives every tap one
 * short buzz of its own, so a double tap is felt as two buzzes and a triple
 * as three.
 *
 * The cover MCU has no short-pulse command reachable over the DAC socket: an
 * alarm's power is ignored and its pattern is only `double` (half a second
 * on, half off, from half a second after the start) or `rise`. So a
 * confirmation starts a `double` alarm and clears it after the pulses it
 * wants (verified live on a Pod 5 cover, docs/hardware/alarms.md).
 */

/** One `double` pattern cycle: 500 ms on, 500 ms off, starting 500 ms in. */
export const CONFIRM_PULSE_PERIOD_MS = 1000
/** Clear this far past the last pulse's cycle: after it ends, before the next starts at +500 ms. */
export const CONFIRM_CLEAR_MARGIN_MS = 150
/** The shortest alarm the firmware engages the motor for; the clear cuts it short. */
const CONFIRM_ALARM_SECONDS = 10

const PULSES: Record<GestureEvent['tapType'], number> = { doubleTap: 1, tripleTap: 2, quadTap: 3 }

export function confirmationPulses(tapType: GestureEvent['tapType']): number {
  return PULSES[tapType] ?? 0
}

export interface TapConfirmationDeps {
  client: () => HardwareClient
  /** True while an alarm vibrates on either side, or when that cannot be read. */
  alarmVibrating: () => boolean
  sleep: (ms: number) => Promise<void>
}

export async function pulseTapConfirmation(side: Side, pulses: number, deps: TapConfirmationDeps): Promise<void> {
  if (pulses < 1) return
  // The firmware's clear stops both sides' vibration, so a confirmation never
  // runs while an alarm rings: it would silence the other side's alarm.
  if (deps.alarmVibrating()) return
  const client = deps.client()
  await client.connect()
  await client.setAlarm(side, { vibrationIntensity: 100, vibrationPattern: 'double', duration: CONFIRM_ALARM_SECONDS })
  await deps.sleep(pulses * CONFIRM_PULSE_PERIOD_MS + CONFIRM_CLEAR_MARGIN_MS)
  // An alarm that started meanwhile replaced this one (same side) or would be
  // stopped with it (other side); leave it ringing.
  if (deps.alarmVibrating()) return
  await client.clearAlarm(side)
}
