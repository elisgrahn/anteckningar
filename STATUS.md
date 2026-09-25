# STATUS

Läs det här efter `VISION.md` och `CLAUDE.md`, innan du gör något annat.

## Nu

M0, M4 och M7 är klara. M1 avfärdat av Elis — testsviten och git-historiken
räcker som skyddsnät, ingen Vercel-koppling görs (se Klart). M2 (⛔): kan
inte verifieras empiriskt i den här molnmiljön (se Lärdomar), så i stället
för att gissa en implementation väntar en liten testbegäran hos Elis
(issue #3, ~5 minuter på hans egen dator) på svar — den avgör om spannet
redan går att slå upp utan en Rust-patch. M3 väntar på M2. M6 (⛔): nytt
designförslag (issue #9) väntar på Elis — bara vilket namn dagens
`document/`-mapp ska få som projekt är den blockerande frågan. Näst på tur
medan båda väntar: M8 (penna på datorn) — behöver Wacom-hårdvara att testa
mot, så en testbegäran där blir sannolikt sista steget även för den.

## Klart

- **M0.** Playwright-svit (`e2e/`) med ett test som ritar ett simulerat
  pennstreck och kontrollerar att en figur infogas, och ett test som kör
  riktig `typst compile document/main.typ`. GitHub Actions-workflow
  (`.github/workflows/ci.yml`) kör `npm run build` och `npm test` på varje PR.
  Verifierat under arbetet: `allowPointer` gjordes tillfälligt trasig för
  pennhändelser, pennstrecktestet slog då rött, och ändringen rullades
  tillbaka innan commit — testet fångar alltså faktiskt en trasig
  ritfunktion, inte bara en tom smoke test. Sammanslagen:
  https://github.com/elisgrahn/anteckningar/pull/1
- **M4.** Lokal kö (IndexedDB, `src/queue.js`) för skrivningar som inte når
  servern på grund av ett nätverksfel — de köas i stället för att tappas, och
  skickas så fort en poll lyckas igen. Varje skrivning bär `X-Base-Mtime`;
  skiljer sig den från filens riktiga `mtime` på servern sparas den som en
  konfliktkopia bredvid originalet (`writeVersioned` i `vite.config.js`) i
  stället för att skriva över, så två enheter som skrivit i samma fil utan
  nät mellan sig aldrig tappar den ena versionen. `e2e/queue.spec.js`:
  ett test som blockerar `/api/doc`, skriver, väntar på att statusfältet
  visar "not synced", släpper blockeringen och kontrollerar att texten når
  servern efter nästa poll; och ett test som skickar två skrivningar mot
  samma bas-`mtime` direkt mot fil-API:t och kontrollerar att den andra
  hamnar i en konfliktfil på disk i stället för att skriva över den första.
  Sammanslagen: https://github.com/elisgrahn/anteckningar/pull/4
- **M7.** "New page" i huvudet öppnar samma ritläge som `Cmd-I` men med en
  `pageSize`-prop (`Canvas.jsx`, A4 i punkter) och en centrerad
  "pappersark"-yta i stället för att fylla hela rutan. Done infogar
  `#pagebreak()` + figuren + `#pagebreak()` som en rad — ingen ankring,
  ingen `#place`, sidan lever i flödet som vilken `#image` som helst.
  `ink.js`s `toSvg(strokes, fixedSize)` skriver den fasta storleken i
  stället för att härleda den ur bläckets ram, så en tom eller nästan tom
  sida ändå blir sidstor. Två test: `e2e/page-draw.spec.js` ritar ett
  pennstreck och kontrollerar att raden får rätt `#pagebreak()`-omslag
  (verifierat att det fångar en trasig infogning: bytte tillfälligt till
  vanlig `figureCode` i `finishCanvas`, testet slog rött, återställt innan
  commit), och ett andra test kör riktig `typst compile` på en liten fixtur
  och kontrollerar att exakt tre sidor kommer ut (text, den ritade sidan,
  text) — mätt, inte antaget.
- **M1, avfärdat.** Elis: testsviten + git-historiken räcker, han behöver
  inte kunna kolla en PR från iPaden före sammanslagning. Ingen
  Vercel-koppling görs. https://github.com/elisgrahn/anteckningar/issues/2
  (stängd, "not planned").
- **M2, spiken (två omgångar).** Läst källkoden på `Myriad-Dreamin/typst.ts`
  (den `typst-ts-web-compiler`/`typst-ts-renderer` vi redan beror på, v0.7.0)
  via GitHubs kodsökning och en lokal klon, inte gissat. Första fyndet:
  `RenderSession.getSourceLoc(path)`/`data-span`-attributet på renderade
  SVG-element är redan kompilerade in i vår nuvarande wasm-fil — ingen
  ombyggnad krävs för att gå från ett klickat element till ett Typst-spann.
  Andra fyndet, ännu bättre: den data som idag är tom (`page_source_mapping`,
  det CLAUDE.md kallar tomt `page_sources`) fylls bara i om
  `compiler.setAttachDebugInfo(true)` slås på — också en redan skickad
  JS-metod, men bara på den **inkrementella** kompileringsvägen, som
  `src/typst.js` inte använder idag (vi kör ett engångsanrop via
  `runWithWorld`/`world.vector()`). Möjligen krävs alltså ingen Rust-patch
  alls. Kvar att verifiera: om spann-id:t den vägen ger faktiskt går att slå
  upp till rad/kolumn med en redan exponerad funktion, eller om det (som
  `data-tid` redan är) bara är ett innehållsfingeravtryck som kräver den lilla
  patchen från första spiken (`resolve_source_span` i
  `crates/reflexo-typst/src/error.rs`, identifierad men inte skriven).
  Tredje fyndet: `IncrServer::default()` sätter redan `should_attach_debug_info
  = true`, `setAttachDebugInfo` behövs alltså inte alls — men den metoden
  finns bekräftat bara på `IncrServer`, inte på `TypstCompiler`, så bytet är
  ett sessionsmodellsbyte (`manipulateData`/återanvänd session), inte bara en
  flagga. Försökte verifiera empiriskt (ett kastprov i `src/typst.js`, borttaget
  igen) men körde in i samma Chromium-begränsning som redan är dokumenterad
  nedan under Lärdomar — även appens vanliga kompilering misslyckas i den här
  molnsessionens symlänkade Chromium. Detaljer:
  https://github.com/elisgrahn/anteckningar/issues/3

## Väntar på Elis

- **M2 (⛔, blockerar M3).** Testbegäran, ~5 minuter: kör ett litet
  konsolskript och klistra in vad det skriver ut.
  https://github.com/elisgrahn/anteckningar/issues/3
- **M6 (⛔, blockerar inget annat).** Designförslag klart; bara namnet på
  dagens projekt är den blockerande frågan.
  https://github.com/elisgrahn/anteckningar/issues/9

## Lärdomar

- **Molnmiljön saknar både `typst` och Playwrights webbläsare från början.**
  `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` fanns och innehöll en
  Chromium-build, men av en annan revision än den `@playwright/test` (via
  `package.json`) förväntade sig — `chromium-1194` fanns, `1243` söktes.
  Löst genom att bara acceptera det för lokal interaktiv körning i den här
  sessionen (aldrig committat); i CI laddar `npx playwright install --with-deps
  chromium` ner rätt revision själv, vilket är den robusta vägen. Förslag på
  setup-skript för nästa session/molnmiljö, så det inte behöver göras om för
  hand (t.ex. som en `session-start`-hook):

  ```sh
  # typst — ingen apt-paket, binären hämtas från GitHub Releases
  curl -sSL -o /tmp/typst.tar.xz \
    https://github.com/typst/typst/releases/latest/download/typst-x86_64-unknown-linux-musl.tar.xz
  tar xf /tmp/typst.tar.xz -C /tmp
  install -m 755 /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst

  # Playwrights Chromium, om den förinstallerade revisionen inte matchar
  # @playwright/test i package.json (kontrollera med `npx playwright --version`
  # mot mappnamnen i $PLAYWRIGHT_BROWSERS_PATH innan detta körs i onödan)
  npx playwright install --with-deps chromium
  ```

- **Pennsimulering måste gå via CDP, inte `locator.dispatchEvent()`.** Ett
  odispatchat/syntetiskt (`isTrusted: false`) pointer-event ger tom lista
  från `PointerEvent.getCoalescedEvents()` per spec, och `Canvas.jsx` läser
  rörelsepunkterna just därifrån (`e.nativeEvent.getCoalescedEvents()`).
  Testet ritar därför via `Input.dispatchMouseEvent` med `pointerType: 'pen'`
  (se `e2e/pen.js`) — riktiga, betrodda pointer-events, samma väg touch- och
  pennmaskinvara faktiskt tar.

- **Testsviten får aldrig peka mot `document/`.** Det är de riktiga
  föreläsningsanteckningarna, incheckade i repot. `vite.config.js` läser nu
  `ANTECKNINGAR_DOCUMENT_DIR` (default `document`, som förut) så att
  `playwright.config.js` kan peka dev-servern mot en tom mapp i
  `os.tmpdir()` under testkörning, rensad före varje körning.

- **Chromium-revisionsmissmatchen (ovan) går att lappa lokalt utan nät**, om
  `npx playwright install` inte når `cdn.playwright.dev` (blockerad i den här
  molnmiljöns proxy). `/opt/pw-browsers/chromium-1194` eller
  `chromium_headless_shell-1194` finns oftast kvar från en tidigare
  installation; symlänka dess `chrome-linux`-mapp till den nya revisionens
  förväntade sökväg (`chromium_headless_shell-<ny>/chrome-headless-shell-linux64`)
  och symlänka binären `headless_shell` → `chrome-headless-shell` i den mappen.
  Aldrig committat — bara ett sätt att köra `npm test` interaktivt i sessionen
  när CI ändå laddar rätt revision själv.

- **Samma symlänkade Chromium klarar inte typst-wasm-kompileringen i
  webbläsaren**, upptäckt under M2-spiken: `net::ERR_TUNNEL_CONNECTION_FAILED`
  redan vid typsnittsladdning, innan appens egen kod ens är inblandad.
  `draw.spec.js` märker inte av det eftersom figurinfogning inte väntar på en
  lyckad kompilering — bara `npm run dev`/en riktig webbläsare kan alltså
  verifiera något som rör `src/typst.js` i den här molnmiljön just nu.

- Hör något av det här hemma permanent i stället för i den här loggen, flytta
  det till `CLAUDE.md` i en senare PR.
