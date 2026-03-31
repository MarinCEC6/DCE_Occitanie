# Occitanie AV Blocks Explorer

Prototype exploratoire pour visualiser les blocs AV reconstruits en Occitanie.

## Contenu
- `index.html`, `app.js`, `style.css` : interface carte
- `data/blocks_points.geojson` : tous les blocs en points
- `data/blocks_large.geojson` : blocs de 10 ha et plus en polygones simplifies
- `data/occitanie_departments.geojson` : contours departementaux
- `data/summary.json` : synthese des effectifs
- `.nojekyll` : compatibilite GitHub Pages

## Lancement local
Depuis `C:\data\RESULTS_AV\03_FIGURES\occitanie_blocks_explorer` :

```powershell
python -m http.server 8010
```

Ou plus simplement :
- double-cliquer sur `serve_local.bat`

Puis ouvrir :
- `http://localhost:8010/index.html`

## Fonctions V1
- filtres par departement, taille, culture dominante et stress hydrique
- coloration par culture, hydric ou taille
- mode point repondant avec cercle `near` a 10 km
- fiche detaillee au clic sur un bloc
- zone de clic elargie sur les points pour faciliter la selection

## Partage via GitHub
Le plus simple est de creer un **nouveau repo GitHub** et d'y copier **le contenu de ce dossier** a la racine.

Puis sur GitHub :
1. `Settings`
2. `Pages`
3. `Deploy from a branch`
4. choisir `main` puis `/root`

L'URL publique sera alors du type :
- `https://<ton-compte>.github.io/<nom-du-repo>/`

## Source de donnees
Les couches sont construites a partir de :
- `01_INTERMEDIATE/av_dce_occitanie_crop_blocks/combined/blocks_features_hydric.parquet`
- `01_INTERMEDIATE/av_dce_occitanie_crop_blocks/combined/blocks_raw.gpkg`

Le build des couches front est genere par :
- `00_CODE/av_dce_pipeline/15_build_occitanie_explorer_data.py`
