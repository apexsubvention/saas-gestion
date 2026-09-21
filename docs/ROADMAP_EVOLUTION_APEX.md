# Apex — Audit et feuille de route d'évolution

Document de travail, mis à jour à chaque phase. Principe : **étendre l'existant, ne rien supprimer, pas de doublon de tables.**
Toute migration est additive ; les seules conversions de données (statuts de dossier, 0034) ont été annoncées et testées.

## 1. Audit — ce qui existe

### Déjà en place et fonctionnel
| Domaine | État |
|---|---|
| Clients | Fiche, hiérarchie parent/enfants, « Besoins actuels », import, contacts (table), accès par client |
| Portail | Comptes `organization_users.role='client'` + `client_access` + `client_portal_users` ; page Facturation à préparer |
| Programmes | Ajout avec URL, lecture auto (Claude + repli regex), fiche éditable, exemples financés, correspondance client |
| Veille | Sources, opportunités, « Parle-moi de ton projet » filtré + recherche web approfondie, cache |
| Dossiers | 6 statuts, entente saisissable, DDR mensuels PARI-CNRC, échéancier (retire les éléments terminés), fournisseurs/factures modifiables, subvention restante, lecture auto des factures |
| Sécurité | RLS sur toutes les tables ; 0033 : rôle client limité (stockage, org_users, programmes, connaissances) |

### Présent en base mais **sans écran** (à activer plutôt que recréer)
| Table | Ce qu'elle prévoit déjà |
|---|---|
| `meetings`, `meeting_insights` | audio (`audio_storage_path`, `audio_retention`), `transcript`, insights typés (résumé, décision, tâche, document attendu, opportunité, question ouverte, info CRM) avec `status` **proposed / accepted / modified / ignored** = le modèle « suggestion → action » demandé |
| `grant_applications`, `application_sections/questions/answers` | questionnaire d'une demande ; réponses `ai_draft` / `user_draft` / `final_text` ; statut draft/in_progress/submitted |
| `document_requests` | demande de document au client (`visible_in_client_portal`, statuts requested/received/validated/issue…) — policy portail en **lecture** seulement, aucun écran |
| `notifications` | table prête, jamais alimentée |
| `audit_logs`, `ai_audit_logs` | journaux prêts, jamais alimentés |
| `claims.is_template`, `claim_requirements` | modèle de DDR + liste de pièces par réclamation |
| `tasks` (+ `source`, `assigned_to`, `description`) | tâches avec origine (manual/email/meeting/claim/agreement/ai/document) |
| `program_knowledge_items` | règles/observations par programme, avec `validated_by_user` |

### Manques réels (nouvelles tables/colonnes nécessaires)
- **Traçabilité** : aucune notion de source/valeur auto vs manuelle/confiance → `ai_suggestions` + colonnes `source_*`, `*_override`.
- **Plusieurs utilisateurs portail par client** : `client_portal_users` a `unique(client_id)` et `unique(user_id)` → un seul compte par client.
- **Changement de mot de passe à la 1re connexion** : non géré (mot de passe temporaire affiché une fois).
- **Mémoire structurée du client** avec historique temporel (aucune table).
- **Journal / timeline de dossier** (aucune table).
- **Versions des réponses de demande, gel du dossier déposé, snapshot des règles du programme** (aucune table).
- **Règles de programme versionnées** (`program_knowledge_items` n'a pas de validité/version).
- **Génération de PDF** (aucune dépendance).
- **Transcription audio** : l'API Claude n'accepte pas l'audio → **fournisseur externe à choisir**.

## 2. Décisions d'architecture

1. **Suggestion ≠ action** (`ai_suggestions`) : toute extraction IA importante est *proposée* (source, page/section, confiance) et n'est appliquée qu'après confirmation. Réutilisé par conventions, réunions, factures, documents du portail. `meeting_insights` garde son rôle propre (déjà conforme).
2. **Valeur effective** = `manual_override ?? calculated`, avec provenance : colonnes `*_override`, `*_override_by/at`, `source_kind`, `source_document_id`, `source_ref`, `confidence`. Bouton « revenir au calcul automatique » = remettre l'override à NULL (la valeur auto n'est jamais détruite).
3. **Confiance** uniforme : `high | medium | low`.
4. **Faits datés** : mémoire client = lignes (clé, valeur, `valid_from`, `source`, `confidence`, `validated_at`) — on ajoute, on ne remplace pas.
5. **Aucun service_role** pour les opérations courantes ; seuls le provisionnement d'utilisateurs Auth et les jobs système.
6. **Gel** : à la soumission, copie figée (questions/réponses/budget/règles) ; triggers refusant les modifications d'un dossier `submitted`.

## 3. Sécurité — analyse

| Sujet | Risque | Traitement |
|---|---|---|
| Portail = membre de l'org (rôle client) | lectures trop larges via `is_org_member` | **Fait (0033)** : stockage, `organization_users`, programmes, connaissances, recherches. **Reste** : `organizations`, `reminder_rules`, tables `funding_*`, lignes `documents` du client (y compris internes) → Phase 1 |
| Multi-utilisateurs | un compte = un client ; désactiver un compte ne doit pas couper les autres | lever `unique(client_id)`, garder `unique(user_id)` ; policies par `is_client_portal_user` déjà indépendantes du nombre |
| Mots de passe | temporaire affiché à l'écran ; jamais de clair en base (Supabase Auth) | invitation par **lien Supabase** (`generateLink`) plutôt que mot de passe par courriel ; `must_change_password` en métadonnées + écran de changement forcé |
| Invitations | jeton réutilisable / longue durée | liens à expiration courte, usage unique, journalisés |
| Audio | données très sensibles ; consentement ; fournisseur tiers | stockage privé `{org}/{client}/meetings/`, lecture personnel seulement, rétention par défaut « supprimer après transcription », avertissement de consentement avant l'enregistrement |
| Transcriptions | contiennent des informations client | table `meetings` déjà réservée au personnel (à vérifier/durcir : `meetings_select` passe par `can_access_client`) |
| Téléversement client | fichiers arbitraires | dossier réservé (0033), types et taille bornés, nom nettoyé, signature URL courte |
| Coûts IA | boucle / lien piégé | plafond quotidien (déjà pour la recherche web) à généraliser |
| Injection de prompt | documents/pages hostiles | sorties par schéma + revalidation zod ; URL jamais issues du modèle (déjà appliqué) |

## 4. Dépendances entre fonctionnalités

```
Fondation (ai_suggestions, provenance, audit)
   ├─► Fournisseurs/convention (extraction → propositions)
   ├─► Tâches + timeline
   ├─► Portail multi-utilisateurs ─► Documents demandés ─► Notifications
   │        └─► « Parle-moi de mes projets » ─► Mémoire client
   ├─► Réunions (audio→transcription→insights) ─► Mémoire client ─► Programmes potentiels
   └─► Programme : Q&R sourcée ─► Règles versionnées ─► Snapshot par dossier
                                     └─► Aide à la rédaction ─► Versions ─► Gel à la soumission
                                                   └─► Générateur de présentation (PDF)
```

## 5. Plan par phases et état

| Phase | Contenu | État |
|---|---|---|
| **0** | Programmes+URL, veille+recherche web, statuts, entente, DDR, échéancier, tableau fournisseurs, lecture des factures, durcissement RLS | ✅ fait |
| **1 — Fondation** | `ai_suggestions`, provenance/override, journal d'audit, journal de dossier, tâches urgentes, durcissement RLS (veille, rappels, documents du personnel) | ✅ fait (migration 0036, 37 tests) |
| **2 — Dossiers** | Modifier/supprimer/réassigner une tâche + « Mes tâches » ✅ (0037) · Tableau fournisseurs (subvention acceptée, réclamé AUTO/manuel, source, total) ✅ · extraction de convention avec confirmation ✅ · tâches manuelles (urgente, responsable, description, réclamation liée) + origine visible ✅ · journal de dossier ✅ (statut, entente, documents, tâches, propositions) · **restent** : modifier/supprimer/réassigner une tâche depuis le tableau, statuts de tâche simplifiés, snapshot du programme, gel du dossier déposé, vue globale « Mes tâches » | ✅ majoritairement fait |
| **3 — Portail** | Multi-utilisateurs, invitation, 1re connexion, documents demandés + téléversement, notifications, « Parle-moi de mes projets », association programme→client | à faire (0033 déjà appliquée : tables prêtes) |
| **4 — Réunions / mémoire** | Enregistrement, transcription (**fournisseur à choisir**), insights → suggestions, mémoire client datée | à faire |
| **5 — Intelligence programme** | « Pose-moi tes questions » sourcé ✅ · aide à la rédaction : « Explique-moi ton projet » + compatibilité explicable ✅, budget intelligent (admissibilité d'une dépense, source vérifiée) ✅, documents à rassembler ✅ · **restent** : import du questionnaire officiel (PDF/Word) + réponses proposées, copilote de rédaction, versions des réponses, gel à la soumission, règles versionnées / snapshot du programme, demande au client depuis le portail | ✅ partiel (migration 0037) |
| **6 — Présentation** | PDF personnalisé (logo/couleurs du client), export PPTX plus tard | à faire (**bibliothèque PDF à choisir**) |

Décisions attendues de l'utilisateur : fournisseur de transcription audio ; bibliothèque/approche PDF ; compte Resend (courriels).
