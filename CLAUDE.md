# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Filen beskriver appen som den är. Vart den ska, invarianterna och arbetssättet
står i `VISION.md`; läget just nu i `STATUS.md`. Säger de emot varandra gäller
`VISION.md`.

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
npm test             # playwright test — startar dev-servern själv
```

Ingen linter, inget typsystem. Verifiering av UI sker i övrigt genom att köra
appen och titta på förhandsvisningen.

**Testsviten** (`e2e/`, `playwright.config.js`) är två saker: `typst-compile.spec.js`
kör riktig `typst compile document/main.typ` (invariant 1, mätt — inte antaget),
och `draw.spec.js` ritar med ett simulerat pennstreck och kontrollerar att en
figur infogas. `npm test` startar sin egen vite-server på port 5273 mot en
tom mapp i `os.tmpdir()`, aldrig mot `document/` — se `ANTECKNINGAR_DOCUMENT_DIR`
i `vite.config.js`, annars skulle testkörningen skräpa ner de riktiga
anteckningarna med provfigurer.

Pennstrecket i `e2e/pen.js` går via CDP (`Input.dispatchMouseEvent` med
`pointerType: 'pen'`), inte `locator.dispatchEvent()`. Ett odispatchat/
otillförlitligt event (`isTrusted: false`) ger tom lista från
`PointerEvent.getCoalescedEvents()` per spec, och `onMove` i `Canvas.jsx` läser
punkterna just därifrån — ett vanligt dispatchat event ritar alltså ingenting,
tyst.

CI (`.github/workflows/ci.yml`) kör `npm run build` och `npm test` på varje PR
och laddar ner både `typst` och Playwrights Chromium själv — se STATUS.md
"Lärdomar" för molnmiljöns motsvarande setup-skript.

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
`ensure()` om det saknas. Ett fritt filträd med flera kurser är planerat (M6 i
`VISION.md`).

**Kö vid nätavbrott (M4), `src/queue.js`.** Misslyckas ett sparförsök av ett
nätverksfel (`api.isOffline`, ett `TypeError` från `fetch` självt — skilt från
ett HTTP-felsvar, som inte köas) hamnar skrivningen i IndexedDB i stället för
att försvinna. En nyckel per fil (`"doc"`, `"figure:f-01.svg"`) så ett andra
offline-redigering ersätter den köade i stället för att stapla — bara det
senaste innehållet betyder något, precis som den vanliga sparvägen redan
fungerar. `flushQueue()` i `App.jsx` körs efter varje lyckad poll (alltså bara
när servern faktiskt just svarat) och skickar det som ligger kvar.

Varje skrivning bär `X-Base-Mtime`: vilken version den byggdes på. Skiljer sig
det från filens `mtime` på servern (`writeVersioned` i `vite.config.js`) sparas
den som en konfliktkopia bredvid originalet i stället för att skriva över — det
är så invariant 7 hålls när en enhet varit offline länge nog att den andra
hunnit skriva emellan. Ingen egen upplösning av konflikten; båda versionerna
finns bara på disk.

**Synk är poll + debounce, sista skrivningen vinner.** `App.jsx` håller hela
modellen i `sync.current = { mtime, saved, figures, writing, loaded }`;
skillnaden mellan `saved` (vad vi senast skickade) och `sourceRef.current` (vad
som står i editorn) avgör om ett inkommande serversvar får skriva över texten.
`loaded` är ett skydd mot det enda sätt appen kan förstöra arbete på: en
misslyckad första hämtning faller tillbaka på tom editor (invariant 6), och utan
flaggan skrev autospara den tomheten till disk. Sparar
400 ms efter senaste tangenttryck, pollar var 1500 ms, kompilerar 220 ms efter
ändring. `src/server.js` är klientsidans fyra fetch-funktioner — det är de som
byts ut när kön och den egna servern byggs (M4 och M5 i `VISION.md`), inget
annat.

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
- En `#place`-rad får **ingen markör**, och räknas som blank för raden under.
  Annars faller två fel ut: figuren blir ett eget ankare, så nästa figur som
  ritas bredvid hänger på en figur i stället för på texten — och en figur som
  dras utan att flytta sig ankrar till sig själv. Och står raden direkt ovanför
  ett block stjäl den blockets markör, eftersom en markör bara sätts efter en
  blank rad, varpå figuren ankrar två block ned.

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

Beteendet — penna, handlovsskydd, snäppgest, ångra — ligger i `src/strokes.js`
och delas av båda ytorna: helskärmsrutan (`Canvas.jsx`) och ritandet på den
renderade sidan (`PageDraw.jsx`). Komponenterna äger bara sin yta och sin
rendering. Lägg aldrig beteende i en av dem; det glider isär.

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

`Cmd-I` öppnar ritläget — `Cmd-D` är `selectNextOccurrence` i editorn. Står
markören på en rad som redan matchar
`image("...svg")` öppnas den figuren för påfyllning; annars skapas nästa
lediga `f-NN.svg`. Done sparar figuren och infogar `#image("figures/f-NN.svg")`
som **en enda** ångra-bar ändring, med fokus tillbaka i editorn.

Storleken kommer från figuren själv: `toSvg` skriver `width`/`height` i punkter
(`SCALE = 2.0`, alltså två ritade pixlar per punkt) medan `viewBox` står kvar i
ritpixlar. Ingen `width:` i den infogade koden — en liten skiss blir liten på
pappret. A4:s textbredd är 453 pt, så en figur bredare än ~907 ritade pixlar
spiller ut i marginalen; justera `SCALE` i `src/ink.js` om det blir ett problem.

### Handskrivna sidor (M7)

"New page" i huvudet öppnar samma `Canvas.jsx` som `Cmd-I`, men med en
`pageSize`-prop (`A4_PT`, i punkter) och en synligt annorlunda yta: en
centrerad "pappersark"-låda (`.sheet`) i stället för att fylla hela rutan
kant i kant, så det är tydligt att man ritar en hel sida och inte en liten
skiss. Done infogar `#pagebreak()`, figuren, `#pagebreak()` som **en enda**
rad — figuren lever i flödet precis som en vanlig `#image`, den äger bara
sidbrytningarna runt sig. Ingen ankring, inget `#place`: en handskriven sida
flyttas genom att flytta raden för hand, som vilken text som helst.

Storleken skiljer sig från en vanlig figur: `toSvg(strokes, fixedSize)` tar en
valfri `{width, height}` i punkter och skriver **den** som `width`/`height` i
stället för att härleda den ur bläckets ramar + vaddering. Utan den (alla
andra anrop) är beteendet oförändrat. Bläckets koordinater fångas ändå i
CSS-pixlar av lådan, som `Canvas.jsx` alltid gjort — omräkningen till
sidrelativa ritpixlar (`scaleRef`, `pageSize.height * SCALE / lådans CSS-höjd`)
sker bara en gång, i `done()`, inte vid varje `pointermove`. Annars hade
render-loopen och den fångade punktlistan behövt två olika koordinatsystem
samtidigt.

### Rita på utfallet (`src/PageDraw.jsx`)

Pennan ritar, fingret rullar. Fingerrullningen görs för hand, eftersom
`touch-action` inte kan skilja ett penndrag från ett fingerdrag. Musen ritar,
för en laptop har ingen penna. Svg:n har `pointer-events: none` — utfallet är en
bakgrund, inte en text man markerar i.

Punkterna hålls i **ritade pixlar** (sidpunkter × `SCALE`), inte skärmpixlar, så
figuren blir lika stor oavsett skalning och snäpptröskorna betyder samma sak på
båda ytorna.

En fritt placerad figur skrivs som `#place(dx:, dy:, image(...))` som ett eget
stycke **efter** sitt block, alltså före nästa block. Kopierar man en rubrik med
allt under sig följer figuren med.

Det hänger på **avslutaren**. `withMarkers` avslutar kopian med `#block()`
(`SENTINEL`), och utan den håller inget av det här: ett osynligt block som är
sist i flödet rapporterar en position en radhöjd för högt tills något följer
efter det. Mätt isär:

| | flödesposition | efter en redigering |
|---|---|---|
| place mellan två block | 91,30 | 91,30, stabil |
| place sist i dokumentet | 78,10 | 91,30, hoppar |

Prövade avslutare: `#block()` och `\` ger rätt position; vår egen markör,
`#v(0pt)`, `#[]` och `#metadata(none)` gör det inte. `#block()` valdes för att
den inte är en radbrytning. Den ändrar inte layouten, mätt ord för ord och på
sidantal.

**Den kända kostnaden:** filen på disk har ingen avslutare, så en figur som hör
till *sista* blocket ritas cirka 13 pt högre av `typst compile` än av appen.
Skillnaden gäller bara det sista blocket och försvinner så fort något skrivs
efter det. Flyttas raden tillbaka till före sitt block försvinner kostnaden, men
då står varje figur ovanför sin text i källan.

Två fällor: **ankaret väljs på bläckets övre kant** (`inkTopLeft`), inte på det
vadderade hörnet — vadderingen är 8 linjebredder, högre än en textrad, så en
understrykning skulle annars ankra till stycket ovanför. Och `withMarkers`
lägger en markör **efter sista raden**, annars finns inget att ankra mot för
något ritat under allt annat.

Ett snabbt tryck som inte rörde sig räknas som klick, inte märke, annars lämnar
dubbelklicket som hoppar till källan två prickar efter sig.

### Röra en placerad figur (`src/placed.js`)

En placerad figurs rektangel är ankarets position + `dx`/`dy` + storleken som
står i figurens egen `width`/`height`. Ingen extra query och ingen state: den
härleds ur källan och senaste kompileringens markörer, som innehållsförteckningen
och de väntande figurerna.

Ett **tryck markerar** — solid ram, streckat ankarstreck, rund X-knapp. Ett
**drag innanför ramen flyttar**, dubbelklick öppnar för påfyllning, X tar bort
raden. Markering är ett läge man går in i med flit, och det är den regeln som
gör att en omarkerad figur fortfarande går att rita ovanpå; att fylla på en
skiss är just det. Esc avmarkerar.

Det streckade strecket visar var figuren *är* förankrad, och under ett drag var
den *skulle* förankras om man släppte nu. Ankringen är modellens enda osynliga
del och den syns först nästa gång texten flödar om — därför visas den.

Två funktioner måste ge samma svar, annars byter en figur ankare bara av att bli
vidrörd: `anchorFor` (vilket block ett bläckhörn hör till) används både när
figuren ritas och när den dras, och `anchorOf` (vilket block en befintlig rad
hänger på) läser tillbaka det. Mätt med riktiga `typst` på en fixtur — en figur
vid varje block, en under allt, och en flytt: rektangeln läses tillbaka på samma
punkt som pennan lämnade den, och ett drag ger samma ankare som raden har.

En flytt som byter ankarblock **flyttar raden i källan** (`moveLine` i
`Editor.jsx`), inte bara talen — annars pekar förskjutningen från fel block så
fort texten flödar om. Raden tas bort med den blanka rad den annars lämnar efter
sig, och båda ändringarna går ut i en dispatch, alltså ett ångra-steg.

Radering tar bara bort raden; SVG:n ligger kvar och dyker upp i städlistan. Det
är därför den listan finns.

Fylls en placerad figur på så att bläcket växer uppåt eller åt vänster flyttar
sig figurens hörn, eftersom `toSvg` räknar om ramen. `dx`/`dy` justeras med samma
belopp när ritläget stängs, annars glider figuren undan lika mycket som den växte.
Samma korrigering (`continuePlaced` i `App.jsx`) gäller båda vägarna in: genom
Canvas.jsx-dialogen (`finishCanvas`) och genom att rita direkt på sidan.

**Ett förstatryck som landar på en omarkerad figur fyller på den**, i stället
för att rita en ny figur ovanpå (`PageDraw.jsx`, `continuing`-refen). Träffen
prövas bara vid själva nedtrycket och bara när ingenting redan ritas — figurens
sparade streck laddas in i ritläget då, innan pennan ens rört sig, så att ett
kort tryck som visar sig vara ett *val* i stället (inget drag) kan kasta den
inlästa kopian ograverad. Samma `placed`-rektangel avgör träffen som redan
används för markering och drag, så samma yta man kan dra i är den man kan
fylla på i.

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

Tilläggen är `basicSetup` från `codemirror`-paketet, inte en handplockad lista:
radnummer, ångra, flera markörer, matchande och självstängande parenteser,
vikning, sökning och standardtangenterna på en gång. Det som ligger efter den i
listan lägger till eller ersätter en del av den med flit — språket,
`search({ top: true })`, `autocompletion({ override })` och radbrytningen.

`Mod-i` för ritläget är en följd av bytet: `basicSetup` ger `Mod-d` till
`selectNextOccurrence`, och `Prec.high` runt ritläget vann över den. Genvägen
står på knappen i huvudet, som är den iPaden går efter. `Mod-h` är ett alias
till sökpanelen, för det är det VS Code använder för ersätt — panelen är samma
som `Mod-f` öppnar och har ersättningsfälten. `Tab` tar emot ett förslag och
returnerar `false` när inget är öppet, så den faller igenom som förut;
snippetfältens egen `Tab` ligger på `Prec.highest` och vinner över den.

Syntaxfärgningen ligger i `src/typstlang.js`, en `StreamLanguage` utan
tree-sitter. Tokennamnen är **strängar** (`variableName.function`), inte
`Tag`-objekt — CodeMirror slår upp dem i sin egen tabell och delar på punkt.
Utan `syntaxHighlighting(defaultHighlightStyle)` i extensions får de ingen färg
alls, språket ensamt räcker inte.

Mount-effekten har `[]` som deps, så props når den genom refen `latest` — nya
callbacks måste läggas där, annars stänger de om första renderns värden.

#### Förslagen (`src/complete.js`)

Fem källor, alla härledda ur dokumentet självt eller ur en kort handskriven
lista. De skickas in med `autocompletion({ override })` och inte som
språkdata, eftersom språkdatans `autocomplete` rymmer **en** källa och en array
där tolkas som en lista med förslag, inte som en lista med källor.

- Typst-kommandon (`#figure`, `#image`, `#let`, `#set`, `#place`) som snippets,
  bara utanför matte.
- Matematiska symbolnamn, bara i matte. De som tar argument är snippets.
- Dokumentets egna `#let`-makron, via samma `macros()` som symbolraden. Bara
  namnet i matteläge, med `#` utanför — så vill Typst ha dem.
- `completeAnyWord`, ord som redan står i dokumentet.
- **Substitution**: vad det som står under markören har sagts vara lika med
  tidigare. Tabellen byggs av `lhs = rhs` funna mellan dollartecken, plus varje
  `namn(argument)` så att `v` föreslår `v(t)`. Resultatet har `filter: false`,
  för förslaget är vad texten ska *bli* — CodeMirrors egen filtrering skulle
  kasta `2g` som icke-träff på `v(t)`. Aldrig automatisk: att substituera är ett
  räknesteg, inte en stavningsrättelse, så det väljs ur listan.

Tabellerna byggs om bara när texten ändrats (`cache` i filen) — en källa körs
vid varje tangenttryck och läser hela dokumentet.

Matteläget är `mathAt()` i `typstlang.js`: paritetsräkning av `$` från styckets
början, samma regel som tokenizern följer, där en blank rad avslutar matte som
lämnats öppen. Lokalt, så ett ensamt `$` längre upp inte vänder varje rad efter
sig. `inMath()` i `Editor.jsx` är numera samma funktion.

`$` sluter sig själv genom språkdata (`closeBrackets: { brackets: [...] }`) —
det är enda vägen, för ett dollartecken är ingen parentes för CodeMirror. Ett
par per tryck: `$$` i Typst är inte LaTeX:s blockmatte, och andra trycket
hoppar förbi det tecken som redan står där. `'` är borttaget ur listan med
flit; det här är svensk löptext, inte kod.

## Medvetet utelämnat

Fjärråtkomst (`tailscale serve 5173` när det behövs),
åtkomstskydd (vem som helst på nätet kan skriva till API:t), flera dokument och
filträd, markeringsverktyg i ritläget. Kö vid nätavbrott, egen server med
åtkomstskydd och filträd saknas än så länge men är planerade (M4–M6 i
`VISION.md`).

## Att vara försiktig med

- `README.md` inleder med "allt sparas i OPFS". Det stämmer inte längre —
  lagringen är fil-API:t mot `document/`, vilket README:s egen nästa rubrik
  beskriver korrekt.
- `filApi()` använder blockkropp med flit i `configureServer`: ett returvärde
  tolkas av Vite som en efter-hook, och `middlewares.use()` returnerar
  connect-appen.
- Wasm-storleken är siffran som avgör om Safari på iPaden orkar. Mät där innan
  mer byggs ovanpå.
- **`npx vite` eller `npm run dev` utan `ANTECKNINGAR_DOCUMENT_DIR` pekar mot
  de riktiga anteckningarna i `document/`.** Bara `npm test` sätter den åt en
  tom temp-mapp automatiskt (`playwright.config.js`). Ett manuellt
  Playwright-skript mot en egen `vite`-process för att verifiera något i
  webbläsaren — värdefullt nu när fil-fixen i #15 gjort det möjligt i
  molnmiljön — skriver till skarpt läge om `ANTECKNINGAR_DOCUMENT_DIR` inte
  sätts uttryckligen till en temp-mapp. `git status document/` direkt efter
  en sådan körning, innan något annat, om det händer ändå.
