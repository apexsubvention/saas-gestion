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

-- "if not exists" sur chaque colonne : rend le fichier rejouable sans erreur si un run précédent
-- avait déjà appliqué cette partie avant d'échouer plus loin (voir plus bas).
alter table budget_lines
  add column if not exists deposited_amount_auto numeric(14,2),
  add column if not exists deposited_amount_override numeric(14,2),
  add column if not exists deposited_amount_override_by uuid references organization_users(id),
  add column if not exists deposited_amount_override_at timestamptz,
  add column if not exists accepted_amount_auto numeric(14,2),
  add column if not exists accepted_amount_override numeric(14,2),
  add column if not exists accepted_amount_override_by uuid references organization_users(id),
  add column if not exists accepted_amount_override_at timestamptz,
  add column if not exists subsidy_rate_auto numeric(5,4),
  add column if not exists subsidy_rate_override numeric(5,4),
  add column if not exists source text not null default 'manual' check (source in ('ai','manual')),
  add column if not exists position int not null default 0;

-- approved_amount (colonne d'origine, jamais utilisée en pratique -- confirmé, table vide) migrée
-- vers accepted_amount_override pour ne rien perdre si des lignes existaient malgré tout. Fait
-- AVANT de toucher la vue ci-dessous (aucune dépendance encore cassée à ce stade). Protégé par un
-- test d'existence de la colonne : si un run précédent l'avait déjà supprimée plus bas, cette
-- étape ne fait rien plutôt que d'échouer sur une colonne qui n'existe plus.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'budget_lines' and column_name = 'approved_amount'
  ) then
    update budget_lines
      set accepted_amount_override = approved_amount
      where approved_amount is not null and approved_amount <> 0 and accepted_amount_override is null;
  end if;
end $$;

-- Vue « Suivi budgétaire » (Bundle 2, préparée ici pour ne pas refaire une migration séparée) --
-- étend budget_line_actuals (0017) avec les montants déposé/accepté/taux effectifs (override si
-- présent, sinon auto) à côté de spent/claimed/paid déjà calculés à partir des vraies transactions.
-- security_invoker = true conservé (RLS des tables sous-jacentes, jamais contournée).
--
-- IMPORTANT : DROP VIEW + CREATE VIEW, jamais CREATE OR REPLACE VIEW ici. CREATE OR REPLACE
-- interdit d'insérer une colonne au milieu d'une vue déjà existante -- chaque colonne déjà
-- exposée doit garder EXACTEMENT le même nom à la même position, seul un ajout à la toute fin
-- est permis. L'ancienne vue (0017) exposait, dans cet ordre : budget_line_id, grant_project_id,
-- approved_amount, spent_amount, claimed_amount, paid_amount -- category/supplier_id/... ne
-- peuvent pas prendre la 3e position (où était approved_amount) via CREATE OR REPLACE, d'où
-- l'erreur "cannot change name of view column approved_amount to category" (SQLSTATE 42P16)
-- obtenue lors du premier npx supabase db push. Un DROP + CREATE n'a pas cette contrainte de
-- position, et rien d'autre dans l'app ne dépend de cette vue (confirmé) donc rien à recasser.
drop view if exists budget_line_actuals;

create view budget_line_actuals
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

-- La vue ne dépend plus de approved_amount : elle peut maintenant être supprimée sans erreur.
-- "if exists" au cas où un run précédent l'aurait déjà fait avant d'échouer plus loin.
alter table budget_lines drop column if exists approved_amount;

-- budget_lines_delete (0016) était réservée aux admins -- une restriction plus stricte que
-- billing_line_items_delete (0042 : is_org_staff, admin OU employé), qui gère la même sorte
-- d'opération (replaceAll d'une lecture de convention, incluant le retrait des lignes obsolètes).
-- Cette table redevient un tableau actif du dossier (comme Fournisseurs/Aide à la facturation, où
-- tout membre du personnel peut déjà ajouter/modifier/retirer une ligne) -- alignée ici sur le même
-- droit, pour que « Générer depuis la convention » (qui retire les postes IA obsolètes) et la
-- suppression manuelle d'un poste ne soient pas silencieusement bloquées pour un employé.
-- "if exists" sur le drop : ne jamais échouer si un run précédent avait déjà recréé la policy.
drop policy if exists "budget_lines_delete" on budget_lines;
create policy "budget_lines_delete" on budget_lines
  for delete using (is_org_staff(organization_id) and can_access_grant_project(grant_project_id));

-- Jade : le coût total/montant approuvé/taux du dossier n'étaient modifiables qu'à la création --
-- désormais éditables en tout temps depuis la nouvelle section « Ce qui a été déposé » (mode
-- simple, tant qu'aucun poste détaillé n'existe). Aucune colonne à ajouter (déjà sur
-- grant_projects) -- seul un repository.updateFinancials()/service manquait, ajouté en TypeScript.
