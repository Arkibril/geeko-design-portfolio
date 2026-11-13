# Geeko Design — Portfolio CD 3D

Portfolio de graphiste pensé comme **le bac d'un disquaire**. Chaque projet est un CD : on fouille dans une étagère infinie, on sort un boîtier, on l'ouvre, et le design se découvre comme une pochette d'album. Les variantes de couleur d'un même projet deviennent les éditions d'un même disque.

Code écrit à la main : **three.js + shaders GLSL + JavaScript pur**. Pas de framework, pas d'étape de build.

---

## Le concept

### L'objet
Le boîtier n'est pas une illustration : il est construit en vraie 3D, aux proportions réelles (**142 × 125 × 10,4 mm**).
- livret de 12 cm tenu par ses languettes, nervures de charnière, jaquette qui dépasse sur les tranches ;
- plateau noir avec son moyeu à dents ;
- disque de 120 mm, épais de 1,2 mm : centre transparent, bande miroir chromée, étiquette imprimée, et une face gravée argentée avec la **diffraction arc-en-ciel** des pistes (shader inspiré du « CD shader » de Jos Stam).

### Le traitement de l'image : threshold + gradient map
La signature visuelle, reprise de Photoshop. En mode **Threshold**, les pochettes passent en niveaux de gris, sont contrastées, puis colorées par un **gradient map**. La couleur d'origine revient toujours au survol, et le design complet reste affiché intact quand un projet est ouvert.

### Le mouvement
- la caméra et les disques suivent la souris ;
- ouverture en trois temps : le boîtier quitte l'étagère, s'ouvre, puis se range à gauche pendant que le design apparaît à droite ;
- la fermeture rejoue la même animation à l'envers : on sait toujours d'où vient l'objet et où il retourne ;
- **clic maintenu** sur le boîtier ouvert, sur son CD, ou sur le disque central de la vue Disques : rotation libre à 360°.

### L'intro
« GEEKO DESIGN » apparaît par seuillage d'un bruit, puis une **vague liquide et visqueuse** colorée par le gradient map balaie l'écran et révèle le site.

### Deux façons de parcourir
- **Boîtiers** : le bac de disquaire, dense et tactile, pour fouiller.
- **Disques** : un carrousel éditorial, disques de face qui s'orientent vers le curseur, avec une fiche par projet.

### Recherche
Insensible aux majuscules et aux accents, avec suggestions et filtres par type (poster, motif, portrait…).

---

## Éditeur de gradient map

Bouton **Gradient map** dans l'en-tête :
- **clic sur la barre** : ajouter une couleur ;
- **glisser un point** : le déplacer ;
- **double-clic sur un point** : le retirer ;
- **préréglages** : Geeko, Rouge, et quatre duotones (Orange, Vert, Violet, Bleu) ;
- recliquer sur **Threshold** passe au préréglage suivant ;
- **Rejouer l'intro** pour voir le dégradé dans la vague.

Le dégradé est converti en une texture de 256 couleurs (LUT) partagée entre les pochettes (canvas) et l'intro (shader). Il est mémorisé dans le navigateur.

---

## Technique

| Élément | Outil |
|---|---|
| Scène 3D, matériaux physiques, ombres | three.js r170 (`lib/`) |
| Effet CD gravé, vague liquide de l'intro | shaders GLSL écrits à la main |
| Textures des boîtiers, disques, livrets, threshold | Canvas 2D, dessinées au chargement |
| Interface, recherche, éditeur | HTML / CSS / JavaScript pur |
| Typographies | Anton, IBM Plex Mono, Instrument Serif (Google Fonts) |

Aucune dépendance à installer : three.js est inclus dans `lib/`.

---

## Lancer en local

Les modules JavaScript ne fonctionnent pas en ouvrant `index.html` directement : il faut un petit serveur.

```bash
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000.

---

## Structure

```
index.html   interface (en-tête, recherche, filtres, panneau projet, éditeur de gradient map)
app.js       scène 3D, boîtiers, disques, ouverture, rotation, intro, gradient map, recherche
data.js      liste des projets et de leurs variantes
lib/         three.js + RoomEnvironment + RoundedBoxGeometry
img/         <projet>-<n>.jpg = design complet, <projet>-<n>-c.jpg = pochette carrée 600 px
```

### Ajouter un projet
1. Mettre les images dans `img/` (pochette carrée 600 × 600 + design complet ~1500 px).
2. Ajouter l'entrée dans `data.js` (`id`, `name`, `kind`, `variants[{ full, cover, color, label }]`).
3. Ajouter son type et ses mots-clés dans `META`, en haut de `app.js`.

### Réglages rapides (haut de `app.js`)
`SPACING` (écart entre boîtiers), `FAN` (rotation vers la caméra), `COUNT` (nombre de boîtiers), `LIFT` (hauteur au survol), `CAM.pos` / `CAM.target` dans `cameraBase()` (angle de vue), `GM_PRESETS` (gradient maps par défaut).

---

## Droits

- **Code** : libre de lecture et d'inspiration.
- **Visuels** (`img/`) : © Geeko Design, tous droits réservés. Les personnages et univers cités (Jujutsu Kaisen, Marvel, Mr. Robot…) appartiennent à leurs ayants droit ; les visuels sont des travaux personnels.
- **three.js** : licence MIT.
