import { describe, expect, it } from 'vitest'
import { availableActions, needsPassword } from '@/features/users/actions'
import { managedUser, NO_ACTIONS } from '@/test/usersFixtures'

describe('availableActions', () => {
  it('offers nothing when the server allows nothing (e.g. your own row)', () => {
    expect(availableActions(managedUser({ is_current_user: true, can: NO_ACTIONS }))).toEqual([])
  })

  it('offers resend and cancel to invited users when allowed', () => {
    expect(availableActions(managedUser({ status: 'invited' }))).toEqual(['resend', 'cancel'])
  })

  it('offers role change and disable to active users when allowed', () => {
    expect(availableActions(managedUser())).toEqual(['changeRole', 'disable'])
  })

  it('offers enable to disabled users when allowed', () => {
    expect(availableActions(managedUser({ status: 'disabled' }))).toEqual(['enable'])
  })

  it('never offers an action the status does not allow, even if the server allows it', () => {
    // can è calcolato sui ruoli: lo stato decide comunque quali azioni hanno senso
    expect(availableActions(managedUser({ status: 'active' }))).not.toContain('enable')
    expect(availableActions(managedUser({ status: 'disabled' }))).not.toContain('disable')
    expect(availableActions(managedUser({ status: 'invited' }))).not.toContain('changeRole')
  })

  it('hides each action the server does not allow', () => {
    expect(availableActions(managedUser({ can: { ...NO_ACTIONS, disable: true } }))).toEqual(['disable'])
    expect(availableActions(managedUser({ role: 'admin', can: { ...NO_ACTIONS, change_role: true, disable: false } }))).toEqual(['changeRole'])
    expect(availableActions(managedUser({ status: 'invited', can: { ...NO_ACTIONS, resend_invitation: true } }))).toEqual(['resend'])
    expect(availableActions(managedUser({ status: 'invited', can: { ...NO_ACTIONS, cancel_invitation: true } }))).toEqual(['cancel'])
    expect(availableActions(managedUser({ status: 'disabled', can: NO_ACTIONS }))).toEqual([])
  })
})

describe('needsPassword', () => {
  it('asks for the password only to disable or enable an admin', () => {
    expect(needsPassword(managedUser({ role: 'admin' }), 'disable')).toBe(true)
    expect(needsPassword(managedUser({ role: 'admin', status: 'disabled' }), 'enable')).toBe(true)
    expect(needsPassword(managedUser(), 'disable')).toBe(false)
  })
})
