# Installation neuve Home Assistant — v0.5.0

Validation effectuée avec Home Assistant Core 2026.9.2. Le test crée un
répertoire de configuration temporaire vide, copie le composant à installer,
démarre réellement Home Assistant puis utilise son flux de configuration.
L’API Raspberry est simulée sur une adresse de boucle locale : aucun appareil
de production n’est associé et aucune configuration personnelle n’est utilisée.

Résultat : **OK — 14 entités, un seul appareil**. Le manifest, les trois modes,
le choix du BH1750, une nouvelle entité d’illuminance, la consigne acquittée,
le planning et le frontend HTTP ont été vérifiés. Chromium charge le module
réellement servi par cette installation neuve. Le répertoire temporaire est
supprimé après arrêt du serveur. Les détails sont dans [result.json](result.json).

## Reproduire

Utiliser Python 3.14 et les dépendances de `tests/requirements-ha8.txt`.
Installer Playwright dans un répertoire externe au dépôt et son navigateur
Chromium, puis exécuter depuis le dépôt :

```sh
NODE_PATH=/chemin/vers/node_modules python tests/fresh_install.py
```

Le port HTTP local 18123 doit être libre. Les éventuelles bibliothèques natives
du navigateur dépendent de l’environnement de validation. Aucune installation
Python ou Node du poste de développement n’est copiée dans le composant.

Ce résultat qualifie l’installation HA avec une API isolée ; il ne représente
pas un démarrage physique d’une nouvelle carte Raspberry.
