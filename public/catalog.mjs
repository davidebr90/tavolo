export const catalog = {
  chess: {
    name:'Scacchi', category:'Strategia', art:'♞', color:'lavender', players:['Bianco','Nero'],
    desc:'Proteggi il re, costruisci il tuo attacco.',
    source:['FIDE · Laws of Chess','https://handbook.fide.com/chapter/e012023']
  },
  naval: {
    name:'Battaglia navale',category:'Tattica',art:'✦',color:'blue',players:['Flotta 1','Flotta 2'],
    desc:'Schiera la flotta e trova le navi avversarie.',
    source:['Hasbro · Battleship Classic','https://instructions.hasbro.com/en-us/instruction/Battleship-Classic-Board-Game-Strategy-Game']
  },
  four: {
    name:'Forza 4',category:'Partita veloce',art:'●',color:'rose',players:['Corallo','Oro'],
    desc:'Fai cadere le pedine. Allineane quattro.',
    source:['Hasbro · Connect 4, modalità classica','https://instructions.hasbro.com/en-us/instruction/connect-4-game-instructions']
  },
  reversi: {
    name:'Reversi',category:'Strategia',art:'◐',color:'mint',players:['Nero','Bianco'],
    desc:'Chiudi le linee e ribalta i dischi.',
    source:['World Othello Federation · Regole ufficiali','https://www.worldothello.org/about/about-othello/othello-rules/official-rules/english']
  },
  tris: {
    name:'Tris',category:'Partita veloce',art:'×',color:'sand',players:['X','O'],
    desc:'Tre simboli in fila e la partita è tua.',
    source:['Wolfram MathWorld · Tic-Tac-Toe','https://mathworld.wolfram.com/Tic-Tac-Toe.html']
  },
  scopa: {
    name:'Scopa',category:'Carte',art:'✷',color:'sand',players:['Posto 1','Posto 2'], seats:[2,4],
    desc:'Fai le prese e raggiungi 11 punti.',
    source:['Pagat · Scopa','https://www.pagat.com/fishing/scopa.html']
  },
  uno: {
    name:'UNO',category:'Carte',art:'✦',color:'rose',players:['Posto 1','Posto 2'], seats:[2,3,4,5,6,7,8,9,10],
    desc:'Finisci le carte prima del tuo avversario.',
    source:['Mattel · Regole UNO','https://service.mattel.com/instruction_sheets/42001.pdf']
  },
  briscola: {
    name:'Briscola',category:'Carte',art:'✷',color:'mint',players:['Posto 1','Posto 2'],seats:[2,4],
    desc:'Conquista assi e tre, in duello o in coppia.',
    source:['Sisal · Regole della Briscola','https://www.sisal.it/content/dam/new-dam/italy/canali/sisal-it/doc-pdf/giochi-di-carte/regolamenti-giochi/briscola.pdf']
  },
  'poker-italiano': {
    name:'Poker italiano',category:'Carte',art:'♦',color:'peach',players:['Posto 1','Posto 2'],seats:[2,3,4,5,6],
    desc:'Apri il gioco e scegli quali delle cinque carte cambiare.',
    source:['Sisal · Poker all’italiana','https://www.sisal.it/content/dam/new-dam/italy/canali/sisal-it/doc-pdf/giochi-di-carte/regolamenti-giochi/pokeritaliana.pdf']
  },
  'texas-holdem': {
    name:'Poker Texas Hold’em',category:'Carte',art:'♠',color:'blue',players:['Posto 1','Posto 2'],seats:[2,3,4,5,6,7,8,9,10],
    desc:'Combina due carte personali con le cinque comuni.',
    source:['Poker TDA · Regole da torneo','https://www.pokertda.com/view-poker-tda-rules/']
  },
  backgammon: {
    name:'Backgammon',art:'⚄',color:'peach',players:['Chiaro','Scuro'],desc:'Corri verso casa e porta fuori le pedine.',
    source:['US Backgammon Federation','https://usbgf.org/wp-content/uploads/2023/08/USBGF-rules-2024.pdf']
  },
  go: {
    name:'Go',art:'◌',color:'mint',players:['Nero','Bianco'],desc:'Circonda le pietre e controlla le intersezioni.',
    source:['British Go Association · Regole di gioco','https://www.britgo.org/files/rules/rulesofplay.pdf']
  },
  nim: {
    name:'Nim',art:'⋮',color:'lavender',players:['Posto 1','Posto 2'],desc:'Scegli un mucchio e calcola quante togliere.',
    source:['Wolfram MathWorld · Nim','https://mathworld.wolfram.com/Nim.html']
  },
  dots: {
    name:'Punti e quadrati',art:'▦',color:'blue',players:['Viola','Blu'],desc:'Chiudi più quadrati del tuo avversario.',
    source:['Wolfram MathWorld · Dots and Boxes','https://mathworld.wolfram.com/DotsandBoxes.html']
  },
  dama: {
    name:'Dama',category:'Dama italiana',art:'◉',color:'peach',players:['Bianco','Nero'],
    desc:'Calcola le prese e raggiungi il lato opposto.',
    source:['Federazione Italiana Dama · Regolamento','https://www.fid.it/regolamenti/capo1.htm']
  }
};
