import { describe, expect, it } from 'vitest'
import { maskEndedSession } from '../endedSession'

// Regression: after the firmware's timer ran out it still reported targetLevel
// 20 (88°F) while the water fell to neutral, and the UI read that as "Warming".
describe('maskEndedSession', () => {
  const expired = { targetLevel: 20, targetTemperature: 88, heatingDuration: 0, currentLevel: -37, currentTemperature: 72 }

  it('presents a confirmed-ended session as off', () => {
    expect(maskEndedSession(expired, false, false)).toEqual({ ...expired, targetLevel: 0, targetTemperature: null })
  })

  it('keeps the firmware target while the session is live or unconfirmed', () => {
    expect(maskEndedSession(expired, true, false)).toBe(expired)
    expect(maskEndedSession(expired, null, false)).toBe(expired)
    expect(maskEndedSession({ ...expired, heatingDuration: 1200 }, false, false).targetLevel).toBe(20)
  })

  it('does not mask a side commanded moments ago or already neutral', () => {
    expect(maskEndedSession(expired, false, true)).toBe(expired)
    const neutral = { ...expired, targetLevel: 0 }
    expect(maskEndedSession(neutral, false, false)).toBe(neutral)
  })
})
