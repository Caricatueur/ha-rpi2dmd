# Image Raspberry de test — préparation locale

Une copie distincte de l’image de référence a été préparée localement avec
les exécutables, scripts web et services du firmware actuellement validé.
L’image de référence et la microSD de production n’ont pas été modifiées.
L’image et sa compression ne sont ni dans Git ni dans les assets de release.

Les configurations personnelles Wi-Fi, MQTT, météo et l’association HA
sont retirées. Les identités machine, jetons API et clés hôtes SSH sont
générés à la première mise en route. Les comptes `root` et `pi` sont verrouillés :
préparer un accès personnel sur la **copie de test** avant le démarrage,
sans ajouter de secret partagé à une éventuelle image distribuée.

Les fichiers du firmware ont été relus dans la partition modifiée et comparés
aux fichiers source de production. Le système de fichiers ext4 a passé
`e2fsck -fn` ; l’espace libre et les zones inutilisées FAT ont été nettoyés.
Une somme SHA-256 est conservée auprès de l’image locale.

**Démarrage physique non effectué.** Aucun support distinct n’était disponible.
La qualification physique Raspberry Pi Zero 2 W reste à effectuer.

## Validation sur une carte distincte

1. Identifier explicitement une microSD vierge distincte ; vérifier la somme
   SHA-256, écrire uniquement cette carte et préparer les accès personnels.
2. Vérifier le boot et l’accès à l’interface web ; les valeurs initiales
   doivent être génériques et ne contenir aucune ancienne association HA.
3. Vérifier GIF, Clock et Date ; configurer Weather et MQTT avec des
   identifiants propres à la validation, puis vérifier leur fonctionnement.
4. Brancher le BH1750 suivant les marquages du module et le brochage
   documenté, vérifier I²C `/dev/i2c-1`, adresse `0x23` et valeurs lux.
5. Sélectionner BH1750, modifier/sauvegarder la courbe locale, puis vérifier
   planning, mode HA, nouvelle association, ACK et repli au planning.
6. Vérifier les trois états du capteur HA et sa reprise automatique.
7. Redémarrer ; vérifier la persistance de la courbe, du planning et du mode.
8. Contrôler l’absence de secrets provenant du poste de développement,
   puis retirer les secrets ajoutés pour le test avant toute publication.

Cette checklist est un protocole à exécuter, pas un résultat de test physique.
