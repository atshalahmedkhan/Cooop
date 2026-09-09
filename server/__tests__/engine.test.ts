import { describe, it, expect } from 'vitest'
import { rollDie, calcXP, getBaseXP, evaluateAnswer } from '../game/engine.js'

describe('rollDie', () => {
  it('always returns 1–6', () => {
    for (let i = 0; i < 1000; i++) {
      const r = rollDie()
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(6)
      expect(Number.isInteger(r)).toBe(true)
    }
  })
})

describe('getBaseXP', () => {
  it('returns correct values per spec', () => {
    expect(getBaseXP('QUIZ', 'easy')).toBe(40)
    expect(getBaseXP('QUIZ', 'medium')).toBe(60)
    expect(getBaseXP('QUIZ', 'hard')).toBe(80)
    expect(getBaseXP('LOGIC', 'easy')).toBe(50)
    expect(getBaseXP('LOGIC', 'medium')).toBe(80)
    expect(getBaseXP('LOGIC', 'hard')).toBe(120)
    expect(getBaseXP('OUTPUT', 'easy')).toBe(50)
    expect(getBaseXP('OUTPUT', 'medium')).toBe(80)
    expect(getBaseXP('OUTPUT', 'hard')).toBe(120)
  })
})

describe('calcXP — attempt penalty', () => {
  it('1.0x on first attempt (no prior wrongs)', () => {
    const xp = calcXP('QUIZ', 'easy', 0, 0)
    expect(xp).toBe(40) // 40 * 1.0 * (1 + 0%) = 40
  })

  it('0.9x after 1 wrong', () => {
    const xp = calcXP('QUIZ', 'easy', 1, 0)
    expect(xp).toBe(36) // 40 * 0.9 = 36
  })

  it('0.8x after 2 wrong', () => {
    const xp = calcXP('QUIZ', 'easy', 2, 0)
    expect(xp).toBe(32) // 40 * 0.8 = 32
  })

  it('0.7x after 3+ wrong', () => {
    const xp = calcXP('QUIZ', 'easy', 3, 0)
    expect(xp).toBe(28) // 40 * 0.7 = 28
    const xp5 = calcXP('QUIZ', 'easy', 5, 0)
    expect(xp5).toBe(28) // same floor
  })
})

describe('calcXP — streak bonus', () => {
  it('no bonus at streak 1', () => {
    expect(calcXP('QUIZ', 'easy', 0, 1)).toBe(40)
  })

  it('5% bonus at streak 2', () => {
    expect(calcXP('QUIZ', 'easy', 0, 2)).toBe(42) // 40 * 1.05 = 42
  })

  it('10% bonus at streak 3', () => {
    expect(calcXP('QUIZ', 'easy', 0, 3)).toBe(44) // 40 * 1.10 = 44
  })

  it('15% bonus at streak 5', () => {
    expect(calcXP('QUIZ', 'easy', 0, 5)).toBe(46) // 40 * 1.15 = 46
  })

  it('20% bonus at streak 7+', () => {
    expect(calcXP('QUIZ', 'easy', 0, 7)).toBe(48) // 40 * 1.20 = 48
  })
})

describe('evaluateAnswer', () => {
  it('QUIZ correct choice', () => {
    const data = { type: 'QUIZ', choices: { A: 'foo', B: 'bar' }, correct_choice: 'B' }
    expect(evaluateAnswer(data, { choice: 'B' })).toBe(true)
    expect(evaluateAnswer(data, { choice: 'A' })).toBe(false)
  })

  it('QUIZ is case-insensitive', () => {
    const data = { type: 'QUIZ', correct_choice: 'A' }
    expect(evaluateAnswer(data, { choice: 'a' })).toBe(true)
  })

  it('LOGIC correct choice', () => {
    const data = { type: 'LOGIC', correct_choice: 'C' }
    expect(evaluateAnswer(data, { choice: 'C' })).toBe(true)
    expect(evaluateAnswer(data, { choice: 'D' })).toBe(false)
  })

  it('OUTPUT trims whitespace', () => {
    const data = { type: 'OUTPUT', expected_output: 'Hello World' }
    expect(evaluateAnswer(data, { output: 'Hello World' })).toBe(true)
    expect(evaluateAnswer(data, { output: '  Hello World  ' })).toBe(true)
    expect(evaluateAnswer(data, { output: 'hello world' })).toBe(false)
  })
})
