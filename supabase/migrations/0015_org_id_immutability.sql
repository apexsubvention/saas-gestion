-- ============================================================
-- 0014b_org_id_immutability.sql
-- ============================================================


-- Filet de securite generique : organization_id ne doit JAMAIS pouvoir changer une fois
-- la ligne creee, sur AUCUNE table. Complement structurel aux policies RLS (qui restent
-- necessaires pour le reste), pas un remplacement : meme un admin ne peut pas deplacer
-- une ligne d'un tenant a un autre par UPDATE.
create or replace function prevent_organization_id_change()
returns trigger language plpgsql as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception '%: organization_id is immutable and cannot be changed', TG_TABLE_NAME;
  end if;
  return new;
end;
$$;

create trigger trg_organization_users_org_immutable before update on organization_users for each row execute function prevent_organization_id_change();
create trigger trg_clients_org_immutable before update on clients for each row execute function prevent_organization_id_change();
create trigger trg_client_access_org_immutable before update on client_access for each row execute function prevent_organization_id_change();
create trigger trg_contacts_org_immutable before update on contacts for each row execute function prevent_organization_id_change();
create trigger trg_client_portal_users_org_immutable before update on client_portal_users for each row execute function prevent_organization_id_change();
create trigger trg_grant_programs_org_immutable before update on grant_programs for each row execute function prevent_organization_id_change();
create trigger trg_program_knowledge_items_org_immutable before update on program_knowledge_items for each row execute function prevent_organization_id_change();
create trigger trg_grant_projects_org_immutable before update on grant_projects for each row execute function prevent_organization_id_change();
create trigger trg_grant_applications_org_immutable before update on grant_applications for each row execute function prevent_organization_id_change();
create trigger trg_application_sections_org_immutable before update on application_sections for each row execute function prevent_organization_id_change();
create trigger trg_application_questions_org_immutable before update on application_questions for each row execute function prevent_organization_id_change();
create trigger trg_application_answers_org_immutable before update on application_answers for each row execute function prevent_organization_id_change();
create trigger trg_grant_agreements_org_immutable before update on grant_agreements for each row execute function prevent_organization_id_change();
create trigger trg_milestones_org_immutable before update on milestones for each row execute function prevent_organization_id_change();
create trigger trg_project_suppliers_org_immutable before update on project_suppliers for each row execute function prevent_organization_id_change();
create trigger trg_budget_lines_org_immutable before update on budget_lines for each row execute function prevent_organization_id_change();
create trigger trg_tasks_org_immutable before update on tasks for each row execute function prevent_organization_id_change();
create trigger trg_documents_org_immutable before update on documents for each row execute function prevent_organization_id_change();
create trigger trg_document_versions_org_immutable before update on document_versions for each row execute function prevent_organization_id_change();
create trigger trg_expenses_org_immutable before update on expenses for each row execute function prevent_organization_id_change();
create trigger trg_expected_invoices_org_immutable before update on expected_invoices for each row execute function prevent_organization_id_change();
create trigger trg_claims_org_immutable before update on claims for each row execute function prevent_organization_id_change();
create trigger trg_claim_expenses_org_immutable before update on claim_expenses for each row execute function prevent_organization_id_change();
create trigger trg_claim_requirements_org_immutable before update on claim_requirements for each row execute function prevent_organization_id_change();
create trigger trg_document_requests_org_immutable before update on document_requests for each row execute function prevent_organization_id_change();
create trigger trg_document_links_org_immutable before update on document_links for each row execute function prevent_organization_id_change();
create trigger trg_activities_org_immutable before update on activities for each row execute function prevent_organization_id_change();
create trigger trg_opportunities_org_immutable before update on opportunities for each row execute function prevent_organization_id_change();
create trigger trg_gmail_connections_org_immutable before update on gmail_connections for each row execute function prevent_organization_id_change();
create trigger trg_emails_org_immutable before update on emails for each row execute function prevent_organization_id_change();
create trigger trg_funding_opportunities_org_immutable before update on funding_opportunities for each row execute function prevent_organization_id_change();
create trigger trg_meetings_org_immutable before update on meetings for each row execute function prevent_organization_id_change();
create trigger trg_meeting_insights_org_immutable before update on meeting_insights for each row execute function prevent_organization_id_change();
create trigger trg_notifications_org_immutable before update on notifications for each row execute function prevent_organization_id_change();
create trigger trg_reminder_rules_org_immutable before update on reminder_rules for each row execute function prevent_organization_id_change();
create trigger trg_audit_logs_org_immutable before update on audit_logs for each row execute function prevent_organization_id_change();
create trigger trg_ai_audit_logs_org_immutable before update on ai_audit_logs for each row execute function prevent_organization_id_change();


