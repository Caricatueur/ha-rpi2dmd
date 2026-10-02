# Captures luminosité

Captures Chromium du 2 octobre 2026, réalisées sur les pages réellement
servies en production, sans modifier le mode ni les réglages.

- `brightness-home-assistant.png` : panneau Luminosité ouvert dans Home Assistant,
  avec son frontend natif et les valeurs reçues de l’appareil.
- `brightness-rpi2dmd-bh1750.png` : interface Raspberry, section Luminosité
  ouverte avec le BH1750 actif.

Les libellés personnels du capteur HA ont été remplacés dans le DOM de
capture par un libellé générique. Les mesures, courbes, modes et ACK n’ont
pas été modifiés. La production affichait encore le numéro 0.4.5 ; la release
0.5.0 reprend ce code validé avec sa nouvelle version et sa documentation.
Les PNG ont été optimisés sans perte.
