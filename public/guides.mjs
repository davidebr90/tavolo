export const guides={
  chess:[
    ['Obiettivo e turno','Il Bianco apre. Si alterna una mossa a testa. Lo scacco è un attacco al re: puoi allontanare il re, catturare il pezzo che attacca o bloccare la linea, quando possibile. Se nessuna risposta legale elimina lo scacco, è scacco matto.'],
    ['Come si muovono i pezzi','La torre segue righe e colonne, l’alfiere le diagonali, la donna entrambe. Il cavallo salta a L, anche sopra altre pedine. Il re si sposta di una casella senza entrare sotto attacco. Il pedone avanza di una casella, oppure due dalla partenza se entrambe sono libere. Cattura in diagonale in avanti.'],
    ['Arrocco, presa al varco e promozione','Per arroccare seleziona il re e spostalo di due caselle verso la torre. Re e torre devono essere alla posizione iniziale e mai mossi. La strada deve essere libera, e il re non può partire sotto scacco, attraversarlo o finirci. Un pedone che avanza di due e termina di fianco a un pedone avversario può essere catturato come se fosse avanzato di una sola, esclusivamente nella mossa successiva. All’ultima traversa scegli donna, torre, alfiere o cavallo.'],
    ['Patta','Se il giocatore di turno ha il re al sicuro ma non ha mosse legali, è stallo. Tavolo riconosce anche le comuni posizioni di materiale insufficiente. Puoi richiedere patta dopo tre ripetizioni della posizione attuale o 50 mosse a testa senza catture o avanzamenti di pedoni. Dopo cinque ripetizioni o 75 mosse a testa nelle stesse condizioni, il pareggio è automatico, salvo matto.'],
    ['Comandi di Tavolo','Seleziona un tuo pezzo. I punti indicano caselle libere, gli anelli le prese. Clicca la destinazione o trascina il pezzo. Per esempio e2–e4 sposta il pedone di due caselle. In Mosse trovi la notazione: x indica una presa, + uno scacco e # un matto. Puoi copiare la cronologia. Si gioca senza orologio.']
  ],
  dama:[
    ['Posizione iniziale e movimento','Si gioca sulle caselle scure della damiera 8×8, con 12 pedine per parte. Il Bianco apre. Una pedina avanza in diagonale di una casa. Quando raggiunge il fondo si promuove a dama. La dama si muove di una casa diagonale in entrambi i sensi.'],
    ['Come si cattura','Salta un pezzo avversario adiacente se la casa immediatamente oltre è libera. La pedina cattura solo pedine e solo in avanti. La dama cattura pedine e dame, avanti e indietro. Se la presa continua, seleziona in ordine le case di arrivo dei salti.'],
    ['Priorità obbligatorie','Se puoi prendere, devi farlo. Scegli la sequenza con più pezzi. A parità ha precedenza una dama che cattura, poi la sequenza che prende più dame, poi quella che incontra prima una dama. Con priorità uguali puoi scegliere liberamente.'],
    ['Fine partita e notazione','Vinci se l’altro rimane senza pezzi o senza mosse legali. Tavolo applica la patta dopo 40 mosse a testa di sole dame senza prese. Nella cronologia le case usano il righello a lettere e numeri. Un trattino indica lo spostamento, × collega i salti di una presa.']
  ],
  scopa:[
    ['Preparazione e valori','Tavolo distribuisce tre carte a testa e dispone quattro carte scoperte. Quando entrambi finiscono le carte in mano, distribuisce altre tre a testa finché c’è mazzo. Asso vale 1, le carte numeriche il proprio numero, fante 8, cavallo 9 e re 10.'],
    ['Prese e priorità','Se giochi un 7 e sul tavolo c’è un 7, devi prendere un solo 7, anche con un 3 e un 4 disponibili. Se manca il 7 puoi prendere il 3 e il 4, o un’altra combinazione che faccia 7. Quando ci sono più prese valide, Tavolo ti fa scegliere. Se non puoi prendere, la carta rimane sul tavolo.'],
    ['Scopa e ultime carte','Svuotare il tavolo con una presa vale un punto, salvo nell’ultima giocata della smazzata. Le carte rimaste sul tavolo vanno a chi ha fatto l’ultima presa.'],
    ['Punteggio della smazzata','Oltre alle scope vale un punto ciascuno per maggioranza di carte, maggioranza di denari, settebello (7 di denari) e primiera. Con 20 carte a testa, 5 denari a testa o primiera pari, quel punto non si assegna.'],
    ['Come si calcola la primiera','Si sceglie la miglior carta presa di ciascuno dei quattro semi. Valori: 7 = 21, 6 = 18, asso = 16, 5 = 15, 4 = 14, 3 = 13, 2 = 12, figure = 10. Vince la somma maggiore. Serve almeno una carta per seme.'],
    ['Fine partita e mazzi','Vince chi, a fine smazzata, raggiunge almeno 11 punti e supera l’avversario. Se siete pari si gioca ancora. Il menu Mazzo cambia l’aspetto delle carte.']
  ],
  uno:[
    ['Preparazione e abbinamenti','Inizi con sette carte. Si gioca su una carta scoperta abbinandone colore, numero o azione. Per esempio, sopra un 5 rosso puoi giocare un altro 5 o una carta rossa. Il jolly cambia il colore attivo.'],
    ['Pesca o passa','Puoi pescare anche se hai una carta giocabile. Se la carta pescata è valida, puoi giocare solo quella oppure passare. Se non è valida, il turno passa automaticamente.'],
    ['Azioni in due','Salta e Inverti ti fanno giocare ancora. Con +2 o +4 l’avversario pesca e il turno torna a te. Il +4 richiede che tu non abbia carte del colore attivo. Tavolo controlla questa condizione e ti chiede quale colore impostare.'],
    ['Vittoria','Tavolo annuncia UNO automaticamente quando resta una carta. Vince chi la finisce per primo. Si gioca una mano singola, con una carta numerica iniziale.']
  ],
  naval:[
    ['Configura e schiera','Nella creazione puoi scegliere una griglia 8×8, 10×10 o 12×12 e da tre a sei navi. La flotta classica è 10×10 con navi da 5, 4, 3, 3 e 2 caselle. Disponi le navi in orizzontale o verticale. Possono toccarsi, senza sovrapporsi.'],
    ['Comandi di schieramento','Scegli fra Orizzontale e Verticale, poi clicca la casella iniziale o trascina la nave. L’anteprima rossa segnala una posizione invalida. Disponi a caso sistema la flotta, Svuota libera la griglia. Usa Conferma flotta per iniziare quando entrambi avete finito.'],
    ['Attacco e vittoria','Sulla griglia Bersaglio scegli una casella ancora inesplorata. Hai un colpo per turno anche se colpisci. Nella tua flotta vedi le navi e i colpi avversari. Quando tutte le caselle di una nave sono colpite, è affondata. Vince chi affonda tutta la flotta avversaria.']
  ],
  four:[
    ['Griglia e turno','La griglia ha sette colonne e sei righe. Clicca una colonna: la pedina scende nella casa libera più in basso. Una colonna piena non accetta altre pedine.'],
    ['Allinea quattro','Contano gli allineamenti orizzontali, verticali e diagonali consecutivi. Una diagonale crescente, ad esempio, può partire in basso a sinistra e salire di una riga e una colonna per pedina.'],
    ['Difesa e pareggio','Guarda dove finirà la prossima pedina dell’avversario: una casella in alto può diventare accessibile solo dopo averla sostenuta da sotto. A griglia piena senza un allineamento, è pareggio.']
  ],
  reversi:[
    ['Avvio','Si parte con quattro dischi al centro. Il Nero inizia. Una mossa deve racchiudere almeno un disco avversario tra il nuovo disco e uno già tuo.'],
    ['Come si ribalta','Controlla tutte le direzioni orizzontali, verticali e diagonali. Si ribaltano tutte le sequenze avversarie racchiuse, anche su più direzioni con una sola mossa. Un buco o il bordo senza un tuo disco interrompe la linea.'],
    ['Fine e suggerimento','Senza una mossa legale il turno passa automaticamente. Quando nessuno può più muovere, anche a griglia incompleta, si contano i dischi. I quattro angoli sono preziosi perché non possono essere ribaltati una volta occupati.']
  ],
  tris:[
    ['Preparazione e turno','X apre sulla griglia 3×3. Si alterna un simbolo per turno cliccando una casella libera.'],
    ['Vittoria o pareggio','Vince chi allinea tre simboli identici di fila, in orizzontale, verticale o diagonale. La griglia piena senza vincitore è patta.'],
    ['Doppia minaccia','Se riesci a minacciare due linee con due caselle finali diverse, l’avversario può bloccarne soltanto una. Prima controlla sempre se può vincere al prossimo turno.']
  ],
  backgammon:[
    ['Dadi e direzione','Il primo tiro assegna a ciascuno un dado. Chi ottiene il maggiore apre usando entrambi. Le pedine dei due giocatori avanzano in direzioni opposte verso casa. In seguito lancia due dadi per turno. Un doppio dà quattro spostamenti dello stesso valore.'],
    ['Distribuire le mosse','Ogni dado è uno spostamento separato. Puoi muovere la stessa pedina più volte passando da punte legali, oppure usare pedine diverse. Devi usare il massimo numero possibile di dadi e, se puoi usarne uno solo, il maggiore quando possibile.'],
    ['Punte bloccate e barra','Una punta con due o più pedine avversarie è bloccata. Se ne ha una sola puoi colpirla e mandarla sulla barra. Prima di muovere le altre pedine, fai rientrare quelle sulla barra secondo i dadi disponibili.'],
    ['Uscita e vittoria','Puoi far uscire le pedine solo quando tutte sono nelle ultime sei punte. Un dado esatto fa uscire la pedina dalla punta corrispondente. Un dado più alto si può usare sulla pedina più lontana se non hai pedine oltre. Vinci facendo uscire le 15 pedine. Tavolo usa una partita singola senza cubo.']
  ],
  go:[
    ['Intersezioni e gruppi','Si gioca sulle intersezioni del tavoliere 9×9. Il Nero apre. Pietre dello stesso colore confinanti in orizzontale o verticale formano un gruppo. Le intersezioni vuote adiacenti sono libertà, condivise da tutto il gruppo.'],
    ['Presa e ripetizione','Quando un gruppo perde l’ultima libertà viene rimosso. Una mossa che lascia il proprio gruppo senza libertà è vietata, salvo quando una cattura libera spazio. Tavolo vieta di ricreare una posizione già giocata.'],
    ['Fine e punteggio','Due passaggi consecutivi chiudono la partita. Si contano pietre rimaste sulla griglia e intersezioni libere controllate da un solo colore. Il Bianco riceve 7,5 punti. Concorda con l’avversario e cattura i gruppi morti prima di passare, perché Tavolo conta lo stato effettivo della griglia.']
  ],
  nim:[
    ['Le file','Si parte con 1, 3, 5 e 7 gettoni. A ogni turno scegli una sola fila. Puoi togliere anche tutti i gettoni di quella fila.'],
    ['Come cliccare','Clicca il gettone a partire dal quale vuoi rimuovere il resto della fila. Per esempio, su una fila di cinque, scegliendo il terzo togli il terzo, il quarto e il quinto.'],
    ['Fine partita','Vince chi prende l’ultimo gettone dell’intera griglia. Due file uguali lasciate all’avversario permettono spesso di rispondere copiando la sua mossa nell’altra fila.']
  ],
  dots:[
    ['Traccia un lato','Clicca uno spazio libero fra due punti adiacenti per tracciare un segmento orizzontale o verticale. Le diagonali non contano.'],
    ['Chiudi e continua','Se il tuo segmento è il quarto lato di un quadrato, segni un punto e giochi ancora. Un segmento condiviso può chiudere due quadrati insieme. Con una mossa che non chiude quadrati il turno passa.'],
    ['Fine e strategia','Vince chi possiede più quadrati quando tutti i lati sono tracciati. Se puoi, evita di aggiungere il terzo lato di un quadrato che l’avversario potrebbe chiudere.']
  ]
};
