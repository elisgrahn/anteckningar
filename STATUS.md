# STATUS

Läs det här efter `VISION.md` och `CLAUDE.md`, innan du gör något annat.

## Nu

M0 (Grund: testsvit + CI) är genomförd:
https://github.com/elisgrahn/anteckningar/pull/1. Väntar på att CI går grönt
på PR:en och, om inget annat väljs, på att den slås ihop automatiskt (M0 är
inte ⛔, rör ingen invariant, och kräver inget manuellt test på riktig
hårdvara).

## Klart

- **M0.** Playwright-svit (`e2e/`) med ett test som ritar ett simulerat
  pennstreck och kontrollerar att en figur infogas, och ett test som kör
  riktig `typst compile document/main.typ`. GitHub Actions-workflow
  (`.github/workflows/ci.yml`) kör `npm run build` och `npm test` på varje PR.
  Verifierat under arbetet: `allowPointer` gjordes tillfälligt trasig för
  pennhändelser, pennstrecktestet slog då rött, och ändringen rullades
  tillbaka innan commit — testet fångar alltså faktiskt en trasig
  ritfunktion, inte bara en tom smoke test.
  PR: https://github.com/elisgrahn/anteckningar/pull/1

## Väntar på Elis

Inget just nu.

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

- Hör något av det här hemma permanent i stället för i den här loggen, flytta
  det till `CLAUDE.md` i en senare PR.
