# Kravspec: omgången före ritläget

Utfallet är i dag en återvändsgränd. Man ser vad man skrivit men kan inte röra
det, och för att rätta något får man leta upp stället i koden själv. Den här
omgången kopplar ihop utfallet med källan, och gör resten av verktyget dugligt
i en föreläsningssal.

Att rita direkt på den renderade sidan ligger i `kravspec-ritlage.md` och byggs
efter det här. Uppgift 1 är medvetet först: den kravspecen behöver kunna svara
på exakt samma fråga — vilken del av källan hör den här pixeln till — så spiken
betalar sig två gånger.

Arbetsordning som förut: en uppgift i taget, `npm run build` efter varje, en
commit per uppgift. Uppgifterna är sorterade så att varje steg är användbart i
sig och kan lämnas ofärdigt utan att blockera nästa. Undantaget är uppgift 2,
som bygger på 1.

Offline ligger sist trots att den är den nyttigaste av allihop. Det är för att
den är störst och rör synkmodellen, inte för att den är minst viktig. Vill du
ha den först är det ett rimligt val — då hoppas resten över.

## Invarianter som inte får brytas

Samma som förra omgången, med noteringar om var den här omgången tar i dem.

1. Vanlig Typst. Dokumentet ska gå att kompilera med `typst compile
   dokument/main.typ` utan patchar, plugins eller egna kompilatorer.
2. En figur är en självständig SVG-fil på disk som Typst renderar direkt, med
   dragen sparade som JSON i en kommentar sist i filen.
3. Servern äger filerna. Klienterna har ingen egen sanning. **Uppgift 9 tar i
   den här.** En kö av ändringar gjorda utan nät är per definition sanning som
   bara finns på klienten. Invarianten omformuleras där till: servern äger
   filerna, och klienten får hålla en kö som är tom så fort nätet finns.
4. Källan ska vara läsbar för en språkmodell. Notation definieras som
   Typst-makron, inte som bilder. **Uppgift 7 lutar sig mot den här** — den
   läser dina egna `#let`-definitioner i stället för att ha en egen symbollista.
5. Inget kräver att användaren trycker på en sparaknapp.
6. Det ska aldrig gå att fastna på "Laddar…". Misslyckas något ska appen starta
   ändå och skriva orsaken i statusfältet. **Uppgift 1 tar i den här**, eftersom
   den byter ut hur renderaren startas.

---

## 1. Dubbelklick i utfallet går till raden i koden

**Problem.** Preview är läsbar men död. Ser man ett fel får man leta upp stället
i källan för hand.

**Det här är utrett, inte gissat.** typst.ts har mekaniken, samma som typst.app
och typst-preview använder:

- `RenderSession.source_span(path: Uint32Array)` finns i wasm-bindningen, med
  JS-omslaget `getSourceLoc(path)` i `renderer.mjs`.
- Den renderade SVG:n bär `data-tid`-attribut. Elementvägen byggs genom att gå
  uppåt från det klickade elementet och samla dem.
- Haken: `renderSvg({ artifactContent })`, som `src/typst.js` använder i dag,
  skapar en session internt via `runWithSession` och slänger den direkt.
  Sessionen måste hållas vid liv för att gå att fråga.

**Ändring.**

- `src/typst.js` behåller en `RenderSession` mellan kompileringar i stället för
  att skapa och slänga en per anrop, och exporterar en funktion som tar en
  elementväg och ger tillbaka en källposition.
- `App.jsx` lyssnar på `dblclick` i `.right`, går uppåt från `event.target` och
  samlar `data-tid` till en `Uint32Array`, frågar, och flyttar markören med en
  CodeMirror-dispatch plus `scrollIntoView`.

**Osäkert, och det avgörs först.** Vad `source_span` returnerar för sträng är
inte verifierat, och kompilatorn exponerar ingen egen span-upplösning —
`get_ast`, `query` och `get_semantic_tokens` finns, men inget span till
radnummer. Första steget är därför att logga vad den ger för ett känt dokument.
Är det redan en position är resten rakt fram. Är det ett ogenomträngligt id får
uppgiften avbrytas och rapporteras, för då vilar `kravspec-ritlage.md` på en
förutsättning som inte håller och den bör skrivas om innan den påbörjas.

**Invariant 6.** Sessionen får inte kunna hänga starten. Misslyckas den ska
appen rendera utan positionsuppslagning och skriva orsaken i statusfältet.

**Klart när.** Dubbelklick på en rubrik i utfallet flyttar markören till
rubrikraden i editorn och rullar dit.

## 2. Dubbelklick på en figur öppnar den för redigering

**Ändring.** Samma mekanism som uppgift 1. Löser positionen ut till en rad som
matchar `image("...svg")` öppnas ritläget med den figuren i stället för att
markören bara flyttas. `figureAtCursor` i `Editor.jsx` gör redan matchningen och
`openCanvas` i `App.jsx` gör redan öppnandet — det som behövs är att koppla ihop
dem.

**Klart när.** Dubbelklick på en ritad figur i utfallet öppnar ritläget med
figurens drag laddade, och Klar ändrar den befintliga figuren utan att lägga in
en ny rad.

## 3. Kom ihåg pennfärgen

**Ändring.** Vald färg sparas i `localStorage` och är förvald nästa gång
ritläget öppnas. Fyra rader.

**Klart när.** Väljer du rött, ritar, klickar Klar och öppnar ritläget igen är
rött förvalt. Överlever omladdning.

## 4. Statusfältet visar när ändringar från andra enheten väntar

**Problem.** `App.jsx` blockerar tyst en inkommande ändring när du har egna
osparade ändringar (`egnaÄndringar`). Det är rätt beteende, men osynligt: den
andra enhetens text finns och du får inte veta det.

**Ändring.** Statusfältet skriver att ändringar väntar, och slutar när de
kommit in. Ingen knapp, ingen konfliktdialog — sista skrivningen vinner som
förut, det här är bara att säga vad som händer.

**Klart när.** Skriv på båda enheterna samtidigt. Den som har osparade
ändringar visar att något väntar, och det försvinner när det lagt sig.

## 5. Syntaxfärgning för Typst

**Ändring.** Det finns ingen färdig Typst-modul för CodeMirror 6, och
tree-sitter är för mycket. En `StreamLanguage` på ett sextiotal rader tar det
mesta av värdet: rubriker (`=`), matte mellan `$`, `#`-kod, strängar,
kommentarer, `*fet*` och `_kursiv_`.

**Klart när.** Matte och kod går att skilja från text på en skärmbild, och en
rad med ett ensamt `$` färgar inte resten av dokumentet.

## 6. Innehållsförteckning ur rubrikerna

**Problem.** När filen är en hel kurs blir den lång, och rullning är det enda
sättet att ta sig runt.

**Ändring.** Regex över källan efter `^=+ `, en lista i en panel som går att
fälla in, klick flyttar markören. Ingen Typst inblandad, ingen ny state — listan
härleds ur källan precis som väntande figurer gör.

**Klart när.** Hoppa mellan två föreläsningar i ett långt dokument utan att
rulla.

## 7. Symbolrad för matten

**Problem.** Utan tangentbord är `$integral_0^1 x^2 dif x$` rent plågsamt att
skriva. Det är det som avgör om appen går att använda på iPaden i en sal.

**Ändring.** En kompakt rad ovanför editorn, bara på pekskärm. Tryck sätter in
tecknet vid markören. Raden har två delar:

- Ett fast urval: `$`, `_`, `^`, `integral`, `sum`, `dif`, `->`, `<=`, `!=`,
  `alpha`, `beta`, `pi`.
- **Dina egna makron**, lästa ur källan med regex efter `#let namn = `. Kursens
  notation hamnar därmed på raden av sig själv, utan att appen behöver känna
  till den, vilket är hela poängen med invariant 4.

**Klart när.** Makrot `lg` i `dokument/main.typ` går att sätta in med ett tryck
på iPaden utan tangentbord, och raden uppdateras när du definierar ett nytt.

## 8. Städa oanvända figurer

**Problem.** Raderar man en figurrad ligger SVG-filen kvar på disken för alltid.
Sedan förra omgången kommer den inte tillbaka som väntande, alltså är den helt
osynlig.

**Ändring.** En lista över figurer vars filnamn inte förekommer i källan, med
möjlighet att radera. Kräver en ny rutt `DELETE /api/figur/:namn` i
`vite.config.js`, med samma `safeFigure`-kontroll som skrivningen har.

Radering är destruktiv och ska bekräftas, och aldrig ske automatiskt. En figur
kan vara oanvänd för att du håller på att skriva om ett stycke.

**Klart när.** En figur du slutat använda går att radera från appen, och en
figur som nämns i texten går inte att radera av misstag.

## 9. Offline

**Problem.** Servern måste vara nåbar, annars går det inte att skriva. Det är
det enda felläget som gör appen oanvändbar i stället för bara sämre, och det
inträffar i just den situation appen är byggd för.

**Ändring.** Två delar som är oberoende och bör tas som två commits.

- **Service worker** som cachar appskalet, typsnitten och wasm-modulen.
  Wasm-modulen är 28 MB, cirka 11 MB över nätet, och är därmed hela frågan.
  Mät att den verkligen ligger kvar i cachen på iPaden efter en omstart innan
  något byggs ovanpå — Safari vräker ur cachen hårdare än andra.
- **Kö för skrivningar**, i IndexedDB, som töms mot servern när nätet kommer
  tillbaka. Dokumentet och figurerna köas var för sig. Sista skrivningen vinner
  som förut; kön ändrar inte konfliktmodellen, bara när skrivningen sker.

**Invariant 3 omformuleras**, se listan ovan. Kön är sanning som bara finns på
klienten, och det är avsiktligt. Villkoret är att den töms så fort nätet finns
och att statusfältet visar när den inte är tom.

**Klart när.** Slå på flygplansläge, skriv en mening, rita en figur, slå av
flygplansläget. Båda hamnar på servern utan att något behöver klickas, och
`dokument/` på maskinen ser ut som förväntat.

---

## Inte nu

- Fritt placerade figurer och ritande direkt på den renderade sidan. Egen
  kravspec, `kravspec-ritlage.md`. Bygg uppgift 1 först, den behövs där
- Supabase. Byt ut de fyra funktionerna i `src/server.js` när behovet finns
- Åtkomstskydd på API:t. Vem som helst på samma nät kan skriva
- Flera dokument och filträd
- Konfliktlösning värd namnet. Sista skrivningen vinner räcker för en person
  med två enheter, och uppgift 4 gör bara det synligt
