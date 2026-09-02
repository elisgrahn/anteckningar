# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Språk

**Koden är engelsk**: identifierare, kommentarer och all synlig UI-text.
**Dokumentationen är svensk**: README, kravspecar och commit-meddelanden.

Ingen svenska finns kvar i `src/`, `vite.config.js` eller `index.html` — det
går att kontrollera med `grep -rl "[åäöÅÄÖ]" src/`.

Två strängar är format och inte namn, och kan inte ändras fritt:

- `SCENE_OPEN = '<!--scene:'` i `ink.js` står inskriven i varje figur på disk.
  Byts den måste figurerna migreras i samma veva, annars går de inte att öppna.
- `COLOR_KEY = 'notes.penColor'` ligger i användarens webbläsare. Byts den
  glöms den valda pennfärgen, vilket är litet men onödigt.

Makroregexen i `SymbolRow.jsx` använder `\p{L}` och inte `A-Za-z`, eftersom den
läser användarens dokument — som är skrivet på svenska.

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

**Server = Vite-plugin.** `fileApi()` i `vite.config.js` är hela backenden — ett
connect-middleware monterat på både dev- och preview-servern. Det finns ingen
separat serverprocess och inget fil-API i en byggd `dist/`. Fyra rutter:
`GET /api/state` (källa + mtime + figurernas mtimes i ett anrop),
`PUT /api/doc`, `GET|PUT|DELETE /api/figure/:name`.

**Sanningen ligger på disk i `document/`** — `main.typ` och `figures/*.svg` som
riktiga filer på maskinen som kör servern, versionshanterbara och kompilerbara
med vanliga `typst compile`. Klienterna (dator, iPad på samma nät) är kopior
utan egen sanning. `document/` skapas och fylls med ett startdokument av
`ensure()` om det saknas.

**Synk är poll + debounce, sista skrivningen vinner.** `App.jsx` håller hela
modellen i `sync.current = { mtime, saved, figures, writing, loaded }`;
skillnaden mellan `saved` (vad vi senast skickade) och `sourceRef.current` (vad
som står i editorn) avgör om ett inkommande serversvar får skriva över texten.
`loaded` är ett skydd mot det enda sätt appen kan förstöra arbete på: en
misslyckad första hämtning faller tillbaka på tom editor (invariant 6), och utan
flaggan skrev autospara den tomheten till disk. Sparar
400 ms efter senaste tangenttryck, pollar var 1500 ms, kompilerar 220 ms efter
ändring. `src/server.js` är klientsidans fyra fetch-funktioner — det är de som
byts ut mot Supabase, inget annat.

**Typst kompileras i webbläsaren** via typst.ts (`src/typst.js`). Wasm-modulen
är ~28 MB (~11 MB över nätet), initieras en gång bakom `boot()`. Figurer skickas
in som `mapShadow('/figures/f-01.svg', bytes)` i ett virtuellt filsystem, så
`image("figures/f-01.svg")` i källan löser ut mot samma sökväg som på disk.
Typst har **inga inbyggda typsnitt**: utan de sex filerna i `public/fonts` ger
varje rad text `no font could be found`, och matten kräver särskilt
NewCMMath-Regular.

### Hopp mellan utfall och källa (`src/sourcemap.js`)

Webbkompilatorn exporterar **inga spann** — `page_sources` är tom och `data-tid`
är ett innehållsfingeravtryck för inkrementell diffning, inte en källposition.
Dokumentet får därför berätta själv: `withMarkers()` skjuter in osynliga
`#metadata`-markörer i den kopia som kompileras, och `query` ger tillbaka sida
och punktposition för varje markör.

Tre saker som är lätta att gå på:

- Positionerna måste hämtas ur **samma** kompilering som artefakten, via
  `runWithWorld`. Ett ensamt `compiler.query()` misslyckas med `document is not
  compiled`, eftersom det tar en färsk snapshot utan att kompilera.
- Markören måste stå på **egen rad** och bara vid blockstart. `#__am(6)= Heading`
  gör att `=` inte längre står först på raden, och rubriken blir vanlig text.
  Aldrig inuti råblock, flerradig matte eller flerradiga anrop.
- Kompilatorns felmeddelanden pekar på **kopian**. `withMarkers` returnerar en
  radkarta och `originalLine()` översätter tillbaka, annars visar editorn fel rad.

Filen på disk rörs aldrig (invariant 1). Att kopian ger identisk layout är mätt
med riktiga `typst`, ord för ord, inte antaget. Upplösningen är blocknivå: ett
klick landar på styckets början, inte på ordet.

### Figurformatet

En figur är en vanlig SVG som Typst renderar direkt, med dragen sparade som
JSON i en HTML-kommentar sist i filen (`<!--scene:...-->`, `--` escapas till
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

Strecken ritas med **perfect-freehand**: en kontur som fylls, inte en linje som
stryks. `pathFromOutline` i `ink.js` delas av canvasen (`Path2D`) och `toSvg`.
`thinning: 0` och `simulatePressure: false` är nödvändiga — vi ritar med fast
bredd, och utan dem gissar biblioteket tryck och strecket blir ojämnt.

**Formigenkänning** (`src/shapes.js`, ren geometri utan beroenden): står spetsen
still — under `STILL_PX` i mer än `HOLD_MS` — byts punkterna mot en idealiserad
linje, ellips eller rektangel. Prövningen ligger *utanför* `dirty`-blocket i
renderloopen, eftersom en still spets inte ger några `pointermove` och därmed
ingenting som gör ritningen smutsig. `recognise()` returnerar en vanlig punktlista, så
scenformatet och `hitStroke` är opåverkade.

Ångra arbetar på hela draglistan (`st.undo`, ögonblicksbilder), inte på det
sista draget. Ett snäpp lägger den ritade formen som ett eget steg, så första
Cmd-Z ger tillbaka den innan andra raderar draget.

`Cmd-D` öppnar ritläget. Står markören på en rad som redan matchar
`image("...svg")` öppnas den figuren för påfyllning; annars skapas nästa
lediga `f-NN.svg`. Done sparar figuren och infogar `#image("figures/f-NN.svg")`
som **en enda** ångra-bar ändring, med fokus tillbaka i editorn.

Storleken kommer från figuren själv: `toSvg` skriver `width`/`height` i punkter
(`SCALE = 2.0`, alltså två ritade pixlar per punkt) medan `viewBox` står kvar i
ritpixlar. Ingen `width:` i den infogade koden — en liten skiss blir liten på
pappret. A4:s textbredd är 453 pt, så en figur bredare än ~907 ritade pixlar
spiller ut i marginalen; justera `SCALE` i `src/ink.js` om det blir ett problem.

### Var figuren hamnar

Markörens position går inte att synka mellan enheter — ett offset blir ogiltigt
så fort den andra enheten skriver en bokstav. I stället infogar varje klient vid
sin egen markör, som vid start står **sist i dokumentet** (`selection` i
`Editor.jsx`), eftersom anteckningar växer nedåt.

En figur är **väntande** om dess filnamn inte förekommer i källan — härlett i
`App.jsx`, ingen state på servern, så knappen "N new figures" dyker upp på alla
klienter av sig själv. Den är ett skyddsnät sedan Done började infoga direkt:
den fångar figurer vars rad raderats eller som aldrig kom in i texten.

### Editorn

CodeMirror 6, inte Monaco — Monaco beter sig illa med pekskärm och
iPad-tangentbord. Editorn skapas en gång och äger sedan texten; ändringar
utifrån (poll från andra enheten) går genom `setDoc`, som behåller markören.

Syntaxfärgningen ligger i `src/typstlang.js`, en `StreamLanguage` utan
tree-sitter. Tokennamnen är **strängar** (`variableName.function`), inte
`Tag`-objekt — CodeMirror slår upp dem i sin egen tabell och delar på punkt.
Utan `syntaxHighlighting(defaultHighlightStyle)` i extensions får de ingen färg
alls, språket ensamt räcker inte.

Mount-effekten har `[]` som deps, så props når den genom refen `latest` — nya
callbacks måste läggas där, annars stänger de om första renderns värden.

## Medvetet utelämnat

Offline/service worker, fjärråtkomst (`tailscale serve 5173` när det behövs),
åtkomstskydd (vem som helst på nätet kan skriva till API:t), flera dokument och
filträd, markeringsverktyg i ritläget.

## Att vara försiktig med

- `README.md` inleder med "allt sparas i OPFS". Det stämmer inte längre —
  lagringen är fil-API:t mot `document/`, vilket README:s egen nästa rubrik
  beskriver korrekt.
- `filApi()` använder blockkropp med flit i `configureServer`: ett returvärde
  tolkas av Vite som en efter-hook, och `middlewares.use()` returnerar
  connect-appen.
- Wasm-storleken är siffran som avgör om Safari på iPaden orkar. Mät där innan
  mer byggs ovanpå.
