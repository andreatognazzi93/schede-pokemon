# Schede Pokémon

Scheda personaggio in italiano basata sul PDF vuoto fornito, con esempio Tillo.

## Uso

Apri il sito, compila la scheda e usa **Condividi** per creare un link leggibile da chiunque. Il link contiene una copia dei valori attuali: crea un nuovo link dopo una modifica. **Crea una copia** permette a chi riceve il link di salvare e modificare il personaggio nel proprio browser.

Le schede vengono salvate in localStorage, nel browser e dispositivo utilizzati. **Esporta** scarica un backup JSON; **Importa** lo carica su un altro dispositivo. **Stampa / PDF** include anche il testo completo delle note e dell'inventario. Nessuna registrazione o database esterno.

## Regole

- Tutti i modificatori: `Math.floor((statistica - 10) / 2)`.
- Iniziativa: `competenza + modificatore Velocità`.
- CA: `8 + competenza + modificatore Difesa`.
- PF massimi: `livello * (6 + modificatore HP)`.
- Bonus di ogni abilità con caratteristica selezionata: `modificatore caratteristica + bonus di competenza`.
- Save, nomi delle abilità, valore della competenza e mosse si compilano manualmente.

Tillo: livello 9, competenza 4, statistiche 14 / 13 / 14 / 16 / 12 / 8 → CA 14, iniziativa +3, PF massimi 72. Il PDF di esempio contiene altri calcoli nelle note; non modificano le regole dell'app. Le note di campagna e l'inventario personali sono stati omessi dall'esempio pubblico.

## Sviluppo

App statica senza dipendenze. `npm start` avvia il server locale su `http://127.0.0.1:4173`. `npm test` verifica regole e condivisione Unicode, importazioni e limiti.

`node build.mjs` copia gli asset in `dist`. `node scripts/package.mjs` crea una versione HTML autonoma utilizzabile offline. La configurazione per Sites è pronta in `.openai/hosting.json`; il servizio non è attualmente abilitato in questo workspace. Il sito viene pubblicato su GitHub Pages dalla radice del branch `main`, con `.nojekyll` per distribuire direttamente gli asset.
