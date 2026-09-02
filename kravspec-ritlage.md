# Kravspec: rita direkt på utfallet

I dag ritar man i en tom helskärmsruta och figuren hamnar där markören står.
Det fungerar, men det är inte så man antecknar. Man vill dra en pil till just
det ordet, ringa in ett uttryck, skriva en kommentar i marginalen bredvid den
rad den gäller. Den här omgången gör utfallet till en yta man kan rita på.

Förutsättningarna är andra än när den här specen först nämndes. Hoppet mellan
utfall och källa är byggt och mekanismen finns i `src/sourcemap.js`: osynliga
metadata-markörer i minneskopian, och `query` som ger sida och punktposition för
varje block. Den ger oss **koordinater**, vilket är exakt vad ritande på sidan
behöver. Spannvägen är utesluten och behöver inte utredas igen — se
`kravspec-nasta.md`.

Arbetsordning som förut: en uppgift i taget, `npm run build` efter varje, en
commit per uppgift.

## Invarianter som inte får brytas

1. Vanlig Typst. Dokumentet ska gå att kompilera med `typst compile
   document/main.typ` utan patchar, plugins eller egna kompilatorer.
2. En figur är en självständig SVG-fil på disk, med dragen som JSON i en
   kommentar sist i filen. **Oförändrad här** — `ink.js` rörs inte, det är bara
   ytan man ritar på som byter plats.
3. Servern äger filerna. Klienterna har ingen egen sanning.
4. Källan ska vara läsbar för en språkmodell.
5. Inget kräver att användaren trycker på en sparaknapp.
6. Det ska aldrig gå att fastna på "Laddar…".

---

## Avgjort i förväg: hur en fritt placerad figur uttrycks

Det här är omgångens hela knut, så den löses innan något byggs.

**Problemet.** "Fritt placerad" och "flödande text" går emot varandra. Ritar man
en pil vid en viss punkt på sidan och sedan lägger till en mening högre upp,
ska pilen följa med sitt stycke — inte ligga kvar och peka på fel sak. Absoluta
sidkoordinater ger det senare, och det är fel.

**Lösningen.** Figuren ankras till blocket den ritades vid, och förskjutningen
lagras relativt det:

```typst
#place(dx: 120pt, dy: -6pt, image("figures/f-07.svg"))
```

Raden står direkt efter sitt ankarblock. Flödar texten om följer figuren med.

**Verifierat med riktiga `typst`, inte antaget:**

- `#place` påverkar inte textflödet. Ordens bounding boxes i PDF:en är identiska
  med och utan `#place`-raden.
- Flödespositionen där raden står går att fråga efter, alltså är figurens
  absoluta plats på sidan = ankarets position + `(dx, dy)`. Det behövs ingen
  extra query för att veta var en placerad figur hamnade — markörmekanismen ger
  redan ankaret, och `dx`/`dy` står i källan.

**Invariant 1 och 4 håller.** `#place(dx:, dy:, image(...))` är vanlig Typst och
en läsbar rad.

---

## 1. Rita direkt på sidan

**Ändring.** En genomskinlig ritayta över förhandsvisningen, i samma
koordinatsystem som sidan.

- **Interaktionsmodellen: pennan ritar, fingret rullar.** Samma princip som
  handlovsskyddet i dag bygger på. Ingen lägesknapp att glömma, och en iPad utan
  penna beter sig som förut. `pointerType === 'pen'` avgör.
- Klickpunkten räknas om till sida och punkter med samma kod som dubbelklicket
  använder (`pageAt` i `src/sourcemap.js`).
- **Skalan.** En punkt på sidan ska bli `SCALE` ritade pixlar i den sparade
  figuren, annars kommer figuren tillbaka i fel storlek. `SCALE` bor i
  `src/ink.js` och är 2,0.
- Klar sparar figuren precis som i dag, och skjuter in en `#place`-rad efter
  ankarblocket. Ankaret är den sista markören på eller ovanför dragens
  övre vänstra hörn; `dx`/`dy` är avståndet dit.

**Indatahanteringen ska delas, inte kopieras.** Pennans träffprövning,
handlovsskyddet, snäppgesten och ångra-historiken ligger i dag inne i
`Canvas.jsx`. De hör inte ihop med helskärmsrutan utan med *att rita*, och ska
lyftas ut så att båda ytorna använder samma kod. Kopieras de i stället kommer de
att glida isär, och det är just den sortens dubblering som gör att en bugg
rättas på ett ställe av två.

**Klart när.** Rita en pil bredvid ett stycke i utfallet, klicka Klar, och pilen
sitter kvar på samma ställe efter omkompilering. Lägg till en mening ovanför —
pilen följer med sitt stycke. `typst compile document/main.typ` går igenom.

## 2. Öppna en placerad figur för påfyllning — BYGGD

Dubbelklick på en placerad figur öppnar den för påfyllning. Rektangeln räknas ut
som specen sa: ankarets position plus `dx`/`dy` plus figurens egen storlek ur
SVG:ns `width`/`height`. Ingen ny query. `src/placed.js`.

**Ett tillägg specen inte förutsåg.** Växer bläcket uppåt eller åt vänster under
påfyllningen flyttar sig figurens hörn, eftersom `toSvg` räknar om ramen. Då
justeras `dx`/`dy` med samma belopp när ritläget stängs — annars glider figuren
undan lika mycket som den växte.

## 3. Flytta en placerad figur — BYGGD

Ett tryck markerar figuren, ett drag innanför ramen flyttar den, och släppet
skriver nya `dx`/`dy`. Byter flytten ankarblock flyttas raden i källan
(`moveLine`), inte bara talen; raden och den blanka rad den annars lämnar efter
sig går ut i en enda dispatch, alltså ett ångra-steg.

**Markering blev ett eget läge**, vilket specen inte tog ställning till. Ett
tryck markerar, ett drag ritar som förut — annars hade en penna som nuddar en
figur slutat kunna rita ovanpå den, och påfyllning är just det.

Under flytten visar ett streckat streck var figuren skulle förankras om man
släppte nu. Ankringen är modellens enda osynliga del, och den är det som gör
skillnad först nästa gång texten flödar om.

## 4. Radera en placerad figur — BYGGD

En rund X-knapp i figurens övre högra hörn när den är markerad. Raden tas bort ur
källan, SVG:n blir kvar på disk och dyker upp i städlistan.

---

## Inte nu

- **Zoom och panorering i förhandsvisningen.** Kommer att behövas när man ritar
  smått, men det är en egen sak och ändrar koordinatomräkningen. Bygg 1–4 först
  och se hur illa det är utan.
- **Text i ritläget.** Skrivna anteckningar hör hemma i källan, inte i en bild.
  Det är hela poängen med invariant 4.
- **Markering och gruppering av flera figurer.**
- **Ritande över sidbrytningar.** En figur hör till en sida. Vill man ha en pil
  som korsar en sidbrytning får det bli två figurer.
- Offline. Egen uppgift i `kravspec-nasta.md`, och den är fortfarande den
  nyttigaste av allihop.

## Rättat på vägen: markörer för `#place`-rader

Uppgift 1 lämnade efter sig ett fel som inte syntes förrän figurerna gick att
röra. En `#place`-rad fick en egen markör, och då blir figuren ett ankare: nästa
figur som ritas bredvid hänger på en figur i stället för på texten, och en figur
som dras utan att egentligen flytta sig ankrar till sig själv. Stod raden direkt
ovanför ett block stal den dessutom blockets markör, eftersom en markör bara
sätts efter en blank rad — figuren ankrade två block ned.

`withMarkers` sätter därför ingen markör för en `#place`-rad, och räknar raden
som blank för raden under. Mätt med riktiga `typst` på det faktiska dokumentet:
kopian med markörer ger byte-identiska sidbilder mot filen på disk, sida för
sida. (Med avslutaren skiljer sista sidan, precis som den kända kostnaden säger.)

## Känd begränsning som ärvs

Ankaret hittas på blocknivå, inte per tecken. En figur ritad mitt i ett långt
stycke ankras till styckets början, inte till ordet den ligger över. Det räcker
för att figuren ska följa med när texten flödar om, vilket är vad ankaret finns
till för. Bestäm det medvetet så att det inte läses som en bugg.
