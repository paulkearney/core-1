import { describe, expect, it, vi } from 'vitest'
import type { HardwareClient } from '../client'
import { CONFIRM_CLEAR_MARGIN_MS, CONFIRM_START_DELAY_MS, CONFIRM_PULSE_PERIOD_MS, confirmationPulses, pulseTapConfirmation } from '../tapConfirmation'

function setup(vibrating: boolean[] = [false, false]) {
  const calls: string[] = []
  const client = {
    connect: vi.fn(async () => {}),
    setAlarm: vi.fn(async () => {
      calls.push('start')
    }),
    clearAlarm: vi.fn(async () => {
      calls.push('clear')
    }),
  } as unknown as HardwareClient
  const checks = [...vibrating]
  const sleep = vi.fn(async (ms: number) => {
    calls.push(`sleep ${ms}`)
  })
  const deps = { client: () => client, alarmVibrating: () => checks.shift() ?? false, sleep }
  return { client, calls, deps }
}

describe('tap confirmation pulses', () => {
  it('adds one pulse per tap beyond the firmware\'s own buzz', () => {
    expect(confirmationPulses('doubleTap')).toBe(1)
    expect(confirmationPulses('tripleTap')).toBe(2)
    expect(confirmationPulses('quadTap')).toBe(3)
  })

  it('starts a double-pattern alarm and clears it after the wanted pulses', async () => {
    const s = setup()
    await pulseTapConfirmation('left', 2, s.deps)
    expect(s.client.setAlarm).toHaveBeenCalledWith('left', { vibrationIntensity: 100, vibrationPattern: 'double', duration: 10 })
    expect(s.calls).toEqual([`sleep ${CONFIRM_START_DELAY_MS}`, 'start', `sleep ${2 * CONFIRM_PULSE_PERIOD_MS + CONFIRM_CLEAR_MARGIN_MS}`, 'clear'])
    expect(s.client.clearAlarm).toHaveBeenCalledWith('left')
  })

  it('does nothing while an alarm rings (the clear would stop it)', async () => {
    const s = setup([true])
    await pulseTapConfirmation('left', 1, s.deps)
    expect(s.calls).toEqual([])
  })

  it('waits out the firmware\'s own tap buzz before starting', async () => {
    const s = setup([false, true])
    await pulseTapConfirmation('left', 1, s.deps)
    // An alarm that began during the wait is left alone.
    expect(s.calls).toEqual([`sleep ${CONFIRM_START_DELAY_MS}`])
  })

  it('leaves an alarm that started during the pulses ringing', async () => {
    const s = setup([false, false, true])
    await pulseTapConfirmation('right', 1, s.deps)
    expect(s.calls).toEqual([`sleep ${CONFIRM_START_DELAY_MS}`, 'start', `sleep ${CONFIRM_PULSE_PERIOD_MS + CONFIRM_CLEAR_MARGIN_MS}`])
  })

  it('sends nothing for zero pulses', async () => {
    const s = setup()
    await pulseTapConfirmation('left', 0, s.deps)
    expect(s.calls).toEqual([])
  })
})
