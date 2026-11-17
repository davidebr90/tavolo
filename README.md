# Tavolo

Scacchi, Battaglia navale, Forza 4, Reversi, Tris, Dama italiana, Scopa, UNO, Backgammon, Go, Nim e Punti e quadrati. Due giocatori per stanza, inviti con link, partite senza orologio e tab **Regole** con fonti per ogni titolo.

## Gioca a Tavolo

Crea una stanza, copia il link d'invito e mandalo alla seconda persona. In **Partite in corso** trovi le stanze, i nickname e il turno. Per giocare online serve un'istanza di Tavolo pubblicata come indicato sotto.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fdavidebr90%2Ftavolo)

Il pulsante consente a chi ha un account Cloudflare di pubblicare una propria istanza. GitHub ospita il codice. Il server di gioco gestisce stanze, chat e mosse su Cloudflare Workers.

## Avvio locale su Windows

Apri PowerShell nella cartella estratta e avvia il server di sviluppo con Node.js 22 o successivo.

```powershell
node dev.mjs
```

Apri [http://127.0.0.1:8788](http://127.0.0.1:8788), crea una stanza e apri l’invito in una finestra InPrivate o in un altro browser per simulare il secondo giocatore. Lo stesso profilo browser conserva il posto già occupato. In locale gli aggiornamenti arrivano via Server-Sent Events, con richieste periodiche come ripiego.

## Pubblicazione su Cloudflare

Servono un account Cloudflare Workers e l'accesso al relativo ambiente da Wrangler. Dalla cartella estratta:

```powershell
npx wrangler login
npx wrangler dev
npx wrangler deploy
```

Apri l'indirizzo HTTPS restituito da Wrangler per giocare. Puoi aggiungerlo al campo **Website** del repository GitHub così chi visita il progetto trova subito l'app. Se necessario, scegli un nome per il Worker in `wrangler.jsonc` prima del primo deploy.

Worker, asset e Durable Object SQLite sono configurati nello stesso progetto. Ogni stanza è gestita da un oggetto distinto. Le mosse viaggiano via HTTPS e gli aggiornamenti arrivano via WebSocket con ibernazione. Quando il WebSocket non è raggiungibile, il browser recupera lo stato via HTTPS. La scrittura della mossa, della versione e della ricevuta per i tentativi ripetuti avviene in una singola operazione SQLite. La flotta avversaria resta nel backend, che pubblica uno stato diverso per ciascun posto.

I link danno accesso alla stanza a chi li riceve. Il posto viene salvato localmente nel profilo browser usato per entrare. Per tornare in partita basta riaprire lo stesso link nello stesso profilo.

Da **Home → Partite in corso** puoi controllare e riprendere più stanze. **Chiudi partita** chiude subito se l’altra persona non ha ancora fatto una mossa. Altrimenti la stanza resta attiva finché l’altro giocatore accetta. Se rifiuta, si continua a giocare. Gli avvisi si aggiornano mentre Tavolo resta aperto. In locale le stanze sono salvate sotto la cartella temporanea del sistema, in Tavolo. Un riavvio di Node dalla stessa installazione permette di riprendere la partita dallo stesso link e profilo browser. Per scegliere una cartella diversa, imposta TAVOLO_ROOM_DIR prima di avviare il server.

Ogni stanza mantiene gli ultimi 50 messaggi, con un massimo di 280 caratteri per messaggio. La sessione scade dopo 24 ore senza mosse, accesso del secondo giocatore o messaggi. Il server locale rimuove i file scaduti e il Worker pianifica la rimozione della riga di stato.

## Verifica

```powershell
node --test
```

I test coprono motori, accesso ai posti, mosse concorrenti e duplicate e isolamento delle stanze. Per includere l'integrazione HTTP/SSE su un PC con loopback disponibile, esegui `$env:TAVOLO_HTTP_TEST='1'; node --test`. Il runtime Cloudflare e la rete aziendale vanno verificati dopo il deploy. Il test concorrente è funzionale e non misura la capacità in produzione.

## Varianti amichevoli

Scacchi riconosce le comuni posizioni di materiale insufficiente. La richiesta di patta si basa sulla posizione già raggiunta. Dama usa il conteggio automatico delle 40 mosse per lato di sole dame senza catture. Battaglia navale usa un colpo per turno. UNO usa una mano singola con dichiarazione automatica e validazione server del +4. Backgammon usa una partita singola senza cubo. Go usa la griglia 9×9 e conta l'area dopo due passaggi consecutivi. I gruppi morti vanno catturati sulla griglia prima di passare. Le schede Regole riportano queste scelte.

## Struttura

- `public/` contiene lobby, interfaccia di partita e schede Regole.
- `src/games.mjs` definisce il contratto dei giochi e i motori. Scacchi ha un modulo dedicato.
- `src/room.mjs` gestisce posti, turni, versioni e ricevute.
- `src/worker.mjs` e `wrangler.jsonc` descrivono il deployment gestito.
- `dev.mjs` avvia la versione locale.
## Grafica delle carte

In Scopa scegli Napoletane, Piacentine o Bergamasche dal menu **Mazzo**. L'app usa le scansioni dei fronti e un dorso comune per le carte coperte. La scelta del mazzo rimane nel profilo del browser.

## Licenza

Codice e documentazione originali con licenza [MIT](LICENSE). Per provenienza, licenze dei singoli asset e marchi, consulta le [attribuzioni](THIRD_PARTY_NOTICES.md).
