# Anteckningar

Ett dokument, en rityta, ingen server. Typst kompileras i webbläsaren med
typst.ts, allt sparas i OPFS, och figurer är SVG-filer som kan öppnas igen.

## Var filerna ligger

`document/main.typ` och `document/figures/*.svg`, som riktiga filer på maskinen
som kör servern. Det är sanningen. Datorn och iPaden är båda klienter mot samma
mapp, så de ser samma dokument. Mappen kan versionshanteras med git, öppnas i
VS Code och kompileras med vanliga `typst compile`.

Klienterna sparar 0,4 sekunder efter senaste tangenttryck och pollar var 1,5:e
sekund efter ändringar från den andra enheten. Senaste skrivningen vinner. Det
räcker för en person med två enheter, och byts mot Supabase genom att ersätta
de fyra funktionerna i `src/server.js`.

## Kom igång

```
npm install
npm run dev -- --host
```

Öppna adressen som skrivs ut på iPaden, på samma nät. Lägg till på
hemskärmen så körs den i helskärm utan adressfält.

## Vad som finns

- Editor och preview sida vid sida, med kod- respektive utfallsläge för smala skärmar
- Cmd-I öppnar ritläget i helskärm. Står markören på en rad som redan har en
  figur öppnas den figuren för påfyllning i stället för att en ny skapas
  (Cmd-D är upptaget av editorns "markera nästa förekomst")
- Klar sparar figuren och lägger `#figure(image(...))` vid markören som en
  enda ångra-bar ändring, och lämnar tillbaka fokus till editorn
- Figurer numreras automatiskt, `figures/f-01.svg`. Ingen namnruta
- Handlovsskydd: fingret ritar bara om pennan varit borta i mer än 1,5 sekunder,
  och all textmarkering och rullning blockeras medan pennan är i bruk
- Sparas hela tiden, aldrig med en knapp

## Editorn

Vanliga kodeditorsvanor, de flesta rakt ur CodeMirror:

- Radnummer i vänsterkanten, flera markörer (Cmd-D för nästa förekomst,
  Cmd-Shift-L för alla), matchande parenteser, vikning
- Cmd-F söker och ersätter i samma panel, Cmd-H öppnar den likaså, F3 eller
  Cmd-G för nästa träff
- `(`, `[`, `"` och `$` sluter sig själva. Skriver du sluttecknet ändå hoppar
  markören förbi det i stället för att lägga till ett extra
- Förslag med Tab: ord ur dokumentet, Typst-kommandon som `#figure` med
  hoppbara fält, matematiska symbolnamn i matteläge, och dokumentets egna
  `#let`-makron
- **Substitution**: har du skrivit `$v(t) = 2 g t$` någonstans erbjuds `2 g t`
  när du skriver `v(t)` i ett senare matteblock. Aldrig automatiskt — det är ett
  räknesteg och väljs ur listan

## Verktygsbyte

Pennans dubbeltryck och kläm går inte att läsa från en webbsida, de finns bara
i UIKit. Håll `E` för sudd i stället, så länge du har tangentbord. Utan
tangentbord finns knapparna i verktygsraden.

## Figurformatet

En figur är en vanlig SVG som Typst renderar direkt, med dragen sparade som
JSON i en kommentar sist i filen. Filen är alltså både bild och redigerbart
dokument. Det är därför en figur kan fyllas på i tre omgångar under en
föreläsning i stället för att ritas om.

Ingen patchad Typst-kompilator, till skillnad från tide. Dokumentet går att
kompilera med vanliga `typst compile` var som helst.

## Typsnitt

Typst har inga typsnitt inbyggda. Utan filerna i `public/fonts` ger varje rad
med text felet "no font could be found", och matten kräver särskilt
NewCMMath-Regular. De sex filerna är cirka 2,6 MB.

## Storlek

Kompilatorns wasm-modul är 28 MB, cirka 11 MB över nätet. Första starten är
alltså tung, sedan cachar webbläsaren den. Det är den siffra som avgör om
Safari orkar, och det är värt att mäta på iPaden innan mer byggs ovanpå.

## Medvetet utelämnat

- Offline. Servern måste vara nåbar, annars går det inte att skriva. Nästa steg
  är en service worker plus en lokal kö för ändringar gjorda utan nät
- Fjärråtkomst. På samma nät räcker `--host`. När datorn står hemma behövs
  `tailscale serve 5173`, som dessutom ger ett giltigt certifikat
- Åtkomstskydd. Vem som helst på samma nät kan skriva till API:t
- Syntaxfärgning för Typst
- Flera dokument och filträd
- Markeringsverktyg i ritläget. Bara penna, sudd och ångra
