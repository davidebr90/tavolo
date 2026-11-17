# Piano di implementazione

1. Verificare le fonti e definire regole, varianti e azioni valide per ciascun gioco.
2. Implementare i motori con un contratto comune e testare mosse, turni e condizioni di fine.
3. Collegare lobby e stanze private al backend, con salvataggio atomico, controllo della versione, deduplicazione e riconnessione.
4. Costruire i sei tabelloni e le schede Regole. Verificare avvio e percorsi a due giocatori, poi preparare la distribuzione.

Le partite sono per due, senza orologio. Il backend di produzione è un Cloudflare Worker con un Durable Object e SQLite per stanza. Il server locale riproduce l'API per lo sviluppo.
