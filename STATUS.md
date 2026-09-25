# STATUS

Läs det här efter `VISION.md` och `CLAUDE.md`, innan du gör något annat.

## Läge

Skeppat senast: M7 (handskrivna sidor, #10) och en definitiv slutsats på
M2:s öppna fråga (issue #3) — dagens npm-paket kan inte emittera spann,
oavsett JS-anrop, för `SHOULD_ATTACH_DEBUG_INFO` är en Rust-**konstant**,
inte en körtidsflagga. Kräver en egen wasm-modul, precis vad VISION.md
redan sa. Ingen kod skriven än för den, bara research (se Lärdomar).

**Pågående diskussion med Elis:** M5 (⛔, server som inte kräver hemdatorn)
— han vill undvika Supabase, föreslog Google Drive i stället. Ingen har
frågat honom om M6 (⛔, filträd) än via `AskUserQuestion` — den frågan
ligger bara som en GitHub-kommentar från innan processreglerna ändrades
(issue #9), och bör ställas om.

Nästa uppgift: bygga och mäta den egna wasm-modulen (M2, `wasm-pack` +
`wasm32`-target saknas än), M8 (penna på datorn, oberoende av M2/M5/M6),
eller punkt 4 i #14 (kräver ett beslut, rör invariant 2). Väntar på Elis:
M5-beslutet, M6-frågan (bör ställas på nytt via `AskUserQuestion`), och
#14 väntar på hans test på iPaden under en riktig föreläsning.

## Nu

M0, M1 (avfärdad), M4 och M7 är klara. M2 (⛔): definitivt svar — en egen
wasm-modul krävs, ingen väg runt det. Näst steg: patcha
`SHOULD_ATTACH_DEBUG_INFO` i en fork av typst.ts, bygg med `wasm-pack` för
`wasm32`, mät storleken (M2:s eget klart-kriterium för spiken). M3 väntar
på M2. M6 (⛔): designförslag klart (issue #9), väntar bara på vilket namn
dagens `document/`-mapp ska få som projekt — frågan är ställd som en
GitHub-kommentar från innan `AskUserQuestion`-regeln, bör ställas om.
Issue #14 (`prio`): punkt 1–3 klara (#17), punkt 4 kvar (beslut, rör
invariant 2), och själva issuen väntar på Elis test på iPaden under en
riktig föreläsning. M5 (⛔, server utan hemdator): Elis diskuterar Google
Drive i stället för Supabase, väntar på hans beslut. M8 saknar beroenden
till M1–M6 och kan påbörjas när som helst.

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
  text) — mätt, inte antaget. PR: https://github.com/elisgrahn/anteckningar/pull/10
- **M1, avfärdat.** Elis: testsviten + git-historiken räcker, han behöver
  inte kunna kolla en PR från iPaden före sammanslagning. Ingen
  Vercel-koppling görs. https://github.com/elisgrahn/anteckningar/issues/2
  (stängd, "not planned").
- **M6, designförslaget.** Fritt filträd som en platt lista projekt under
  `notes/<namn>/` (samma `main.typ` + `figures/` som idag, en kurs med
  flera föreläsningar är fortfarande en enda fil som `#include`:ar andra),
  route-prefix `/api/:project/...`, klienten remountar hela `App` vid
  projektbyte i stället för att bygga om synken för ett byte i farten.
  Enda blockerande frågan: vilket namn dagens `document/` ska få.
  https://github.com/elisgrahn/anteckningar/issues/9 (bör ställas om via
  `AskUserQuestion`, se Väntar på Elis).
- **M2, spiken (tre omgångar, definitivt svar).** Läst källkoden på
  `Myriad-Dreamin/typst.ts` (den `typst-ts-web-compiler`/`-renderer` vi
  redan beror på, v0.7.0) via GitHubs kodsökning och en lokal klon, inte
  gissat. Slutsats: `Feat::SHOULD_ATTACH_DEBUG_INFO` är en Rust-**konstant**,
  hårdkodad `false` i alla publicerade `ExportFeature`-implementationer
  (`crates/conversion/vec2svg/src/frontend/incremental.rs:25` m.fl.) — ingen
  JS-anropad metod (`setAttachDebugInfo`, `IncrServer`, inkrementell vs.
  engångskompilering) kan ändra en Rust-konstant. `getSourceLoc` kastar
  `out of bound access ... page_sources ... actual: 0` snarare än att ge
  något upplösningsbart. Dagens npm-paket kan alltså inte emittera spann,
  punkt slut — en egen wasm-modul krävs, precis vad VISION.md:s M2-rad
  redan sa. Detaljer och alla tre spikomgångarna:
  https://github.com/elisgrahn/anteckningar/issues/3
- **M2-blockeraren i en tidigare Lärdomar-post var fel diagnosticerad, nu
  rättad och fixad.** "Chromium klarar inte typst-wasm-kompileringen"
  stämde inte — `src/typst.js` bad `loadFonts(fonts)` om sina sex lokala
  filer utan att säga att de var *hela* uppsättningen, och typst.ts
  (`options.init.mjs`, `TypstCompilerDriver.init`) tolkar ett
  `loadFonts`-anrop utan `{ assets: ... }` som "inga fonter angivna" och
  lägger själv till sin egen ~20-filers standardpaket från
  `cdn.jsdelivr.net` — en host molnmiljöns nätverkspolicy blockerar.
  Fixat med `loadFonts(fonts, { assets: false })`, verifierat med en
  instrumenterad Playwright-körning (17 jsdelivr-hämtningar och "Failed to
  fetch" innan, en lyckad kompilering på 246 ms efter, inga externa
  hämtningar alls). `npm run dev`/en riktig webbläsare mot appen fungerar
  nu i den här molnmiljön. PR: https://github.com/elisgrahn/anteckningar/pull/15
- **Elis instruktion om process genomförd.** VISION.md: ny sektion
  "Måttstocken" (https://github.com/elisgrahn/anteckningar/pull/11), tre
  punkter under "Hur teamet arbetar"
  (https://github.com/elisgrahn/anteckningar/pull/12), och nya regler för
  "Hur Elis involveras" — `AskUserQuestion` i sessionen i stället för
  GitHub-kommentarer, "Läge" överst i STATUS.md, en fråga om nästa steg i
  slutet av varje session
  (https://github.com/elisgrahn/anteckningar/pull/13). Etiketterna `prio`
  och `observation` skapade i repot. Issue #14 skapad med `prio`:
  "Figurflödet ska slå GoodNotes-omvägen"
  (https://github.com/elisgrahn/anteckningar/issues/14).
- **Issue #14, punkt 1–3.** Rita direkt ovanpå en placerad, omarkerad figur
  fyller nu på den (laddar in dess sparade streck och fortsätter på dem)
  i stället för att skapa en ny, överlappande figur — samma `hitPlaced`-yta
  som markering och drag redan använder. Punkt 2 (ny figur med en gest,
  utan namngivning) och punkt 3 (storlek som följer ritningen, inte
  sidbredden) var redan uppfyllda av befintlig kod vid genomläsning; ingen
  ändring behövdes för dem. Verifierat manuellt mot en riktig kompilering:
  två streck på samma plats gav en `#place`-rad och en figur med två
  streck på disk, ett tredje streck på annan plats gav en riktig andra
  figur. `e2e/continue-placed.spec.js` gör samma kontroll i testsviten.
  Punkt 4 (klistra in bild, rör invariant 2) och issuens eget klart-kriterium
  (Elis test på iPaden under en riktig föreläsning) är kvar — se issuen.
  Sammanslagen: https://github.com/elisgrahn/anteckningar/pull/17

## Väntar på Elis

- **M5-beslutet.** Han vill undvika Supabase. Diskuterat: klienten pratar
  direkt mot Google Drive-API:t (OAuth i webbläsaren, `drive.file`-scope),
  ingen egen backend alls — bara statisk hosting kvar att lösa (Vercel
  eller vad som är enklast). Han vill tänka mer innan han bestämmer sig;
  inget byggs förrän han svarar.
- **M6 (⛔, blockerar inget annat).** Designförslaget är klart (se Klart);
  bara namnet på dagens `document/`-projekt är den blockerande frågan.
  Ställd som en GitHub-kommentar innan `AskUserQuestion`-regeln fanns
  (issue #9) — bör ställas om i en session.
- Issue #14 väntar på Elis eget test på iPaden under en riktig föreläsning
  innan den kan stängas (dess klart-kriterium, inte något kod kan
  verifiera åt honom).
- En begränsning i sessionens GitHub-åtkomst: den kan skapa och stänga
  grenar men inte radera dem — `git push origin --delete` och `DELETE
  /repos/.../git/refs/heads/...` gav båda 403 ("Write access to this
  GitHub API path is not permitted through this proxy"). Tolv+ sammanslagna
  grenar väntar på städning (se Lärdomar för listan) — Elis kan radera dem
  i GitHubs branch-lista på tio sekunder, eller säga åt en session med
  annan behörighet att göra det.

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

- **Det var aldrig Chromium som blockerade typst-wasm-kompileringen i
  webbläsaren — en tidigare session diagnosticerade fel.** Den symlänkade
  Chromium klarar det fint. `net::ERR_TUNNEL_CONNECTION_FAILED` vid
  typsnittsladdning kom av att `src/typst.js` anropade `loadFonts(fonts)`
  utan `{ assets: false }` — typst.ts tolkade det som "inga fonter angivna"
  och lade själv till sitt eget ~20-filers standardpaket från
  `cdn.jsdelivr.net`, en host molnmiljöns nätverkspolicy blockerar. Fixat i
  `src/typst.js` (se Klart); `npm run dev`/en riktig webbläsare mot appen
  fungerar nu i den här molnmiljön, ingen begränsning kvar. Diagnosen togs
  fram genom att instrumentera en headless körning (`page.on('requestfailed'
  /'console'/...)`) i stället för att gissa vidare på tidigare hypoteser —
  gör om det direkt nästa gång något liknande dyker upp, det tar minuter.

- **Sessionens GitHub-åtkomst kan inte radera grenar.** Både `git push
  origin --delete <gren>` och `DELETE /repos/.../git/refs/heads/<gren>` gav
  403 ("Write access to this GitHub API path is not permitted through this
  proxy"), även efter att auto-mode-klassificeraren själv godkänt
  kommandot. Ingen känd väg runt det från en session. Sammanslagna grenar
  som väntar på manuell städning (PR:erna är redan stängda, bara grenen
  kvar): `claude/jolly-gates-7wbpxc` (#4), `status/m4-merged` (#5),
  `status/m2-spike` (#6), `m2-span-patch` (#7), `m2-experiment-notes` (#8),
  `claude/youthful-hawking-7la1ks` (#1), `vision/mattstocken` (#11),
  `vision/arbetssatt` (#12), `vision/hur-elis-involveras` (#13),
  `fix/typst-default-font-assets` (#15),
  `feat/continue-placed-figure-on-tap` (#17), `status/branch-cleanup-list`
  (#16), `status/session-wrap` (#18), och `m7-handwritten-pages` (#10) så
  fort den PR:en är sammanslagen.

- **`cargo`/`rustc` finns i molnmiljön (1.94.1), men `wasm-pack` och
  `wasm32-unknown-unknown`-target gör det inte.** Behövs för M2:s riktiga
  spik (bygga en patchad `typst-ts-web-compiler`/`-renderer`). Inte
  installerat i den här sessionen — nästa som tar M2 vidare behöver
  `rustup target add wasm32-unknown-unknown` och `cargo install wasm-pack`
  (eller `npm i -g wasm-pack`) innan `wasm-pack build` går att köra.

- Hör något av det här hemma permanent i stället för i den här loggen, flytta
  det till `CLAUDE.md` i en senare PR.
