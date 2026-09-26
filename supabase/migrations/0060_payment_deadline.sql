-- 0060_payment_deadline.sql
--
-- Jade : certaines conventions précisent un délai de paiement/facturation différent de la
-- simple fin de projet (ex. « le paiement peut être effectué jusqu'à 90 jours après la fin
-- du projet »), parfois une date fixe précise. Si rien n'est indiqué dans la convention, la
-- règle par défaut reste : tout doit être payé et facturé d'ici la fin du projet elle-même.
-- On stocke ici les FAITS BRUTS lus dans la convention (jamais un calcul fait par l'IA --
-- même principe que les autres champs de grant_agreements) ; la date effective et le texte
-- d'alerte affiché sont calculés en TypeScript pur (src/features/billing/paymentDeadline.ts).
alter table grant_agreements
  add column payment_deadline_date date,
  add column payment_deadline_days_after_end integer;

alter table grant_agreements
  add constraint grant_agreements_payment_deadline_days_check
  check (payment_deadline_days_after_end is null or (payment_deadline_days_after_end >= 0 and payment_deadline_days_after_end <= 3650));

comment on column grant_agreements.payment_deadline_date is
  'Date limite explicite de paiement/facturation lue dans la convention (prioritaire sur le délai en jours si les deux sont renseignés).';
comment on column grant_agreements.payment_deadline_days_after_end is
  'Délai de grâce en jours après la fin du projet pendant lequel le paiement peut encore être effectué, lu dans la convention.';

-- Portail fournisseur/sous-traitant (0047) : même repli Début/Fin/Montant approuvé/Taux que
-- côté client parent (portalDossiers.service.ts, cf. commentaire dans ce fichier) -- une
-- convention lue/saisie doit toujours l'emporter sur des champs "officiels" du projet
-- jamais renseignés à la main. Ajoute aussi les 2 nouveaux champs bruts de délai de
-- paiement, pour l'alerte affichée côté portail fournisseur.
--
-- Postgres refuse un simple "create or replace" quand la liste des colonnes de retour change
-- (RETURNS TABLE) : il faut d'abord supprimer l'ancienne fonction (SQLSTATE 42P13, "cannot
-- change return type of existing function").
drop function if exists portal_supplier_dossier_view(uuid);

create function portal_supplier_dossier_view(p_grant_project_id uuid)
returns table (
  grant_project_id uuid,
  grant_project_name text,
  status text,
  client_name text,
  program_name text,
  official_start_date date,
  official_end_date date,
  total_project_cost numeric,
  approved_grant_amount numeric,
  grant_rate numeric,
  payment_deadline_date date,
  payment_deadline_days_after_end integer,
  own_supplier_id uuid,
  own_budget_amount numeric,
  own_billing_frequency text,
  own_expected_invoice_day int,
  own_invoice_description_requirements text,
  other_suppliers_count int,
  other_suppliers_total numeric
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_own_supplier_client_id uuid;
begin
  if not can_access_grant_project_as_supplier(p_grant_project_id) then
    return; -- aucune ligne : accès refusé, pas d'exception (plus simple à gérer côté appelant)
  end if;

  select ps.supplier_client_id into v_own_supplier_client_id
  from project_suppliers ps
  where ps.grant_project_id = p_grant_project_id
    and ps.supplier_client_id is not null
    and can_access_client(ps.supplier_client_id)
  limit 1;

  return query
    select
      gp.id,
      gp.name,
      gp.status,
      c.name,
      prog.name,
      coalesce(gp.official_start_date, ga.project_start),
      coalesce(gp.official_end_date, ga.project_end),
      gp.total_project_cost,
      coalesce(gp.approved_grant_amount, ga.grant_amount),
      coalesce(gp.grant_rate, ga.grant_rate),
      ga.payment_deadline_date,
      ga.payment_deadline_days_after_end,
      own.id,
      own.budget_amount,
      own.billing_frequency,
      own.expected_invoice_day,
      own.invoice_description_requirements,
      (
        select count(*)::int from project_suppliers other
        where other.grant_project_id = p_grant_project_id
          and other.supplier_client_id is not null
          and other.supplier_client_id is distinct from v_own_supplier_client_id
      ),
      (
        select coalesce(sum(other.budget_amount), 0) from project_suppliers other
        where other.grant_project_id = p_grant_project_id
          and other.supplier_client_id is not null
          and other.supplier_client_id is distinct from v_own_supplier_client_id
      )
    from grant_projects gp
    join clients c on c.id = gp.client_id
    join grant_programs prog on prog.id = gp.program_id
    left join lateral (
      select ga2.project_start, ga2.project_end, ga2.grant_amount, ga2.grant_rate,
             ga2.payment_deadline_date, ga2.payment_deadline_days_after_end
      from grant_agreements ga2
      where ga2.grant_project_id = gp.id
      order by ga2.created_at desc
      limit 1
    ) ga on true
    left join project_suppliers own
      on own.grant_project_id = gp.id and own.supplier_client_id = v_own_supplier_client_id
    where gp.id = p_grant_project_id;
end;
$$;

grant execute on function portal_supplier_dossier_view(uuid) to authenticated;
