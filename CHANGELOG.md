# Changelog

## v0.4.5

- Versionne l’URL du module frontend pour éviter l’utilisation d’un ancien JS.
- Affiche la version frontend réellement chargée.
- Facilite le diagnostic entre plusieurs sessions navigateur.

## v0.4.4

- Chargement séquentiel et progressif des aperçus d’icônes, par pages de 12.
- Espacement de 200 ms et backoff de 2 secondes sur indisponibilité temporaire.
- Évite la saturation du proxy/API pendant le picker.
- Les aperçus temporairement indisponibles peuvent être retentés.
- Priorité aux opérations temps réel et aux aperçus de la playlist.

## v0.4.3

- Limite le chargement simultané des aperçus d’icônes à quatre requêtes.
- Évite la saturation temporaire de l’API lors de l’ouverture du sélecteur.
- Stabilise le statut RPI2DMD et les écritures playlist pendant la sélection d’icônes.

## v0.4.2

- Retry automatique des écritures playlist lorsque le RPI2DMD retourne HTTP 409.
- Correction du faux statut « Hors ligne » lors d’un conflit temporaire.
- Messages d’erreur « RPI2DMD occupé » plus précis.

## v0.4.1

- Ajout d’un vrai sélecteur de type pour la playlist.
- Ajout facilité des lignes MQTT Display avec un formulaire inline.
- Suppression du prompt texte pour le choix du type.

## v0.4.0

### Added

- Zeroconf discovery for `_rpi2dmd._tcp.local.`
- Six-digit physical pairing and reauthentication flow
- Stable RPI2DMD hardware identity based on `instance_id`

### Improved

- Host selection: `.local` hostname, then IPv4, then IPv6
- Automatic host update for an existing ConfigEntry
- Entity identity and brightness schedule migration

### Fixed

- Duplicate ConfigEntries after network changes or reflashing
- Recovery of entity IDs ending in `_2`
- Home Assistant `EntityCategory.DIAGNOSTIC` compatibility

### Compatibility

- Validated with Home Assistant Core 2026.9.2 and Home Assistant OS 18.2
