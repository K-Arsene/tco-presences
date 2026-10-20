# TCO Présences — application Android du service d'accueil

Ce que fait l'application :
- pointer les membres pendant le culte, avec leur photo ;
- envoyer un rappel après 2 absences successives ;
- produire les bilans mensuels et annuels ;
- ajouter et modifier les fiches membres.

Les données restent sur le téléphone : l'application fonctionne sans Internet.

## Obtenir l'APK

### Option 1 — Android Studio (sur un PC)
1. Installer Android Studio (version Ladybug 2024.2 ou plus récente).
2. *File › Open*, puis choisir ce dossier `tco-presences`. Attendre la fin de la synchronisation Gradle (connexion Internet nécessaire la première fois).
3. *Build › Build App Bundle(s) / APK(s) › Build APK(s)*.
4. L'APK se trouve dans `app/build/outputs/apk/debug/app-debug.apk`.

### Option 2 — GitHub (sans rien installer)
1. Créer un dépôt sur github.com et y déposer tout le contenu de ce dossier, y compris le dossier caché `.github`.
2. Ouvrir l'onglet **Actions** : la compilation démarre seule (environ 5 minutes).
3. À la fin, télécharger l'artefact **TCO-Presences-apk** : il contient `TCO-Presences.apk`.

### Installer sur le téléphone
1. Copier l'APK sur le téléphone, par WhatsApp, câble USB ou Google Drive.
2. L'ouvrir, puis autoriser « Installer des applications inconnues » quand Android le demande.

Configuration requise : Android 7.0 ou plus récent.

## Utilisation

| Écran | Rôle |
| --- | --- |
| Pointage | Ouvrir le culte (date, heure, type), pointer *Présent* ou *Excusé*, ajouter un nouveau membre, puis clôturer. À la clôture, les personnes non pointées passent « absent ». |
| Rappels | Liste créée automatiquement quand un membre est absent à 2 cultes comptés successifs. Boutons Appeler, SMS et WhatsApp (message préparé), puis « Noter la suite donnée ». |
| Membres | Fiche avec photo actualisable, église de provenance, baptême d'eau et historique de présence. |
| Bilans | Mensuel ou annuel : taux de participation, présents par culte, membres sous le seuil, répartition par zone et par sexe. Export en PDF (via « Enregistrer au format PDF ») ou en Excel (CSV). |
| Réglages (roue dentée) | Seuil de participation, texte du message de rappel, sauvegarde et restauration. |

Règles appliquées :
- Seuls les cultes **comptés** entrent dans les bilans et la règle des 2 absences. Les cultes du dimanche sont comptés par défaut, et la case peut être changée à l'ouverture de chaque culte.
- Une absence **excusée** ne compte pas comme absence et n'entre pas dans le calcul du taux.
- Taux de participation = présences ÷ (cultes comptés depuis l'enregistrement du membre − absences excusées).

## Important : données et sauvegarde
- Les données sont enregistrées **sur un seul téléphone**. Si deux responsables pointent sur deux téléphones différents, leurs listes ne se rejoignent pas. Pour la première version, il faut donc **un téléphone de pointage** pour le service d'accueil.
- Faire une **sauvegarde chaque semaine** (Réglages › Créer une sauvegarde) et l'envoyer sur un autre support (WhatsApp, Drive). Elle permet aussi de passer les données sur un nouveau téléphone (Réglages › Restaurer).
- Désinstaller l'application efface les données. Sauvegarder d'abord.

## Version suivante (à prévoir)
Le pointage à plusieurs téléphones en même temps demande un petit serveur de synchronisation (par exemple l'API Laravel décrite dans le dossier de conception). La structure des données est déjà prévue pour.

## Version « release » signée (facultatif)
L'APK *debug* s'installe et fonctionne normalement. Pour une diffusion plus large, ou plus tard sur le Play Store :
1. Créer une clé de signature avec *Build › Generate Signed App Bundle / APK* dans Android Studio.
2. Conserver la clé précieusement : sans elle, les mises à jour sont impossibles.
