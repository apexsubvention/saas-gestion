-- 0066_invoice_paid_notification.sql
--
-- Jade : « quand une facture, envoyée mais pas encore payée, passe à payée par le client (portail),
-- j'aimerais un notif pour m'avertir » -- visible dans la cloche de notifications (dashboard),
-- avant même d'ouvrir le dossier concerné. Nouveau type 'invoice_paid', déclenché depuis le portail
-- (src/app/(portal)/portal/(app)/actions.ts) avec le client admin (service role), puisqu'un compte
-- portail ne remplit jamais is_org_staff(organization_id) exigé par notifications_insert_staff (0038).

alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'deadline','document_missing','invoice_missing','email_waiting',
  'new_prospect','claim_due','budget_warning','client_followup','meeting_task',
  'task_assigned','ai_review','general','opportunity_interest','invoice_paid'
));
