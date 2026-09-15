export function runPrototypeStressSimulation(participantCount, rounds) {
    const state = {
        enemyHp: participantCount * 10 * rounds + 1,
        enemyMaxHp: participantCount * 10 * rounds + 1,
        players: Array.from({ length: participantCount }, (_, index) => ({
            id: `stress-player-${index}`,
            name: `Stress Player ${index + 1}`,
            class: index % 2 === 0 ? 'FIGHTER' : 'SUPPORT',
            currentHp: 30,
            maxHp: 30,
            dead: false
        }))
    };
    const actions = state.players.map((player) => ({ actorId: player.id, actionId: 'STRIKE' }));
    const startedAt = performance.now();
    for (let round = 0; round < rounds; round += 1) {
        const playerResult = resolvePrototypePlayerBatch(state, actions);
        state.enemyHp = playerResult.state.enemyHp;
        state.players = playerResult.state.players;
        const target = state.players.find((player) => !player.dead);
        if (target !== undefined) {
            const enemyResult = resolvePrototypeEnemyAction(state, { actorId: 'enemy', actionId: 'STRIKE', targetId: target.id });
            state.enemyHp = enemyResult.state.enemyHp;
            state.players = enemyResult.state.players;
        }
    }
    const elapsedMilliseconds = performance.now() - startedAt;
    return {
        participantCount,
        rounds,
        actionsResolved: participantCount * rounds,
        elapsedMilliseconds,
        averageRoundMilliseconds: elapsedMilliseconds / rounds,
        finalEnemyHp: state.enemyHp
    };
}
// The resolver is intentionally pure: callers provide a snapshot and receive
// a new state plus an auditable event list without changing the database.
export function resolvePrototypePlayerBatch(startState, actions) {
    // Every player action reads the same phase-start snapshot. Effects are then
    // applied in submission order only to the working copy.
    const state = cloneState(startState);
    const events = [];
    for (const action of actions) {
        const actor = state.players.find((player) => player.id === action.actorId);
        if (actor === undefined || actor.dead) {
            continue;
        }
        if (action.actionId === 'STRIKE') {
            const damage = 10;
            state.enemyHp = Math.max(0, state.enemyHp - damage);
            events.push({
                type: 'DAMAGE',
                actorId: actor.id,
                targetId: 'enemy',
                amount: damage,
                message: `${actor.name} dealt ${damage} damage.`
            });
        }
        else if (action.actionId === 'HEAL') {
            const target = state.players.find((player) => player.id === action.targetId);
            if (target === undefined || target.dead) {
                events.push({ type: 'NOTHING', actorId: actor.id, message: `${actor.name}'s heal had no valid target.` });
                continue;
            }
            const amount = Math.min(10, target.maxHp - target.currentHp);
            target.currentHp = Math.min(target.maxHp, target.currentHp + 10);
            events.push({
                type: 'HEAL',
                actorId: actor.id,
                targetId: target.id,
                amount,
                message: `${actor.name} healed ${target.name} for ${amount} HP.`
            });
        }
        else {
            events.push({ type: 'NOTHING', actorId: actor.id, message: `${actor.name} did nothing.` });
        }
    }
    appendOutcomeEvents(state, events);
    return { state, events };
}
export function resolvePrototypeEnemyAction(startState, action) {
    // Enemy resolution is a separate phase after the player batch commits.
    const state = cloneState(startState);
    const events = [];
    const target = state.players.find((player) => player.id === action.targetId && !player.dead);
    if (target === undefined) {
        events.push({ type: 'NOTHING', actorId: 'enemy', message: 'The enemy had no valid target.' });
        appendOutcomeEvents(state, events);
        return { state, events };
    }
    const damage = 5;
    target.currentHp = Math.max(0, target.currentHp - damage);
    events.push({
        type: 'DAMAGE',
        actorId: 'enemy',
        targetId: target.id,
        amount: damage,
        message: `The enemy dealt ${damage} damage to ${target.name}.`
    });
    if (target.currentHp === 0) {
        target.dead = true;
        events.push({ type: 'DEAD', targetId: target.id, message: `${target.name} is Dead.` });
    }
    appendOutcomeEvents(state, events);
    return { state, events };
}
function cloneState(state) {
    // Prevent a resolver call from mutating the object owned by its caller.
    return {
        enemyHp: state.enemyHp,
        enemyMaxHp: state.enemyMaxHp,
        players: state.players.map((player) => ({ ...player }))
    };
}
function appendOutcomeEvents(state, events) {
    // Outcomes are derived after a complete batch, not after each individual
    // effect, so simultaneous actions can finish legally before victory/defeat.
    if (state.enemyHp === 0) {
        events.push({ type: 'VICTORY', message: 'The party won the encounter.' });
    }
    else if (state.players.every((player) => player.dead)) {
        events.push({ type: 'DEFEAT', message: 'The party was defeated.' });
    }
}
//# sourceMappingURL=prototype.js.map