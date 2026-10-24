import test from 'node:test';
import assert from 'node:assert/strict';
import {
  demoReducer,
  initialDemoState,
  missingFields,
  previewText,
  type DemoRole,
  type DemoState,
} from '../src/features/mission-delivery/demo/model.ts';

const at = '2026-10-24T12:00:00.000Z';
function submitted(): DemoState {
  let state = demoReducer(initialDemoState(), { type: 'sample', id: 'alpha' });
  state = demoReducer(state, { type: 'verify', id: 'alpha', value: true });
  return demoReducer(state, { type: 'submit', id: 'alpha', at });
}

test('a missing source never becomes a complete draft or a submitted record', () => {
  let state = demoReducer(initialDemoState(), { type: 'sample', id: 'beta' });
  assert.equal(missingFields(state.notes.beta.fields).length, 6);
  state = demoReducer(state, { type: 'verify', id: 'beta', value: true });
  assert.equal(demoReducer(state, { type: 'submit', id: 'beta', at }), state);
  const text = previewText('beta', state.notes.beta);
  assert.equal((text.match(/\[Not supplied — do not infer\]/g) ?? []).length, 6);
  assert.ok(text.includes('NOT A SERVICE RECORD. NOT SIGNED.'));
  assert.ok(text.includes('MD01-0.1 (demonstration)'));
});

test('submission requires a current staff source check; edits invalidate that check', () => {
  let state = demoReducer(initialDemoState(), { type: 'sample', id: 'alpha' });
  assert.equal(demoReducer(state, { type: 'submit', id: 'alpha', at }), state);
  state = demoReducer(state, { type: 'verify', id: 'alpha', value: true });
  state = demoReducer(state, {
    type: 'edit',
    id: 'alpha',
    field: 'plan',
    value: 'An edited fictional plan',
  });
  assert.equal(state.notes.alpha.verified, false);
  assert.equal(demoReducer(state, { type: 'submit', id: 'alpha', at }), state);
});

test('demo role matrix enforces permissions even when actions bypass disabled controls', () => {
  for (const role of ['reviewer', 'observer'] as DemoRole[]) {
    const state = demoReducer(initialDemoState(), { type: 'role', role });
    for (const action of [
      {
        type: 'edit' as const,
        id: 'alpha' as const,
        field: 'plan' as const,
        value: 'Forbidden change',
      },
      { type: 'sample' as const, id: 'alpha' as const },
      { type: 'verify' as const, id: 'alpha' as const, value: true },
      { type: 'submit' as const, id: 'alpha' as const, at },
    ])
      assert.equal(demoReducer(state, action), state);
  }
  for (const role of ['staff', 'observer'] as DemoRole[]) {
    const state = demoReducer(submitted(), { type: 'role', role });
    assert.equal(demoReducer(state, { type: 'accept', id: 'alpha', at }), state);
    assert.equal(
      demoReducer(state, { type: 'return', id: 'alpha', comment: 'A comment', at }),
      state,
    );
  }
});

test('return and resubmission preserve earlier submission snapshots and review comments', () => {
  let state = submitted();
  const firstSubmission = state.notes.alpha.submitted!;
  const originalPlan = firstSubmission.plan;
  assert.equal(
    demoReducer(state, { type: 'edit', id: 'alpha', field: 'plan', value: 'Blocked' }),
    state,
  );
  state = demoReducer(state, { type: 'role', role: 'reviewer' });
  assert.equal(demoReducer(state, { type: 'return', id: 'alpha', comment: '  ', at }), state);
  state = demoReducer(state, {
    type: 'return',
    id: 'alpha',
    comment: 'Check the chosen next step.',
    at,
  });
  assert.equal(state.notes.alpha.status, 'returned');
  assert.equal(state.notes.alpha.verified, false);
  state = demoReducer(state, { type: 'role', role: 'staff' });
  state = demoReducer(state, {
    type: 'edit',
    id: 'alpha',
    field: 'plan',
    value: originalPlan + ' [TEST EDIT]',
  });
  assert.equal(firstSubmission.plan, originalPlan);
  assert.equal(state.notes.alpha.feedback, 'Check the chosen next step.');
  state = demoReducer(state, { type: 'verify', id: 'alpha', value: true });
  state = demoReducer(state, { type: 'submit', id: 'alpha', at });
  assert.equal(state.notes.alpha.revision, 2);
  assert.notEqual(state.notes.alpha.submitted, firstSubmission);
  state = demoReducer(state, { type: 'role', role: 'reviewer' });
  state = demoReducer(state, { type: 'accept', id: 'alpha', at });
  assert.deepEqual(
    state.notes.alpha.history.map((event) => event.action),
    ['Submitted', 'Returned', 'Submitted', 'Accepted in demo'],
  );
  assert.ok(previewText('alpha', state.notes.alpha).includes('[TEST EDIT]'));
  state = demoReducer(state, { type: 'role', role: 'staff' });
  assert.equal(demoReducer(state, { type: 'sample', id: 'alpha' }), state);
});

test('reset returns new blank notes with no retained draft, review history or role', () => {
  const previous = submitted();
  const next = demoReducer(previous, { type: 'reset' });
  assert.deepEqual(next, initialDemoState());
  assert.notEqual(next.notes.alpha.fields, previous.notes.alpha.fields);
});
