import type { Vertical } from "@beamy/shared";

/**
 * Sample workflow definitions used by the Workflows page DAG canvas.
 *
 * Beamy has no workflow engine yet (that's a later milestone), so these are
 * static, illustrative flows — enough to render the horizontal DAG and show
 * how a workflow reads end to end. Each set is vertical-aware: a construction
 * org sees construction flows, a landscaping org sees landscaping ones.
 *
 * A step's `dependsOn` lists the steps that must finish before it; the canvas
 * draws an edge from each dependency into the step. Some flows fan out into
 * parallel work and fan back in, so the graph is a real DAG, not just a line.
 */

export type StepType =
  | "trigger"
  | "task"
  | "approval"
  | "automation"
  | "ai"
  | "notification";

export interface WorkflowStep {
  id: string;
  name: string;
  type: StepType;
  /** ids of steps that must complete first (drawn as incoming edges). */
  dependsOn: string[];
  /** optional one-line detail shown under the name. */
  detail?: string;
}

export interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
}

const CONSTRUCTION: WorkflowDef[] = [
  {
    id: "project-intake",
    name: "New project intake",
    description:
      "From an inbound lead to a crew on site — with material ordering and crew scheduling running in parallel after the client signs.",
    steps: [
      { id: "lead", name: "Lead received", type: "trigger", dependsOn: [], detail: "Web form or referral" },
      { id: "visit", name: "Site visit", type: "task", dependsOn: ["lead"] },
      { id: "estimate", name: "Build estimate", type: "task", dependsOn: ["visit"] },
      { id: "proposal", name: "Send proposal", type: "automation", dependsOn: ["estimate"], detail: "PDF + e-sign" },
      { id: "approval", name: "Client approval", type: "approval", dependsOn: ["proposal"] },
      { id: "materials", name: "Order materials", type: "automation", dependsOn: ["approval"] },
      { id: "crew", name: "Schedule crew", type: "task", dependsOn: ["approval"] },
      { id: "build", name: "Build", type: "task", dependsOn: ["materials", "crew"] },
      { id: "punch", name: "Punch list", type: "task", dependsOn: ["build"] },
      { id: "closeout", name: "Closeout sign-off", type: "approval", dependsOn: ["punch"] },
    ],
  },
  {
    id: "change-order",
    name: "Change order review",
    description: "Route a requested change through cost analysis and the right approvals before the plan updates.",
    steps: [
      { id: "requested", name: "Change requested", type: "trigger", dependsOn: [] },
      { id: "cost", name: "Cost impact analysis", type: "ai", dependsOn: ["requested"], detail: "Drafts a cost delta" },
      { id: "pm", name: "PM review", type: "approval", dependsOn: ["cost"] },
      { id: "client", name: "Client approval", type: "approval", dependsOn: ["pm"] },
      { id: "update", name: "Update plan + budget", type: "automation", dependsOn: ["client"] },
      { id: "notify", name: "Notify crew", type: "notification", dependsOn: ["update"] },
    ],
  },
];

const LANDSCAPING: WorkflowDef[] = [
  {
    id: "landscape-project",
    name: "Landscape project flow",
    description:
      "From inquiry to install — design and quoting up front, then plant ordering and crew scheduling in parallel before installation.",
    steps: [
      { id: "inquiry", name: "Inquiry received", type: "trigger", dependsOn: [], detail: "Web form or referral" },
      { id: "assess", name: "Site assessment", type: "task", dependsOn: ["inquiry"] },
      { id: "design", name: "Design concept", type: "ai", dependsOn: ["assess"], detail: "Generates a planting plan" },
      { id: "quote", name: "Build quote", type: "task", dependsOn: ["design"] },
      { id: "approval", name: "Client approval", type: "approval", dependsOn: ["quote"] },
      { id: "plants", name: "Order plants + materials", type: "automation", dependsOn: ["approval"] },
      { id: "schedule", name: "Schedule install crew", type: "task", dependsOn: ["approval"] },
      { id: "install", name: "Installation", type: "task", dependsOn: ["plants", "schedule"] },
      { id: "walk", name: "Client walkthrough", type: "approval", dependsOn: ["install"] },
      { id: "maint", name: "Set up maintenance", type: "automation", dependsOn: ["walk"] },
    ],
  },
  {
    id: "seasonal-maintenance",
    name: "Seasonal maintenance",
    description: "Kick off a season's recurring visits, dispatch the crew, and send the client a photo report after each service.",
    steps: [
      { id: "season", name: "Season start", type: "trigger", dependsOn: [], detail: "Scheduled trigger" },
      { id: "plan", name: "Generate visit schedule", type: "automation", dependsOn: ["season"] },
      { id: "dispatch", name: "Crew dispatch", type: "task", dependsOn: ["plan"] },
      { id: "service", name: "Service visit", type: "task", dependsOn: ["dispatch"] },
      { id: "report", name: "Photo report", type: "ai", dependsOn: ["service"], detail: "Summarizes work done" },
      { id: "client", name: "Client notification", type: "notification", dependsOn: ["report"] },
    ],
  },
];

export const WORKFLOWS_BY_VERTICAL: Record<Vertical, WorkflowDef[]> = {
  construction: CONSTRUCTION,
  landscaping: LANDSCAPING,
};
