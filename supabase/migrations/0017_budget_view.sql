-- 0017_budget_view.sql
-- Source de verite = transactions reelles (expenses + claim_expenses), pas de colonnes stockees.
--
-- security_invoker = true est OBLIGATOIRE : par defaut Postgres execute une vue avec les
-- droits de son PROPRIETAIRE (le role postgres/superuser cote Supabase), donc SANS passer
-- par la RLS des tables sous-jacentes -- une vue "normale" contournerait silencieusement
-- l'isolation multi-tenant. Avec security_invoker, la vue s'execute avec les droits de
-- l'appelant : les policies RLS de budget_lines/expenses/claim_expenses/claims s'appliquent
-- normalement, exactement comme si l'appelant avait ecrit la requete lui-meme.

create or replace view budget_line_actuals
with (security_invoker = true)
as
select
  bl.id as budget_line_id,
  bl.grant_project_id,
  bl.approved_amount,
  coalesce(sum(e.eligible_amount), 0)::numeric(14,2) as spent_amount,
  coalesce(sum(ce.claimed_amount), 0)::numeric(14,2) as claimed_amount,
  coalesce(
    sum(ce.claimed_amount) filter (where c.status = 'paid'),
    0
  )::numeric(14,2) as paid_amount
from budget_lines bl
left join expenses e on e.budget_line_id = bl.id
left join claim_expenses ce on ce.expense_id = e.id
left join claims c on c.id = ce.claim_id
group by
  bl.id,
  bl.grant_project_id,
  bl.approved_amount;
