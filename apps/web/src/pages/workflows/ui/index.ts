// workflow-studio UI kit — prop-driven, self-themed React components. Apps import from here
// (a UI subpath, not the module's main capability surface, so non-React contexts stay clean).
// Peer deps: react, @xyflow/react (+ its CSS), dagre. Theme by overriding `--wf-*` on
// <WorkflowStudioRoot>.
export { WorkflowStudioRoot, Badge, Button, Card, Field, Select, TextInput, tok, stepTypeMeta, statusMeta, STEP_TYPE_META, STATUS_META } from './theme';
export { WorkflowListView, type WorkflowListViewProps } from './WorkflowListView';
export { WorkflowCanvas, type WorkflowCanvasProps } from './WorkflowCanvas';
export { StepListView, type StepListViewProps } from './StepListView';
export { StepEditor, type StepEditorProps } from './StepEditor';
export { StepCreatorModal, ConfigFields, type StepCreatorModalProps, type ConnectionOption } from './StepCreatorModal';
export { InputsDeclEditor, OutputsEditor, VerificationPicker } from './StepIO';
export { STEP_CREATE_GROUPS, stepTypeSpec, type StepTypeSpec } from './step-catalog';
export { RunWizard, type RunWizardProps } from './RunWizard';
export { RunStepInspector, type RunStepInspectorProps, type UpstreamOutput } from './RunStepInspector';
export { VersionHistory, type VersionHistoryProps } from './VersionHistory';
export { WorkflowCreatorWizard, type WorkflowCreatorWizardProps } from './WorkflowCreatorWizard';
export type {
  WfStep, WfStepInput, WfStepOutput, WfVerification, WfDefinition, WfNote,
  WorkflowSummary, WorkflowDetail, VersionView, RunView, RunStepView,
  StepTemplateView, StepTestView, StepTestRunView,
} from './types';
