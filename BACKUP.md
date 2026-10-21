# Sauvegarde et restauration

Toutes les données (prospects, CRM, devis, projets, versions, matrices, **médias privés**) sont dans **une seule base Neon**. Une stratégie de sauvegarde n’est valable qu’avec une procédure de restauration testée : celle-ci l’a été (voir « Tests réalisés »).

## Stratégie

| Niveau | Outil | Fréquence | Rétention |
|---|---|---|---|
| 1. Restauration instantanée (PITR) | Neon *History window* | continue | Free : 6 h · Launch : jusqu’à 7 jours · Scale : jusqu’à 30 jours (réglez le maximum : Settings → Postgres) |
| 2. Sauvegarde logique hors Neon | `pg_dump` (format custom) | **hebdomadaire** + avant chaque migration | 8 semaines minimum, stockage chiffré hors du compte Neon (disque chiffré, coffre cloud) |
| 3. Export métier lisible | Paramètres → Sécurité → « Exporter mes données (JSON) » | mensuel ou à la demande | Consultation / portabilité (les binaires des médias ne sont pas inclus) |

## Sauvegarde logique

```bash
# Depuis votre poste (PostgreSQL client 16+). La chaîne de connexion n'est jamais enregistrée dans un fichier versionné.
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="harmony-$(date +%F).dump"
# Vérification immédiate de l'archive :
pg_restore --list "harmony-$(date +%F).dump" | head
```

Chiffrez l’archive si elle quitte votre poste, par exemple : `gpg --symmetric --cipher-algo AES256 harmony-AAAA-MM-JJ.dump`.

## Restauration

### A. Erreur récente (moins que la *history window*)
1. Console Neon → *Branches* → branche principale → **Restore** → choisir l’horodatage (avant l’incident).
2. Option prudente : restaurer d’abord dans une **nouvelle branche**, vérifier, puis promouvoir.
3. Vérifier : `GET /api/health` puis connexion et contrôle des données.

### B. Depuis une sauvegarde `pg_dump`
```bash
# 1. Base cible vide (nouvelle branche ou nouveau projet Neon), puis :
pg_restore --no-owner --dbname="$DATABASE_URL_CIBLE" harmony-AAAA-MM-JJ.dump
# 2. Contrôle de cohérence :
psql "$DATABASE_URL_CIBLE" -c "select count(*) from prospects" -c "select count(*) from projects" -c "select name from schema_migrations order by name"
# 3. Pointer DATABASE_URL (Vercel) vers la base restaurée, redéployer, vérifier /api/health.
```

### C. Retour arrière d’une migration
Toujours après une sauvegarde (B) :
```bash
psql "$DATABASE_URL" -f db/rollback/003_react_sites.down.sql      # retire les ajouts de 003
psql "$DATABASE_URL" -f db/rollback/002_harmony_v2.down.sql       # revient au schéma V1 (données V2 perdues)
```

## Tests réalisés (21/10/2026, PostgreSQL 16 local)

- `pg_dump` (format custom) d’une base contenant prospects, projets, versions et médias → `pg_restore` dans une base vide : **comptages identiques** (prospects, projets, versions, blocs média, migrations) et **empreinte MD5 identique** de l’ensemble des fichiers de versions.
- Aller-retour de schéma V1 → V2 → V1 (scripts `db/rollback`) → V2 : les données V1 sont conservées et l’application V1 peut réécrire en base après retour arrière.
- Non testé ici : la restauration PITR dans la console Neon (nécessite votre compte) — à faire une fois lors de la mise en service (créer une branche restaurée de test, vérifier, supprimer).

## Données personnelles

Les sauvegardes contiennent des données de prospection (professionnelles). Elles suivent la même durée de conservation que la base : supprimez les archives de plus de 8 semaines, et rejouez les suppressions RGPD (effacements) si vous restaurez une archive antérieure à une demande d’effacement.
