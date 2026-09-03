# Appendice — Note di data quality
### (Sezione extra, NON conteggiata nelle 4 pagine richieste)

> **Premessa.** Non è dato sapere se il dataset rifletta dinamiche reali o sia (in parte) generato
> sinteticamente; in quest'ultimo caso alcune osservazioni potrebbero essere artefatti privi di
> significato nel mondo reale. Le riporto quindi **non come conclusioni**, ma come esempio del mio
> approccio di **controllo qualità dei dati**.

## Metodo
Per ogni anomalia applico quattro passi:
1. **Individuo** il valore strano;
2. **Misuro** quanto è frequente (caso isolato o sistematico?);
3. **Verifico** se ha una logica (testo un'ipotesi);
4. **Decido** se impatta il modello.

## Caso principale — `carico_fiscale` incoerente
Ho notato bambini di pochi anni marcati come **"non a carico"** del caponucleo, fiscalmente implausibile.
Indagando:

- **Non è isolato**: il **20%** dei figli risulta "non a carico".
- **È contro-logico**: la fascia **0-5 anni** ha la quota più alta (**29,5%**), quando i più piccoli
  (senza reddito) dovrebbero essere quasi tutti a carico.
- **Ho testato l'ipotesi "a carico dell'altro coniuge"** (meccanismo fiscale reale e plausibile):
  **non confermata dai dati** —
  - la presenza del coniuge non aumenta i casi "non a carico" (20,2% con coniuge vs 21,8% senza);
  - il 22% dei figli minorenni "non a carico" non ha alcun coniuge nel nucleo;
  - l'88,5% delle famiglie con ≥2 figli ha `carico_fiscale` uniforme (nessuna divisione individuale).

**Decisione**: variabile considerata inaffidabile ed **esclusa dal modello** (peraltro già ridondante
con `legame_familiare`).

## Altre osservazioni minori (nessun impatto sul modello)
- `esposizione`: 8 valori esattamente a **1,01** (logicamente impossibile, >100% dell'anno). Non è un
  errore di floating-point — i valori sono "puliti" (il dato è arrotondato a 2 decimali alla fonte) — ma
  un **artefatto di arrotondamento/sovrapposizione** nel dato sorgente. Riportati a 1,0 (clip).
- **52 sinistri "orfani"** (0,13%) non agganciati ad alcun assicurato → esclusi dal target.
- **427 sinistri a importo zero** (1,1%) → prestazioni registrate senza costo a carico della compagnia.
- L'esposizione parziale (<1) si **concentra su frazioni mensili** (1/12, 2/12, …, con picco a 0,5 =
  6 mesi): le coperture iniziano/terminano a confini di mese.

## Conclusione
Le incoerenze trovate sono marginali o gestite, e **nessuna inficia le 4 pagine principali**.
L'esercizio dimostra l'abitudine a non fidarsi dei dati a scatola chiusa: individuare, quantificare,
testare un'ipotesi e decidere con criterio se e come intervenire.
