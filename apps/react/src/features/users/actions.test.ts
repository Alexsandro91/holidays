import { describe, expect, it } from 'vitest'
import { availableActions, needsPassword } from '@/features/users/actions'
import { managedUser } from '@/test/usersFixtures'

describe('availableActions', () => {
  it('offers nothing on your own row', () => {
    expect(availableActions(managedUser({ is_current_user: true }))).toEqual([])
  })

  it('offers resend and cancel to invited users', () => {
    expect(availableActions(managedUser({ status: 'invited' }))).toEqual(['resend', 'cancel'])
  })

  it('offers role change and disable to active employees and managers', () => {
    expect(availableActions(managedUser())).toEqual(['changeRole', 'disable'])
    expect(availableActions(managedUser({ role: 'manager' }))).toEqual(['changeRole', 'disable'])
  })

  it('never offers a role change to admins', () => {
    expect(availableActions(managedUser({ role: 'admin' }))).toEqual(['disable'])
  })

  it('offers enable to disabled users', () => {
    expect(availableActions(managedUser({ status: 'disabled' }))).toEqual(['enable'])
  })
})

describe('needsPassword', () => {
  it('asks for the password only to disable or enable an admin', () => {
    expect(needsPassword(managedUser({ role: 'admin' }), 'disable')).toBe(true)
    expect(needsPassword(managedUser({ role: 'admin', status: 'disabled' }), 'enable')).toBe(true)
    expect(needsPassword(managedUser(), 'disable')).toBe(false)
  })
})
