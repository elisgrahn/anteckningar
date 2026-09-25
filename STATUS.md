# STATUS

Läs det här efter `VISION.md` och `CLAUDE.md`, innan du gör något annat.

## Nu

M1 och M2 väntar båda på Elis (se nedan). M4 (kö vid nätavbrott) väntar på
grön CI och sammanslagning i https://github.com/elisgrahn/anteckningar/pull/4.
M2 är ⛔ så M3 kan inte börja förrän Elis svarat på designförslaget. Nästa
uppgift efter PR #4 är slutförd: M7 eller M8, som båda saknar beroenden till
M1–M3 (M6 är också ⛔ och väntar på Elis).

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
  PR: https://github.com/elisgrahn/anteckningar/pull/4

## Väntar på Elis

- **M1 (beslut, blockerar inte annat).** Behöver ett konto hos en
  hostingtjänst för förhandsversioner per PR — inget en agent kan skapa själv.
  https://github.com/elisgrahn/anteckningar/issues/2
- **M2 (⛔, blockerar M3).** Designförslag för egen typst+typst-ide-wasm med
  spann, och hur figurankringen överlever utan `withMarkers`.
  https://github.com/elisgrahn/anteckningar/issues/3

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

- Hör något av det här hemma permanent i stället för i den här loggen, flytta
  det till `CLAUDE.md` i en senare PR.
