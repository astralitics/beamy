// Curated workflow templates — ready-to-run starting points users instantiate into a DRAFT and then
// edit (the Phase-4 templates gallery). Static product content (not db rows): version-controlled,
// org-agnostic, and the single source shared by the templates router AND the verification fixture.
// Each `def` is a raw {name, steps} in the same shape the AI builder emits, so templates.instantiate
// runs it through the SAME normalizeWorkflowDef before persisting (a hand-edit here can never ship a
// broken draft). They also double as AI-builder few-shot exemplars.

export interface WorkflowTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  /** manual | scheduled | signal — carried onto the created draft. */
  triggerType: string;
  def: { name: string; summary?: string; steps: Record<string, unknown>[] };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    "id": "change-order-routing-by-tier",
    "title": "Route change orders by tier",
    "description": "Drafts a change order, then routes it three ways by budget tier: high-value needs a PM sign-off before it's sent; mid and low go straight to the client.",
    "category": "Projects & change orders",
    "triggerType": "manual",
    "def": {
      "name": "Route change orders by tier",
      "summary": "Drafts a change order, then routes it three ways by budget tier: high needs PM approval; mid and low go straight to the client.",
      "steps": [
        {
          "id": "draft_co",
          "type": "ai_agent_task",
          "name": "Draft the change order",
          "config": {
            "prompt": "Write a clear, client-facing change order for project ${inputs.project_name}. Scope change: ${inputs.scope_change}. Estimated cost: ${inputs.amount} ${inputs.currency}. Include a one-line summary, the reason, the cost impact, and the schedule impact. Keep it professional and concise."
          }
        },
        {
          "id": "classify_tier",
          "type": "switch",
          "name": "Route by budget tier",
          "dependsOn": [
            "draft_co"
          ],
          "config": {
            "value": "${inputs.tier}",
            "cases": [
              { "id": "high", "value": "high", "label": "High-value" },
              { "id": "mid", "value": "mid", "label": "Mid-tier" },
              { "id": "low", "value": "low", "label": "Low-value" }
            ]
          }
        },
        {
          "id": "pm_approval",
          "type": "human_approval",
          "name": "PM approves the high-value change order",
          "dependsOn": [
            "classify_tier"
          ],
          "when": "${steps.classify_tier.output.cases.high}",
          "instructions": "This change order is in the high-value tier. Review the draft and the cost before it goes to the client. Approve to send it, or reject to revise.\n\n${steps.draft_co.output.text}"
        },
        {
          "id": "send_high",
          "type": "notify",
          "name": "Email the approved change order",
          "dependsOn": [
            "pm_approval"
          ],
          "config": {
            "channel": "email",
            "to": "${inputs.client_email}",
            "subject": "Change order for ${inputs.project_name}",
            "body": "${steps.draft_co.output.text}"
          }
        },
        {
          "id": "send_mid",
          "type": "notify",
          "name": "Email the mid-tier change order",
          "dependsOn": [
            "classify_tier"
          ],
          "when": "${steps.classify_tier.output.cases.mid}",
          "config": {
            "channel": "email",
            "to": "${inputs.client_email}",
            "subject": "Change order for ${inputs.project_name}",
            "body": "${steps.draft_co.output.text}"
          }
        },
        {
          "id": "send_low",
          "type": "notify",
          "name": "Email the low-value change order",
          "dependsOn": [
            "classify_tier"
          ],
          "when": "${steps.classify_tier.output.cases.low}",
          "config": {
            "channel": "email",
            "to": "${inputs.client_email}",
            "subject": "Quick change on ${inputs.project_name}",
            "body": "${steps.draft_co.output.text}"
          }
        }
      ]
    }
  },
  {
    "id": "batch-vendor-outreach",
    "title": "Batch vendor outreach",
    "description": "Drafts a short RFP cover note once, then emails it to every vendor on the list — one email per vendor, personalized.",
    "category": "Vendors & procurement",
    "triggerType": "manual",
    "def": {
      "name": "Batch vendor outreach",
      "summary": "Draft an RFP note once, then email each vendor on the list (one personalized email per vendor).",
      "steps": [
        {
          "id": "draft_note",
          "type": "ai_agent_task",
          "name": "Draft the RFP cover note",
          "config": {
            "prompt": "Write a short, friendly RFP cover note for project ${inputs.project_name}. Invite the vendor to bid, mention the scope in one line (${inputs.scope_summary}), and ask for a quote by ${inputs.due_date}. Leave a greeting line out — it's added per vendor."
          }
        },
        {
          "id": "email_each_vendor",
          "type": "loop",
          "name": "Email each vendor",
          "dependsOn": [
            "draft_note"
          ],
          "config": {
            "items": "${inputs.vendors}",
            "bodyType": "notify",
            "bodyConfig": {
              "channel": "email",
              "to": "${item.email}",
              "subject": "RFP — ${inputs.project_name}",
              "body": "Hi ${item.name},\n\n${steps.draft_note.output.text}\n\nThank you,\n${inputs.company_name}"
            }
          }
        },
        {
          "id": "done",
          "type": "succeed",
          "name": "All vendors emailed",
          "dependsOn": [
            "email_each_vendor"
          ]
        }
      ]
    }
  },
  {
    "id": "change-order-budget-triage",
    "title": "Change order budget triage",
    "description": "Drafts a change order, routes anything over the threshold to a PM approval, and sends small ones straight to the client.",
    "category": "Projects & change orders",
    "triggerType": "manual",
    "def": {
      "name": "Change order budget triage",
      "summary": "Drafts a change order, routes anything over the threshold to a PM approval, and sends small ones straight to the client.",
      "steps": [
        {
          "id": "draft_co",
          "type": "ai_agent_task",
          "name": "Draft the change order",
          "config": {
            "prompt": "Write a clear, client-facing change order for project ${inputs.project_name}. Scope change: ${inputs.scope_change}. Estimated cost: ${inputs.amount} ${inputs.currency}. Include a one-line summary, the reason, the cost impact, and the schedule impact. Keep it professional and concise."
          }
        },
        {
          "id": "is_major",
          "type": "branch",
          "name": "Over the approval threshold?",
          "dependsOn": [
            "draft_co"
          ],
          "config": {
            "condition": "${inputs.is_major}"
          }
        },
        {
          "id": "pm_approval",
          "type": "human_approval",
          "name": "PM approves the change order",
          "dependsOn": [
            "is_major"
          ],
          "when": "${steps.is_major.output.onTrue}",
          "instructions": "This change order is above your approval threshold. Review the draft and the cost before it goes to the client. Approve to send it, or reject to revise.\n\n${steps.draft_co.output.text}"
        },
        {
          "id": "send_major",
          "type": "notify",
          "name": "Email the approved change order",
          "dependsOn": [
            "pm_approval"
          ],
          "config": {
            "channel": "email",
            "to": "${inputs.client_email}",
            "subject": "Change order for ${inputs.project_name}",
            "body": "${steps.draft_co.output.text}"
          }
        },
        {
          "id": "send_minor",
          "type": "notify",
          "name": "Email the minor change order",
          "dependsOn": [
            "is_major"
          ],
          "when": "${steps.is_major.output.onFalse}",
          "config": {
            "channel": "email",
            "to": "${inputs.client_email}",
            "subject": "Quick change on ${inputs.project_name}",
            "body": "${steps.draft_co.output.text}"
          }
        }
      ]
    }
  },
  {
    "id": "lead-to-proposal",
    "title": "Lead to proposal",
    "description": "New lead in? Claude drafts a scope of work, an owner approves it, and it emails the client. If rejected, the run ends so you can revise.",
    "category": "Sales & proposals",
    "triggerType": "manual",
    "def": {
      "name": "Lead to proposal",
      "summary": "New lead in? Claude drafts a scope of work, an owner approves it, and it emails the client. If rejected, the run ends so you can revise.",
      "steps": [
        {
          "id": "draft_proposal",
          "type": "ai_agent_task",
          "name": "Draft scope of work",
          "config": {
            "prompt": "You are an estimator at a construction & landscaping agency. Draft a clear, professional scope of work and ballpark proposal for this lead. Use plain language a homeowner can understand, list the work in phases, and note assumptions and exclusions.\nClient: ${inputs.client_name}\nProject: ${inputs.project_description}\nProperty: ${inputs.property_address}\nBudget hint: ${inputs.budget}"
          }
        },
        {
          "id": "review_proposal",
          "type": "human_approval",
          "name": "Review the proposal",
          "dependsOn": [
            "draft_proposal"
          ],
          "instructions": "Review the AI-drafted scope of work below. Approve to send it to the client, or reject to revise it first. Check pricing, exclusions, and that the scope matches what we discussed.\n\n${steps.draft_proposal.output.text}"
        },
        {
          "id": "check_approved",
          "type": "branch",
          "name": "Was it approved?",
          "dependsOn": [
            "review_proposal"
          ],
          "config": {
            "condition": "${steps.review_proposal.output.approved}"
          }
        },
        {
          "id": "send_proposal",
          "type": "notify",
          "name": "Email the proposal",
          "dependsOn": [
            "check_approved"
          ],
          "when": "${steps.check_approved.output.onTrue}",
          "config": {
            "channel": "email",
            "to": "${inputs.client_email}",
            "subject": "Your proposal from ${inputs.company_name}",
            "body": "Hi ${inputs.client_name},\n\nThank you for the opportunity. Please find our proposed scope of work below. Let us know if you have any questions.\n\n${steps.draft_proposal.output.text}\n\nWarm regards,\n${inputs.company_name}"
          }
        },
        {
          "id": "sent",
          "type": "succeed",
          "name": "Proposal sent",
          "dependsOn": [
            "send_proposal"
          ]
        },
        {
          "id": "needs_revision",
          "type": "fail",
          "name": "Needs revision",
          "dependsOn": [
            "check_approved"
          ],
          "when": "${steps.check_approved.output.onFalse}",
          "config": {
            "reason": "Proposal rejected in review \u2014 revise the scope and run again."
          }
        }
      ]
    }
  },
  {
    "id": "site-visit-to-assessment",
    "title": "Site visit to assessment",
    "description": "After a site visit, Claude turns the field notes into a clean assessment, a supervisor signs off, and it emails the project owner.",
    "category": "Field operations",
    "triggerType": "manual",
    "def": {
      "name": "Site visit to assessment",
      "summary": "After a site visit, Claude turns the field notes into a clean assessment, a supervisor signs off, and it emails the project owner.",
      "steps": [
        {
          "id": "write_assessment",
          "type": "ai_agent_task",
          "name": "Write site assessment",
          "config": {
            "prompt": "You are a senior site supervisor. Turn these raw field notes into a structured site assessment with clear headings: site conditions, access/logistics, risks or surprises, recommended next steps, and follow-ups needed before we quote or schedule. Keep it tight and skimmable.\n\nProject: ${inputs.project_name}\nSite: ${inputs.site_address}\nVisited by: ${inputs.inspector_name}\nRaw field notes:\n${inputs.field_notes}"
          }
        },
        {
          "id": "supervisor_review",
          "type": "human_approval",
          "name": "Supervisor sign-off",
          "dependsOn": [
            "write_assessment"
          ],
          "instructions": "Review the assessment below for accuracy before it goes to the project owner. Approve to send, or reject if the notes need correcting first.\n\n${steps.write_assessment.output.text}"
        },
        {
          "id": "check_signoff",
          "type": "branch",
          "name": "Signed off?",
          "dependsOn": [
            "supervisor_review"
          ],
          "config": {
            "condition": "${steps.supervisor_review.output.approved}"
          }
        },
        {
          "id": "email_assessment",
          "type": "notify",
          "name": "Send assessment",
          "dependsOn": [
            "check_signoff"
          ],
          "when": "${steps.check_signoff.output.onTrue}",
          "config": {
            "channel": "email",
            "to": "${inputs.owner_email}",
            "subject": "Site assessment \u2014 ${inputs.project_name}",
            "body": "Hi,\n\nHere is the assessment from our recent visit to ${inputs.site_address}.\n\n${steps.write_assessment.output.text}\n\nLet us know if you'd like to walk through any of this together."
          }
        },
        {
          "id": "delivered",
          "type": "succeed",
          "name": "Assessment delivered",
          "dependsOn": [
            "email_assessment"
          ]
        },
        {
          "id": "rework_notes",
          "type": "fail",
          "name": "Notes need rework",
          "dependsOn": [
            "check_signoff"
          ],
          "when": "${steps.check_signoff.output.onFalse}",
          "config": {
            "reason": "Assessment not signed off \u2014 correct the field notes and re-run."
          }
        }
      ]
    }
  },
  {
    "id": "weekly-site-weather-briefing",
    "title": "Weekly site weather briefing",
    "description": "Pulls the week's forecast for the job site, has Claude turn it into a crew-ready plan, and emails the crew lead.",
    "category": "Site operations",
    "triggerType": "scheduled",
    "def": {
      "name": "Weekly site weather briefing",
      "summary": "Pulls the week's forecast for the job site, has Claude turn it into a crew-ready plan, and emails the crew lead.",
      "steps": [
        {
          "id": "fetch_forecast",
          "type": "http_call",
          "name": "Get the site forecast",
          "config": {
            "method": "GET",
            "url": "https://api.open-meteo.com/v1/forecast?latitude=${inputs.lat}&longitude=${inputs.lon}&daily=precipitation_probability_max,temperature_2m_max,wind_speed_10m_max&timezone=auto"
          }
        },
        {
          "id": "briefing",
          "type": "ai_agent_task",
          "name": "Write the crew briefing",
          "dependsOn": [
            "fetch_forecast"
          ],
          "config": {
            "prompt": "You are a site superintendent. From this 7-day forecast JSON for ${inputs.site_name}, write a short crew briefing: flag any rain or high-wind days that put concrete pours, excavation, or roofing at risk, and recommend which days to schedule weather-sensitive work. Plain language, bullet points.\n\nForecast: ${steps.fetch_forecast.output.data}"
          }
        },
        {
          "id": "email_crew",
          "type": "notify",
          "name": "Email the crew lead",
          "dependsOn": [
            "briefing"
          ],
          "config": {
            "channel": "email",
            "to": "${inputs.crew_lead_email}",
            "subject": "This week on ${inputs.site_name}: weather plan",
            "body": "${steps.briefing.output.text}"
          }
        },
        {
          "id": "sent",
          "type": "succeed",
          "name": "Sent",
          "dependsOn": [
            "email_crew"
          ]
        }
      ]
    }
  },
  {
    "id": "rfi-intake",
    "title": "RFI intake & response",
    "description": "An RFI lands: Claude drafts an answer, a lead reviews it, and the response goes back to the requester. Fires from an inbound RFI signal.",
    "category": "RFIs & submittals",
    "triggerType": "signal",
    "def": {
      "name": "RFI intake & response",
      "summary": "An RFI lands: Claude drafts an answer, a lead reviews it, and the response goes back to the requester. Fires from an inbound RFI signal.",
      "steps": [
        {
          "id": "draft_answer",
          "type": "ai_agent_task",
          "name": "Draft RFI response",
          "config": {
            "prompt": "You are a project lead responding to a Request for Information (RFI) on a construction project. Draft a clear, direct answer. If it can't be fully answered without more detail, say exactly what is needed. Reference relevant drawings or specs by name if mentioned.\n\nProject: ${inputs.project_name}\nFrom: ${inputs.requester_name}\nRFI question:\n${inputs.rfi_question}"
          }
        },
        {
          "id": "lead_review",
          "type": "human_approval",
          "name": "Lead reviews answer",
          "dependsOn": [
            "draft_answer"
          ],
          "instructions": "Review the drafted RFI response for technical accuracy before it's sent to the requester. Approve to send, or reject to revise.\n\n${steps.draft_answer.output.text}"
        },
        {
          "id": "check_review",
          "type": "branch",
          "name": "Answer approved?",
          "dependsOn": [
            "lead_review"
          ],
          "config": {
            "condition": "${steps.lead_review.output.approved}"
          }
        },
        {
          "id": "send_response",
          "type": "notify",
          "name": "Send RFI response",
          "dependsOn": [
            "check_review"
          ],
          "when": "${steps.check_review.output.onTrue}",
          "config": {
            "channel": "email",
            "to": "${inputs.requester_email}",
            "subject": "RE: RFI \u2014 ${inputs.project_name}",
            "body": "Hi ${inputs.requester_name},\n\nThank you for your RFI. Our response:\n\n${steps.draft_answer.output.text}\n\nPlease reach out if anything is unclear."
          }
        },
        {
          "id": "answered",
          "type": "succeed",
          "name": "RFI answered",
          "dependsOn": [
            "send_response"
          ]
        },
        {
          "id": "revise",
          "type": "fail",
          "name": "Answer needs revision",
          "dependsOn": [
            "check_review"
          ],
          "when": "${steps.check_review.output.onFalse}",
          "config": {
            "reason": "RFI response rejected in review \u2014 revise and re-run."
          }
        }
      ]
    }
  }
];
