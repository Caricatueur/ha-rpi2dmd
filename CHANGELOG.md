# Changelog

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
