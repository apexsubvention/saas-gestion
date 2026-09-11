# Apex — Setup (Mission 2, Étape 1)

## 1. Créer le projet Supabase
- Créer un nouveau projet sur supabase.com
- Copier l'URL et les clés (anon + service_role) dans `.env` (voir `.env.example`)

## 2. Appliquer les migrations
```bash
npx supabase login
npx supabase link --project-ref <votre-project-ref>
npx supabase db push
```
Les migrations sont dans `supabase/migrations/`, numérotées dans l'ordre validé en
Mission 1 (0001 à 0018). `db push` les applique dans l'ordre lexical.

## 3. Générer les types TypeScript
```bash
npm run supabase:types
```
(nécessite `SUPABASE_PROJECT_ID` dans `.env`)

## 4. Bootstrap du premier admin
Voir `supabase/seed.sql` — créer le premier utilisateur via le Dashboard Supabase
(Authentication > Add user), copier son UUID dans le script, puis l'exécuter dans
l'éditeur SQL Supabase.

## 5. Lancer l'app
```bash
npm install
npm run dev
```

## Critère de fin de l'Étape 1
Un admin peut se connecter (`/login`) et voir un dashboard vide (`/dashboard`) qui
affiche le nombre de clients visibles (0 au départ) — la preuve que l'isolation par
organisation fonctionne vient de créer une deuxième organisation + un deuxième admin
et de vérifier qu'aucun ne voit les données de l'autre.
