# Tavolo

Scacchi, Battaglia navale, Forza 4, Reversi, Tris, Dama italiana, Scopa, UNO, Backgammon, Go, Nim e Punti e quadrati. Stanze da 2 giocatori per i duelli, da 2 a 10 per UNO e da 4 per lo Scopone scientifico a coppie, inviti con link, partite senza orologio e tab **Regole** con fonti per ogni titolo.

## Gioca a Tavolo

Crea una stanza, copia il link d'invito e mandalo agli altri giocatori. In **Partite in corso** trovi le stanze, i nickname e il turno. Per giocare online serve un'istanza di Tavolo pubblicata come indicato sotto.

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

## Verifica

```powershell
node --test
```

I test coprono motori, accesso ai posti, mosse concorrenti e duplicate e isolamento delle stanze. Per includere l'integrazione HTTP/SSE su un PC con loopback disponibile, esegui `$env:TAVOLO_HTTP_TEST='1'; node --test`. Il runtime Cloudflare e la rete aziendale vanno verificati dopo il deploy. Il test concorrente è funzionale e non misura la capacità in produzione.

## Varianti amichevoli

Scacchi riconosce le comuni posizioni di materiale insufficiente. La richiesta di patta si basa sulla posizione già raggiunta. Dama usa il conteggio automatico delle 40 mosse per lato di sole dame senza catture. Battaglia navale usa un colpo per turno. UNO usa una mano singola con dichiarazione automatica e validazione server del +4. Backgammon usa una partita singola senza cubo. Go usa la griglia 9×9 e conta l'area dopo due passaggi consecutivi. I gruppi morti vanno catturati sulla griglia prima di passare. Le schede Regole riportano queste scelte.

## Struttura

- `public/` contiene lobby, interfaccia di partita, schede Regole ed effetti animati.
- `src/games.mjs` definisce il contratto dei giochi e i motori. Scacchi ha un modulo dedicato.
- `src/room.mjs` gestisce posti, turni, versioni e ricevute.
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

Scopa, Scopone e UNO si giocano a un tavolo ovale. Tu siedi in basso e gli altri giocatori sono disposti attorno, in senso orario a partire dalla tua sinistra, ognuno con il ventaglio delle sue carte coperte. Un segnalino d'ottone sul feltro indica chi è di turno.

- Chi gioca una carta la lancia con la mano: la carta scivola ruotando fino al suo posto. In una presa la mano del giocatore raccoglie le carte e le porta al suo mazzetto.
- In Scopa i punti sono fiches. A fine smazzata il banco paga una fiche per ogni punto, e ogni scopa vale subito una fiche d'oro.
- In UNO chi pesca allunga la mano sul mazzo. Puoi pescare cliccando il mazzo, e le frecce sul feltro mostrano il verso del giro.
- Nei giochi a due l'avversario siede sopra la plancia e tu sotto, o ai due angoli quando c'è spazio a lato.

## Chat, mosse e nickname

Mosse e Chat si aprono in una colonna a destra della partita, alta quanto il tavolo, con la cronologia sopra e la chat sotto. Su schermi stretti la colonna scende sotto il tavolo.

Il campo della chat e quello del nickname mostrano il testo già formattato: seleziona una parte e scegli grassetto, corsivo, sottolineato, barrato o un colore. Con il cursore fermo, lo stile vale per le lettere che scrivi dopo. Ctrl+B, Ctrl+I e Ctrl+U sono le scorciatoie, Maiusc+Invio va a capo nella chat. Il pulsante </> passa alla modalità codice, dove scrivi e vedi i tag come [b]testo[/b] o [red]testo[/red], con l'anteprima sotto. La scelta resta in questo browser.

## Grafica delle carte

In Scopa scegli Napoletane, Piacentine o Bergamasche dal menu **Mazzo**. L'app usa le scansioni dei fronti e un dorso comune per le carte coperte. La scelta del mazzo resta in questo browser.

## Licenza

Codice e documentazione originali con licenza [MIT](LICENSE). Per provenienza, licenze dei singoli asset e marchi, consulta le [attribuzioni](THIRD_PARTY_NOTICES.md).
