/** MD01 only: a synchronous, in-memory adapter. No SDK, network, storage or AI. */
export const TEMPLATE = { name: 'Peer-support SOAP', version: 'MD01-0.1 (demonstration)' } as const;
export const FIELD_DEFINITIONS = [
  { key: 'subjective', label: 'S · Subjective', help: 'What the person said, in their own terms.' },
  {
    key: 'objective',
    label: 'O · Objective',
    help: 'What staff directly observed; separate observation from interpretation.',
  },
  {
    key: 'assessment',
    label: 'A · Peer-support reflection',
    help: 'Describe the person’s response and process of change without diagnosing.',
  },
  {
    key: 'plan',
    label: 'P · Plan',
    help: 'The next step the person chose; do not invent commitments.',
  },
  {
    key: 'intervention',
    label: 'Peer intervention',
    help: 'What staff actually did within the peer-support role.',
  },
  {
    key: 'response',
    label: 'Person’s response',
    help: 'The person’s stated or observed response to that intervention.',
  },
  {
    key: 'goalConnection',
    label: 'Connection to the person’s goal',
    help: 'How the encounter relates to the person’s own goal or process of change.',
  },
] as const;
export type NoteField = (typeof FIELD_DEFINITIONS)[number]['key'];
export type Draft = Record<NoteField, string>;
export type DemoRole = 'staff' | 'reviewer' | 'observer';
export type DemoStatus = 'draft' | 'in_review' | 'returned' | 'reviewed';
export const STATUS_LABELS: Record<DemoStatus, string> = {
  draft: 'Draft',
  in_review: 'Awaiting simulated review',
  returned: 'Returned for practice revision',
  reviewed: 'Accepted in demo',
};

export const DEMO_CASES = [
  {
    id: 'alpha',
    person: 'TEST PERSON ALPHA',
    encounter: 'TEST ENCOUNTER 001',
    title: 'Practice resource navigation',
    time: '10:00',
    date: '2026-10-24',
    goal: 'Choose one resource from a fictional training directory.',
    source: {
      subjective:
        'TEST PERSON ALPHA said, “I want to compare the two practice resources before choosing one.”',
      objective:
        'During the tabletop exercise, TEST PERSON ALPHA compared two printed training resource cards.',
      assessment:
        'TEST PERSON ALPHA described a preferred resource and asked to practice the next step.',
      plan: 'TEST PERSON ALPHA chose to practice making an inquiry using the fictional directory at the next training exercise.',
      intervention:
        'TEST STAFF helped compare the two training cards and offered a practice inquiry script.',
      response: 'TEST PERSON ALPHA tried the script once and said, “That wording works for me.”',
      goalConnection:
        'Comparing the cards supported TEST PERSON ALPHA’s stated goal of choosing one training resource.',
    },
    missingSource: [] as string[],
  },
  {
    id: 'beta',
    person: 'TEST PERSON BETA',
    encounter: 'TEST ENCOUNTER 002',
    title: 'Practice checking missing facts',
    time: '11:00',
    date: '2026-10-24',
    goal: 'Not supplied in the fictional source.',
    source: {
      subjective: 'TEST PERSON BETA said, “I would like to hear about practice resources.”',
      objective: '',
      assessment: '',
      plan: '',
      intervention: '',
      response: '',
      goalConnection: '',
    },
    missingSource: [
      'Staff observations',
      'Peer intervention',
      'Person’s response',
      'Person’s goal and chosen next step',
    ],
  },
] as const;
export type CaseId = (typeof DEMO_CASES)[number]['id'];

export interface ReviewEvent {
  action: 'Submitted' | 'Returned' | 'Accepted in demo';
  actor: 'TEST STAFF' | 'TEST REVIEWER';
  revision: number;
  comment: string;
  at: string;
}
export interface DemoNote {
  fields: Draft;
  status: DemoStatus;
  verified: boolean;
  revision: number;
  submitted: Draft | null;
  feedback: string;
  history: ReviewEvent[];
}
export interface DemoState {
  role: DemoRole;
  notes: Record<CaseId, DemoNote>;
}
export type DemoAction =
  | { type: 'role'; role: DemoRole }
  | { type: 'reset' }
  | { type: 'edit'; id: CaseId; field: NoteField; value: string }
  | { type: 'sample'; id: CaseId }
  | { type: 'verify'; id: CaseId; value: boolean }
  | { type: 'submit'; id: CaseId; at: string }
  | { type: 'return'; id: CaseId; comment: string; at: string }
  | { type: 'accept'; id: CaseId; at: string };

function emptyDraft(): Draft {
  return {
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    intervention: '',
    response: '',
    goalConnection: '',
  };
}
function emptyNote(): DemoNote {
  return {
    fields: emptyDraft(),
    status: 'draft',
    verified: false,
    revision: 0,
    submitted: null,
    feedback: '',
    history: [],
  };
}
export function initialDemoState(): DemoState {
  return { role: 'staff', notes: { alpha: emptyNote(), beta: emptyNote() } };
}
export function canEdit(role: DemoRole, note: DemoNote) {
  return role === 'staff' && (note.status === 'draft' || note.status === 'returned');
}
export function missingFields(fields: Draft) {
  return FIELD_DEFINITIONS.filter((field) => !fields[field.key].trim());
}

/** Guard transitions here as well as in the UI. Demo roles are never real app permissions. */
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'reset') return initialDemoState();
  if (action.type === 'role') return { ...state, role: action.role };
  const note = state.notes[action.id];
  let next: DemoNote;
  if (action.type === 'edit' || action.type === 'sample' || action.type === 'verify') {
    if (!canEdit(state.role, note)) return state;
    if (action.type === 'edit')
      next = { ...note, fields: { ...note.fields, [action.field]: action.value }, verified: false };
    else if (action.type === 'sample') {
      const fixture = DEMO_CASES.find((item) => item.id === action.id)!;
      next = { ...note, fields: { ...fixture.source }, verified: false };
    } else next = { ...note, verified: action.value };
  } else if (action.type === 'submit') {
    if (!canEdit(state.role, note) || !note.verified || missingFields(note.fields).length)
      return state;
    const revision = note.revision + 1;
    next = {
      ...note,
      status: 'in_review',
      revision,
      submitted: { ...note.fields },
      feedback: '',
      history: [
        ...note.history,
        { action: 'Submitted', actor: 'TEST STAFF', revision, comment: '', at: action.at },
      ],
    };
  } else {
    if (state.role !== 'reviewer' || note.status !== 'in_review') return state;
    if (action.type === 'return') {
      if (!action.comment.trim()) return state;
      next = {
        ...note,
        status: 'returned',
        verified: false,
        feedback: action.comment.trim(),
        history: [
          ...note.history,
          {
            action: 'Returned',
            actor: 'TEST REVIEWER',
            revision: note.revision,
            comment: action.comment.trim(),
            at: action.at,
          },
        ],
      };
    } else
      next = {
        ...note,
        status: 'reviewed',
        history: [
          ...note.history,
          {
            action: 'Accepted in demo',
            actor: 'TEST REVIEWER',
            revision: note.revision,
            comment: '',
            at: action.at,
          },
        ],
      };
  }
  return { ...state, notes: { ...state.notes, [action.id]: next } };
}

export function previewText(id: CaseId, note: DemoNote): string {
  const fixture = DEMO_CASES.find((item) => item.id === id)!;
  return [
    'MISSIONOS MD01 — FICTIONAL WORKFLOW DEMONSTRATION',
    'NOT A SERVICE RECORD. NOT SIGNED. NOT FOR BILLING OR CARE DELIVERY.',
    `${fixture.person} / ${fixture.encounter}`,
    `Fictional encounter date: ${fixture.date}`,
    `Template: ${TEMPLATE.name} / ${TEMPLATE.version}`,
    `Demo status: ${STATUS_LABELS[note.status]}; submitted revision: ${note.revision}`,
    '',
    ...FIELD_DEFINITIONS.flatMap((field) => [
      field.label,
      note.fields[field.key].trim() || '[Not supplied — do not infer]',
      '',
    ]),
    'SIMULATED REVIEW HISTORY (not a legal signature or audit record)',
    ...note.history.map(
      (event) =>
        `${event.at} | ${event.actor} | ${event.action} | Revision ${event.revision}${event.comment ? ` | ${event.comment}` : ''}`,
    ),
  ].join('\n');
}
