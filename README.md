# Tavolo

Quindici giochi da fare con gli amici tramite link, oppure contro il computer. La sala carte comprende Scopa e Scopone scientifico, UNO, Briscola, Poker italiano e Poker Texas Hold’em. Gli altri tavoli sono Scacchi, Battaglia navale, Forza 4, Reversi, Tris, Dama italiana, Backgammon, Go, Nim e Punti e quadrati. Ogni stanza include la scheda **Regole**, la chat e il ripristino della partita.

## Gioca a Tavolo

Crea una stanza, copia il link d'invito e mandalo agli altri giocatori. Se vuoi giocare subito, scegli **Computer** sulla scheda del gioco. In **Partite in corso** trovi le stanze, i nickname e il turno. Per giocare online serve un'istanza di Tavolo pubblicata come indicato sotto.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fdavidebr90%2Ftavolo)

Il pulsante consente a chi ha un account Cloudflare di pubblicare una propria istanza. GitHub ospita il codice. Il server di gioco gestisce stanze, chat e mosse su Cloudflare Workers.

## Avvio locale su Windows

Apri PowerShell nella cartella estratta e avvia il server di sviluppo con Node.js 22 o successivo.

```powershell
node dev.mjs
```

Apri [http://127.0.0.1:8788](http://127.0.0.1:8788), crea una stanza e apri l’invito in una finestra InPrivate o in un altro browser per simulare il secondo giocatore. Lo stesso browser conserva il posto già occupato; su un altro dispositivo lo ritrovi con il link personale del profilo. In locale gli aggiornamenti arrivano via Server-Sent Events, con richieste periodiche come ripiego.

## Pubblicazione su Cloudflare

Servono un account Cloudflare Workers e l'accesso al relativo ambiente da Wrangler. Dalla cartella estratta:

```powershell
npx wrangler login
npx wrangler dev
npx wrangler deploy
```

Apri l'indirizzo HTTPS restituito da Wrangler per giocare. Puoi aggiungerlo al campo **Website** del repository GitHub così chi visita il progetto trova subito l'app. Se necessario, scegli un nome per il Worker in `wrangler.jsonc` prima del primo deploy.

Worker, asset e Durable Object SQLite sono configurati nello stesso progetto. Ogni stanza è gestita da un oggetto distinto. Le mosse viaggiano via HTTPS e gli aggiornamenti arrivano via WebSocket con ibernazione. Quando il WebSocket non è raggiungibile, il browser recupera lo stato via HTTPS. La scrittura della mossa, della versione e della ricevuta per i tentativi ripetuti avviene in una singola operazione SQLite. La flotta avversaria resta nel backend, che pubblica uno stato diverso per ciascun posto.

I link delle stanze danno accesso a chi li riceve: chi entra occupa un posto libero. Il tuo posto è legato al tuo **profilo**.

## Profilo e link personale

Il profilo raccoglie le tue stanze e il tuo nickname, senza password. Si crea da solo con la prima stanza, e chi aveva già partite le ritrova raccolte in un profilo al primo avvio. Dal menu **Profilo** in alto copi il **link personale**: aprendolo su un altro dispositivo, browser o app ritrovi le stesse stanze e partite in corso. Funziona anche dopo aver cancellato i dati del browser.

- La chiave del profilo sta dopo `#profilo=` nel link. Il browser non la invia al server e Tavolo la toglie dalla barra degli indirizzi appena aperta. Il server conserva il profilo sotto un'impronta SHA-256 della chiave.
- Chi apre il link entra nel profilo e gioca al tuo posto: tienilo per te.
- Dal menu puoi dare un nome al profilo, crearne un altro, passare a mano tra i profili ricordati sul dispositivo, aprirne uno incollando il link o dimenticarlo sul dispositivo. Il link continua a funzionare.
- Le stanze rimosse su un dispositivo spariscono anche dagli altri. Le stanze scadono comunque dopo 7 giorni senza attività; il profilo dopo 90 giorni senza utilizzo.
- Su Cloudflare ogni profilo è un Durable Object `PlayerProfile` (migrazione `v2` in `wrangler.jsonc`). In locale i profili stanno nella cartella `profili` accanto alle stanze.

Da **Home → Partite in corso** puoi controllare e riprendere più stanze. **Chiudi partita** chiude subito se l’altra persona non ha ancora fatto una mossa. Altrimenti la stanza resta attiva finché l’altro giocatore accetta. Se rifiuta, si continua a giocare. Gli avvisi si aggiornano mentre Tavolo resta aperto. In locale le stanze sono salvate sotto la cartella temporanea del sistema, in Tavolo. Un riavvio di Node dalla stessa installazione permette di riprendere la partita dallo stesso link e dallo stesso browser, o dal link personale del profilo. Per scegliere una cartella diversa, imposta TAVOLO_ROOM_DIR prima di avviare il server.

Ogni stanza mantiene gli ultimi 50 messaggi, con un massimo di 280 caratteri per messaggio. La stanza scade dopo 7 giorni senza mosse, ingressi o messaggi. A partita conclusa compare **Rivincita**: quando tutti i giocatori la chiedono, nella stessa stanza parte una nuova partita e i posti ruotano, così apre chi prima muoveva per secondo. Il server locale rimuove i file scaduti e il Worker pianifica la rimozione della riga di stato.

## Contro il computer

Ogni gioco si può giocare contro il computer. Nella finestra di creazione scegli quanti posti affidargli e il livello: facile, normale o difficile. Nei giochi a più posti puoi mescolare persone e computer, per esempio un tavolo di poker da sei con due amici e tre computer.

- Il computer gioca sul server e vede solo ciò che vedrebbe una persona a quel posto: non conosce le carte degli altri né la flotta avversaria.
- Scacchi, Dama, Reversi e Forza 4 cercano la mossa migliore qualche mossa in avanti. Nim e Tris, al livello difficile, non sbagliano. Go gioca da principiante.
- A carte e a Battaglia navale segue le regole pratiche di un buon giocatore: a Scopa conta denari, sette e scope, a Briscola dosa carichi e briscole, a poker stima le probabilità della propria mano.
- Le sue mosse arrivano quando chi è al tavolo le chiede, con una breve pausa, così le animazioni restano leggibili. Anche da **Partite in corso** le stanze contro il computer avanzano da sole fino al tuo turno.
- La rivincita parte subito e la stanza si chiude senza chiedere conferma, perché non c'è nessun altro da aspettare.

Le strategie sono in `src/bots.mjs`. Se l'host concede pochissimo tempo di calcolo, il client chiede una risposta più rapida e il computer gioca più semplice invece di fermarsi.

## Spettatori

Chi apre il link di una stanza può scegliere **Guarda soltanto**. Dalla stanza, il pulsante **Spettatori** copia un link che apre direttamente la partita in sola lettura. Chi guarda vede tavolo, mosse e chat, ma non le carte in mano ai giocatori né le flotte, e non può muovere né scrivere.

## Suoni

Carte, fiches, pedine, dadi e colpi in mare hanno un suono, generato dal browser senza scaricare file. Il pulsante con l'altoparlante in alto li spegne e la scelta resta su questo dispositivo. I suoni partono solo dopo il primo clic o tasto, come richiedono i browser.

## Verifica

```powershell
node --test
```

I test coprono motori, accesso ai posti, mosse concorrenti e duplicate e isolamento delle stanze. Per includere l'integrazione HTTP/SSE su un PC con loopback disponibile, esegui `$env:TAVOLO_HTTP_TEST='1'; node --test`. Il runtime Cloudflare e la rete aziendale vanno verificati dopo il deploy. Il test concorrente è funzionale e non misura la capacità in produzione.

## Varianti amichevoli

| Gioco di carte | Posti | Come si conclude |
| --- | --- | --- |
| Scopa | 2 | Ogni mazzo comprende sei distribuzioni di tre carte a testa. Dopo l’ultima si contano i punti. La partita termina a 11 o più con un vantaggio. |
| Scopone scientifico | 4, a coppie | Dieci carte per posto in una sola distribuzione. Il punteggio si conta a mazzo concluso. |
| Briscola | 2 oppure 4 a coppie | Si giocano tutte le quaranta carte. Vince chi prende almeno 61 dei 120 punti. A 60 pari si pareggia. |
| Poker italiano | 2–6 | Cinque carte coperte, invito di una fiche, apertura e un cambio fino a quattro carte. Vince chi raccoglie le fiches del tavolo. |
| Poker Texas Hold’em | 2–10 | Due carte personali, cinque comuni, bui 1/2, puntate no-limit e piatti laterali. Vince l’ultimo giocatore con fiches. |
| UNO | 2–10 | Si gioca una mano. Vince chi finisce le carte per primo. |

Entrambi i poker usano 100 fiches virtuali per posto, senza acquisti né premi. Ogni giocatore riceve soltanto la propria mano. Allo scontro si scoprono le mani ancora in gioco. Dopo l’assegnazione dei piatti, il giocatore indicato dal turno può avviare la mano successiva.

Scacchi riconosce le comuni posizioni di materiale insufficiente. La richiesta di patta si basa sulla posizione già raggiunta. Dama usa il conteggio automatico delle 40 mosse per lato di sole dame senza catture. Battaglia navale usa un colpo per turno. UNO usa una mano singola con dichiarazione automatica e validazione server del +4. Backgammon usa una partita singola senza cubo. Go usa la griglia 9×9 e conta l'area dopo due passaggi consecutivi. I gruppi morti vanno catturati sulla griglia prima di passare. Le schede Regole riportano queste scelte.

## Struttura

- `public/` contiene lobby, interfaccia di partita, schede Regole ed effetti animati.
- `src/games.mjs` definisce il contratto dei giochi e i motori. Scacchi ha un modulo dedicato.
- `src/room.mjs` gestisce posti, turni, versioni e ricevute.
- `src/bots.mjs` contiene i giocatori al computer.
- `public/sound.mjs` genera i suoni del tavolo.
- `src/worker.mjs` e `wrangler.jsonc` descrivono il deployment gestito.
- `dev.mjs` avvia la versione locale.
## Versione

Accanto al logo compaiono il numero di versione e la data dell'ultimo aggiornamento del core. Il pallino verde segnala un aggiornamento nelle ultime 24 ore. Il numero è in `public/version.mjs`: aggiornalo a ogni rilascio. La data la fornisce il server tramite `/api/config`. Su Cloudflare è l'ora di creazione della versione del Worker, letta dal binding `CF_VERSION_METADATA` e aggiornata a ogni `wrangler deploy`. In locale è l'ultima modifica dei file in `src/`.

## Interfaccia ed effetti

Tavolo usa un tema scuro da sala da gioco: feltro, noce e ottone, con Bodoni Moda per i titoli e Schibsted Grotesk per i testi. Ogni mossa ha un'animazione propria. I pezzi degli scacchi e della dama scivolano o saltano fino alla destinazione, i dischi di Reversi si girano in sequenza e le pedine di Forza 4 cadono nella colonna. In Battaglia navale i colpi a segno esplodono e quelli in acqua sollevano schizzi. Le carte volano dal mazzo alla mano e si girano. Vittorie, scope, UNO e scacchi hanno un annuncio a tutto schermo, con coriandoli quando vinci.

Il pulsante ✦ in alto riduce gli effetti al minimo e la scelta resta in questo browser. Con l'impostazione di sistema *riduci movimento* gli effetti restano ridotti. Gli effetti non partono quando la scheda è in background. Il titolo della scheda mostra ● quando tocca a te.

- `public/effects.mjs` confronta due stati della stanza e descrive cosa è cambiato. È testato in `test/effects.test.mjs`.
- `public/motion.mjs` disegna particelle, voli delle carte, spostamenti dei pezzi e annunci.

## Il tavolo da carte

Scopa, Scopone, Briscola, UNO, Poker italiano e Texas Hold'em si giocano a un tavolo ovale. Tu siedi in basso e gli altri giocatori sono disposti attorno, in senso orario a partire dalla tua sinistra, ognuno con le sue carte coperte. Un segnalino d'ottone sul feltro indica chi è di turno; nel poker al suo posto c'è il bottone del mazziere, che scivola al giocatore successivo a ogni mano.

- Chi gioca una carta la lancia con la mano: la carta scivola ruotando fino al suo posto. In una presa la mano del giocatore raccoglie le carte e le porta al suo mazzetto.
- In Scopa i punti sono fiches. A fine smazzata il banco paga una fiche per ogni punto, e ogni scopa vale subito una fiche d'oro.
- In Briscola la carta di briscola resta scoperta sotto il tallone. La presa finita rimane sul feltro finché chi l'ha vinta non la raccoglie per aprire la successiva.
- In UNO chi pesca allunga la mano sul mazzo. Puoi pescare cliccando il mazzo, e le frecce sul feltro mostrano il verso del giro.
- Nel poker ogni giocatore ha le sue fiches sulla targhetta, in pile per valore (1 avorio, 5 rosse, 25 verdi, 100 nere). Chi punta spinge le fiches davanti a sé, chi passa bussa sul feltro, chi lascia getta le carte verso il mazzo. A giro chiuso le puntate scivolano nel piatto, e allo showdown il piatto va al vincitore con le mani scoperte accanto ai nomi.
- Nei giochi a due l'avversario siede sopra la plancia e tu sotto, o ai due angoli quando c'è spazio a lato.

Le animazioni seguono il tavolo anche mentre la pagina scorre. `public/poker-table.mjs` disegna il tavolo da poker e `public/briscola.mjs` quello di Briscola; mani, carte e fiches in movimento sono in `public/motion.mjs`.

## Chat, mosse e nickname

Mosse e Chat si aprono in una colonna a destra della partita, alta quanto il tavolo, con la cronologia sopra e la chat sotto. Su schermi stretti la colonna scende sotto il tavolo.

Il campo della chat e quello del nickname mostrano il testo già formattato: seleziona una parte e scegli grassetto, corsivo, sottolineato, barrato o un colore. Con il cursore fermo, lo stile vale per le lettere che scrivi dopo. Ctrl+B, Ctrl+I e Ctrl+U sono le scorciatoie, Maiusc+Invio va a capo nella chat. Il pulsante </> passa alla modalità codice, dove scrivi e vedi i tag come [b]testo[/b] o [red]testo[/red], con l'anteprima sotto. La scelta resta in questo browser.

## Grafica delle carte

In Scopa e Briscola scegli Napoletane, Piacentine o Bergamasche dal menu **Mazzo**. L'app usa le scansioni dei fronti e un dorso comune per le carte coperte. La scelta del mazzo resta in questo browser. La distribuzione scopre ogni carta all’arrivo. Riprendendo una stanza già avviata si vede la posizione corrente. Il poker usa carte francesi disegnate con testo e CSS.

## Licenza

Codice e documentazione originali con licenza [MIT](LICENSE). Per provenienza, licenze dei singoli asset e marchi, consulta le [attribuzioni](THIRD_PARTY_NOTICES.md).
