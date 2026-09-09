// @refresh reset
// v2 — WebSocket realtime
import { useLayoutEffect, useRef, useState } from 'react'
import { useGameApi } from './game/useGameApi'
import type { PlayerState, ActiveChallengeState, UiGameState, CodeTestResult } from './game/useGameApi'

// ── Types ──────────────────────────────────────────────────────────────────────
type TileKind = 'CODE' | 'QUIZ' | 'DEBUG' | 'LOGIC' | 'MYSTERY' | 'BATTLE' | 'BOSS'
type CornerKind = 'tl' | 'tr' | 'br' | 'bl'

interface Space {
  id: number
  kind: TileKind | 'CORNER'
  corner?: CornerKind
  fork?: boolean
}

// ── Tile visual config ────────────────────────────────────────────────────────
const TILE_CFG: Record<TileKind, { face: string; bevel: string; ink: string; icon: string; label: string }> = {
  CODE:    { face: '#3ec74e', bevel: '#1f8a2c', ink: '#0a3d12', icon: '</>', label: 'CODE'   },
  QUIZ:    { face: '#fbc23b', bevel: '#c8850e', ink: '#5a3b02', icon: '?',   label: 'QUIZ'   },
  DEBUG:   { face: '#d17233', bevel: '#8f451a', ink: '#3d1c08', icon: '🔧',  label: 'DEBUG'  },
  LOGIC:   { face: '#ffd93d', bevel: '#d69e08', ink: '#5a4302', icon: '◆',   label: 'LOGIC'  },
  MYSTERY: { face: '#a670e0', bevel: '#6d3aad', ink: '#2f0f52', icon: '★',   label: 'BONUS'  },
  BATTLE:  { face: '#e8443b', bevel: '#a51f18', ink: '#450a06', icon: '⚔',   label: 'BATTLE' },
  BOSS:    { face: '#2b2233', bevel: '#0d0812', ink: '#ffcf3f', icon: '♛',   label: 'BOWSER' },
}

const INK = '#1a1a2e'
const MAX_XP = 400

// ── Board spaces (32 total, clockwise from top-left corner) ──────────────────
const SPACES: Space[] = [
  { id: 0,  kind: 'CORNER', corner: 'tl' },
  { id: 1,  kind: 'CODE' }, { id: 2, kind: 'QUIZ' }, { id: 3, kind: 'DEBUG' },
  { id: 4,  kind: 'LOGIC', fork: true },
  { id: 5,  kind: 'MYSTERY' }, { id: 6, kind: 'CODE' }, { id: 7, kind: 'BATTLE' }, { id: 8, kind: 'QUIZ' },
  { id: 9,  kind: 'CORNER', corner: 'tr' },
  { id: 10, kind: 'CODE' }, { id: 11, kind: 'DEBUG' }, { id: 12, kind: 'LOGIC' },
  { id: 13, kind: 'MYSTERY' }, { id: 14, kind: 'QUIZ' }, { id: 15, kind: 'CODE' },
  { id: 16, kind: 'CORNER', corner: 'br' },
  { id: 17, kind: 'BOSS' }, { id: 18, kind: 'BATTLE' }, { id: 19, kind: 'CODE' },
  { id: 20, kind: 'QUIZ' }, { id: 21, kind: 'DEBUG' }, { id: 22, kind: 'LOGIC' },
  { id: 23, kind: 'MYSTERY' }, { id: 24, kind: 'CODE' },
  { id: 25, kind: 'CORNER', corner: 'bl' },
  { id: 26, kind: 'QUIZ' }, { id: 27, kind: 'CODE' }, { id: 28, kind: 'LOGIC' },
  { id: 29, kind: 'DEBUG' }, { id: 30, kind: 'MYSTERY' }, { id: 31, kind: 'BATTLE' },
]

// ── Primitive components ──────────────────────────────────────────────────────

function Coin({ size = 14 }: { size?: number }) {
  return (
    <span className="coin-spin" style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: 'radial-gradient(circle at 38% 34%, #fff6c9 0 18%, #ffd93d 40%, #e0a100 100%)',
      border: `${Math.max(1.5, size * 0.11)}px solid #8a5c00`,
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.4)', flexShrink: 0,
    }} />
  )
}

function Avatar({ player, size = 28, hop = false }: { player: PlayerState; size?: number; hop?: boolean }) {
  return (
    <div className={hop ? 'hop' : undefined} style={{
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle at 35% 30%, ${player.color} 0 55%, ${player.dark} 100%)`,
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.4), fontWeight: 900, flexShrink: 0,
      border: `${Math.max(2, size * 0.09)}px solid ${INK}`,
      boxShadow: `0 ${Math.max(1, size * 0.06)}px 0 0 ${INK}`,
      fontFamily: '"Press Start 2P", monospace', userSelect: 'none',
    }}>
      {player.abbr[0]}
    </div>
  )
}

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#fffdf5', border: `4px solid ${INK}`, borderRadius: 10,
      boxShadow: `0 5px 0 0 rgba(26,26,46,0.35)`, ...style,
    }}>{children}</div>
  )
}

function PowerUpPip({ icon, n }: { icon: string; n: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      background: '#fff8e7', border: `2px solid ${INK}`, borderRadius: 4,
      padding: '2px 5px', fontSize: 11, fontWeight: 900, color: INK,
    }}>
      {icon}<span style={{ fontSize: 10 }}>×{n}</span>
    </div>
  )
}

function Btn({
  children, onClick, variant = 'ghost', disabled = false,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'green'
  disabled?: boolean
}) {
  const styles = {
    primary: { background: '#e8443b', color: 'white' },
    green:   { background: '#3ec74e', color: 'white' },
    ghost:   { background: '#fff8e7', color: INK },
  }[variant]
  return (
    <button
      className="nes-btn pixel"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles, fontSize: 10, padding: '9px 14px', borderRadius: 4, lineHeight: 1.3,
        textShadow: variant === 'ghost' ? 'none' : '1px 1px 0 rgba(0,0,0,0.35)',
        opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// ── Board tile ────────────────────────────────────────────────────────────────

function Tile({
  space, players, w, h, currentPlayerId,
}: {
  space: Space; players: PlayerState[]; w: number; h: number; currentPlayerId: string
}) {
  const here = players.filter(p => p.space === space.id)
  const isActivePlayer = here.some(p => p.id === currentPlayerId)
  const waveDelay = { animationDelay: `${-space.id * 0.075}s` }

  if (space.kind === 'CORNER') {
    const arrows: Record<CornerKind, string> = { tl: '▶', tr: '▼', br: '◀', bl: '▲' }
    const isStart = space.corner === 'tl'
    return (
      <div className="tile-wave" style={{
        ...waveDelay, width: w, height: 88, flexShrink: 0, position: 'relative',
        background: isStart
          ? 'linear-gradient(180deg, #3ec74e 0%, #1f8a2c 100%)'
          : 'linear-gradient(180deg, #7ec8ff 0%, #4aa3ff 100%)',
        borderRight: `2px solid ${INK}`, borderBottom: `2px solid ${INK}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
      }}>
        {isStart ? (
          <>
            <div style={{ position: 'relative', width: 34, height: 30 }}>
              <div style={{ position: 'absolute', top: 0, left: -3, right: -3, height: 10, background: '#2fae3c', border: `2px solid ${INK}`, borderRadius: 3 }} />
              <div style={{ position: 'absolute', top: 9, left: 3, right: 3, bottom: 0, background: '#249a30', borderLeft: `2px solid ${INK}`, borderRight: `2px solid ${INK}` }} />
            </div>
            <span className="pixel" style={{ fontSize: 8, color: 'white', textShadow: `1px 1px 0 ${INK}` }}>START</span>
          </>
        ) : (
          <span style={{ fontSize: 22, color: 'white', textShadow: `1.5px 1.5px 0 ${INK}` }}>{arrows[space.corner!]}</span>
        )}
        {here.length > 0 && (
          <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2 }}>
            {here.map(p => <Avatar key={p.id} player={p} size={16} hop={p.id === currentPlayerId} />)}
          </div>
        )}
      </div>
    )
  }

  const cfg = TILE_CFG[space.kind as TileKind]
  const isBoss = space.kind === 'BOSS'
  const isQ = space.kind === 'QUIZ' || space.kind === 'MYSTERY'

  return (
    <div className="tile-wave" style={{
      ...waveDelay, width: w, height: 88, flexShrink: 0, position: 'relative',
      background: cfg.face,
      borderRight: `2px solid ${INK}`, borderBottom: `2px solid ${INK}`,
      boxShadow: `inset 3px 3px 0 0 rgba(255,255,255,0.35), inset -3px -4px 0 0 ${cfg.bevel}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 3px 6px',
      outline: isActivePlayer ? '3px solid #fff' : 'none', outlineOffset: -3,
    }}>
      <span style={{
        fontSize: isBoss ? 17 : 15, lineHeight: 1, zIndex: 1,
        color: isBoss ? '#ffcf3f' : cfg.ink, fontWeight: 900,
        fontFamily: space.kind === 'CODE' ? '"JetBrains Mono", monospace' : 'inherit',
        textShadow: isQ ? '1px 1px 0 rgba(255,255,255,0.5)' : 'none',
        animation: isQ ? 'q-bob 1.4s ease-in-out infinite' : 'none',
      }}>{cfg.icon}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', zIndex: 1, minHeight: 14 }}>
        {here.map(p => <Avatar key={p.id} player={p} size={15} hop={p.id === currentPlayerId} />)}
      </div>
      <span className="pixel" style={{
        fontSize: 6, color: cfg.ink, lineHeight: 1.1, zIndex: 1, textAlign: 'center',
        textShadow: '0.5px 0.5px 0 rgba(255,255,255,0.35)',
      }}>{cfg.label}</span>
      {space.fork && (
        <div className="pixel" style={{
          position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
          background: '#6d3aad', color: 'white', fontSize: 5, padding: '2px 4px',
          border: `1.5px solid ${INK}`, borderRadius: 2, whiteSpace: 'nowrap', zIndex: 10,
        }}>⑂FORK</div>
      )}
    </div>
  )
}

// ── Background scenery ────────────────────────────────────────────────────────

function BackgroundScene() {
  const clouds = [
    { top: '8%',  scale: 1.1, dur: 70, delay: 0 },
    { top: '20%', scale: 0.7, dur: 95, delay: -30 },
    { top: '4%',  scale: 0.9, dur: 82, delay: -55 },
    { top: '32%', scale: 1.3, dur: 60, delay: -18 },
  ]
  const hills = [
    { left: '6%',  w: 260, h: 150 },
    { left: '68%', w: 340, h: 190 },
    { left: '40%', w: 200, h: 110 },
  ]
  return (
    <div className="bg-scene">
      {hills.map((h, i) => <div key={i} className="hill" style={{ left: h.left, width: h.w, height: h.h }} />)}
      {clouds.map((c, i) => (
        <div key={i} className="cloud" style={{
          top: c.top, transform: `scale(${c.scale})`,
          animation: `drift ${c.dur}s linear infinite`, animationDelay: `${c.delay}s`,
        }} />
      ))}
      <div className="ground" />
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ round, maxRounds }: { round: number; maxRounds: number }) {
  return (
    <Panel style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', height: 60, width: 936, flexShrink: 0, boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div className="pixel" style={{
          width: 34, height: 34, background: '#fbc23b', border: `3px solid ${INK}`, borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#5a3b02', fontSize: 14, boxShadow: 'inset -3px -3px 0 0 #c8850e',
        }}>?</div>
        <span className="pixel" style={{ fontSize: 17, color: '#e8443b', textShadow: `2px 2px 0 ${INK}`, letterSpacing: '-0.02em' }}>
          CODE<span style={{ color: '#3ec74e' }}>POLY</span>
        </span>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="pixel" style={{ fontSize: 10, color: INK, marginBottom: 5 }}>PYTHON VILLAGE</div>
        <div style={{ fontSize: 11, color: '#5c5470', fontWeight: 800 }}>
          WORLD 1 · Round {round} / {maxRounds}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {[{ l: 'Sound', i: '🔊' }, { l: 'Help', i: '?' }, { l: 'Settings', i: '⚙' }].map(({ l, i }) => (
          <button key={l} title={l} className="nes-btn" style={{
            width: 32, height: 32, borderRadius: 5, background: '#fff8e7',
            fontSize: 14, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 3px 0 0 ${INK}`,
          }}>{i}</button>
        ))}
      </div>
    </Panel>
  )
}

// ── Player HUD ────────────────────────────────────────────────────────────────

function PlayerHUD({
  currentPlayer, otherPlayers, turnState, diceResult, onRoll,
}: {
  currentPlayer: PlayerState
  otherPlayers: PlayerState[]
  turnState: string
  diceResult: number | null
  onRoll: () => void
}) {
  const canRoll = turnState === 'awaiting_roll'
  const isRolling = turnState === 'rolling'
  const isMoving = turnState === 'moving'

  return (
    <Panel style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
      width: 936, boxSizing: 'border-box', flexShrink: 0,
    }}>
      {/* Current player section */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        paddingRight: 16, borderRight: '3px dashed #d9cfef', flexShrink: 0,
      }}>
        <div style={{ position: 'relative' }}>
          <Avatar player={currentPlayer} size={40} hop={canRoll} />
          <div className="pixel" style={{
            position: 'absolute', bottom: -6, right: -8,
            background: '#e8443b', color: 'white', fontSize: 6,
            padding: '3px 3px', border: `2px solid ${INK}`, borderRadius: 3, lineHeight: 1,
          }}>P{currentPlayer.seatNumber}</div>
        </div>
        <div>
          <div className="pixel" style={{ fontSize: 10, color: INK, marginBottom: 6 }}>{currentPlayer.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Coin size={13} />
            <div style={{ width: 74, height: 8, background: '#ece3fb', border: `2px solid ${INK}`, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.min(100, (currentPlayer.xp / MAX_XP) * 100)}%`,
                height: '100%',
                background: 'repeating-linear-gradient(90deg,#ffd93d 0 6px,#f0c400 6px 8px)',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ fontSize: 11, color: '#5c5470', fontWeight: 800, whiteSpace: 'nowrap' }}>
              {currentPlayer.xp} XP
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, marginLeft: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} style={{
              fontSize: 16,
              color: i < currentPlayer.hearts ? '#e8443b' : '#d9cfef',
              textShadow: i < currentPlayer.hearts ? `1px 1px 0 ${INK}` : 'none',
            }}>♥</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5, marginLeft: 4 }}>
          {currentPlayer.powerUps.hint > 0 && <PowerUpPip icon="🍄" n={currentPlayer.powerUps.hint} />}
          {currentPlayer.powerUps.shield > 0 && <PowerUpPip icon="🛡️" n={currentPlayer.powerUps.shield} />}
          {currentPlayer.powerUps.doubleDice > 0 && <PowerUpPip icon="🎲" n={currentPlayer.powerUps.doubleDice} />}
        </div>
      </div>

      {/* Other players */}
      <div style={{ display: 'flex', gap: 18, flex: 1, justifyContent: 'center' }}>
        {otherPlayers.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Avatar player={p} size={30} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: INK, marginBottom: 3 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Coin size={11} />
                <span style={{ fontSize: 11, color: '#5c5470', fontWeight: 800 }}>{p.xp}</span>
                <span style={{ color: '#d9cfef' }}>·</span>
                <div style={{ display: 'flex', gap: 1 }}>
                  {Array.from({ length: 3 }).map((_, i) => (
                    <span key={i} style={{ fontSize: 11, color: i < p.hearts ? '#f08a84' : '#e4dcf4' }}>♥</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Roll / state section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, paddingLeft: 16, borderLeft: '3px dashed #d9cfef', flexShrink: 0 }}>
        {canRoll && (
          <>
            <span className="pixel" style={{ fontSize: 7, color: '#e8443b' }}>YOUR TURN</span>
            <button
              className="nes-btn pixel"
              onClick={onRoll}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 4, background: '#e8443b', color: 'white',
                fontSize: 10, textShadow: '1px 1px 0 rgba(0,0,0,0.35)',
              }}
            >🎲 ROLL</button>
            <span style={{ fontSize: 10, color: '#8a7fb0', fontWeight: 700 }}>{currentPlayer.name}'s turn</span>
          </>
        )}
        {isRolling && (
          <>
            <span className="pixel" style={{ fontSize: 7, color: '#fbc23b' }}>ROLLING...</span>
            <span className="dice-bounce" style={{ fontSize: 28 }}>🎲</span>
          </>
        )}
        {isMoving && diceResult !== null && (
          <>
            <span className="pixel" style={{ fontSize: 7, color: '#3ec74e' }}>ROLLED</span>
            <span className="pixel dice-pop" style={{ fontSize: 28, color: '#fbc23b', textShadow: `2px 2px 0 ${INK}` }}>
              {diceResult}
            </span>
            <span style={{ fontSize: 10, color: '#8a7fb0', fontWeight: 700 }}>Moving...</span>
          </>
        )}
        {(turnState === 'challenge' || turnState === 'mystery' || turnState === 'turn_complete') && diceResult !== null && (
          <>
            <span className="pixel" style={{ fontSize: 7, color: '#5c5470' }}>ROLLED</span>
            <span className="pixel" style={{ fontSize: 24, color: '#fbc23b', textShadow: `2px 2px 0 ${INK}` }}>
              {diceResult}
            </span>
          </>
        )}
        {currentPlayer.streak >= 2 && (
          <div style={{
            background: '#ffd93d', border: `2px solid ${INK}`, borderRadius: 4,
            padding: '2px 6px', fontSize: 10, fontWeight: 900, color: '#5a3b02',
          }}>
            🔥 ×{currentPlayer.streak}
          </div>
        )}
      </div>
    </Panel>
  )
}

// ── Timer bar ─────────────────────────────────────────────────────────────────

function TimerBar({ timeLeft, maxTime }: { timeLeft: number; maxTime: number }) {
  const pct = (timeLeft / maxTime) * 100
  const col = pct > 50 ? '#3ec74e' : pct > 25 ? '#fbc23b' : '#e8443b'
  return (
    <div style={{ height: 6, background: '#ece3fb', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{
        width: `${pct}%`, height: '100%', background: col, borderRadius: 3,
        transition: 'width 1s linear, background 0.5s',
      }} />
    </div>
  )
}

// ── Quiz content ──────────────────────────────────────────────────────────────

function QuizContent({
  choices, selected, onSelect,
}: {
  choices: Record<string, string> | null
  selected: string | null
  onSelect: (l: 'A' | 'B' | 'C' | 'D') => void
}) {
  if (!choices) return null
  const entries = (['A', 'B', 'C', 'D'] as const).filter(k => k in choices)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1, alignContent: 'start' }}>
      {entries.map(label => (
        <button key={label} onClick={() => onSelect(label)} style={{
          background: selected === label ? '#e8443b' : '#fff8e7',
          color: selected === label ? 'white' : INK,
          border: `3px solid ${INK}`, borderRadius: 6, padding: '10px 12px',
          textAlign: 'left', cursor: 'pointer', fontFamily: '"Nunito", sans-serif',
          fontSize: 12, fontWeight: 700,
          boxShadow: `0 3px 0 0 ${INK}`, transition: 'all 0.08s',
        }}>
          <span className="pixel" style={{ fontSize: 7, marginRight: 8, color: selected === label ? '#ffcf3f' : '#a51f18' }}>
            {label}
          </span>
          {choices[label]}
        </button>
      ))}
    </div>
  )
}

// ── Editable code editor ──────────────────────────────────────────────────────

function EditableCodeArea({ value, onChange, readOnly = false }: {
  value: string; onChange?: (v: string) => void; readOnly?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = ref.current!
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = value.substring(0, start) + '    ' + value.substring(end)
      onChange?.(next)
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 4 }, 0)
    }
  }

  return (
    <div style={{
      flex: 1, background: '#140f26', borderRadius: 4, overflow: 'hidden',
      border: `3px solid ${INK}`, boxShadow: 'inset 0 0 0 2px #2a2145', minHeight: 80,
    }}>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        spellCheck={false}
        style={{
          width: '100%', height: '100%', minHeight: 80, background: 'transparent',
          border: 'none', outline: 'none', resize: 'none', color: '#c3f0ff',
          padding: '10px 16px', boxSizing: 'border-box',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 13, lineHeight: '22px', caretColor: '#ffe66d',
        }}
      />
    </div>
  )
}

// ── Output prediction content ─────────────────────────────────────────────────

function OutputContent({ codeToRead, answer, onAnswerChange }: {
  codeToRead: string; answer: string; onAnswerChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
      <div style={{
        background: '#140f26', borderRadius: 4, padding: '10px 14px',
        border: `3px solid ${INK}`, fontFamily: '"JetBrains Mono", monospace',
        fontSize: 12, color: '#c3f0ff', lineHeight: 1.8, whiteSpace: 'pre',
        overflowX: 'auto',
      }}>
        {codeToRead}
      </div>
      <div>
        <label className="pixel" style={{ fontSize: 7, color: INK, display: 'block', marginBottom: 5 }}>
          YOUR ANSWER:
        </label>
        <textarea
          value={answer}
          onChange={e => onAnswerChange(e.target.value)}
          placeholder="Type what Python would print..."
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            background: '#fffdf5', border: `3px solid ${INK}`, borderRadius: 4,
            padding: '8px 12px', fontFamily: '"JetBrains Mono", monospace',
            fontSize: 12, color: INK, outline: 'none',
          }}
        />
        <div style={{ fontSize: 10, color: '#8a7fb0', marginTop: 2, fontWeight: 700 }}>
          Type each printed line on a new line
        </div>
      </div>
    </div>
  )
}

// ── Hint display ──────────────────────────────────────────────────────────────

function HintDisplay({ hint }: { hint: string }) {
  return (
    <div style={{
      background: '#fff8e7', border: `2px solid #fbc23b`, borderRadius: 6,
      padding: '8px 12px', fontSize: 12, color: '#5a3b02', fontWeight: 700, marginTop: 6,
    }}>
      <span className="pixel" style={{ fontSize: 7, color: '#c8850e', marginRight: 6 }}>HINT:</span>
      {hint}
    </div>
  )
}

// ── Code test results ─────────────────────────────────────────────────────────

function TestResultsDisplay({ results, isRunning }: { results: CodeTestResult[] | null; isRunning: boolean }) {
  if (isRunning) return (
    <div style={{ padding: '8px 12px', background: '#140f26', borderRadius: 4, border: `2px solid ${INK}`, fontSize: 11, color: '#c3f0ff', fontFamily: '"JetBrains Mono", monospace' }}>
      ⏳ Running tests...
    </div>
  )
  if (!results || results.length === 0) return null
  const passed = results.filter(r => r.passed).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: passed === results.length ? '#1f8a2c' : '#a51f18' }}>
        Tests: {passed}/{results.length} passed
      </div>
      {results.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '4px 8px', borderRadius: 4,
          background: r.passed ? '#e8f9ea' : '#fdeceb',
          border: `2px solid ${r.passed ? '#1f8a2c' : '#e8443b'}`,
          fontSize: 10,
        }}>
          <span style={{ flexShrink: 0 }}>{r.passed ? '✓' : '✗'}</span>
          <div style={{ flex: 1, fontFamily: '"JetBrains Mono", monospace', minWidth: 0 }}>
            {r.error && <div style={{ color: '#a51f18', wordBreak: 'break-word' }}>{r.error.slice(0, 120)}</div>}
            {!r.error && !r.passed && !r.hidden && (
              <div style={{ color: '#5c5470' }}>
                Got: <code>{r.output || '(empty)'}</code>
                {r.expected && <> · Expected: <code>{r.expected}</code></>}
              </div>
            )}
            {r.hidden && !r.passed && <div style={{ color: '#6b5e8a' }}>Hidden test failed</div>}
            {r.hint && <div style={{ color: '#c8850e', marginTop: 2 }}>💡 {r.hint}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Active challenge panel ────────────────────────────────────────────────────

function ActiveChallengePanel({
  challenge, timeLeft, onSelectChoice, onUpdateCode, onRunCode, onSubmit, onUseHint, onGiveUp,
}: {
  challenge: ActiveChallengeState
  timeLeft: number
  onSelectChoice: (c: 'A' | 'B' | 'C' | 'D') => void
  onUpdateCode: (v: string) => void
  onRunCode: () => void
  onSubmit: () => void
  onUseHint: () => void
  onGiveUp: () => void
}) {
  const q = challenge.question
  const cfg = TILE_CFG[challenge.tileKind as TileKind] ?? TILE_CFG.QUIZ
  const baseXP = challenge.maxTime > 0 ? Math.round(challenge.maxTime / 1.2) : 50

  const diffStars = q.difficulty === 'easy' ? '★☆☆' : q.difficulty === 'medium' ? '★★☆' : '★★★'
  const diffColor = q.difficulty === 'easy' ? '#3ec74e' : q.difficulty === 'medium' ? '#fbc23b' : '#e8443b'
  const isCode = challenge.isCodeChallenge

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px 16px 10px' }}>
      <TimerBar timeLeft={timeLeft} maxTime={challenge.maxTime} />

      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span className="pixel" style={{
            background: cfg.face, color: cfg.ink, fontSize: 7, padding: '4px 7px',
            border: `2px solid ${INK}`, borderRadius: 3,
          }}>
            {cfg.icon} {challenge.tileKind}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: timeLeft <= 15 ? '#e8443b' : '#5c5470' }}>
            ⏱ {timeLeft}s
          </span>
        </div>
        <div style={{ fontSize: 11, color: INK, marginBottom: 5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {q.prompt}
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: diffColor, fontWeight: 700 }}>{diffStars}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: '#c8850e' }}>
            <Coin size={13} /> ~{baseXP} XP
          </span>
          {challenge.incorrectSubmits > 0 && (
            <span style={{ fontSize: 11, color: '#a51f18', fontWeight: 700 }}>
              ✗ {challenge.incorrectSubmits} wrong
            </span>
          )}
        </div>
      </div>

      {/* Question body */}
      {(q.type === 'QUIZ' || q.type === 'LOGIC') && q.choices && (
        <QuizContent choices={q.choices} selected={challenge.selectedChoice} onSelect={onSelectChoice} />
      )}
      {q.type === 'OUTPUT' && (
        <OutputContent codeToRead={q.prompt} answer={challenge.userInput} onAnswerChange={onUpdateCode} />
      )}
      {isCode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 10, color: '#5c5470', fontWeight: 700 }}>
            {q.type === 'DEBUG' ? '🔧 Fix the bug in the code below:' : '</> Write your solution:'}
          </div>
          <EditableCodeArea value={challenge.userInput} onChange={onUpdateCode} />
          <TestResultsDisplay results={challenge.codeRunResults} isRunning={challenge.isRunning} />
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn variant="ghost" onClick={onGiveUp}>Give Up</Btn>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isCode && (
            <button
              onClick={onRunCode}
              disabled={challenge.isRunning}
              className="nes-btn"
              style={{
                padding: '8px 12px', borderRadius: 4,
                background: challenge.isRunning ? '#d9cfef' : '#4aa3ff',
                color: 'white', fontSize: 10, fontWeight: 800,
                boxShadow: `0 3px 0 0 ${INK}`,
                opacity: challenge.isRunning ? 0.7 : 1,
                cursor: challenge.isRunning ? 'not-allowed' : 'pointer',
              }}
            >
              {challenge.isRunning ? '⏳ Running...' : '▷ RUN'}
            </button>
          )}
          <Btn
            variant="green"
            onClick={onSubmit}
            disabled={(q.type === 'QUIZ' || q.type === 'LOGIC') && !challenge.selectedChoice}
          >
            SUBMIT ▶
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── Correct state ─────────────────────────────────────────────────────────────

function CorrectState({ xp, onContinue }: { xp: number; onContinue: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, textAlign: 'center' }}>
      <div className="hop" style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => <Coin key={i} size={34} />)}
      </div>
      <div className="pixel" style={{ fontSize: 22, color: '#1f8a2c', textShadow: `2px 2px 0 ${INK}` }}>
        LEVEL CLEAR!
      </div>
      <div style={{ fontSize: 14, color: '#5c5470', fontWeight: 800 }}>All tests passed!</div>
      <div className="pixel" style={{
        padding: '14px 30px', background: '#ffd93d', border: `3px solid ${INK}`, borderRadius: 6,
        fontSize: 18, color: '#5a4302', boxShadow: `0 5px 0 0 ${INK}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Coin size={22} /> +{xp} XP
      </div>
      <Btn variant="green" onClick={onContinue}>CONTINUE ▶</Btn>
    </div>
  )
}

// ── Incorrect state ───────────────────────────────────────────────────────────

function IncorrectState({
  challenge, onRetry, onContinue,
}: {
  challenge: ActiveChallengeState; onRetry: () => void; onContinue: () => void
}) {
  const q = challenge.question
  const isAbandoned = challenge.abandoned

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 20px 16px', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 32 }}>{isAbandoned ? '⏰' : '💥'}</span>
        <div>
          <div className="pixel" style={{ fontSize: 13, color: '#a51f18', marginBottom: 5 }}>
            {isAbandoned ? 'TIME\'S UP!' : 'OOF! TRY AGAIN'}
          </div>
          <div style={{ fontSize: 12, color: '#5c5470', fontWeight: 700 }}>
            {isAbandoned ? 'Challenge failed — lost a heart.' : `Wrong answer (attempt ${challenge.incorrectSubmits})`}
          </div>
        </div>
      </div>

      {q.explanation && (
        <div style={{ background: '#fdeceb', border: `3px solid ${INK}`, borderRadius: 6, padding: '10px 14px' }}>
          <div className="pixel" style={{ fontSize: 7, color: '#a51f18', marginBottom: 5 }}>EXPLANATION</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{q.explanation}</div>
        </div>
      )}

      <div style={{
        background: '#fff8e7', border: `2px solid #fbc23b`, borderRadius: 6, padding: '10px 14px',
        fontSize: 12, color: '#5a3b02', fontWeight: 700,
      }}>
        <span className="pixel" style={{ fontSize: 7, color: '#c8850e', display: 'block', marginBottom: 4 }}>EXPLANATION</span>
        {q.explanation}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
        {!isAbandoned && <Btn variant="primary" onClick={onRetry}>RETRY ↺</Btn>}
        <Btn variant={isAbandoned ? 'green' : 'ghost'} onClick={onContinue}>
          {isAbandoned ? 'NEXT PLAYER ▶' : 'SKIP (lose ♥)'}
        </Btn>
      </div>
    </div>
  )
}

// ── Battle panel ──────────────────────────────────────────────────────────────

function BattlePanel({ onContinue }: { onContinue: () => void }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 14, textAlign: 'center', padding: 20,
    }}>
      <div style={{ fontSize: 44 }}>⚔</div>
      <div className="pixel" style={{ fontSize: 14, color: '#e8443b', textShadow: `2px 2px 0 ${INK}` }}>
        BATTLE TIME!
      </div>
      <div style={{ fontSize: 12, color: '#5c5470', fontWeight: 700, maxWidth: 280 }}>
        All players are competing simultaneously. The fastest correct answer wins the most XP!
      </div>
      <Btn variant="primary" onClick={onContinue}>VIEW RESULTS ▶</Btn>
    </div>
  )
}

// ── Mystery event panel ───────────────────────────────────────────────────────

function MysteryEventPanel({
  outcome, onReveal, onContinue,
}: {
  outcome: import('./api/types').MysteryOutcome | null
  onReveal: () => void
  onContinue: () => void
}) {
  if (!outcome) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 14, textAlign: 'center', padding: 20,
      }}>
        <div style={{ fontSize: 52 }}>★</div>
        <div className="pixel" style={{ fontSize: 15, color: '#a670e0', textShadow: `2px 2px 0 ${INK}` }}>
          MYSTERY TILE!
        </div>
        <div style={{ fontSize: 13, color: '#5c5470', fontWeight: 700 }}>Tap to reveal your fate...</div>
        <Btn variant="primary" onClick={onReveal}>REVEAL ★</Btn>
      </div>
    )
  }

  const icon = outcome.category === 'positive' ? '🎁' : outcome.category === 'negative' ? '💀' : '🎱'
  const title = outcome.category === 'positive' ? 'LUCKY!' : outcome.category === 'negative' ? 'BAD LUCK!' : 'NEUTRAL'
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', gap: 14, textAlign: 'center', padding: 20,
    }}>
      <div style={{ fontSize: 52 }}>{icon}</div>
      <div className="pixel" style={{ fontSize: 15, color: '#a670e0', textShadow: `2px 2px 0 ${INK}` }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: '#5c5470', fontWeight: 700, maxWidth: 280 }}>
        {outcome.description}
      </div>
      {outcome.xp_delta > 0 && (
        <div className="pixel" style={{
          padding: '12px 24px', background: '#ffd93d', border: `3px solid ${INK}`,
          borderRadius: 6, fontSize: 16, color: '#5a4302',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: `0 4px 0 0 ${INK}`,
        }}>
          <Coin size={20} /> +{outcome.xp_delta} XP!
        </div>
      )}
      {outcome.xp_delta < 0 && (
        <div className="pixel" style={{
          padding: '10px 20px', background: '#fdeceb', border: `3px solid ${INK}`,
          borderRadius: 6, fontSize: 14, color: '#a51f18',
        }}>
          {outcome.xp_delta} XP
        </div>
      )}
      {outcome.power_up_granted && (
        <div style={{
          padding: '8px 18px', background: '#fff8e7', border: `2px solid ${INK}`,
          borderRadius: 6, fontSize: 12, fontWeight: 800, color: INK,
        }}>
          🎁 {outcome.power_up_granted} power-up added to inventory!
        </div>
      )}
      {outcome.spaces_delta > 0 && (
        <div style={{ fontSize: 12, fontWeight: 800, color: '#3ec74e' }}>
          Moving forward {outcome.spaces_delta} spaces!
        </div>
      )}
      {outcome.spaces_delta < 0 && (
        <div style={{ fontSize: 12, fontWeight: 800, color: '#e8443b' }}>
          Moving back {Math.abs(outcome.spaces_delta)} spaces!
        </div>
      )}
      <Btn variant="green" onClick={onContinue}>CONTINUE ▶</Btn>
    </div>
  )
}

// ── Lobby: home ──────────────────────────────────────────────────────────────

function HomeScreen({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 18, textAlign: 'center' }}>
      <div style={{ display: 'flex', gap: 8 }}>{[0,1,2].map(i => <Coin key={i} size={30} />)}</div>
      <div>
        <div className="pixel" style={{ fontSize: 20, color: '#e8443b', textShadow: `3px 3px 0 ${INK}`, marginBottom: 8 }}>WELCOME TO</div>
        <div className="pixel" style={{ fontSize: 22, textShadow: `3px 3px 0 ${INK}` }}>
          <span style={{ color: '#e8443b' }}>CODE</span><span style={{ color: '#3ec74e' }}>POLY</span>
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#5c5470', fontWeight: 700, maxWidth: 300 }}>
        The Python education board game!<br />Roll, move, solve challenges, earn XP.
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="primary" onClick={onCreate}>▶ CREATE GAME</Btn>
        <Btn variant="ghost" onClick={onJoin}>JOIN GAME</Btn>
      </div>
      <div style={{ fontSize: 11, color: '#8a7fb0', fontWeight: 700 }}>1–4 players · 4 rounds · Python challenges</div>
    </div>
  )
}

// ── Lobby: create game screen ─────────────────────────────────────────────────

function CreateGameScreen({ onSubmit, onBack, isLoading, error }: {
  onSubmit: (name: string) => void
  onBack: () => void
  isLoading: boolean
  error: string | null
}) {
  const [name, setName] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 24 }}>
      <div className="pixel" style={{ fontSize: 14, color: '#e8443b', textShadow: `2px 2px 0 ${INK}` }}>CREATE GAME</div>
      <div style={{ width: '100%', maxWidth: 260 }}>
        <label className="pixel" style={{ fontSize: 7, color: INK, display: 'block', marginBottom: 6 }}>YOUR NAME</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSubmit(name.trim())}
          placeholder="Enter display name..."
          maxLength={20}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px',
            background: '#fffdf5', border: `3px solid ${INK}`, borderRadius: 6,
            fontFamily: '"Nunito", sans-serif', fontSize: 14, fontWeight: 700, color: INK, outline: 'none',
          }}
        />
      </div>
      {error && (
        <div style={{ background: '#fdeceb', border: `2px solid #e8443b`, borderRadius: 6, padding: '8px 14px', fontSize: 12, color: '#a51f18', fontWeight: 700, maxWidth: 260, textAlign: 'center' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="ghost" onClick={onBack}>← BACK</Btn>
        <Btn variant="green" onClick={() => name.trim() && onSubmit(name.trim())} disabled={!name.trim() || isLoading}>
          {isLoading ? 'CREATING...' : 'CREATE ▶'}
        </Btn>
      </div>
    </div>
  )
}

// ── Lobby: join game screen ───────────────────────────────────────────────────

function JoinGameScreen({ onSubmit, onBack, isLoading, error }: {
  onSubmit: (code: string, name: string) => void
  onBack: () => void
  isLoading: boolean
  error: string | null
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const handleCode = (v: string) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
  const canSubmit = code.length === 6 && name.trim().length > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14, padding: 24 }}>
      <div className="pixel" style={{ fontSize: 14, color: '#4aa3ff', textShadow: `2px 2px 0 ${INK}` }}>JOIN GAME</div>
      <div style={{ width: '100%', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="pixel" style={{ fontSize: 7, color: INK, display: 'block', marginBottom: 6 }}>GAME CODE</label>
          <input
            value={code}
            onChange={e => handleCode(e.target.value)}
            placeholder="AB7K2P"
            maxLength={6}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              background: '#fffdf5', border: `3px solid ${INK}`, borderRadius: 6,
              fontFamily: '"Press Start 2P", monospace', fontSize: 13, fontWeight: 700,
              color: '#3ec74e', outline: 'none', letterSpacing: '0.12em', textAlign: 'center',
            }}
          />
        </div>
        <div>
          <label className="pixel" style={{ fontSize: 7, color: INK, display: 'block', marginBottom: 6 }}>YOUR NAME</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && canSubmit && onSubmit(code, name.trim())}
            placeholder="Enter display name..."
            maxLength={20}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px',
              background: '#fffdf5', border: `3px solid ${INK}`, borderRadius: 6,
              fontFamily: '"Nunito", sans-serif', fontSize: 14, fontWeight: 700, color: INK, outline: 'none',
            }}
          />
        </div>
      </div>
      {error && (
        <div style={{ background: '#fdeceb', border: `2px solid #e8443b`, borderRadius: 6, padding: '8px 14px', fontSize: 12, color: '#a51f18', fontWeight: 700, maxWidth: 260, textAlign: 'center' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <Btn variant="ghost" onClick={onBack}>← BACK</Btn>
        <Btn variant="primary" onClick={() => canSubmit && onSubmit(code, name.trim())} disabled={!canSubmit || isLoading}>
          {isLoading ? 'JOINING...' : 'JOIN ▶'}
        </Btn>
      </div>
    </div>
  )
}

// ── Lobby: waiting room ───────────────────────────────────────────────────────

const SEAT_COLORS = ['#e8443b','#3ec74e','#4aa3ff','#fbc23b']

function LobbyScreen({ game, isLoading, onToggleReady, onStart, onBack }: {
  game: UiGameState
  isLoading: boolean
  onToggleReady: (ready: boolean) => void
  onStart: () => void
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)
  const copyCode = () => {
    if (game.joinCode) navigator.clipboard.writeText(game.joinCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const myPlayer = game.players.find(p => p.id === game.playerId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '18px 20px 16px', gap: 14 }}>
      {/* Title + code */}
      <div style={{ textAlign: 'center' }}>
        <div className="pixel" style={{ fontSize: 14, color: '#e8443b', textShadow: `2px 2px 0 ${INK}`, marginBottom: 8 }}>
          <span style={{ color: '#e8443b' }}>CODE</span><span style={{ color: '#3ec74e' }}>POLY</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span className="pixel" style={{ fontSize: 7, color: '#5c5470' }}>GAME CODE</span>
          <span
            className="pixel"
            style={{ fontSize: 16, color: '#3ec74e', textShadow: `2px 2px 0 ${INK}`, letterSpacing: '0.1em', cursor: 'pointer' }}
            onClick={copyCode}
            title="Click to copy"
          >
            {game.joinCode}
          </span>
          <button onClick={copyCode} className="nes-btn" style={{
            padding: '4px 8px', borderRadius: 4, background: copied ? '#3ec74e' : '#fff8e7',
            color: copied ? 'white' : INK, fontSize: 10, fontWeight: 800, border: `2px solid ${INK}`,
          }}>
            {copied ? '✓ COPIED' : 'COPY'}
          </button>
        </div>
      </div>

      {/* Player list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="pixel" style={{ fontSize: 7, color: '#5c5470', marginBottom: 2 }}>PLAYERS ({game.players.length}/4)</div>
        {game.players.map((p, i) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', background: p.id === game.playerId ? '#f0fdf4' : '#fff8e7',
            border: `2px solid ${p.id === game.playerId ? '#3ec74e' : INK}`, borderRadius: 6,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: SEAT_COLORS[i] ?? '#aaa',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontFamily: '"Press Start 2P", monospace', fontSize: 9, fontWeight: 900,
              border: `2px solid ${INK}`,
            }}>
              {p.abbr[0]}
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: INK }}>{p.name}</span>
              {p.id === game.playerId && (
                <span style={{ marginLeft: 6, fontSize: 10, color: '#3ec74e', fontWeight: 700 }}>(you)</span>
              )}
            </div>
            {p.isHost ? (
              <span className="pixel" style={{ fontSize: 7, color: '#fbc23b', background: '#5a3b02', padding: '3px 6px', borderRadius: 3 }}>HOST</span>
            ) : p.isReady ? (
              <span className="pixel" style={{ fontSize: 7, color: 'white', background: '#1f8a2c', padding: '3px 6px', borderRadius: 3 }}>READY</span>
            ) : (
              <span className="pixel" style={{ fontSize: 7, color: '#5c5470', background: '#e4dcf4', padding: '3px 6px', borderRadius: 3 }}>WAITING</span>
            )}
          </div>
        ))}
        {Array.from({ length: Math.max(0, 4 - game.players.length) }).map((_, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            border: `2px dashed #d9cfef`, borderRadius: 6, opacity: 0.5,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e4dcf4', border: `2px solid #d9cfef` }} />
            <span style={{ fontSize: 12, color: '#8a7fb0', fontWeight: 700 }}>Waiting for player...</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} className="nes-btn" style={{
          padding: '6px 10px', borderRadius: 4, background: '#fff8e7',
          color: INK, fontSize: 10, fontWeight: 800, border: `2px solid ${INK}`,
        }}>← LEAVE</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {!game.isHost && myPlayer && (
            <Btn variant={game.myReady ? 'ghost' : 'green'} onClick={() => onToggleReady(game.myReady)}>
              {game.myReady ? 'UNREADY' : '✓ READY'}
            </Btn>
          )}
          {game.isHost && (
            <Btn variant="primary" onClick={onStart} disabled={!game.canStart || isLoading}>
              {isLoading ? 'STARTING...' : game.canStart ? '▶ START GAME' : 'WAITING...'}
            </Btn>
          )}
        </div>
      </div>

      {!game.canStart && game.isHost && game.players.length > 1 && (
        <div className="pixel" style={{ fontSize: 7, color: '#8a7fb0', textAlign: 'center' }}>
          Waiting for all players to ready up
        </div>
      )}
    </div>
  )
}

// ── Awaiting roll panel ───────────────────────────────────────────────────────

function AwaitingRollPanel({ player }: { player: PlayerState }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 14,
    }}>
      <Avatar player={player} size={48} hop />
      <div className="pixel" style={{ fontSize: 13, color: INK, textAlign: 'center' }}>
        {player.name}'s Turn!
      </div>
      <div style={{ fontSize: 13, color: '#5c5470', fontWeight: 700, textAlign: 'center' }}>
        Press <strong>ROLL</strong> to throw the dice
      </div>
      {player.streak >= 2 && (
        <div style={{
          background: '#ffd93d', border: `3px solid ${INK}`, borderRadius: 6,
          padding: '8px 16px', fontSize: 12, fontWeight: 900, color: '#5a4302',
        }}>
          🔥 {player.streak} correct streak! Bonus XP active.
        </div>
      )}
    </div>
  )
}

// ── Rolling dice panel ────────────────────────────────────────────────────────

function RollingPanel() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 16,
    }}>
      <span className="dice-bounce" style={{ fontSize: 64 }}>🎲</span>
      <div className="pixel" style={{ fontSize: 12, color: INK }}>Rolling the dice...</div>
    </div>
  )
}

// ── Moving panel ──────────────────────────────────────────────────────────────

function MovingPanel({ diceResult, player }: { diceResult: number; player: PlayerState }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 14,
    }}>
      <div className="pixel dice-pop" style={{
        fontSize: 52, color: '#fbc23b', textShadow: `3px 3px 0 ${INK}`,
      }}>
        {diceResult}
      </div>
      <div className="pixel" style={{ fontSize: 11, color: INK }}>Moving {player.name}...</div>
      <Avatar player={player} size={40} hop />
    </div>
  )
}

// ── Turn complete panel ───────────────────────────────────────────────────────

function TurnCompletePanel({
  summary, nextPlayer, onContinue,
}: {
  summary: { xp: number; message: string }
  nextPlayer: PlayerState
  onContinue: () => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 16, textAlign: 'center',
    }}>
      <div className="pixel" style={{ fontSize: 14, color: '#1f8a2c' }}>TURN COMPLETE!</div>
      {summary.xp > 0 && (
        <div className="pixel" style={{
          padding: '12px 28px', background: '#ffd93d', border: `3px solid ${INK}`,
          borderRadius: 6, fontSize: 18, color: '#5a4302',
          display: 'flex', alignItems: 'center', gap: 10, boxShadow: `0 4px 0 0 ${INK}`,
        }}>
          <Coin size={20} /> +{summary.xp} XP
        </div>
      )}
      <div style={{ fontSize: 13, color: '#5c5470', fontWeight: 700 }}>{summary.message}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8a7fb0', fontWeight: 700 }}>
        Next up: <Avatar player={nextPlayer} size={24} /> {nextPlayer.name}
      </div>
      <Btn variant="green" onClick={onContinue}>NEXT PLAYER ▶</Btn>
    </div>
  )
}

// ── Winner screen ─────────────────────────────────────────────────────────────

function WinnerScreen({ players, winner, onReset }: {
  players: PlayerState[]; winner: PlayerState; onReset: () => void
}) {
  const sorted = [...players].sort((a, b) => b.xp - a.xp)
  const medals = ['🥇', '🥈', '🥉', '4️⃣']
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 12, textAlign: 'center', padding: '16px',
    }}>
      <div className="hop" style={{ display: 'flex', gap: 6 }}>
        {[0, 1, 2].map(i => <Coin key={i} size={28} />)}
      </div>
      <div className="pixel" style={{ fontSize: 18, color: '#e8443b', textShadow: `2px 2px 0 ${INK}` }}>
        GAME OVER!
      </div>
      <div className="pixel" style={{ fontSize: 13, color: '#fbc23b', textShadow: `2px 2px 0 ${INK}` }}>
        🏆 {winner.name} WINS!
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {sorted.map((p, i) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 14px',
            background: i === 0 ? '#ffd93d' : '#fff8e7',
            border: `2px solid ${INK}`, borderRadius: 6,
          }}>
            <span style={{ fontSize: 16, width: 24 }}>{medals[i]}</span>
            <Avatar player={p} size={24} />
            <span style={{ fontWeight: 800, fontSize: 13, flex: 1, textAlign: 'left' }}>{p.name}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 800 }}>
              <Coin size={13} /> {p.xp} XP
            </span>
          </div>
        ))}
      </div>
      <Btn variant="primary" onClick={onReset}>PLAY AGAIN ▶</Btn>
    </div>
  )
}

// ── Center panel router ───────────────────────────────────────────────────────

function CenterPanel({
  game, timeLeft, isLoading,
  onCreateScreen, onJoinScreen, onBack,
  onCreateLobby, onJoinLobby, onToggleReady, onStartMatch,
  onSelectChoice, onUpdateCode, onRunCode, onSubmit, onUseHint, onGiveUp, onRetry, onContinue, onReset, onSelectPath, onRevealMystery,
}: {
  game: UiGameState
  timeLeft: number
  isLoading: boolean
  onCreateScreen: () => void
  onJoinScreen: () => void
  onBack: () => void
  onCreateLobby: (name: string) => void
  onJoinLobby: (code: string, name: string) => void
  onToggleReady: (ready: boolean) => void
  onStartMatch: () => void
  onSelectChoice: (c: 'A' | 'B' | 'C' | 'D') => void
  onUpdateCode: (v: string) => void
  onRunCode: () => void
  onSubmit: () => void
  onUseHint: () => void
  onGiveUp: () => void
  onRetry: () => void
  onContinue: () => void
  onReset: () => void
  onSelectPath: (destNodeKey: number) => void
  onRevealMystery: () => void
}) {
  const currentPlayer = game.players[game.currentPlayerIdx]
  const nextPlayerIdx = game.players.length > 0 ? (game.currentPlayerIdx + 1) % game.players.length : 0
  const nextPlayer = game.players[nextPlayerIdx]

  // Lobby screens
  if (game.phase === 'lobby') {
    if (game.lobbyScreen === 'home') return <HomeScreen onCreate={onCreateScreen} onJoin={onJoinScreen} />
    if (game.lobbyScreen === 'creating') return <CreateGameScreen onSubmit={onCreateLobby} onBack={onBack} isLoading={isLoading} error={game.error} />
    if (game.lobbyScreen === 'joining') return <JoinGameScreen onSubmit={onJoinLobby} onBack={onBack} isLoading={isLoading} error={game.error} />
    if (game.lobbyScreen === 'lobby') return <LobbyScreen game={game} isLoading={isLoading} onToggleReady={onToggleReady} onStart={onStartMatch} onBack={onBack} />
    return <HomeScreen onCreate={onCreateScreen} onJoin={onJoinScreen} />
  }

  // Game complete
  if (game.phase === 'complete' && game.winner) {
    return <WinnerScreen players={game.players} winner={game.winner} onReset={onReset} />
  }

  // Playing states
  if (game.turnState === 'awaiting_roll') return <AwaitingRollPanel player={currentPlayer} />
  if (game.turnState === 'rolling') return <RollingPanel />
  if (game.turnState === 'moving' && game.diceResult !== null) {
    return <MovingPanel diceResult={game.diceResult} player={currentPlayer} />
  }
  if (game.turnState === 'awaiting_path') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, textAlign: 'center', padding: 20 }}>
        <div className="pixel" style={{ fontSize: 13, color: '#fbc23b', textShadow: `2px 2px 0 ${INK}` }}>FORK IN THE ROAD!</div>
        <div style={{ fontSize: 12, color: '#5c5470', fontWeight: 700 }}>Choose your path:</div>
        {game.reachablePaths.map(path => (
          <button key={path.path_id} onClick={() => onSelectPath(path.destination_node_id)} className="nes-btn" style={{
            padding: '12px 28px', background: '#ffd93d', border: `3px solid ${INK}`, borderRadius: 6,
            fontSize: 13, fontWeight: 900, color: '#5a4302', cursor: 'pointer',
            boxShadow: `0 4px 0 0 ${INK}`, fontFamily: '"Nunito", sans-serif',
          }}>
            {path.label} (Space {path.destination_node_id})
          </button>
        ))}
      </div>
    )
  }
  if (game.turnState === 'mystery') {
    return <MysteryEventPanel outcome={game.mysteryOutcome} onReveal={onRevealMystery} onContinue={onContinue} />
  }
  if (game.turnState === 'battle') {
    return <BattlePanel onContinue={onContinue} />
  }
  if (game.turnState === 'turn_complete' && game.turnSummary) {
    return <TurnCompletePanel summary={game.turnSummary} nextPlayer={nextPlayer} onContinue={onContinue} />
  }
  if (game.turnState === 'challenge' && game.activeChallenge) {
    const ch = game.activeChallenge
    if (ch.result === 'correct') {
      return <CorrectState xp={ch.xpAwarded} onContinue={onContinue} />
    }
    if (ch.result === 'incorrect') {
      return <IncorrectState challenge={ch} onRetry={onRetry} onContinue={onGiveUp} />
    }
    return (
      <ActiveChallengePanel
        challenge={ch}
        timeLeft={timeLeft}
        onSelectChoice={onSelectChoice}
        onUpdateCode={onUpdateCode}
        onRunCode={onRunCode}
        onSubmit={onSubmit}
        onUseHint={onUseHint}
        onGiveUp={onGiveUp}
      />
    )
  }

  return <AwaitingRollPanel player={currentPlayer} />
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const game = useGameApi()
  const {
    state, timeLeft, isLoading,
    goHome, goToCreateScreen, goToJoinScreen,
    createLobby, joinLobby, toggleReady, startMatch,
    roll, selectPath, selectChoice, updateCode, submitAnswer,
    runCode, resolveMystery,
    useHint, retry, giveUp, continueGame, resetGame,
  } = game

  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const fit = () => {
      const el = stageRef.current
      if (!el) return
      const pad = 28
      const s = Math.min(
        (window.innerWidth - pad) / el.offsetWidth,
        (window.innerHeight - pad) / el.offsetHeight,
        1.35,
      )
      setScale(s)
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const topRow    = SPACES.slice(0, 10)
  const rightCol  = SPACES.slice(10, 16)
  const bottomRow = [...SPACES.slice(16, 26)].reverse()
  const leftCol   = [...SPACES.slice(26, 32)].reverse()

  const FALLBACK_PLAYER: PlayerState = { id: '', name: 'Player', color: '#e8443b', dark: '#a51f18', abbr: 'P1', space: 0, xp: 0, hearts: 3, streak: 0, powerUps: { hint: 0, shield: 0, doubleDice: 0, skip: 0 }, seenQuestionIds: [], isHost: false, isReady: false, seatNumber: 1 }
  const currentPlayer = state.players[state.currentPlayerIdx] ?? FALLBACK_PLAYER
  const otherPlayers  = state.players.filter((_, i) => i !== state.currentPlayerIdx)

  const tileW = { corner: 88, side: 95 }
  const tileH = { top: 88, side: 80 }

  return (
    <div style={{
      width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Nunito", ui-sans-serif, system-ui, sans-serif',
    }}>
      <BackgroundScene />
      <div ref={stageRef} style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        transform: `scale(${scale})`, transformOrigin: 'center center',
      }}>
        <Header round={state.round} maxRounds={state.maxRounds} />

        {/* Board */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          border: `5px solid ${INK}`, borderRadius: 6, overflow: 'hidden',
          background: '#b5651d',
          boxShadow: `0 10px 0 0 rgba(26,26,46,0.35), inset 0 0 0 3px #8f4a12`,
        }}>
          {/* Top row */}
          <div style={{ display: 'flex' }}>
            {topRow.map(s => (
              <Tile
                key={s.id} space={s} players={state.players}
                w={s.kind === 'CORNER' ? tileW.corner : tileW.side}
                h={tileH.top}
                currentPlayerId={currentPlayer.id}
              />
            ))}
          </div>

          {/* Middle: left col + center + right col */}
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {leftCol.map(s => (
                <Tile key={s.id} space={s} players={state.players}
                  w={88} h={tileH.side} currentPlayerId={currentPlayer.id} />
              ))}
            </div>

            {/* Center challenge area */}
            <div style={{
              flex: 1, padding: 8,
              background: '#5c94fc',
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 22px),' +
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 22px)',
            }}>
              <div style={{
                width: '100%', height: '100%', background: '#fffdf5',
                border: `4px solid ${INK}`, borderRadius: 10, overflow: 'hidden',
                boxShadow: '0 8px 0 0 rgba(26,26,46,0.35)',
              }}>
                <CenterPanel
                  game={state}
                  timeLeft={timeLeft}
                  isLoading={isLoading}
                  onCreateScreen={goToCreateScreen}
                  onJoinScreen={goToJoinScreen}
                  onBack={goHome}
                  onCreateLobby={createLobby}
                  onJoinLobby={joinLobby}
                  onToggleReady={toggleReady}
                  onStartMatch={startMatch}
                  onSelectChoice={selectChoice}
                  onUpdateCode={updateCode}
                  onRunCode={runCode}
                  onSubmit={submitAnswer}
                  onUseHint={useHint}
                  onGiveUp={giveUp}
                  onRetry={retry}
                  onContinue={continueGame}
                  onReset={resetGame}
                  onSelectPath={selectPath}
                  onRevealMystery={resolveMystery}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rightCol.map(s => (
                <Tile key={s.id} space={s} players={state.players}
                  w={88} h={tileH.side} currentPlayerId={currentPlayer.id} />
              ))}
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ display: 'flex' }}>
            {bottomRow.map(s => (
              <Tile
                key={s.id} space={s} players={state.players}
                w={s.kind === 'CORNER' ? tileW.corner : tileW.side}
                h={tileH.top}
                currentPlayerId={currentPlayer.id}
              />
            ))}
          </div>
        </div>

        {/* HUD */}
        <PlayerHUD
          currentPlayer={currentPlayer}
          otherPlayers={otherPlayers}
          turnState={state.turnState}
          diceResult={state.diceResult}
          onRoll={roll}
        />

        {/* Reconnecting overlay */}
        {state.isReconnecting && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(26,26,46,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              background: '#1a1a2e', border: '4px solid #fbc23b',
              borderRadius: 8, padding: '24px 40px',
              fontFamily: "'Press Start 2P', monospace",
              color: '#fbc23b', fontSize: 13, letterSpacing: 1,
              boxShadow: '0 8px 0 0 rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}>
              <div style={{ marginBottom: 10 }}>⟳ RECONNECTING…</div>
              <div style={{ fontSize: 9, color: '#aaa' }}>please wait</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
