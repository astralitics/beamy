// The friendly step catalog that drives the guided step creator: each step type gets a
// human title, a one-line blurb, and the type-specific config fields to ask for (an AI task
// asks for a prompt; a fetch asks for a URL + method; a human gate asks for instructions…).
// Shared by StepCreatorModal (create) and StepEditor (refine) so create + edit stay coherent.

export interface StepConfigField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'select';
  placeholder?: string;
  options?: string[];
  hint?: string;
}

export interface StepTypeSpec {
  type: string;
  title: string;
  blurb: string;
  config: StepConfigField[];
  /** When set, the step asks for free-text instructions (human-facing steps). */
  instructionsLabel?: string;
}

export const STEP_CREATE_GROUPS: { group: string; items: StepTypeSpec[] }[] = [
  {
    group: 'Do work',
    items: [
      {
        type: 'ai_agent_task',
        title: 'AI task',
        blurb: 'Have Claude draft, analyze, or decide something.',
        config: [
          { key: 'prompt', label: 'What should the AI do?', kind: 'textarea', placeholder: 'Draft a kitchen estimate from the comparable projects…', hint: 'Reference earlier steps with ${steps.<id>.output.<field>}.' },
        ],
      },
      {
        type: 'http_call',
        title: 'Fetch data',
        blurb: 'Call an external API or webhook.',
        config: [
          { key: 'method', label: 'Method', kind: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          { key: 'url', label: 'URL', kind: 'text', placeholder: 'https://api.example.com/resource' },
        ],
      },
      {
        type: 'mcp_tool_call',
        title: 'Tool call',
        blurb: 'Run a connected tool (QuickBooks, Stripe, an MCP server…).',
        config: [{ key: 'tool', label: 'Tool', kind: 'text', placeholder: 'quickbooks.create_invoice' }],
      },
      {
        type: 'db_operation',
        title: 'Database',
        blurb: 'Read or write structured app data.',
        config: [{ key: 'operation', label: 'Operation', kind: 'textarea', placeholder: 'select * from projects where … / insert …' }],
      },
      {
        type: 'function_call',
        title: 'Function',
        blurb: 'Run a built-in function in your app.',
        config: [{ key: 'fn', label: 'Function name', kind: 'text', placeholder: 'computeBudgetVariance' }],
      },
      {
        type: 'notify',
        title: 'Notify',
        blurb: 'Send a message or notification.',
        config: [
          { key: 'channel', label: 'Channel', kind: 'select', options: ['email', 'sms', 'slack', 'in-app'] },
          { key: 'to', label: 'Recipient', kind: 'text', placeholder: 'client@firm.com' },
        ],
      },
      {
        type: 'call_workflow',
        title: 'Run a workflow',
        blurb: 'Invoke another workflow as a sub-run.',
        config: [{ key: 'workflow', label: 'Workflow', kind: 'text', placeholder: 'send_proposal' }],
      },
    ],
  },
  {
    group: 'People',
    items: [
      {
        type: 'human_approval',
        title: 'Approval gate',
        blurb: 'Pause until someone approves before continuing.',
        config: [],
        instructionsLabel: 'What are they approving?',
      },
      {
        type: 'human_input',
        title: 'Collect input',
        blurb: 'Pause for a person to provide information.',
        config: [],
        instructionsLabel: 'What should they provide?',
      },
    ],
  },
  {
    group: 'Flow',
    items: [
      {
        type: 'branch',
        title: 'Branch',
        blurb: 'Continue only when a condition holds.',
        config: [{ key: 'condition', label: 'Continue when…', kind: 'text', placeholder: '${steps.review.output.approved}' }],
      },
      {
        type: 'delay',
        title: 'Delay',
        blurb: 'Wait for a duration, then continue.',
        config: [{ key: 'duration', label: 'Wait', kind: 'text', placeholder: '30 days · next monday 9am' }],
      },
      {
        type: 'succeed',
        title: 'Finish',
        blurb: 'Mark the workflow complete.',
        config: [],
      },
      {
        type: 'fail',
        title: 'Stop',
        blurb: 'Stop the run with a reason.',
        config: [{ key: 'reason', label: 'Reason', kind: 'text', placeholder: 'Budget exceeded' }],
      },
    ],
  },
];

export const STEP_TYPE_SPECS: Record<string, StepTypeSpec> = Object.fromEntries(
  STEP_CREATE_GROUPS.flatMap((g) => g.items).map((s) => [s.type, s]),
);

export function stepTypeSpec(type: string): StepTypeSpec | undefined {
  return STEP_TYPE_SPECS[type];
}
