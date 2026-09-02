# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Språk

Kod, kommentarer, identifierare, commit-meddelanden och UI-text är på svenska.
Behåll det. Blandad svenska/engelska förekommer där bibliotekens API:er tvingar
fram engelska (`compile`, `strokes`, `source`) — följ omgivande fil.

## Kommandon

```
npm install
npm run dev          # vite --host, fil-API:t ingår
npm run dev:https    # samma, med självsignerat cert (basic-ssl) för iPad
npm run build        # bara klienten — ingen server, inget fil-API
npm run preview      # serverar dist/ och kör fil-API:t igen
```

Inga tester, ingen linter, inget typsystem. Verifiering sker genom att köra
appen och titta på förhandsvisningen.

## Arkitektur

En Typst-editor med ritläge. Tre lager som inte känner till varandra:

**Server = Vite-plugin.** `filApi()` i `vite.config.js` är hela backenden — ett
connect-middleware monterat på både dev- och preview-servern. Det finns ingen
separat serverprocess och inget fil-API i en byggd `dist/`. Fyra rutter:
`GET /api/state` (källa + mtime + figurernas mtimes i ett anrop),
`PUT /api/doc`, `GET|PUT /api/figur/:namn`.

**Sanningen ligger på disk i `dokument/`** — `main.typ` och `figurer/*.svg` som
riktiga filer på maskinen som kör servern, versionshanterbara och kompilerbara
med vanliga `typst compile`. Klienterna (dator, iPad på samma nät) är kopior
utan egen sanning. `dokument/` skapas och fylls med ett startdokument av
`ensure()` om det saknas.

**Synk är poll + debounce, sista skrivningen vinner.** `App.jsx` håller hela
modellen i `sync.current = { mtime, sparad, figurer, skriver }`; skillnaden
mellan `sparad` (vad vi senast skickade) och `sourceRef.current` (vad som står
i editorn) avgör om ett inkommande serversvar får skriva över texten. Sparar
400 ms efter senaste tangenttryck, pollar var 1500 ms, kompilerar 220 ms efter
ändring. `src/server.js` är klientsidans fyra fetch-funktioner — det är de som
byts ut mot Supabase, inget annat.

**Typst kompileras i webbläsaren** via typst.ts (`src/typst.js`). Wasm-modulen
är ~28 MB (~11 MB över nätet), initieras en gång bakom `boot()`. Figurer skickas
in som `mapShadow('/figurer/f-01.svg', bytes)` i ett virtuellt filsystem, så
`image("figurer/f-01.svg")` i källan löser ut mot samma sökväg som på disk.
Typst har **inga inbyggda typsnitt**: utan de sex filerna i `public/fonts` ger
varje rad text `no font could be found`, och matten kräver särskilt
NewCMMath-Regular.

### Figurformatet

En figur är en vanlig SVG som Typst renderar direkt, med dragen sparade som
JSON i en HTML-kommentar sist i filen (`<!--scen:...-->`, `--` escapas till
`- -`). Filen är alltså både bild och redigerbart dokument — det är därför en
figur kan fyllas på i flera omgångar i stället för att ritas om. `toSvg` /
`fromSvg` i `src/ink.js` är hela formatet. Ingen patchad Typst-kompilator.

### Ritläget

`Canvas.jsx` håller drag i en ref och ritar i en `requestAnimationFrame`-loop
med en `dirty`-flagga — React-state används bara för verktyg, färg och antal,
aldrig för punkter under ett drag. Handlovsskydd: fingret får rita bara om
pennan varit borta i mer än 1500 ms, och `touchstart`/`touchmove` blockeras på
document medan pennan är i bruk. Pennans dubbeltryck och kläm går inte att läsa
från en webbsida — `E` hålls nere för sudd i stället.

`Cmd-D` öppnar ritläget. Står markören på en rad som redan matchar
`image("...svg")` öppnas den figuren för påfyllning; annars skapas nästa
lediga `f-NN.svg`. Klar sparar figuren och infogar `#image("figurer/f-NN.svg")`
som **en enda** ångra-bar ändring, med fokus tillbaka i editorn.

Storleken kommer från figuren själv: `toSvg` skriver `width`/`height` i punkter
(`SKALA = 2.0`, alltså två ritade pixlar per punkt) medan `viewBox` står kvar i
ritpixlar. Ingen `width:` i den infogade koden — en liten skiss blir liten på
pappret. A4:s textbredd är 453 pt, så en figur bredare än ~907 ritade pixlar
spiller ut i marginalen; justera `SKALA` i `src/ink.js` om det blir ett problem.

### Var figuren hamnar

Markörens position går inte att synka mellan enheter — ett offset blir ogiltigt
så fort den andra enheten skriver en bokstav. I stället infogar varje klient vid
sin egen markör, som vid start står **sist i dokumentet** (`selection` i
`Editor.jsx`), eftersom anteckningar växer nedåt.

En figur är **väntande** om dess filnamn inte förekommer i källan — härlett i
`App.jsx`, ingen state på servern, så knappen "N nya figurer" dyker upp på alla
klienter av sig själv. Den är ett skyddsnät sedan Klar började infoga direkt:
den fångar figurer vars rad raderats eller som aldrig kom in i texten.

### Editorn

CodeMirror 6, inte Monaco — Monaco beter sig illa med pekskärm och
iPad-tangentbord. Editorn skapas en gång och äger sedan texten; ändringar
utifrån (poll från andra enheten) går genom `setDoc`, som behåller markören.
Ingen syntaxfärgning för Typst.

Mount-effekten har `[]` som deps, så props når den genom refen `senaste` — nya
callbacks måste läggas där, annars stänger de om första renderns värden.

## Medvetet utelämnat

Offline/service worker, fjärråtkomst (`tailscale serve 5173` när det behövs),
åtkomstskydd (vem som helst på nätet kan skriva till API:t), flera dokument och
filträd, markeringsverktyg i ritläget.

## Att vara försiktig med

- `README.md` inleder med "allt sparas i OPFS". Det stämmer inte längre —
  lagringen är fil-API:t mot `dokument/`, vilket README:s egen nästa rubrik
  beskriver korrekt.
- `filApi()` använder blockkropp med flit i `configureServer`: ett returvärde
  tolkas av Vite som en efter-hook, och `middlewares.use()` returnerar
  connect-appen.
- Wasm-storleken är siffran som avgör om Safari på iPaden orkar. Mät där innan
  mer byggs ovanpå.
