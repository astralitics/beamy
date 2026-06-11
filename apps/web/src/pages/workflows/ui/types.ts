// UI-facing prop types — intentionally decoupled from the DB/entities layer so the kit is
// portable (an app maps its own tRPC data onto these). They mirror the entity shapes.

export interface WfVerification { kind: string; params?: Record<string, unknown> }
export interface WfStepOutput { id: string; name: string; type: string; required: boolean; verifications: WfVerification[] }
export interface WfStepInput { name: string; type: string; from?: { stepId: string; outputId: string } }

/** A step inside a workflow definition (the DAG). */
export interface WfStep {
  id: string;
  type: string;
  name?: string;
  dependsOn?: string[];
  templateId?: string;
  inputs?: Record<string, unknown>;
  config?: Record<string, unknown>;
  instructions?: string;
  outputs?: WfStepOutput[];
}
export interface WfDefinition { name: string; steps: WfStep[] }

export interface WorkflowSummary {
  id: string;
  name: string;
  summary?: string | null;
  status: string; // draft | published | archived
  version: string;
  triggerType: string; // manual | scheduled | signal
  stepCount?: number;
  updatedAt?: string;
  lastRun?: { status: string; at?: string | null } | null;
}
export interface WorkflowDetail extends WorkflowSummary {
  definition: WfDefinition;
  currentVersionId?: string | null;
}

export interface VersionView {
  id: string;
  versionNumber: number;
  name: string;
  summary?: string | null;
  publishedAt?: string | null;
  definition: WfDefinition;
}

export interface RunStepView {
  stepId: string;
  stepType: string;
  status: string; // completed | skipped | paused | failed
  output?: unknown;
  error?: string | null;
}
export interface RunView {
  id: string;
  status: string; // running | paused | completed | failed
  pausedStepId?: string | null;
  steps: RunStepView[];
  outputs?: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface StepTemplateView {
  id: string;
  name: string;
  slug: string;
  stepType: string;
  summary?: string | null;
  inputs: WfStepInput[];
  outputs: WfStepOutput[];
  instructions?: string | null;
  status: string;
}

export interface StepTestView {
  id: string;
  stepTemplateId: string;
  name: string;
  inputFixture?: Record<string, unknown>;
  expectedOutput?: unknown;
}
export interface StepTestRunView {
  id: string;
  passed: boolean;
  verificationResults?: { outputId: string; kind: string; status: string; message?: string }[];
  actualOutput?: unknown;
  error?: string | null;
  ranAt?: string | null;
}
