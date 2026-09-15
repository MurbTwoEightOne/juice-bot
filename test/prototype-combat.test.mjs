import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePrototypeEnemyAction, resolvePrototypePlayerBatch, runPrototypeStressSimulation } from '../dist/domain/combat/prototype.js'

function state () {
  return {
    enemyHp: 15,
    enemyMaxHp: 15,
    players: [
      { id: 'fighter', name: 'Fighter', class: 'FIGHTER', currentHp: 30, maxHp: 30, dead: false },
      { id: 'support', name: 'Support', class: 'SUPPORT', currentHp: 30, maxHp: 30, dead: false },
    ],
  }
}

test('resolves player actions from the same snapshot', () => {
  const result = resolvePrototypePlayerBatch(state(), [
    { actorId: 'fighter', actionId: 'STRIKE' },
    { actorId: 'support', actionId: 'HEAL', targetId: 'fighter' },
  ])

  assert.equal(result.state.enemyHp, 5)
  assert.equal(result.state.players[0].currentHp, 30)
  assert.ok(result.events.some((event) => event.type === 'DAMAGE'))
  assert.ok(result.events.some((event) => event.type === 'HEAL'))
})

test('clamps healing and marks a player dead at zero HP', () => {
  const damaged = state()
  damaged.players[0].currentHp = 5
  const result = resolvePrototypeEnemyAction(damaged, { actorId: 'enemy', actionId: 'STRIKE', targetId: 'fighter' })

  assert.equal(result.state.players[0].currentHp, 0)
  assert.equal(result.state.players[0].dead, true)
  assert.ok(result.events.some((event) => event.type === 'DEAD'))
})

test('emits victory and defeat outcomes', () => {
  const victory = resolvePrototypePlayerBatch(state(), [
    { actorId: 'fighter', actionId: 'STRIKE' },
    { actorId: 'support', actionId: 'STRIKE' },
  ])
  assert.ok(victory.events.some((event) => event.type === 'VICTORY'))

  const defeated = state()
  defeated.players[0].dead = true
  defeated.players[0].currentHp = 0
  defeated.players[1].dead = true
  defeated.players[1].currentHp = 0
  const defeat = resolvePrototypeEnemyAction(defeated, { actorId: 'enemy', actionId: 'STRIKE', targetId: 'fighter' })
  assert.ok(defeat.events.some((event) => event.type === 'DEFEAT'))
})

test('stress simulation resolves the requested synthetic workload', () => {
  const result = runPrototypeStressSimulation(30, 4)

  assert.equal(result.participantCount, 30)
  assert.equal(result.rounds, 4)
  assert.equal(result.actionsResolved, 120)
  assert.ok(result.elapsedMilliseconds >= 0)
  assert.ok(result.averageRoundMilliseconds >= 0)
})
