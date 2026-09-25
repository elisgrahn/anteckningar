# STATUS

Läs det här efter `VISION.md` och `CLAUDE.md`, innan du gör något annat.

## Läge

Skeppat senast: Elis processinstruktion (VISION.md-ändringarna, `prio`- och
`observation`-etiketter, issue #14) och teckensnittsfixen i `src/typst.js` —
alla fyra PR:er sammanslagna (#11–#13, #15). Nästa uppgift: issue #14,
figurflödet ska slå GoodNotes-omvägen — oberoende av M2/synken. Väntar på
Elis: inget beslut blockerar. En begränsning flaggad: sessionen kan inte
radera grenar (se "Väntar på Elis"), tio väntar på manuell städning.

## Nu

M0 och M4 är klara och sammanslagna. M1 avfärdat av Elis — testsviten och
git-historiken räcker som skyddsnät, ingen Vercel-koppling görs (se Klart).
M2 (⛔) pågår, inte längre blockerad: teckensnittsfixen (se Klart och
Lärdomar) gör att `src/typst.js` går att köra och verifiera i den här
molnmiljön igen. Näst steg: skriv M2-implementationen (baserad på
källkodsläsningen i issue #3), be Elis om en testbegäran på hans egen dator
innan sammanslagning. M3 väntar på att M2 blir klar. Utöver M2 väntar issue
#14 (`prio`): figurflödet ska slå GoodNotes-omvägen, oberoende av M2/synken.
Elis instruktion om process (VISION.md, etiketter, issue #14, grenstädning)
genomförd, se Klart.

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
- **M2-blockeraren i Lärdomar var fel diagnosticerad, nu rättad och fixad.**
  "Chromium klarar inte typst-wasm-kompileringen" stämde inte —
  `src/typst.js` bad `loadFonts(fonts)` om sina sex lokala filer utan att
  säga att de var *hela* uppsättningen, och typst.ts (`options.init.mjs`,
  `TypstCompilerDriver.init`) tolkar en `loadFonts`-anrop utan
  `{ assets: ... }` som "inga fonter angivna" och lägger själv till sin
  egen ~20-filers standardpaket från `cdn.jsdelivr.net` — en host som
  molnmiljöns nätverkspolicy blockerar (bekräftat med `$HTTPS_PROXY/
  __agentproxy/status`: upprepade "403 to CONNECT" mot den). Fixat med
  `loadFonts(fonts, { assets: false })`, verifierat med en instrumenterad
  Playwright-körning (17 jsdelivr-hämtningar och "Failed to fetch" i
  statusfältet innan, en lyckad kompilering på 246 ms efter, inga externa
  hämtningar alls). Löser både molnmiljöns blockering och gör appen mindre
  beroende av ett nät den ändå ska klara sig utan (M5). PR:
  https://github.com/elisgrahn/anteckningar/pull/15
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

## Väntar på Elis

Inget beslut. En begränsning värd att känna till: den här sessionens
GitHub-åtkomst kan skapa och stänga grenar men inte radera dem — `git push
origin --delete` och `DELETE /repos/.../git/refs/heads/...` gav båda 403
("Write access to this GitHub API path is not permitted through this
proxy"). Tio sammanslagna grenar väntar på städning (se Lärdomar för
listan) — Elis kan radera dem i GitHubs branch-lista på tio sekunder, eller
säga åt en session med annan behörighet att göra det.

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

- **Rättelse av föregående post: det var aldrig Chromium.** Den symlänkade
  Chromium klarar typst-wasm-kompileringen fint. `net::ERR_TUNNEL_CONNECTION_FAILED`
  vid typsnittsladdning kom av att `src/typst.js` anropade `loadFonts(fonts)`
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
  kommandot. Ingen känd väg runt det från en session. Tio sammanslagna
  grenar väntar på manuell städning (PR:erna är redan stängda, bara grenen
  kvar): `claude/jolly-gates-7wbpxc` (#4), `status/m4-merged` (#5),
  `status/m2-spike` (#6), `m2-span-patch` (#7), `m2-experiment-notes` (#8),
  `claude/youthful-hawking-7la1ks` (#1), `vision/mattstocken` (#11),
  `vision/arbetssatt` (#12), `vision/hur-elis-involveras` (#13),
  `fix/typst-default-font-assets` (#15).

- Hör något av det här hemma permanent i stället för i den här loggen, flytta
  det till `CLAUDE.md` i en senare PR.
