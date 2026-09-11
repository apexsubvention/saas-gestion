-- ============================================================
-- 0015_rls_policies.sql
-- Une seule policy par commande (select/insert/update/delete).
-- Exception documentee: document_requests_select (staff + portail).
-- write_check ne re-questionne jamais la ligne par son propre id (voir Mission 1 #3).
-- ============================================================


alter table organizations enable row level security;

create policy "organizations_select" on organizations
  for select using (is_org_member(id));

create policy "organizations_update" on organizations
  for update using (has_org_role(id, 'admin')) with check (has_org_role(id, 'admin'));
-- pas de policy insert/delete pour le role authenticated : cree/supprime uniquement via service role (provisioning).

alter table organization_users enable row level security;

create policy "organization_users_select" on organization_users
  for select using (is_org_member(organization_id));

create policy "organization_users_insert" on organization_users
  for insert with check (has_org_role(organization_id, 'admin'));

create policy "organization_users_update" on organization_users
  for update
  using (has_org_role(organization_id, 'admin'))
  with check (has_org_role(organization_id, 'admin'));

create policy "organization_users_delete" on organization_users
  for delete using (has_org_role(organization_id, 'admin'));


alter table clients enable row level security;

create policy "clients_select" on clients
  for select using (can_access_client(id));

create policy "clients_insert" on clients
  for insert with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')));

create policy "clients_update" on clients
  for update
  using (can_access_client(id))
  with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')));

create policy "clients_delete" on clients
  for delete using (has_org_role(organization_id, 'admin'));


alter table client_access enable row level security;

create policy "client_access_select" on client_access
  for select using (
    has_org_role(organization_id, 'admin')
    or user_id = current_org_user_id(organization_id)
  );

create policy "client_access_insert" on client_access
  for insert with check (has_org_role(organization_id, 'admin'));

create policy "client_access_delete" on client_access
  for delete using (has_org_role(organization_id, 'admin'));
-- pas d'update : on retire/ajoute une ligne, on ne "modifie" pas un acces.


alter table contacts enable row level security;

create policy "contacts_select" on contacts
  for select using (can_access_client(client_id));

create policy "contacts_insert" on contacts
  for insert with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')) and can_access_client(client_id));

create policy "contacts_update" on contacts
  for update
  using (can_access_client(client_id))
  with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')) and can_access_client(client_id));

create policy "contacts_delete" on contacts
  for delete using (has_org_role(organization_id, 'admin'));


alter table client_portal_users enable row level security;

create policy "client_portal_users_select" on client_portal_users
  for select using (has_org_role(organization_id, 'admin'));

create policy "client_portal_users_insert" on client_portal_users
  for insert with check (has_org_role(organization_id, 'admin'));

create policy "client_portal_users_update" on client_portal_users
  for update
  using (has_org_role(organization_id, 'admin'))
  with check (has_org_role(organization_id, 'admin'));

create policy "client_portal_users_delete" on client_portal_users
  for delete using (has_org_role(organization_id, 'admin'));


alter table grant_programs enable row level security;

create policy "grant_programs_select" on grant_programs
  for select using (is_org_member(organization_id));

create policy "grant_programs_insert" on grant_programs
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "grant_programs_update" on grant_programs
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "grant_programs_delete" on grant_programs
  for delete using (has_org_role(organization_id, 'admin'));


alter table program_knowledge_items enable row level security;

create policy "program_knowledge_items_select" on program_knowledge_items
  for select using (is_org_member(organization_id));

create policy "program_knowledge_items_insert" on program_knowledge_items
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "program_knowledge_items_update" on program_knowledge_items
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "program_knowledge_items_delete" on program_knowledge_items
  for delete using (has_org_role(organization_id, 'admin'));


alter table funding_opportunities enable row level security;

create policy "funding_opportunities_select" on funding_opportunities
  for select using (is_org_member(organization_id));

create policy "funding_opportunities_insert" on funding_opportunities
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "funding_opportunities_update" on funding_opportunities
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "funding_opportunities_delete" on funding_opportunities
  for delete using (has_org_role(organization_id, 'admin'));


alter table reminder_rules enable row level security;

create policy "reminder_rules_select" on reminder_rules
  for select using (is_org_member(organization_id));

create policy "reminder_rules_insert" on reminder_rules
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "reminder_rules_update" on reminder_rules
  for update
  using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "reminder_rules_delete" on reminder_rules
  for delete using (has_org_role(organization_id, 'admin'));


alter table grant_projects enable row level security;

create policy "grant_projects_select" on grant_projects
  for select using (can_access_grant_project(id));

create policy "grant_projects_insert" on grant_projects
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_client(client_id)
  );

create policy "grant_projects_update" on grant_projects
  for update
  using (can_access_grant_project(id))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_client(client_id)
  );

create policy "grant_projects_delete" on grant_projects
  for delete using (has_org_role(organization_id, 'admin'));


alter table grant_applications enable row level security;

create policy "grant_applications_select" on grant_applications
  for select using (can_access_grant_project(grant_project_id));

create policy "grant_applications_insert" on grant_applications
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "grant_applications_update" on grant_applications
  for update
  using (can_access_grant_project(grant_project_id))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "grant_applications_delete" on grant_applications
  for delete using (has_org_role(organization_id, 'admin'));


alter table grant_agreements enable row level security;

create policy "grant_agreements_select" on grant_agreements
  for select using (can_access_grant_project(grant_project_id));

create policy "grant_agreements_insert" on grant_agreements
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "grant_agreements_update" on grant_agreements
  for update
  using (can_access_grant_project(grant_project_id))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "grant_agreements_delete" on grant_agreements
  for delete using (has_org_role(organization_id, 'admin'));


alter table milestones enable row level security;

create policy "milestones_select" on milestones
  for select using (can_access_grant_project(grant_project_id));

create policy "milestones_insert" on milestones
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "milestones_update" on milestones
  for update
  using (can_access_grant_project(grant_project_id))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "milestones_delete" on milestones
  for delete using (has_org_role(organization_id, 'admin'));


alter table project_suppliers enable row level security;

create policy "project_suppliers_select" on project_suppliers
  for select using (can_access_grant_project(grant_project_id));

create policy "project_suppliers_insert" on project_suppliers
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "project_suppliers_update" on project_suppliers
  for update
  using (can_access_grant_project(grant_project_id))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "project_suppliers_delete" on project_suppliers
  for delete using (has_org_role(organization_id, 'admin'));


alter table budget_lines enable row level security;

create policy "budget_lines_select" on budget_lines
  for select using (can_access_grant_project(grant_project_id));

create policy "budget_lines_insert" on budget_lines
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "budget_lines_update" on budget_lines
  for update
  using (can_access_grant_project(grant_project_id))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "budget_lines_delete" on budget_lines
  for delete using (has_org_role(organization_id, 'admin'));


alter table expenses enable row level security;

create policy "expenses_select" on expenses
  for select using (can_access_grant_project(grant_project_id));

create policy "expenses_insert" on expenses
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "expenses_update" on expenses
  for update
  using (can_access_grant_project(grant_project_id))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "expenses_delete" on expenses
  for delete using (has_org_role(organization_id, 'admin'));


alter table claims enable row level security;

create policy "claims_select" on claims
  for select using (can_access_grant_project(grant_project_id));

create policy "claims_insert" on claims
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "claims_update" on claims
  for update
  using (can_access_grant_project(grant_project_id))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and can_access_grant_project(grant_project_id)
  );

create policy "claims_delete" on claims
  for delete using (has_org_role(organization_id, 'admin'));


alter table expected_invoices enable row level security;

create policy "expected_invoices_select" on expected_invoices
  for select using (exists (select 1 from project_suppliers p where p.id = expected_invoices.supplier_id and can_access_grant_project(p.grant_project_id)));

create policy "expected_invoices_insert" on expected_invoices
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and exists (select 1 from project_suppliers p where p.id = expected_invoices.supplier_id and can_access_grant_project(p.grant_project_id))
  );

create policy "expected_invoices_update" on expected_invoices
  for update
  using (exists (select 1 from project_suppliers p where p.id = expected_invoices.supplier_id and can_access_grant_project(p.grant_project_id)))
  with check (exists (select 1 from project_suppliers p where p.id = expected_invoices.supplier_id and can_access_grant_project(p.grant_project_id)));

create policy "expected_invoices_delete" on expected_invoices
  for delete using (has_org_role(organization_id, 'admin'));


alter table claim_expenses enable row level security;

create policy "claim_expenses_select" on claim_expenses
  for select using (exists (select 1 from claims p where p.id = claim_expenses.claim_id and can_access_grant_project(p.grant_project_id)));

create policy "claim_expenses_insert" on claim_expenses
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and exists (select 1 from claims p where p.id = claim_expenses.claim_id and can_access_grant_project(p.grant_project_id))
  );

create policy "claim_expenses_update" on claim_expenses
  for update
  using (exists (select 1 from claims p where p.id = claim_expenses.claim_id and can_access_grant_project(p.grant_project_id)))
  with check (exists (select 1 from claims p where p.id = claim_expenses.claim_id and can_access_grant_project(p.grant_project_id)));

create policy "claim_expenses_delete" on claim_expenses
  for delete using (has_org_role(organization_id, 'admin'));


alter table claim_requirements enable row level security;

create policy "claim_requirements_select" on claim_requirements
  for select using (exists (select 1 from claims p where p.id = claim_requirements.claim_id and can_access_grant_project(p.grant_project_id)));

create policy "claim_requirements_insert" on claim_requirements
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and exists (select 1 from claims p where p.id = claim_requirements.claim_id and can_access_grant_project(p.grant_project_id))
  );

create policy "claim_requirements_update" on claim_requirements
  for update
  using (exists (select 1 from claims p where p.id = claim_requirements.claim_id and can_access_grant_project(p.grant_project_id)))
  with check (exists (select 1 from claims p where p.id = claim_requirements.claim_id and can_access_grant_project(p.grant_project_id)));

create policy "claim_requirements_delete" on claim_requirements
  for delete using (has_org_role(organization_id, 'admin'));


alter table documents enable row level security;

create policy "documents_select" on documents
  for select using (((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id))));

create policy "documents_insert" on documents
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id)))
  );

create policy "documents_update" on documents
  for update
  using (((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id))))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id)))
  );

create policy "documents_delete" on documents
  for delete using (has_org_role(organization_id, 'admin'));


alter table tasks enable row level security;

create policy "tasks_select" on tasks
  for select using (((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id))));

create policy "tasks_insert" on tasks
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id)))
  );

create policy "tasks_update" on tasks
  for update
  using (((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id))))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id)))
  );

create policy "tasks_delete" on tasks
  for delete using (has_org_role(organization_id, 'admin'));


alter table meetings enable row level security;

create policy "meetings_select" on meetings
  for select using (((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id))));

create policy "meetings_insert" on meetings
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id)))
  );

create policy "meetings_update" on meetings
  for update
  using (((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id))))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id)))
  );

create policy "meetings_delete" on meetings
  for delete using (has_org_role(organization_id, 'admin'));


alter table activities enable row level security;

create policy "activities_select" on activities
  for select using (((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id))));

create policy "activities_insert" on activities
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id)))
  );

create policy "activities_update" on activities
  for update
  using (((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id))))
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and ((grant_project_id is not null and can_access_grant_project(grant_project_id)) or (client_id is not null and can_access_client(client_id)))
  );

create policy "activities_delete" on activities
  for delete using (has_org_role(organization_id, 'admin'));


alter table emails enable row level security;

create policy "emails_select" on emails
  for select using (
    (client_id is not null and can_access_client(client_id))
    or (client_id is null and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')))
  );

create policy "emails_insert" on emails
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "emails_update" on emails
  for update
  using (
    (client_id is not null and can_access_client(client_id))
    or (client_id is null and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')))
  )
  with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "emails_delete" on emails
  for delete using (has_org_role(organization_id, 'admin'));


alter table gmail_connections enable row level security;

create policy "gmail_connections_select" on gmail_connections
  for select using (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
  );

create policy "gmail_connections_insert" on gmail_connections
  for insert with check (has_org_role(organization_id, 'admin'));

create policy "gmail_connections_update" on gmail_connections
  for update
  using (has_org_role(organization_id, 'admin'))
  with check (has_org_role(organization_id, 'admin'));

create policy "gmail_connections_delete" on gmail_connections
  for delete using (has_org_role(organization_id, 'admin'));


alter table document_requests enable row level security;

create policy "document_requests_select" on document_requests
  for select using (can_access_client(client_id));

create policy "document_requests_insert" on document_requests
  for insert with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')) and can_access_client(client_id));

create policy "document_requests_update" on document_requests
  for update
  using (can_access_client(client_id))
  with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')) and can_access_client(client_id));

create policy "document_requests_delete" on document_requests
  for delete using (has_org_role(organization_id, 'admin'));


create policy "document_requests_portal_select" on document_requests
  for select using (is_client_portal_user(client_id) and visible_in_client_portal = true);


alter table opportunities enable row level security;

create policy "opportunities_select" on opportunities
  for select using (can_access_client(client_id));

create policy "opportunities_insert" on opportunities
  for insert with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')) and can_access_client(client_id));

create policy "opportunities_update" on opportunities
  for update
  using (can_access_client(client_id))
  with check (is_org_member(organization_id) and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee')) and can_access_client(client_id));

create policy "opportunities_delete" on opportunities
  for delete using (has_org_role(organization_id, 'admin'));


alter table application_sections enable row level security;

create policy "application_sections_select" on application_sections
  for select using (exists (select 1 from grant_applications p where p.id = application_sections.application_id and can_access_grant_project(p.grant_project_id)));

create policy "application_sections_insert" on application_sections
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and exists (select 1 from grant_applications p where p.id = application_sections.application_id and can_access_grant_project(p.grant_project_id))
  );

create policy "application_sections_update" on application_sections
  for update
  using (exists (select 1 from grant_applications p where p.id = application_sections.application_id and can_access_grant_project(p.grant_project_id)))
  with check (exists (select 1 from grant_applications p where p.id = application_sections.application_id and can_access_grant_project(p.grant_project_id)));

create policy "application_sections_delete" on application_sections
  for delete using (has_org_role(organization_id, 'admin'));


alter table application_questions enable row level security;

create policy "application_questions_select" on application_questions
  for select using (exists (select 1 from application_sections p where p.id = application_questions.section_id and exists (select 1 from grant_applications ga where ga.id = p.application_id and can_access_grant_project(ga.grant_project_id))));

create policy "application_questions_insert" on application_questions
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and exists (select 1 from application_sections p where p.id = application_questions.section_id and exists (select 1 from grant_applications ga where ga.id = p.application_id and can_access_grant_project(ga.grant_project_id)))
  );

create policy "application_questions_update" on application_questions
  for update
  using (exists (select 1 from application_sections p where p.id = application_questions.section_id and exists (select 1 from grant_applications ga where ga.id = p.application_id and can_access_grant_project(ga.grant_project_id))))
  with check (exists (select 1 from application_sections p where p.id = application_questions.section_id and exists (select 1 from grant_applications ga where ga.id = p.application_id and can_access_grant_project(ga.grant_project_id))));

create policy "application_questions_delete" on application_questions
  for delete using (has_org_role(organization_id, 'admin'));


alter table application_answers enable row level security;

create policy "application_answers_select" on application_answers
  for select using (exists (select 1 from application_questions p where p.id = application_answers.question_id and exists (select 1 from application_sections s join grant_applications ga on ga.id = s.application_id where s.id = p.section_id and can_access_grant_project(ga.grant_project_id))));

create policy "application_answers_insert" on application_answers
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and exists (select 1 from application_questions p where p.id = application_answers.question_id and exists (select 1 from application_sections s join grant_applications ga on ga.id = s.application_id where s.id = p.section_id and can_access_grant_project(ga.grant_project_id)))
  );

create policy "application_answers_update" on application_answers
  for update
  using (exists (select 1 from application_questions p where p.id = application_answers.question_id and exists (select 1 from application_sections s join grant_applications ga on ga.id = s.application_id where s.id = p.section_id and can_access_grant_project(ga.grant_project_id))))
  with check (exists (select 1 from application_questions p where p.id = application_answers.question_id and exists (select 1 from application_sections s join grant_applications ga on ga.id = s.application_id where s.id = p.section_id and can_access_grant_project(ga.grant_project_id))));

create policy "application_answers_delete" on application_answers
  for delete using (has_org_role(organization_id, 'admin'));


alter table document_versions enable row level security;

create policy "document_versions_select" on document_versions
  for select using (exists (select 1 from documents p where p.id = document_versions.document_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id)))));

create policy "document_versions_insert" on document_versions
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and exists (select 1 from documents p where p.id = document_versions.document_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id))))
  );

create policy "document_versions_update" on document_versions
  for update
  using (exists (select 1 from documents p where p.id = document_versions.document_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id)))))
  with check (exists (select 1 from documents p where p.id = document_versions.document_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id)))));

create policy "document_versions_delete" on document_versions
  for delete using (has_org_role(organization_id, 'admin'));


alter table meeting_insights enable row level security;

create policy "meeting_insights_select" on meeting_insights
  for select using (exists (select 1 from meetings p where p.id = meeting_insights.meeting_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id)))));

create policy "meeting_insights_insert" on meeting_insights
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and exists (select 1 from meetings p where p.id = meeting_insights.meeting_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id))))
  );

create policy "meeting_insights_update" on meeting_insights
  for update
  using (exists (select 1 from meetings p where p.id = meeting_insights.meeting_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id)))))
  with check (exists (select 1 from meetings p where p.id = meeting_insights.meeting_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id)))));

create policy "meeting_insights_delete" on meeting_insights
  for delete using (has_org_role(organization_id, 'admin'));


alter table document_links enable row level security;

create policy "document_links_select" on document_links
  for select using (exists (select 1 from documents p where p.id = document_links.document_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id)))));

create policy "document_links_insert" on document_links
  for insert with check (
    is_org_member(organization_id)
    and (has_org_role(organization_id,'admin') or has_org_role(organization_id,'employee'))
    and exists (select 1 from documents p where p.id = document_links.document_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id))))
  );

create policy "document_links_update" on document_links
  for update
  using (exists (select 1 from documents p where p.id = document_links.document_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id)))))
  with check (exists (select 1 from documents p where p.id = document_links.document_id and ((p.grant_project_id is not null and can_access_grant_project(p.grant_project_id)) or (p.client_id is not null and can_access_client(p.client_id)))));

create policy "document_links_delete" on document_links
  for delete using (has_org_role(organization_id, 'admin'));


alter table notifications enable row level security;

create policy "notifications_select" on notifications
  for select using (user_id = current_org_user_id(organization_id));

create policy "notifications_update" on notifications
  for update
  using (user_id = current_org_user_id(organization_id))
  with check (user_id = current_org_user_id(organization_id));

create policy "notifications_delete" on notifications
  for delete using (user_id = current_org_user_id(organization_id));
-- pas d'insert cote client : generees par les services serveur (service role, RLS non applicable).


alter table audit_logs enable row level security;

create policy "audit_logs_select" on audit_logs
  for select using (has_org_role(organization_id, 'admin'));
-- pas d'insert/update/delete pour authenticated : ecrits uniquement par les services serveur.

alter table ai_audit_logs enable row level security;

create policy "ai_audit_logs_select" on ai_audit_logs
  for select using (has_org_role(organization_id, 'admin'));
