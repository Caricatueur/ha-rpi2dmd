# RPI2DMD pour Home Assistant

![RPI2DMD connecté à Home Assistant](https://raw.githubusercontent.com/Caricatueur/ha-rpi2dmd/main/assets/rpi2dmd-ha-banner-4.png)

Cette intégration permet de contrôler un RPI2DMD directement depuis Home
Assistant. Le Raspberry reste autonome et Home Assistant utilise son API
locale pour lire l'état et envoyer les commandes.

## À quoi sert ce projet ?

RPI2DMD est un afficheur DMD piloté par un Raspberry Pi. L'intégration
Home Assistant permet notamment de :

- surveiller l'affichage et la connexion MQTT ;
- consulter la température, l'uptime et les diagnostics d'alimentation ;
- régler la luminosité et son planning horaire ;
- activer ou désactiver l'heure, la date, la météo, les GIF et MQTT ;
- gérer la playlist et ses lignes ;
- gérer les catégories de GIF ;
- configurer MQTT et la météo ;
- exporter ou importer la configuration lorsque l'API le permet.

## Comment ça fonctionne ?

```text
Home Assistant
      ↓
Intégration RPI2DMD
      ↓  API HTTP locale
RPI2DMD V2.8 sur Raspberry Pi
      ↓
Panneau DMD
```

La communication reste sur le réseau local : aucun cloud n'est nécessaire.
Le navigateur Home Assistant parle au backend de l'intégration par
WebSocket ; il ne contacte jamais directement le Raspberry et ne reçoit pas
le token API.

## Fonctionnalités

### Dashboard

- état Display et MQTT ;
- température CPU ;
- alimentation, sous-tension et throttling ;
- uptime ;
- écran actuellement affiché.

### Affichage

Les réglages d'affichage exposés par l'API RPI2DMD sont accessibles depuis
le panel, avec les commandes rapides pour l'heure, la date, la météo, les GIF
et MQTT Display.

### Luminosité

- réglage manuel ;
- planning par points horaires ;
- activation, désactivation et application immédiate du planning.

### Playlist

- ajout et modification de lignes ;
- activation/désactivation ;
- déplacement, duplication et suppression ;
- conservation de l'ordre et des types RPI2DMD.

### MQTT

- configuration du broker, du port, du compte et du client ;
- état de connexion ;
- test de connexion lorsque l'API le propose.

Le mot de passe existant n'est jamais affiché.

### GIF

- catégories et nombre de GIF ;
- activation/désactivation des catégories ;
- consultation des métadonnées disponibles.

### Météo

- réglages de localisation et d'unité ;
- activation et options météo ;
- configuration de la clé OpenWeatherMap sans exposer la clé existante.

### Système

- modèle Raspberry, hostname et adresses réseau ;
- version RPI2DMD et état des services ;
- température, mémoire, stockage, uptime et diagnostics d'alimentation.

### Sauvegarde

Le panel propose l'export et l'import de configuration selon les capacités
de l'API. Les secrets système et les assets ne sont pas inclus.

## Installation

1. Ouvrir **HACS** dans Home Assistant.
2. Ajouter ce dépôt comme dépôt personnalisé, de type **Integration**.
3. Installer **RPI2DMD**.
4. Redémarrer Home Assistant.
5. Aller dans **Paramètres → Appareils et services → Ajouter une intégration**.
6. Rechercher **RPI2DMD**.

Un RPI2DMD V2.8 avec son API activée est nécessaire.

## Configuration

Le flux de configuration demande :

- l'adresse IP ou le hostname du RPI2DMD ;
- le token API RPI2DMD.

Exemple de format d'adresse : `192.168.x.x`.

Le token est stocké dans l'entrée de configuration Home Assistant. Il n'est
pas affiché dans le panel, les entités ou le dépôt GitHub.

## Interface Home Assistant

L'installation ajoute à la fois :

- un appareil Home Assistant classique avec ses capteurs, switches et
  contrôles ;
- une application **RPI2DMD** dans la barre latérale.

Le panel permet les opérations normales depuis une interface graphique,
sans utiliser SSH ou PuTTY.

## Sécurité

- l'API RPI2DMD est protégée par un token ;
- le token reste côté backend Home Assistant ;
- le mot de passe MQTT existant n'est jamais renvoyé au navigateur ;
- les échanges sont locaux ;
- aucun secret n'est stocké dans ce dépôt.

## Compatibilité

- RPI2DMD V2.8 : requis ;
- Home Assistant : custom integration installable via HACS ;
- Raspberry Pi 4 : testé physiquement ;
- Raspberry Pi Zero 2 W : fonctionnement RPI2DMD qualifié ;
- autres modèles : non garantis, à confirmer.

## État du projet

Version actuelle : **0.2.x — développement**.

Les fonctions principales et l'intégration native sont opérationnelles. Le
panel Home Assistant est encore en cours de finalisation et aucune release
stable 1.0 n'est annoncée.
