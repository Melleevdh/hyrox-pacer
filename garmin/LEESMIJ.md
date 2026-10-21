# Hyrox Pacer – Garmin-app (Venu 2, 2S, 2 Plus, 3, 3S, 4)

Een eigen activiteit-app. Hij haalt je actieve schema op van de website,
neemt je Hyrox op als activiteit (met 16 laps) en laat tijdens de race zien:

- je totale tijd en hoeveel je voor (groen, `-0:41`) of achter (rood, `+0:23`) op schema ligt
- het onderdeel (`4/16 Sled Push`), je tijd in het onderdeel en de doeltijd
- bij de runs: gelopen meters en je tempo in **min/km**
- wat er hierna komt
- je **hartslag in de kleur van je zone** (Z1 grijs, Z2 blauw, Z3 groen, Z4 oranje, Z5 rood)

De Roxzone-tijd uit je schema wordt verdeeld over de 8 runs. Druk op LAP zodra je aan een station
begint en zodra je het station af hebt.

## Knoppen
| Knop | Voor de start | Tijdens de race | Gepauzeerd | Na finish |
|---|---|---|---|---|
| Boven (START) | Start | **Stoppen** + menu (hervatten/opslaan/verwijderen) | Hervatten | Opslaan-menu |
| Onder (TERUG/LAP) | App sluiten | **Lap** (volgend onderdeel) | Menu (hervatten/opslaan/verwijderen) | Opslaan-menu |

Aanraken en vegen doen niets, zodat zweet of een tik je race niet verstoort.
Na de 16e lap stopt de tijd automatisch.

## Eenmalig installeren (Windows of Mac)
1. Installeer **VS Code**: https://code.visualstudio.com
2. Download de **Connect IQ SDK Manager**: https://developer.garmin.com/connect-iq/sdk/
   Log in met je Garmin-account, installeer de nieuwste SDK en bij *Devices* de **Venu 3**.
3. Installeer in VS Code de extensie **Monkey C** (van Garmin).
4. `Ctrl/Cmd+Shift+P` → **Monkey C: Verify Installation**. Laat hem een *developer key* aanmaken.

## Bouwen en op je horloge zetten
1. Open in VS Code de map `garmin`.
2. Testen: `Ctrl/Cmd+Shift+P` → **Monkey C: Run** → kies je model (bijv. **venu3**).
   (In de simulator gebruik je *Settings → Connection Type* om de telefoonverbinding na te bootsen.)
3. Bouwen: `Ctrl/Cmd+Shift+P` → **Monkey C: Build for Device** → kies je model. Je krijgt een `.prg`-bestand dat alleen op dat model werkt.
4. Sluit je horloge met USB aan en kopieer het `.prg`-bestand naar `GARMIN/APPS`.
   Op een Mac heb je daarvoor **OpenMTP** nodig (gratis).

## Eerste keer gebruiken
1. Zorg dat je telefoon met de **Garmin Connect-app** verbonden is (Bluetooth).
2. Open **Hyrox Pacer** op je horloge. Je ziet een code van 6 cijfers.
3. Log in op de website en vul de code in bij *Je horloge*.
4. Binnen een paar seconden toont het horloge je actieve schema. Klaar.

Daarna laadt de app bij elke keer openen je actieve schema. Lukt dat niet (geen telefoon in de buurt),
dan gebruikt hij het laatst opgehaalde schema.

## Vrienden
Vrienden zetten dezelfde `.prg` op hun horloge, maken een eigen account op de website en koppelen hun horloge met hun eigen code.

## Lukt het bouwen niet?
Kopieer de foutmelding uit VS Code en plak die in de chat, dan pas ik de code aan.
