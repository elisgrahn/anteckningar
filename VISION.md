# Vision: Anteckningar

Det här dokumentet ägs av Elis. Agenter läser det före varje uppgift men ändrar
det aldrig. Förslag på ändringar lämnas som en fråga (se "Hur Elis involveras").

## Vad appen är

En anteckningsapp där text skrivs i Typst och figurer ritas med penna, direkt
på den renderade sidan eller i en egen rityta. Byggd för föreläsningssalen.

- **iPaden är förstaklassig och självständig.** Den ska gå att skriva Typst-kod
  och rita på den utan att någon dator är på eller nåbar.
- **Datorn är lika förstaklassig.** Tangentbord för text, och ritplatta eller
  pekskärm för figurer.
- **Enheterna synkar när de når varandra**, och ingen ändring gjord offline får
  gå förlorad.
- **Dokumentet är vanlig Typst på disk.** Det ska gå att öppna i vilken editor
  som helst, versionshantera med git och kompilera med `typst compile`.

## Varför

typst.app är bra att skriva i men går inte att rita i. Anteckningsappar som går
att rita i låser in texten i egna format. Den här appen ska ge båda, utan att
någon av dem blir sämre.

## Invarianter

Brytas bara efter uttryckligt godkännande från Elis.

1. **Vanlig Typst.** `typst compile document/main.typ` fungerar utan patchar,
   plugins eller egna kompilatorer.
2. **En figur är en självständig SVG** som Typst renderar direkt, med dragen
   sparade som JSON i en kommentar sist i filen. `SCENE_OPEN` byts aldrig utan
   migrering av befintliga figurer i samma ändring.
3. **Local-first.** Varje enhet har en fullständig kopia och fungerar offline.
   Disken på synkservern är en projektion av det synkade dokumentet, inte en
   enhet som äger sanningen. (Ersätter "servern äger filerna" från och med M1.)
4. **Källan ska vara läsbar för en språkmodell.** Notation är Typst-makron, inte
   bilder. Text hör hemma i källan, inte i ritningar.
5. **Ingen sparaknapp.** Allt sparas hela tiden.
6. **Aldrig fast på "Laddar…".** Misslyckas något startar appen ändå och skriver
   orsaken i statusfältet.
7. **Inget arbete får förloras.** Varken text eller drag, varken vid synk,
   migrering eller krasch.

## Milstolpar

Markerade med ⛔ kräver att Elis godkänt ett kort designförslag innan
implementationen börjar. Övriga får påbörjas direkt.

| | Milstolpe | Klart när |
|---|---|---|
| M0 | **Grund.** Testsvit (Playwright med simulerade pennhändelser, plus kontroll att `typst compile` går igenom), CI på varje PR. | CI är grön på main, och en avsiktligt trasig ritfunktion fångas av ett test. |
| M1 ⛔ | **Textsynk med Yjs.** `y-codemirror.next` och lokal lagring i klienten. Befintlig server som relä. | Skriv offline på två enheter, anslut båda, och all text finns kvar på båda. |
| M2 | **Förhandsversion per PR** på en webbadress, så att Elis kan testa på iPaden utan dator. | En länk i varje PR öppnar en fungerande version på iPaden. |
| M3 ⛔ | **Synkserver i Rust** med `yrs`, som skriver ut `main.typ` och figurerna till disk. | Vite-pluginen är borta och `typst compile` på serverns disk ger samma dokument. |
| M4 ⛔ | **Figurer i Yjs**, varje figur som en mängd drag med ID. | Rita i samma figur på två enheter offline, anslut, och alla drag finns kvar. |
| M5 | **Full offline** som PWA med service worker. | Flygplansläge på iPaden: appen startar, går att skriva och rita i, och synkar när nätet är tillbaka. |
| M6 ⛔ | **Spann i wasm.** Egen modul med `typst` och `typst-ide`. Börjar med en spik som verifierar att `typst-ide` bygger för `wasm32`. | `withMarkers`, avslutaren och heuristiken i `sourcemap.js` är borttagna, och klick i utfallet träffar tecken, inte block. |
| M7 | **Penna på datorn.** Musen markerar när en penna upptäckts, suddänden på ritplattor suddar. | Wacom-penna ritar med tryck och vänd penna suddar, i Chrome och Firefox. |

Ordningen gäller om inte Elis säger annat. Buggar i det som redan finns går före
nya milstolpar.

## Medvetet utelämnat

Flera dokument och filträd. Åtkomstskydd utöver det synkservern behöver.
Text i ritläget. Ritande över sidbrytningar. Zoom i förhandsvisningen tills
det visar sig behövas.

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
