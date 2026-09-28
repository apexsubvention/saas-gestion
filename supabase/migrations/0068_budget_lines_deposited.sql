-- 0068_budget_lines_deposited.sql
-- Jade : refonte de la portion budget/facturation d'un dossier -- section « Ce qui a été déposé »
-- (budget déposé au programme, sous-traitants, montant accepté, % de subvention par poste),
-- DISTINCTE de billing_line_items (facturation au client, table séparée -- décision explicite :
-- deux tableaux, jamais fusionnés même si les montants se ressemblent souvent en pratique).
--
-- budget_lines existe depuis 0006 mais n'a jamais eu de repository/service/UI (confirmé : aucune
-- ligne n'a jamais été écrite en pratique) -- on l'étend plutôt que d'ajouter une nouvelle table.
-- Même pattern « Tracked » (auto/override/by/at, jamais destructeur) que project_suppliers
-- (accepted_subsidy_auto/override, voir 0036) : une valeur lue automatiquement (génération à partir
-- de la convention) reste modifiable à la main sans jamais être perdue -- « Revenir au calcul
-- automatique » redonne exactement la valeur lue, elle n'est jamais écrasée par la correction.

alter table budget_lines
  add column deposited_amount_auto numeric(14,2),
  add column deposited_amount_override numeric(14,2),
  add column deposited_amount_override_by uuid references organization_users(id),
  add column deposited_amount_override_at timestamptz,
  add column accepted_amount_auto numeric(14,2),
  add column accepted_amount_override numeric(14,2),
  add column accepted_amount_override_by uuid references organization_users(id),
  add column accepted_amount_override_at timestamptz,
  add column subsidy_rate_auto numeric(5,4),
  add column subsidy_rate_override numeric(5,4),
  add column source text not null default 'manual' check (source in ('ai','manual')),
  add column position int not null default 0;

-- approved_amount (colonne d'origine, jamais utilisée en pratique -- confirmé, table vide) migrée
-- vers accepted_amount_override pour ne rien perdre si des lignes existaient malgré tout :
update budget_lines set accepted_amount_override = approved_amount where approved_amount is not null and approved_amount <> 0;
alter table budget_lines drop column approved_amount;

-- Vue « Suivi budgétaire » (Bundle 2, préparée ici pour ne pas refaire une migration séparée) --
-- étend budget_line_actuals (0017) avec les montants déposé/accepté/taux effectifs (override si
-- présent, sinon auto) à côté de spent/claimed/paid déjà calculés à partir des vraies transactions.
-- security_invoker = true conservé (RLS des tables sous-jacentes, jamais contournée).
create or replace view budget_line_actuals
with (security_invoker = true)
as
select
  bl.id as budget_line_id,
  bl.grant_project_id,
  bl.category,
  bl.supplier_id,
  bl.source,
  coalesce(bl.deposited_amount_override, bl.deposited_amount_auto) as deposited_amount,
  coalesce(bl.accepted_amount_override, bl.accepted_amount_auto) as accepted_amount,
  coalesce(bl.subsidy_rate_override, bl.subsidy_rate_auto) as subsidy_rate,
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
  bl.category,
  bl.supplier_id,
  bl.source,
  bl.deposited_amount_override,
  bl.deposited_amount_auto,
  bl.accepted_amount_override,
  bl.accepted_amount_auto,
  bl.subsidy_rate_override,
  bl.subsidy_rate_auto;

-- Jade : le coût total/montant approuvé/taux du dossier n'étaient modifiables qu'à la création --
-- désormais éditables en tout temps depuis la nouvelle section « Ce qui a été déposé » (mode
-- simple, tant qu'aucun poste détaillé n'existe). Aucune colonne à ajouter (déjà sur
-- grant_projects) -- seul un repository.updateFinancials()/service manquait, ajouté en TypeScript.
