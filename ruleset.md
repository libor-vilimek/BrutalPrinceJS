# Ruleset projektu BrutalPrinceJS

## Jak pravidla přidávat a měnit

1. Při práci na nové funkci můžeš do rulesetu přidat nové pravidlo. Musí odpovídat zadání a nesmí potichu měnit již platná rozhodnutí. Technickou volbu, kterou uživatel neurčil, označ jako implementační rozhodnutí, nikoli jako jeho přání.
2. Existující pravidlo změň jen tehdy, když z požadavku jasně vyplývá, že ho opravdu měníme. Aktualizuj příslušné pravidlo a odstraň rozpor se starším zněním.
3. Jestli není změna existujícího pravidla jasná, nejprve se zeptej autora promptu, zda ho chce změnit a jak. Do vyjasnění nepovažuj domněnku ani současný kód za souhlas se změnou.
4. Před implementací zkontroluj dotčené oblasti tohoto souboru. Po implementaci ověř nové chování i zachování dosavadních rozhodnutí. Pokud měníš ovládání nebo postup získávání vybavení, oprav také nápovědu, README a odpovídající testovací scénáře.
5. Pozdější výslovné zadání nahrazuje starší rozhodnutí pouze v oblasti, kterou skutečně mění. Ostatní pravidla zůstávají platná.

Tento dokument zachycuje aktuální přání z celé této konverzace. Změny zde uvedené jako nahrazené již nejsou požadavkem. Sepsáno a sjednoceno 6. října 2026.

## Navigace

- [Ovládání a inventář](#ovládání-a-inventář)
- [Tutoriál](#tutoriál)
- [Levely a získávání vybavení](#levely-a-získávání-vybavení)
- [Životy a lahvičky](#životy-a-lahvičky)
- [Vzhled prince a animace zbraní](#vzhled-prince-a-animace-zbraní)
- [Dvě pochodně](#dvě-pochodně)
- [Molotov a oheň](#molotov-a-oheň)
- [Minigun a raketomet](#minigun-a-raketomet)
- [Bič](#bič)
- [Nouzový kopanec](#nouzový-kopanec)
- [Jetpack](#jetpack)
- [Nepřátelé a jejich smrti](#nepřátelé-a-jejich-smrti)
- [Krev a její vrstvy](#krev-a-její-vrstvy)
- [Kamera, místnosti a prostředí](#kamera-místnosti-a-prostředí)
- [Dveře mezi levely](#dveře-mezi-levely)
- [Čas a zobrazení v prohlížeči](#čas-a-zobrazení-v-prohlížeči)
- [Způsob práce](#způsob-práce)
- [Nahrazená rozhodnutí](#nahrazená-rozhodnutí)

## Ovládání a inventář

- **INPUT-01:** `SHIFT` zůstává pro pomalou chůzi, držení a chytání hran. Nesmí automaticky vytahovat minigun ani jinou novou zbraň.
- **INPUT-02:** Pochodně, molotov, minigun a raketomet používají `CTRL`; `F` zůstává rovnocenná alternativa. Držení a uvolnění se řídí pravidly konkrétní zbraně. Samostatný bič má vlastní klávesu `X` podle INPUT-06.
- **INPUT-03:** Pochodně jsou první a základní zbraň, molotov druhá. Obě musí být dostupné výběrem v inventáři; molotov je na `2` a pochodně na `1`.
- **INPUT-04:** `J` zapne/nasadí jetpack a dalším stiskem ho zase sundá. Létání používá šipky.
- **INPUT-05:** Již získané zbraně zůstávají dostupné pro přepínání. Automatické vybavení v pozdějších levelech nesmí vyžadovat opakovaný sběr.
- **INPUT-06:** Bič je samostatná akce na klávese `X`, mimo výběr zbraní. `5` ho už nevybírá a `CTRL`/`F` ho nespouští. Sebrání ani použití biče nemění právě vybranou zbraň.
- **INPUT-07:** `C` je samostatný otočný kopanec, dostupný od začátku bez sběru a bez změny vybrané zbraně.

Navazující implementační rozhodnutí: pořadí zbraní je `1` pochodně, `2` molotov, `3` minigun, `4` raketomet. Pochodně jsou výchozí volba při vstupu do levelu. Bič zůstává automaticky dostupný od levelu 3, samostatně na `X`. Tato doplnění navazují na současné ovládání a postup inventáře; uživatel výslovně určil pořadí pochodní a molotovu a následně vyjmutí biče z výběru zbraní.

## Tutoriál

- **TUTORIAL-01:** Novou mechaniku vysvětlí oranžová obrazovka s ornamentálním rámem ve stylu Prince of Persia. Obsahuje popis a požadovanou klávesu.
- **TUTORIAL-02:** Během obrazovky je hra pozastavená. Stisk požadované klávesy obrazovku zavře, obnoví hru a provede danou akci. Nesouvisející klávesa obrazovku nezavře.
- **TUTORIAL-03:** Lekce může požadovanou klávesu uměle podržet, aby proběhla vyučovaná sekvence i po krátkém stisku. Délka je nastavitelná pro konkrétní lekci; běžné ovládání a pravidla animací zůstávají platné.
- **TUTORIAL-04:** Systém má být rozšiřitelný o další lekce a jeho aktuální obsah i způsob rozšíření musí být popsaný v anglické dokumentaci.

Implementační rozhodnutí: první lekce vysvětluje pochodně po dokončení jejich úvodního sběru v levelu 1, když princ stojí a může je použít. Přijímá CTRL i F a podrží vstup alespoň 1,8 sekundy herního času. Vyobrazené klávesy jsou také tlačítka pro dotyk/myš; akční tlačítka ovladače mají stejný význam. Skutečné delší držení klávesnice se nezkracuje. Čtení nespotřebovává čas kampaně. Dokončené lekce se během jedné hry při restartu levelu ani postupu neopakují; nová hra nebo obnovení stránky je resetuje. Ztráta fokusu, smrt a odchod z levelu zruší umělé držení. Obsah a rozšíření popisuje `docs/tutorials.md`.

## Levely a získávání vybavení

| Level                   | Aktuální pravidlo                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, startovní obrazovka  | Princ automaticky získá dvě skutečné pochodně ze stěny úvodní animací. Molotov zůstává na původním místě na horní startovní plošině. Minigun na této obrazovce není.        |
| 1, místnost pod startem | Několik nepřátel poskytuje první příležitost použít molotov. Minigun leží dobře viditelně v pravé části této druhé obrazovky na pevné podlaze, mimo padající část a sloupy. |
| 2                       | Molotov a minigun jsou automaticky vlastněné. Bič je k sebrání vlevo od prince vedle raketometu u vstupních dveří.                                                          |
| 3                       | Raketomet sebraný v levelu 2 zůstává vlastněný. Pokud ho princ dosud nemá, je k sebrání na začátku. Molotov a minigun jsou automaticky vlastněné.                           |
| 4 a dál                 | Raketomet je automaticky vlastněný společně s dříve dostupnými zbraněmi.                                                                                                    |
| 1–11                    | Jetpack není dostupný.                                                                                                                                                      |
| 12                      | Jetpack je k sebrání hned u startu. Použij existující grafiku, pokud už je hotová.                                                                                          |
| 13 a dál                | Jetpack je automaticky vlastněný; není nutné ho znovu sbírat.                                                                                                               |

- **LEVEL-01:** Raketomet je nově k sebrání vlevo u startu levelu 2. Dřívější pickup na začátku levelu 3 slouží jako další příležitost, pokud ho princ dosud nemá; od levelu 4 je automaticky vlastněný. Již sebraná zbraň při postupu nezmizí.
- **LEVEL-02:** Minigun v první místnosti pod startem (druhé obrazovce prvního levelu) musí být dobře viditelný a dosažitelný po doskoku. Aktuální umístění je vpravo na pevné podlaze, mimo sloup, který by ho zakrýval.
- **LEVEL-03:** Vybavení automaticky přidělené v pozdějších levelech nemá vyžadovat další sběr. Samotné vlastnictví jetpacku ještě nespouští let.

Navazující implementační rozhodnutí: při postupu se uloží výbava přinesená do dalšího levelu. Jeho restart tuto výbavu zachová; pickup získaný až během nedokončeného pokusu se znovu objeví podle dosavadních pravidel restartu. Nová hra uloženou výbavu vymaže.

## Životy a lahvičky

- **HEALTH-01:** Nová hra začíná s deseti životy. Velká červená lahvička zvýší maximum o jeden i nad deset a doplní zdraví na nové maximum. Zvýšené maximum se přenáší do dalšího levelu a obnoví se z uložené URL; starší hodnoty pod deset nesnižují výchozí zdraví.
- **HEALTH-02:** V mapách kampaně je více malých červených lahviček. Každá doplní právě jeden život, nejvýše do aktuálního maxima, a maximum sama nezvýší. Pití nadále používá původní animaci a ovládání.

Implementační rozhodnutí: levely 1–13 obsahují celkem 56 dalších léčivých lahviček na pevné podlaze mimo startovní výbavu, pasti a příběhové scény. Původní lahvičky a jejich účinky zůstávají zachované. Při maximu do deseti má ukazatel původní ikony; nad deset zobrazuje ikonu a přesný počet `aktuální/maximum`, aby nepřekrýval čas ani zdraví protivníka.

## Vzhled prince a animace zbraní

- **ART-01:** Nové pózy musí odpovídat původnímu modelu prince, zejména velikosti hlavy, barvě a velikosti vlasů, původní světlé barvě oblečení a odhaleným pažím. Krk má mít přirozené původní proporce. Animace nesmí trvale barvit oblečení dožluta; krátké osvětlení zábleskem při střelbě podle ART-04 zůstává. Při střelbě má být úsměv/škleb malý; cenění zubů nesmí vytvářet přehnaně velká ústa.
- **ART-02:** Zbraň se při běžném pohybu nezobrazuje trvale. Vidět je při vytahování, používání a schovávání.
- **ART-03:** Vytahování střelných zbraní je krátká blokující sekvence. Výjimkou je výslovně vyžádaný nouzový kopanec na `C` při blízkém nepříteli podle KICK-02.
- **ART-04:** Při střelbě princ drží minigun i raketomet oběma rukama a stojí na místě. Záblesky ho osvětlují žlutě.
- **ART-05:** Když střelba skončí, následuje blokující animace schování zbraně. Pohyb ani přepnutí zbraně ji nesmí přeskočit. Nouzový kopanec na `C` při blízkém nepříteli je výjimkou podle KICK-02.
- **ART-06:** Animace mají být pěkné a svižné. Nové vybavení nesmí měnit původní proporce ani omylem přidat další ruce či ponechat po skončení neúplný sprite.

## Dvě pochodně

- **TORCH-01:** Na začátku prvního levelu proběhne pevná úvodní animace: princ sundá obě skutečné pochodně ze stěny a uloží si je do kalhot. Sejmuté pochodně už nezůstávají na stěně jako zapálené dekorace.
- **TORCH-02:** Při držení `CTRL`/`F` princ nejprve vytáhne pochodně do obou rukou, poté se otáčí dokola a zapaluje všechny dosažitelné nepřátele kolem sebe.
- **TORCH-03:** Během útoku stojí na místě. Dosah pochodní je větší než dosah nepřátelských mečů.
- **TORCH-04:** Při samotném otáčení ho nepřátelé mečem nemohou zranit. To nedává obecnou nesmrtelnost proti pádům či pastím.
- **TORCH-05:** Během úvodní animace a vytahování ho mohou nepřátelé zranit. Neusmrcující zásah tuto sekvenci nepřeruší; pokud stále drží `CTRL`/`F`, dokončí ji a začne se otáčet.
- **TORCH-06:** Zapálení používá stejnou okamžitou smrt a pětisekundovou animaci hořícího nepřítele jako molotov.
- **TORCH-07:** Paže při používání i sběru pochodní mají lidské proporce a přirozeně ohnuté lokty. Při úvodním sběru může princ přistoupit k pochodním, aby nenatahoval ruce; během útoku dál stojí na místě. Dosah útoku a ohnivého efektu se touto úpravou nezmenšuje.

## Molotov a oheň

- **MOLO-01:** Molotov zůstává součástí inventáře a jeho pickup v prvním levelu zůstává na původním místě. Aktuálně je druhou zbraní.
- **MOLO-02:** Na zemi se při držení `CTRL`/`F` připravuje hod. Po uvolnění princ použije druhou ruku k zapálení a láhev hodí.
- **MOLO-03:** Délka držení určuje vzdálenost: delší držení znamená delší hod. Běžný hod má přibližně 30° vzhůru; s vybraným/stisknutým směrem nahoru přibližně 70°.
- **MOLO-04:** Láhev respektuje skutečné stěny, stropy a propojení místností. Nemůže proletět pevným stropem.
- **MOLO-05:** Při visení a stisku `CTRL`/`F` se rovnou spustí původní sekvence, nikoli běžné nabíjení hodu: jedna ruka stále drží hranu, druhá sáhne do kalhot pro zapalovač, zapálí ho, princ ho dá zapálený do pusy, vytáhne molotov, zapálí ho a hodí přímo pod sebe. Celé musí být svižné.
- **MOLO-06:** Náraz do zdi láhev rozbije. Oheň ulpí částečně na zdi a hořící olej spadne na skutečnou zem pod místem nárazu.
- **MOLO-07:** Náraz do spodní strany stropu láhev rozbije a hořící olej spadne pod tento strop na skutečnou zem. Oheň nesmí zůstat jen na horní straně stropu ani zmizet bez dopadu.
- **MOLO-08:** Zasažení nepřítele plamenem ho okamžitě vyřadí z boje a spustí animaci hoření; nemusí čekat na postupné ubírání životů.

## Minigun a raketomet

- **GUN-01:** Minigun má animaci sáhnutí dozadu, vytažení, držení oběma rukama, střelby a následného schování. Při střelbě se nelze pohybovat.
- **GUN-02:** Raketomet má grafiku a kvalitu animací podobnou minigunu. Staré odložení práce na jeho grafice již neplatí.
- **GUN-03:** Rakety znatelně zrychlují. Jejich let nesmí mít pouze konstantní lineární rychlost.
- **GUN-04:** Raketa doletí alespoň do jedné další propojené místnosti a umožní ji probourat i tehdy, když tam ještě není volný průchod. Směr doprava nesmí mít kratší nebo zablokovaný dosah oproti směru doleva.
- **GUN-05:** Střely a exploze respektují skutečné překážky; otevřená/probouraná místa lze dále používat při pohybu i střelbě.
- **GUN-06:** Vystřelené nábojnice se trvale kupí a zůstávají po celý level, včetně odchodu z obrazovky a návratu. Kamera ani ořezávání vykreslování je nesmí odstranit. Při zániku podpory spadnou na další skutečnou podlahu; reset levelu hromady vyčistí.

## Bič

- **WHIP-01:** Bič je v druhém levelu vlevo od startujícího prince, přímo vedle raketometu u vstupních dveří, aby byl dobře viditelný a šel sebrat cestou k raketometu.
- **WHIP-02:** Lze jím normálně práskat a zraňovat nepřátele jako zbraní.
- **WHIP-03:** Jestli nad princem blízko okraje stojí nepřítel, bič ho může chytit za nohu a posunout do skutečné díry, do níž spadne. Funguje i přímo pod protivníkem při otočení prince na obě strany: bič se vede kolem volného okraje plošiny. Nejde o přesun skrz souvislou podlahu nebo strop.
- **WHIP-04:** I při krátkém pádu dopadne na obličej a ztratí jeden život. Velký pád ho zabije podle původních pravidel pádu.
- **WHIP-05:** Přeživší nepřítel se musí chvíli sbírat ze země, než začne znovu útočit. Samotné zotavování neodebírá opakovaně další životy.
- **WHIP-06:** Po chycení nepřítele za nohu puštění `X` nepřeruší stažení z hrany ani dokončení švihu a schování biče. Princ během této sekvence stojí na místě a běžný pohyb, jiný útok ani přepnutí zbraně ji nepřeskočí. Dosavadní výjimka pro nouzový kopanec podle KICK-02 zůstává.

Navazující implementační rozhodnutí: krátký stisk `X` dokončí jeden švih, držení švihy opakuje. Po chycení za nohu celý švih i skutečné stažení do díry doběhnou před schováním nebo dalším švihem. Následný pád a zotavování nepřítele pokračují samostatně. Po uvolnění princ bič schová a teprve pak se obnoví pohyb a přepínání zbraní; výjimkou je nouzový kopanec podle KICK-02. Bič nepřerušuje jinou právě probíhající akci ani schovávání střelné zbraně.

## Nouzový kopanec

- **KICK-01:** Jeden otočný kopanec na `C` přímo srazí nejvýše jednoho těsně blízkého nepřítele před princem nebo za ním. Jeho tělo může povalit nejvýše jednoho dalšího; ten se už jen svalí dozadu a sám nikoho dalšího nepovalí. Celkem tedy jedno kopnutí srazí nejvýše dva protivníky. Limit platí po celou otočku i následný let těla. Samotný kopanec, nárazy ani zotavování neubírají životy.
- **KICK-02:** Je-li poblíž dosažitelný nepřítel, `C` umožní zkrátit probíhající animace a ihned zahájit otočný kop. Platí i pro výlez, tasení a schovávání zbraní včetně biče. Jde o výslovnou výjimku z obvyklých blokujících animací; bez nepřítele se tím animace nepřeskakují. Samotná otočka má pomalejší, čitelnou animaci.
- **KICK-03:** Sražení nepřátelé se chvíli sbírají ze země a nemohou útočit. Domino vyžaduje skutečný kontakt a respektuje stěny, mříže, podlahy a propojení místností.
- **KICK-04:** Bič zůstává samostatný na `X` se svým dosavadním dosahem, stahováním z hrany a poškozením. Kopanec jej nemění ani nevybírá jinou zbraň.
- **KICK-05:** Během celé otočky včetně nápřahu a dokončení je princ chráněn proti zásahům nepřátel mečem. Ochrana končí s animací; původní pravidla pastí a pádů platí dál.
- **KICK-06:** Odhození má být výrazné a hravé: strážci létají pod různými úhly, s různou silou a rotací, s částečně náhodnou obměnou. Nemají všichni skončit na jedné hromadě. Krev při kopu a nárazech je kosmetická a nepřidává poškození.
- **KICK-07:** Princ provede viditelný kop na volné zemi i bez nepřátel v okolí, i když nikoho netrefí. Nouzové přeskakování cizích animací zůstává podmíněné blízkou hrozbou podle KICK-02.

Implementační rozhodnutí: okolí pro nouzovou reakci je 144 světových pixelů, dosah samotného kopu je zkrácený na 32 pixelů (jednu dlaždici) na obě strany. Otočka na jedné opěrné noze trvá 1,05 s, opakování nejdříve po 1,275 s; držení `C` umožňuje opakovat reakci. Animace i její kontaktní okna běží na 80 % předchozí rychlosti: přední oblouk zasahuje přibližně mezi 0,18–0,43 s, zadní mezi 0,49–0,81 s. Oba oblouky sdílejí jediný přímý zásah. Výlez a navazující běžné animace běží osmkrát rychleji přes původní příkazy, akce zbraní se ukončí a schovají. Úvodní sběr pochodní před ukončením dokončí skutečné sejmutí obou pochodní. Pět obměňovaných způsobů přímého odhození kombinuje nízký smyk, vysoký oblouk a přemety; druhotný zásah používá jen krátké svalení bez šíření. Fyzika respektuje stěny, stropy a podlahy. Po dopadu se nad strážcem točí hvězdičky a zotavení trvá 2–2,45 s. Smrt, volný pád, let jetpackem a příběhový odchod do dalšího levelu se kopancem nepřeskakují. Pasti a velké pády nadále používají původní pravidla prostředí; výška získaná samotným odhozením ani krátký pád po kopanci nezpůsobují poškození. Kostlivec a stín si zachovávají zvláštní pravidla.

## Jetpack

- **JET-01:** Jetpack se aktivuje a sundává klávesou `J`, nosí se na zádech a umožňuje létat.
- **JET-02:** Princ při letu drží oběma rukama popruhy. Použij stávající grafiku, pokud existuje; jinak ji vytvoř ve stejném stylu.
- **JET-03:** První dostupnost je pickup u startu levelu 12. Od levelu 13 je automaticky v inventáři. Starší dostupnost od začátku hry byla zrušena.
- **JET-04:** Let musí respektovat skutečné stěny, podlahy, stropy a dostupná propojení místností. Výjimkou je rozražení zničitelné podlahy hlavou podle JET-05.
- **JET-05:** Při letu vzhůru s nasazeným jetpackem princ hlavou rozrazí zničitelné části podlahy nad sebou a může vzniklým otvorem proletět. Pevné podlahy a stropy jej dál zastaví.

Implementační rozhodnutí: zničitelné části jsou původní uvolněné podlahové desky. Náraz zespodu ihned spustí jejich běžný pád a odstraní kolizi i krev z odstraněného povrchu; boční dotyk je nerozbíjí a přistání shora zachovává původní chování.

## Nepřátelé a jejich smrti

- **ENEMY-01:** Ve všech levelech má být mnoho nepřátel.
- **ENEMY-02:** Viditelní strážci na stejném patře, kteří prince mohou skutečně dosáhnout, ho mají aktivně začít pronásledovat. Samotná blízkost přes neprůchodnou překážku nebo z jiného patra nestačí.
- **ENEMY-03:** Zvuk při zabití nepřítele je odstraněný, protože při hromadném zabíjení ruší. Nezapínat ho znovu pro každého padlého strážce.
- **ENEMY-04:** Minigun má několik různých smrtí: například zásah do obličeje s odhozením těla o několik dlaždic, ztrátu částí těla a různé pohyby či převracení těla. Nemá používat jedinou opakovanou nehybnou smrt.
- **ENEMY-05:** Smrt raketometem rozmetá části těla napříč prostředím. Fragmenty a těla se pohybují a střetávají se s okolím.
- **ENEMY-06:** Hořící nepřítel je pro boj ihned mrtvý. Jeho hořící tělo ještě pět sekund pobíhá doleva/doprava; může spadnout nebo se napíchnout do pastí. Po pěti sekundách animace končí smrtí/kolapsem. Během této doby nesmí znovu útočit jako živý strážce.
- **ENEMY-07:** Hořící nepřátelé křičí, ale současně smějí být slyšet nejvýše dva překrývající se křiky hoření. Je to výjimka pro hoření, nikoli návrat obecného zvuku při každém zabití podle ENEMY-03.

## Krev a její vrstvy

- **BLOOD-01:** Střelba do nepřátel všude vytváří krev, která dopadá na prostředí a zůstává tam.
- **BLOOD-02:** Skvrny se kreslí na podlahy a stěny ve více vrstvách podobně jako nábojnice. Mohou zasáhnout i okolní přední zdi.
- **BLOOD-03:** Krev stříká také na sloupy, mezi kterými princ běhá, a na stěny pod podlahou i nad ní.
- **BLOOD-04:** Usazená krev sama nevybledne, nezmizí ani nezmění tvar/barvu při pohybu kamery nebo návratu do místnosti. Přetrvává po dobu daného levelu.
- **BLOOD-05:** Jestli spadne nebo zmizí podlaha, krev patřící této podlaze musí také zmizet. Tato výjimka nesmí vymazat skvrny na okolních zachovaných površích.
- **BLOOD-06:** Krev na ploše dveří do dalšího levelu musí být vzadu, za princem. Nemá jej překrývat jako přední zeď. Okolní přední zdivo a hrana podlahy zachovávají vlastní správné vrstvy.

## Kamera, místnosti a prostředí

- **CAMERA-01:** Horizontální přechody mezi místnostmi jsou plynulé. Kamera se začne posouvat při přibližování prince k bočnímu okraji; žádný ostrý skok o celou místnost.
- **CAMERA-02:** Vertikální přechody nahoru/dolů mohou zůstat ostré.
- **CAMERA-03:** Kamera je oddálená: má být vidět celá aktuální místnost, která bývala jedinou obrazovkou, plus něco navíc po stranách a části pater nad a pod ní.
- **CAMERA-04:** Oddálení musí poskytnout dobrý výhled do sousedních místností ještě před vstupem. Nemá ztrácet původní celou hlavní místnost při běžném záběru.
- **CAMERA-05:** Při pohybu ke straně začne posun; po vstupu do další místnosti se záběr dokončí tak, aby byla nová hlavní místnost celá vidět, i když se princ uvnitř zastaví.
- **WORLD-01:** Skutečné stěny a jejich grafika musí správně navazovat mezi obrazovkami/místnostmi. Zachovat opravené návaznosti i při posouvání kamery.
- **WORLD-02:** Tam, kde nejsou data levelu, má zůstat prázdno. Nevytvářet dodatečné okrajové stěny; uživatel je výslovně nechal odstranit.

## Dveře mezi levely

- **DOOR-01:** Hlavní dveře určené k přechodu do dalšího levelu lze rozstřelit raketometem. Mají animaci zničení a potom trvale poničený vzhled.
- **DOOR-02:** Zničené výstupní dveře stále umožňují přejít do dalšího levelu.
- **DOOR-03:** Dveře, kterými princ do současného levelu přišel, se od výstupu rozlišují a nelze je takto zničit. Ochrana platí pro obě poloviny vstupních dveří. Rakety oběma polovinami volně prolétají bez nárazu či exploze, ať jsou vstupní dveře otevřené, nebo zavřené.
- **DOOR-04:** Poničení dveří nesmí přesunout krev z jejich zadní plochy před prince.

## Čas a zobrazení v prohlížeči

- **TIME-01:** Výchozí čas hry je 600 minut místo původních 60 minut.
- **VIEW-01:** Hra se v prohlížeči vejde do viditelné plochy bez vodorovných i svislých scrollbarů. Při změně velikosti okna se přizpůsobí a zachová správné proporce.
- **VIEW-02:** Titulek karty prohlížeče zní přesně `Brutal Pince of Persia`.

## Způsob práce

- **WORK-01:** Když uživatel výslovně požaduje subagenty či paralelní zpracování, skutečně rozděl práci mezi subagenty. Nestačí jen popsat plán.
- **WORK-02:** Paralelní změny je nutné následně propojit a ověřit jako celek, zejména sdílený inventář, animace, vstupy, vrstvy a přechody mezi levely.
- **WORK-03:** Ruleset popisuje platná rozhodnutí, nikoli seznam slibů. Nedodělané nebo nejasné body označ; neprohlašuj je za vyřešené pouze proto, že jsou zapsané zde.
- **WORK-04:** Testy a prohlídky hry probíhají s vypnutým zvukem. Výjimkou je cílené testování zvuku; po něm se zvuk zase vypne.

## Nahrazená rozhodnutí

Tento přehled brání návratu ke starším požadavkům. Nejde o aktivní alternativy.

| Starší rozhodnutí                                       | Platné znění                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Minigun dostupný hned na první obrazovce                | V levelu 1 je až v místnosti pod startem, vpravo na pevné podlaze mimo sloup.                   |
| Minigun vlevo od dopadu                                 | Aktuální umístění je v pravé části druhé obrazovky, dobře viditelné.                            |
| Nejprve pouze molotov jako první zbraň / molotov na `1` | Základní zbraň jsou dvě pochodně na `1`; molotov na `2` zůstává na svém místě.                  |
| SHIFT vytahuje zbraň                                    | SHIFT slouží pohybu a hranám; zbraně jsou na CTRL/F.                                            |
| Bič jako pátá zbraň na `5`, útok na `CTRL`/`F`          | Samostatný bič na `X`, mimo výběr zbraní; použití ponechá vybranou zbraň.                       |
| Raketomet zatím bez nové grafiky                        | Má mít odpovídající grafiku a animace jako minigun.                                             |
| Raketomet automaticky od levelu 3                       | Sebrat v levelu 2 nebo 3; vlastnictví se přenáší, od levelu 4 je automatické.                   |
| První pickup raketometu až v levelu 3                   | Nově už vlevo u startu levelu 2; v levelu 3 zůstává záložní pickup pro ty, kdo ho dosud nemají. |
| Kop s dlouhým dosahem a více přímými či druhotnými zásahy | Krátký dosah; jeden přímý zásah a nejvýše jeden další sražený tělem, bez dalšího šíření.      |
| Bez nepřítele nelze kopnout                             | Na volné zemi lze kopnout naprázdno; jen nouzové zkracování cizích animací vyžaduje hrozbu.     |
| Jetpack dostupný dříve                                  | Poprvé u startu levelu 12, automaticky od levelu 13.                                            |
| Ostré horizontální přechody a pouze jedna obrazovka     | Plynulé boční posouvání a oddálený záběr celé hlavní místnosti se sousedy.                      |
| Přidat zdi tam, kde mapa končí                          | Dodatečné zdi mimo data byly zrušeny; prázdno zůstává.                                          |
| Krev nikdy nemizí bez výjimky                           | Zůstává na zachovaných površích; krev padající podlahy se odstraní.                             |
| Krev na výstupních dveřích v popředí                    | Krev na jejich ploše je za princem.                                                             |
| Molotov zastavený stropem bez dopadu ohně               | Hořící olej spadne pod strop na podlahu.                                                        |
| Postupné ubírání HP při zapálení                        | Okamžitá smrt v boji a pětisekundová animace hoření.                                            |
| 60 minut                                                | 600 minut.                                                                                      |
