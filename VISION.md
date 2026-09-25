# Vision: Anteckningar

Det här dokumentet ägs av Elis. Agenter läser det före varje uppgift men ändrar
det aldrig. Förslag på ändringar lämnas som en fråga (se "Hur Elis involveras").

## Vad appen är

En anteckningsapp för föreläsningar som ersätter både typst.app och GoodNotes:
text skrivs i Typst, och figurer och helt handskrivna sidor ritas med penna.

- **iPaden är huvudenheten.** Där antecknas det mesta, med penna och
  tangentbord.
- **Datorn är fullvärdig för text**, och ska kunna rita med penna på sikt.
- **Editorn är i nivå med typst.app.** Förhandsvisningen följer med när man
  skriver, klick i den träffar rätt tecken, och förslagen har dokumentation.
- **Inget försvinner vid nätavbrott.** iPaden är nästan alltid uppkopplad, men
  korta avbrott ska inte märkas förutom i statusfältet.
- **En enhet i taget.** Båda enheterna används, men inte samtidigt i samma fil.
  Händer det ändå blir det en konfliktkopia, aldrig en tyst överskrivning.
- **Anteckningarna är vanliga Typst-projekt på disk**, i ett fritt filträd. En
  kurs kan vara en enda fil eller en fil per föreläsning som inkluderas från en
  huvudfil. De går att öppna i vilken editor som helst, versionshantera med git
  och kompilera med `typst compile`.

## Varför

Elis antecknar i dag i typst.app när det är text och i GoodNotes när det är
handskrivet. typst.app går inte att rita i, och GoodNotes låser in texten.
Den här appen ska ge båda i en tjänst, utan att någon av dem blir sämre.

**Klart för riktig användning** när Elis kan sluta använda båda för
föreläsningar. Det kräver att editorn känns lika bra som typst.app, att inget
försvinner, att flera kurser går att hålla isär och att handskrivna sidor
fungerar.

## Måttstocken

Utan appen antecknar Elis i typst.app och ritar figurer i GoodNotes,
markerar området, tar en skärmbild, kopierar och klistrar in i typst.app,
som laddar upp filen och skriver `#image` automatiskt. Varje funktion som
rör figurer ska vara snabbare än den omvägen, annars används den inte.

Omvägens svagheter, som appen ska lösa:

- Att uppdatera en figur när föreläsaren bygger vidare kräver hela
  omvägen igen.
- Bilden blir sidbred oavsett hur stor figuren är.
- Det går inte att rita direkt på utfallet.

## Invarianter

Brytas bara efter uttryckligt godkännande från Elis.

1. **Vanlig Typst.** `typst compile` på ett projekts huvudfil fungerar utan
   patchar, plugins eller egna kompilatorer.
2. **En figur är en självständig SVG** som Typst renderar direkt, med dragen
   sparade som JSON i en kommentar sist i filen. `SCENE_OPEN` byts aldrig utan
   migrering av befintliga figurer i samma ändring. En handskriven sida är en
   figur som alla andra.
3. **Servern äger filerna.** Klienten får hålla en lokal kö med ändringar som
   inte nått servern. Kön töms så fort nätet finns, och statusfältet visar när
   den inte är tom.
4. **Källan ska vara läsbar för en språkmodell.** Notation är Typst-makron, inte
   bilder. Text hör hemma i källan, inte i ritningar.
5. **Ingen sparaknapp.** Allt sparas hela tiden.
6. **Aldrig fast på "Laddar…".** Misslyckas något startar appen ändå och skriver
   orsaken i statusfältet.
7. **Inget arbete får förloras.** Varken text eller drag, varken vid synk,
   nätavbrott, migrering eller krasch. Två versioner som krockar sparas båda.

## Milstolpar

Markerade med ⛔ kräver att Elis godkänt ett kort designförslag innan
implementationen börjar. Övriga får påbörjas direkt.

| | Milstolpe | Klart när |
|---|---|---|
| M0 | **Grund.** Testsvit (Playwright med simulerade pennhändelser, plus kontroll att `typst compile` går igenom), CI på varje PR. **Klar**, #1. | CI är grön på main, och en avsiktligt trasig ritfunktion fångas av ett test. |
| M1 | **Förhandsversion per PR** på en webbadress, så att Elis kan testa på iPaden utan dator. | En länk i varje PR öppnar en fungerande version på iPaden. |
| M2 ⛔ | **Typst i egen wasm-modul, med spann.** Egen modul med `typst` och `typst-ide`. Börjar med en spik som verifierar att `typst-ide` bygger för `wasm32` och mäter modulens storlek i Safari på iPaden. Förslaget ska visa hur figurernas ankring (`#place` efter sitt block) överlever när markörerna försvinner. | `withMarkers`, avslutaren och heuristiken i `sourcemap.js` är borttagna. Klick i utfallet träffar tecken, inte block, förhandsvisningen följer markören, och placerade figurer ankrar som förut. |
| M3 | **Förslag och fel från `typst-ide`.** Autocomplete med dokumentation och parameterhjälp, fel och varningar understrukna i koden. Dokumentets egna makron och substitutionen från `complete.js` finns kvar. | Samma förslag och fel som typst.app ger, på ett dokument som använder både inbyggda funktioner och egna makron. |
| M4 | **Kö vid nätavbrott.** Text och figurer köas lokalt (IndexedDB) när servern inte svarar och skickas när den gör det igen. Servern känner igen en skrivning som bygger på en gammal version och sparar den som konfliktkopia bredvid originalet. | Flygplansläge på iPaden en minut mitt i skrivande och ritande: allt når servern efteråt. Samma fil ändrad på två enheter utan nät: båda versionerna finns på disk. |
| M5 ⛔ | **Server som inte kräver hemdatorn.** Beslutsförslag om var servern står, med kravet att den är gratis eller nästan gratis och fungerar när hemdatorn är avstängd. Egen serverprocess i stället för Vite-pluginen, och åtkomstskydd. | iPaden skriver och synkar när hemdatorn är avstängd, och den som inte är Elis kan varken läsa eller skriva. |
| M6 ⛔ | **Filträd och flera kurser.** Fritt filträd med Typst-projekt; en kurs är en enda fil eller en huvudfil som inkluderar en fil per föreläsning. Förslaget ska ta upp hur dagens `document/` flyttas utan att något tappas. | Två kurser, en av varje sort, går att växla mellan i appen, och båda kompilerar med `typst compile`. |
| M7 | **Handskrivna sidor.** En sida som bara är en stor rityta, en figur i flödet med `#pagebreak()` runt om. | En härledning skriven helt för hand hamnar som en egen sida mellan textsidorna, och `typst compile` ger samma sida. |
| M8 | **Penna på datorn.** Musen markerar när en penna upptäckts, suddänden på ritplattor suddar. | Wacom-penna ritar med tryck och vänd penna suddar, i Chrome och Firefox. |

Ordningen gäller om inte Elis säger annat. Buggar i det som redan finns går före
nya milstolpar.

## Medvetet utelämnat

Samtidig redigering i realtid och CRDT (Yjs); en enhet i taget räcker.
Att starta appen helt utan nät (PWA). Att anteckna på föreläsarens slides
(PDF-import), som kan komma senare men inte nu. Text i ritläget. Ritande över
sidbrytningar. Zoom i förhandsvisningen tills det visar sig behövas.

## Hur teamet arbetar

- **En uppgift per tråd**, på egen gren, med en PR när den är klar.
- **Testa före PR.** `npm run build` och testsviten ska gå igenom. Nytt
  beteende får ett test.
- **Läs `CLAUDE.md`** för arkitektur och språkregler. Koden är engelsk,
  dokumentation och commit-meddelanden svenska.
- **Uppdatera `CLAUDE.md`** när arkitekturen ändras, i samma PR.
- **Sammanslagning.** En PR som klarar CI, inte rör en invariant, inte är en
  ⛔-milstolpe och inte kräver manuellt test får slås ihop utan Elis. Övriga
  väntar på honom.
- **Hellre liten och klar än stor och halvfärdig.** Dela upp en milstolpe i
  PR:er som var för sig lämnar appen fungerande.
- **Kolla issues i början av varje session.** Issues med etiketten `prio`
  går före milstolparna. Issues med etiketten `observation`, och andra
  issues från Elis, är råmaterial: omvandla dem till konkreta issues,
  prioritera in dem, svara kort vad som blev av dem och stäng dem.
- **Lös miljöproblem själv.** Kan något inte verifieras i molnmiljön är
  det teamets problem att ändra miljön eller testupplägget, inte att
  skicka verifieringen till Elis. Kräver lösningen hans behörighet,
  ställ ett beslut.
- **Städa efter dig.** Radera grenen när en PR är sammanslagen eller
  stängd.

## Hur Elis involveras

Elis är dålig på att följa upp, så frågorna till honom ska vara få, korta och
gå att besvara från telefonen. Tre sorters meddelanden, och inga andra:

**1. Antagande — blockerar inte.**
När något är oklart men går att ändra senare: välj det rimligaste, skriv vad
du valde och varför i en mening, och fortsätt. Elis kan protestera i efterhand.

> Antar att färgväljaren ska ligga kvar i verktygsraden även på datorn.
> Fortsätter så om du inte säger annat.

**2. Testbegäran — blockerar bara den PR:en.**
När något måste kännas efter på riktig hårdvara. Högst tio minuter, en länk och
en numrerad lista med vad som ska göras och vad som ska hända. Fortsätt med
nästa uppgift under tiden.

> Testa på iPaden (5 min): [länk]
> 1. Rita en pil med pennan bredvid ett stycke. Den ska synas direkt.
> 2. Vila handen på skärmen medan du ritar. Inga extra streck ska uppstå.
> Svara "funkar" eller vad som hände.

**3. Beslut — blockerar.**
Bara för ⛔-milstolpar, ändringar av en invariant, nya tunga beroenden, och
ändringar av data som redan finns på disk. Ge två eller tre alternativ, ett
rekommenderat, och vad som händer om Elis inte svarar.

> M1 kan byggas med Yjs eller Automerge. Jag rekommenderar Yjs: färdig
> CodeMirror-bindning och en Rust-port (yrs) till M3. Svara A eller B.
> Utan svar jobbar jag vidare med buggar och M2 under tiden.

Samla hellre ihop frågor än att skicka dem en och en. Finns det redan två
obesvarade beslut, starta inget nytt som beror på dem; ta något annat ur listan.

**Var frågorna ställs.** Testbegäran och beslut skrivs som en kommentar i
PR:en, eller i en issue om det inte finns någon PR, och börjar alltid med
`@elisgrahn` så att han får en notis i GitHub-appen. Antaganden räcker att
skriva i PR-beskrivningen.

## Mellan sessioner

Varje session börjar utan minne av de tidigare. `STATUS.md` i repots rot är
teamets gemensamma minne och uppdateras i slutet av varje session, i samma
PR som arbetet:

- **Nu:** milstolpen och uppgiften som pågår.
- **Klart:** en rad per avslutad uppgift, med PR-länk. Rulla ihop äldre rader
  till en sammanfattning per milstolpe.
- **Väntar på Elis:** varje öppen testbegäran och beslut, med länk.
- **Lärdomar:** fällor som nästa session behöver känna till. Hör de hemma
  permanent, flytta dem till `CLAUDE.md`.

En session läser `VISION.md`, `CLAUDE.md` och `STATUS.md` innan den gör något
annat.

**Aldrig utan Elis:** ändra det här dokumentet, bryta en invariant, radera
figurer eller annan användardata, skriva om historik på main.
