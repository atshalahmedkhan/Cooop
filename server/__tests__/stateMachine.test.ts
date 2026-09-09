import { describe, it, expect } from 'vitest'
import { assertTransition, assertAction, allowedActions } from '../game/stateMachine.js'
import { GameError } from '../types.js'

describe('allowedActions', () => {
  it('AWAITING_ROLL allows only ROLL_DICE', () => {
    expect(allowedActions('AWAITING_ROLL')).toEqual(['ROLL_DICE'])
  })

  it('AWAITING_PATH_CHOICE allows only SELECT_PATH', () => {
    expect(allowedActions('AWAITING_PATH_CHOICE')).toEqual(['SELECT_PATH'])
  })

  it('CHALLENGE_ACTIVE allows only SUBMIT_ANSWER', () => {
    expect(allowedActions('CHALLENGE_ACTIVE')).toEqual(['SUBMIT_ANSWER'])
  })

  it('TURN_COMPLETE allows COMPLETE_TURN', () => {
    expect(allowedActions('TURN_COMPLETE')).toContain('COMPLETE_TURN')
  })
})

describe('assertTransition', () => {
  it('allows valid transitions', () => {
    expect(() => assertTransition('AWAITING_ROLL', 'ROLL_RESOLVED')).not.toThrow()
    expect(() => assertTransition('ROLL_RESOLVED', 'MOVING')).not.toThrow()
    expect(() => assertTransition('CHALLENGE_ACTIVE', 'SUBMISSION_PENDING')).not.toThrow()
  })

  it('rejects invalid transitions', () => {
    expect(() => assertTransition('AWAITING_ROLL', 'CHALLENGE_ACTIVE')).toThrow(GameError)
    expect(() => assertTransition('TURN_COMPLETE', 'CHALLENGE_ACTIVE')).toThrow(GameError)
  })
})

describe('assertAction', () => {
  it('allows ROLL_DICE in AWAITING_ROLL', () => {
    expect(() => assertAction('AWAITING_ROLL', 'ROLL_DICE')).not.toThrow()
  })

  it('rejects SUBMIT_ANSWER in AWAITING_ROLL', () => {
    expect(() => assertAction('AWAITING_ROLL', 'SUBMIT_ANSWER')).toThrow(GameError)
  })

  it('rejects ROLL_DICE after already rolling', () => {
    const err = (() => {
      try { assertAction('CHALLENGE_ACTIVE', 'ROLL_DICE') } catch (e) { return e as GameError }
    })()
    expect(err).toBeInstanceOf(GameError)
    expect(err?.code).toBe('ALREADY_ROLLED')
  })
})
