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
- [Levely a získávání vybavení](#levely-a-získávání-vybavení)
- [Vzhled prince a animace zbraní](#vzhled-prince-a-animace-zbraní)
- [Dvě pochodně](#dvě-pochodně)
- [Molotov a oheň](#molotov-a-oheň)
- [Minigun a raketomet](#minigun-a-raketomet)
- [Bič](#bič)
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
- **INPUT-02:** Nové zbraně používají `CTRL`; `F` zůstává rovnocenná alternativa. Držení a uvolnění se řídí pravidly konkrétní zbraně.
- **INPUT-03:** Pochodně jsou první a základní zbraň, molotov druhá. Obě musí být dostupné výběrem v inventáři; molotov je na `2` a pochodně na `1`.
- **INPUT-04:** `J` zapne/nasadí jetpack a dalším stiskem ho zase sundá. Létání používá šipky.
- **INPUT-05:** Již získané zbraně zůstávají dostupné pro přepínání. Automatické vybavení v pozdějších levelech nesmí vyžadovat opakovaný sběr.

Navazující implementační rozhodnutí: kompletní pořadí kláves je `1` pochodně, `2` molotov, `3` minigun, `4` raketomet, `5` bič. Pochodně jsou výchozí volba při vstupu do levelu. Bič zůstává automaticky dostupný od levelu 3. Tato doplnění navazují na současné ovládání a postup inventáře; uživatel výslovně určil pořadí pochodní a molotovu.

## Levely a získávání vybavení

| Level                   | Aktuální pravidlo                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1, startovní obrazovka  | Princ automaticky získá dvě skutečné pochodně ze stěny úvodní animací. Molotov zůstává na původním místě na horní startovní plošině. Minigun na této obrazovce není. |
| 1, místnost pod startem | Několik nepřátel poskytuje první příležitost použít molotov. Minigun leží dobře viditelně v levé části této místnosti na pevné podlaze, mimo padající část.          |
| 2                       | Molotov a minigun jsou automaticky vlastněné. Bič je k sebrání u vstupních dveří na začátku levelu.                                                                  |
| 3                       | Raketomet je dobře viditelný na začátku a je nutné ho sebrat. Molotov a minigun jsou automaticky vlastněné.                                                          |
| 4 a dál                 | Raketomet je automaticky vlastněný společně s dříve dostupnými zbraněmi.                                                                                             |
| 1–11                    | Jetpack není dostupný.                                                                                                                                               |
| 12                      | Jetpack je k sebrání hned u startu. Použij existující grafiku, pokud už je hotová.                                                                                   |
| 13 a dál                | Jetpack je automaticky vlastněný; není nutné ho znovu sbírat.                                                                                                        |

- **LEVEL-01:** Postup raketometu „level 3 sebrat, od levelu 4 automaticky“ uživatel výslovně potvrdil při sepisování tohoto rulesetu. Nahrazuje dřívější automatické vlastnictví od levelu 3.
- **LEVEL-02:** Minigun v první místnosti pod startem musí být dobře viditelný a dosažitelný po doskoku. Poslední požadované umístění je vlevo, nikoli vpravo.
- **LEVEL-03:** Vybavení automaticky přidělené v pozdějších levelech nemá vyžadovat další sběr. Samotné vlastnictví jetpacku ještě nespouští let.

## Vzhled prince a animace zbraní

- **ART-01:** Nové pózy musí odpovídat původnímu modelu prince, zejména velikosti hlavy, barvě a velikosti vlasů, původní světlé barvě oblečení a odhaleným pažím. Krk má mít přirozené původní proporce. Animace nesmí trvale barvit oblečení dožluta; krátké osvětlení zábleskem při střelbě podle ART-04 zůstává. Při střelbě má být úsměv/škleb malý; cenění zubů nesmí vytvářet přehnaně velká ústa.
- **ART-02:** Zbraň se při běžném pohybu nezobrazuje trvale. Vidět je při vytahování, používání a schovávání.
- **ART-03:** Vytahování střelných zbraní je krátká blokující sekvence: princ během ní nevykonává jiné akce.
- **ART-04:** Při střelbě princ drží minigun i raketomet oběma rukama a stojí na místě. Záblesky ho osvětlují žlutě.
- **ART-05:** Když střelba skončí, následuje blokující animace schování zbraně. Pohyb ani přepnutí zbraně ji nesmí přeskočit.
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

## Bič

- **WHIP-01:** Bič je v druhém levelu u vstupních dveří k sebrání.
- **WHIP-02:** Lze jím normálně práskat a zraňovat nepřátele jako zbraní.
- **WHIP-03:** Jestli nad princem blízko okraje stojí nepřítel, bič ho může chytit za nohu a posunout do skutečné díry, do níž spadne. Funguje i přímo pod protivníkem při otočení prince na obě strany: bič se vede kolem volného okraje plošiny. Nejde o přesun skrz souvislou podlahu nebo strop.
- **WHIP-04:** I při krátkém pádu dopadne na obličej a ztratí jeden život. Velký pád ho zabije podle původních pravidel pádu.
- **WHIP-05:** Přeživší nepřítel se musí chvíli sbírat ze země, než začne znovu útočit. Samotné zotavování neodebírá opakovaně další životy.

## Jetpack

- **JET-01:** Jetpack se aktivuje a sundává klávesou `J`, nosí se na zádech a umožňuje létat.
- **JET-02:** Princ při letu drží oběma rukama popruhy. Použij stávající grafiku, pokud existuje; jinak ji vytvoř ve stejném stylu.
- **JET-03:** První dostupnost je pickup u startu levelu 12. Od levelu 13 je automaticky v inventáři. Starší dostupnost od začátku hry byla zrušena.
- **JET-04:** Let musí respektovat skutečné stěny, podlahy, stropy a dostupná propojení místností.

## Nepřátelé a jejich smrti

- **ENEMY-01:** Ve všech levelech má být mnoho nepřátel.
- **ENEMY-02:** Viditelní strážci na stejném patře, kteří prince mohou skutečně dosáhnout, ho mají aktivně začít pronásledovat. Samotná blízkost přes neprůchodnou překážku nebo z jiného patra nestačí.
- **ENEMY-03:** Zvuk při zabití nepřítele je odstraněný, protože při hromadném zabíjení ruší. Nezapínat ho znovu pro každého padlého strážce.
- **ENEMY-04:** Minigun má několik různých smrtí: například zásah do obličeje s odhozením těla o několik dlaždic, ztrátu částí těla a různé pohyby či převracení těla. Nemá používat jedinou opakovanou nehybnou smrt.
- **ENEMY-05:** Smrt raketometem rozmetá části těla napříč prostředím. Fragmenty a těla se pohybují a střetávají se s okolím.
- **ENEMY-06:** Hořící nepřítel je pro boj ihned mrtvý. Jeho hořící tělo ještě pět sekund pobíhá doleva/doprava; může spadnout nebo se napíchnout do pastí. Po pěti sekundách animace končí smrtí/kolapsem. Během této doby nesmí znovu útočit jako živý strážce.

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
- **DOOR-03:** Dveře, kterými princ do současného levelu přišel, se od výstupu rozlišují a nelze je takto zničit. Ochrana platí pro obě poloviny vstupních dveří.
- **DOOR-04:** Poničení dveří nesmí přesunout krev z jejich zadní plochy před prince.

## Čas a zobrazení v prohlížeči

- **TIME-01:** Výchozí čas hry je 600 minut místo původních 60 minut.
- **VIEW-01:** Hra se v prohlížeči vejde do viditelné plochy bez vodorovných i svislých scrollbarů. Při změně velikosti okna se přizpůsobí a zachová správné proporce.

## Způsob práce

- **WORK-01:** Když uživatel výslovně požaduje subagenty či paralelní zpracování, skutečně rozděl práci mezi subagenty. Nestačí jen popsat plán.
- **WORK-02:** Paralelní změny je nutné následně propojit a ověřit jako celek, zejména sdílený inventář, animace, vstupy, vrstvy a přechody mezi levely.
- **WORK-03:** Ruleset popisuje platná rozhodnutí, nikoli seznam slibů. Nedodělané nebo nejasné body označ; neprohlašuj je za vyřešené pouze proto, že jsou zapsané zde.

## Nahrazená rozhodnutí

Tento přehled brání návratu ke starším požadavkům. Nejde o aktivní alternativy.

| Starší rozhodnutí                                       | Platné znění                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Minigun dostupný hned na první obrazovce                | V levelu 1 je až v místnosti pod startem, vlevo na pevné podlaze.                   |
| Minigun vpravo od dopadu                                | Poslední umístění je v levé části místnosti.                                        |
| Nejprve pouze molotov jako první zbraň / molotov na `1` | Základní zbraň jsou dvě pochodně na `1`; molotov na `2` zůstává na svém místě.      |
| SHIFT vytahuje zbraň                                    | SHIFT slouží pohybu a hranám; zbraně jsou na CTRL/F.                                |
| Raketomet zatím bez nové grafiky                        | Má mít odpovídající grafiku a animace jako minigun.                                 |
| Raketomet automaticky od levelu 3                       | Level 3: sebrat na začátku; od levelu 4 automaticky. Výslovně potvrzeno uživatelem. |
| Jetpack dostupný dříve                                  | Poprvé u startu levelu 12, automaticky od levelu 13.                                |
| Ostré horizontální přechody a pouze jedna obrazovka     | Plynulé boční posouvání a oddálený záběr celé hlavní místnosti se sousedy.          |
| Přidat zdi tam, kde mapa končí                          | Dodatečné zdi mimo data byly zrušeny; prázdno zůstává.                              |
| Krev nikdy nemizí bez výjimky                           | Zůstává na zachovaných površích; krev padající podlahy se odstraní.                 |
| Krev na výstupních dveřích v popředí                    | Krev na jejich ploše je za princem.                                                 |
| Molotov zastavený stropem bez dopadu ohně               | Hořící olej spadne pod strop na podlahu.                                            |
| Postupné ubírání HP při zapálení                        | Okamžitá smrt v boji a pětisekundová animace hoření.                                |
| 60 minut                                                | 600 minut.                                                                          |
