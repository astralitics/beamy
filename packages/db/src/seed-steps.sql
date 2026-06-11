-- Example reusable step templates — Dev Workspace (construction) + Green Valley Landscaping.
-- Idempotent: clears prior seeded rows, then re-inserts. Run with:
--   docker exec -i supabase_db_beamy psql -U postgres -d postgres < packages/db/src/seed-steps.sql
delete from step_templates
where org_id = '00000000-0000-0000-0000-000000000010' and created_by = 'agent:seed';

insert into step_templates
  (org_id, name, slug, step_type, summary, config, inputs, outputs, instructions, status, created_by, updated_by)
values
(
  '00000000-0000-0000-0000-000000000010',
  'Draft kitchen estimate', 'draft-kitchen-estimate', 'ai_agent_task',
  'AI drafts a line-item kitchen estimate from comparable projects.',
  '{"prompt":"Draft a line-item kitchen renovation estimate from the scope and the comparable projects. Return a structured estimate plus a short narrative."}'::jsonb,
  '[{"name":"scope","type":"text"},{"name":"comparables","type":"list"}]'::jsonb,
  '[{"id":"estimate","name":"Estimate","type":"structured","required":true,"verifications":[{"kind":"not_null"}]},{"id":"narrative","name":"Narrative","type":"text","required":true,"verifications":[{"kind":"min_words","params":{"n":40}},{"kind":"no_pii"}]}]'::jsonb,
  'Draft a kitchen renovation estimate from the scope and comparable projects.',
  'published', 'agent:seed', 'agent:seed'
),
(
  '00000000-0000-0000-0000-000000000010',
  'PM approval', 'pm-approval', 'human_approval',
  'Project manager approves before the estimate goes to the client.',
  null,
  '[]'::jsonb,
  '[{"id":"decision","name":"Decision","type":"decision","required":true,"verifications":[{"kind":"was_approved"},{"kind":"has_reason"}]}]'::jsonb,
  'Review the estimate and approve, or reject with a reason.',
  'published', 'agent:seed', 'agent:seed'
),
(
  '00000000-0000-0000-0000-000000000010',
  'Site photo report', 'site-photo-report', 'human_input',
  'Field tech captures at least 3 site photos with a progress note.',
  null,
  '[]'::jsonb,
  '[{"id":"photos","name":"Photos","type":"photo-set","required":true,"verifications":[{"kind":"min_count","params":{"n":3}}]},{"id":"note","name":"Note","type":"text","required":false,"verifications":[{"kind":"min_words","params":{"n":5}}]}]'::jsonb,
  'Capture at least 3 site photos and a short note on progress.',
  'published', 'agent:seed', 'agent:seed'
),
(
  '00000000-0000-0000-0000-000000000010',
  'Fetch QuickBooks invoice', 'fetch-qb-invoice', 'http_call',
  'Pulls an invoice from QuickBooks Online by id.',
  '{"method":"GET","url":"https://quickbooks.api/v3/company/realm/invoice/${inputs.invoiceId}"}'::jsonb,
  '[{"name":"invoiceId","type":"scalar"}]'::jsonb,
  '[{"id":"invoice","name":"Invoice","type":"structured","required":true,"verifications":[{"kind":"not_null"}]}]'::jsonb,
  'Fetch the invoice from QuickBooks by id.',
  'published', 'agent:seed', 'agent:seed'
),
(
  '00000000-0000-0000-0000-000000000010',
  'Upload site pictures', 'upload-site-pictures', 'human_input',
  'Upload at least 4 site pictures (JPG or PNG). Criteria are designed per evaluation.',
  null,
  '[]'::jsonb,
  '[{"id":"pictures","name":"Pictures","type":"photo-set","required":true,"verifications":[]}]'::jsonb,
  'Upload at least 4 site pictures, JPG or PNG.',
  'published', 'agent:seed', 'agent:seed'
);

-- Green Valley Landscaping (landscaping vertical).
delete from step_templates
where org_id = '00000000-0000-0000-0000-000000000020' and created_by = 'agent:seed';

insert into step_templates
  (org_id, name, slug, step_type, summary, config, inputs, outputs, instructions, status, created_by, updated_by)
values
(
  '00000000-0000-0000-0000-000000000020',
  'Draft planting plan', 'draft-planting-plan', 'ai_agent_task',
  'AI drafts a planting plan from the site assessment and chosen palette.',
  '{"prompt":"Draft a planting plan from the site assessment and plant palette. Return a structured plan plus a short rationale."}'::jsonb,
  '[{"name":"siteAssessment","type":"structured"},{"name":"palette","type":"list"}]'::jsonb,
  '[{"id":"plan","name":"Planting plan","type":"structured","required":true,"verifications":[{"kind":"not_null"}]},{"id":"rationale","name":"Rationale","type":"text","required":true,"verifications":[{"kind":"min_words","params":{"n":40}},{"kind":"no_pii"}]}]'::jsonb,
  'Draft a planting plan from the site assessment and the chosen plant palette.',
  'published', 'agent:seed', 'agent:seed'
),
(
  '00000000-0000-0000-0000-000000000020',
  'Client design approval', 'client-design-approval', 'human_approval',
  'Homeowner approves the landscape design before installation.',
  null,
  '[]'::jsonb,
  '[{"id":"decision","name":"Decision","type":"decision","required":true,"verifications":[{"kind":"was_approved"},{"kind":"has_reason"}]}]'::jsonb,
  'Review the design with the client and capture approval, or a reason if declined.',
  'published', 'agent:seed', 'agent:seed'
),
(
  '00000000-0000-0000-0000-000000000020',
  'Site assessment', 'site-assessment', 'human_input',
  'Crew lead captures site photos plus soil and sun-exposure notes.',
  null,
  '[]'::jsonb,
  '[{"id":"photos","name":"Photos","type":"photo-set","required":true,"verifications":[{"kind":"min_count","params":{"n":4}}]},{"id":"notes","name":"Soil & sun notes","type":"text","required":true,"verifications":[{"kind":"min_words","params":{"n":10}}]}]'::jsonb,
  'Capture at least 4 site photos and notes on soil and sun exposure.',
  'published', 'agent:seed', 'agent:seed'
),
(
  '00000000-0000-0000-0000-000000000020',
  'Generate plant order list', 'generate-plant-order-list', 'ai_agent_task',
  'Produces a deduplicated plant order list with quantities from the plan.',
  '{"prompt":"From the planting plan, produce a deduplicated plant order list with quantities."}'::jsonb,
  '[{"name":"plan","type":"structured"}]'::jsonb,
  '[{"id":"plants","name":"Plant list","type":"list","required":true,"verifications":[{"kind":"min_count","params":{"n":3}},{"kind":"no_duplicates"}]}]'::jsonb,
  'From the planting plan, produce a deduplicated plant order list with quantities.',
  'published', 'agent:seed', 'agent:seed'
),
(
  '00000000-0000-0000-0000-000000000020',
  'Schedule seasonal maintenance', 'schedule-seasonal-maintenance', 'notify',
  'Notifies the crew of the next seasonal maintenance visit.',
  '{"channel":"email","to":"crew@greenvalley.example"}'::jsonb,
  '[{"name":"visitDate","type":"scalar"},{"name":"propertyId","type":"scalar"}]'::jsonb,
  '[{"id":"sent","name":"Notification","type":"event","required":true,"verifications":[{"kind":"was_emitted"}]}]'::jsonb,
  'Notify the crew of the scheduled seasonal maintenance visit.',
  'published', 'agent:seed', 'agent:seed'
),
(
  '00000000-0000-0000-0000-000000000020',
  'Upload site pictures', 'upload-site-pictures', 'human_input',
  'Upload at least 4 site pictures (JPG or PNG). Criteria are designed per evaluation.',
  null,
  '[]'::jsonb,
  '[{"id":"pictures","name":"Pictures","type":"photo-set","required":true,"verifications":[]}]'::jsonb,
  'Upload at least 4 site pictures, JPG or PNG.',
  'published', 'agent:seed', 'agent:seed'
);
