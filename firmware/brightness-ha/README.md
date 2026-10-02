# Bridge de référence pour les tests HA

`brightness_web_service.py` est conservé comme fixture du contrat historique
HA → broker, utilisée par `tests/test_firmware_brightness_bridge.py`.
Ce dossier ne distribue pas le firmware Raspberry actuel.

Le firmware compatible avec les courbes BH1750 locales et `ha_sensor_status`
est développé séparément ; cette release HA ne fournit pas d’image système.
