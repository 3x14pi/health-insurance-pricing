# Health Insurance Pricing — Modello Burning Cost

Modello predittivo del burning cost individuale (costo atteso sinistri per anno-uomo) su un portafoglio di assicurazione sanitaria collettiva.

📄 La relazione completa del progetto è disponibile in [`RelazioneFerriAntonio.pdf`](RelazioneFerriAntonio.pdf).

## Obiettivo

Stimare il **burning cost** per ogni assicurato scomponendolo in due componenti:

```
Burning Cost = Frequenza × Severity
```

- **Frequenza**: numero atteso di sinistri per anno-uomo
- **Severity**: costo atteso per sinistro

L'approccio a due stadi separati è lo standard nella pratica assicurativa: fornisce **fattori tariffari distinti** per frequenza e severity, permettendo di identificare dove agisce ogni driver di rischio — informazione direttamente utilizzabile nelle decisioni di pricing e nella gestione del portafoglio.

## Dati

Il dataset contiene circa 79.000 record assicurato-anno su 3 anni di sottoscrizione, collegati a circa 40.000 sinistri di un portafoglio sanitario collettivo. Le variabili includono dati demografici (età, sesso), attributi contrattuali (categoria dipendente, legame familiare), caratteristiche aziendali (settore, dimensione) e area geografica.

**Origine e disponibilità:** [DA COMPILARE — es. "I dati provengono da un'esercitazione didattica di pricing assicurativo e non sono ridistribuibili."]. Il dataset non è quindi incluso nel repository. Lo schema delle variabili è documentato in [`reports/dizionario_feature.csv`](reports/dizionario_feature.csv), il dettaglio dei controlli di qualità in [`reports/appendice_data_quality.md`](reports/appendice_data_quality.md).

### Analisi esplorativa e pulizia

- **Qualità dati**: nessun valore mancante né duplicato
- **Anomalie**: esposizione pari a zero (36 righe escluse), esposizione > 1 (8 righe, cappate a 1), 52 sinistri orfani (privi di corrispondenza nella tabella assicurati, esclusi)
- **Grandi sinistri**: capping al 99,5° percentile per limitare l'influenza dei valori estremi sulla stima; soglia calcolata solo sul train per evitare data leakage
- **Zero-inflation**: il 75,7% degli assicurati non genera sinistri — questa struttura conferma che modellare direttamente il burning cost sarebbe inappropriato, motivando l'approccio a due stadi

### Split temporale

Per simulare l'uso reale del modello (prevedere il futuro a partire dal passato), i dati sono divisi **nel tempo**: train sugli anni di sottoscrizione 1 e 2 (54.456 righe), test sull'anno 3 (24.508 righe). Una divisione casuale avrebbe mescolato gli anni, distorcendo le performance.

## Feature engineering

A partire dai dati grezzi sono state derivate:

- **Fasce di età**: discretizzazione dell'età continua per catturare la non linearità a J del rischio sanitario (alto nei bambini, basso nei giovani-adulti, crescente negli anziani)
- **Struttura del nucleo familiare**: composizione numerica, numero di assicurati, variabili aggregate a livello nucleo
- **Dimensione azienda**: numero di assicurati per azienda in scala logaritmica — il log comprime la leva delle poche aziende molto grandi, ottenendo un effetto più regolare

**Variabili usate nel modello:**

- *Categoriche*: fascia di età, sesso, categoria contrattuale, legame familiare, settore, macroarea
- *Numeriche*: composizione numerica del nucleo, dimensione azienda (log)
- *Interazione*: fascia di età × sesso — nella salute il profilo di rischio per età differisce tra uomini e donne (picco di frequenza femminile in età fertile)

Le variabili scartate sono escluse per collinearità o ridondanza con predittori già presenti. Sono inoltre escluse tutte le grandezze note solo dopo l'accadimento del sinistro (controllo del data leakage).

## Modellazione

### Perché un GLM

Nel pricing assicurativo il GLM è lo standard di settore perché è **interpretabile** (ogni coefficiente è un fattore tariffario), adatto a risposte non gaussiane (conteggi, costi) e lineare nei parametri. Un GLM generalizza la regressione lineare rilassando le assunzioni sulla distribuzione della risposta e sul legame tra media e predittore.

Con il **legame logaritmico**, il modello diventa moltiplicativo: ogni exp(beta) è il fattore tariffario che moltiplica il rischio base.

### Frequenza — GLM Poisson con offset

Il numero di sinistri è un conteggio di eventi rari con forte massa in zero: la distribuzione naturale è la **Poisson**. L'esposizione (anni-uomo) entra come **offset** per modellare il tasso per anno-uomo, non il conteggio grezzo.

### Severity — GLM Gamma con pesi

Il costo per sinistro è positivo e fortemente asimmetrico a destra: la distribuzione naturale è la **Gamma**, che a differenza della normale vive solo sui valori positivi e cattura la coda a destra. La stima usa solo i sinistrati; il numero di sinistri entra come **peso** (la media di più sinistri è più stabile).

### Burning cost

Il burning cost per anno-uomo è il prodotto delle due componenti. Poiché entrambe sono moltiplicative, i fattori tariffari si combinano per prodotto.

## Risultati (test set, out-of-time)

| Metrica  | Valore             | Interpretazione                                    |
| -------- | ------------------ | -------------------------------------------------- |
| **Gini** | 0,46 [0,44 ; 0,47] | Potere di ordinamento robusto (IC 95% bootstrap)   |
| **A/E**  | 1,04               | Calibrazione — scarto 4%, entro soglia accettabile |

### Principali fattori tariffari

Riferimenti: dipendente base (categoria), fascia 0-17 (età).

| Segmento               | Frequenza | Severity |
| ---------------------- | --------- | -------- |
| Pensionati             | 3,4×      | 1,2×     |
| Dirigenti              | 2,1×      | 1,3×     |
| Dipendenti qualificati | 1,9×      | 1,2×     |
| Età 75+                | 1,8×      | 1,1×     |

La separazione tra frequenza e severity mostra **dove** agisce ogni driver: i pensionati sono guidati dall'alta frequenza, i dirigenti dalla severity più elevata.

Il dettaglio completo dei coefficienti è in [`reports/coefficienti_modelli.csv`](reports/coefficienti_modelli.csv), il confronto tra i modelli valutati in [`reports/confronto_modelli.csv`](reports/confronto_modelli.csv).

### Calibrazione per segmento (A/E)

I segmenti principali sono ben calibrati (dirigenti 1,03, pensionati 1,01). Gli scostamenti si concentrano sui giovani 18-30 (A/E 1,17) e sui pochi 75+ (A/E 0,86, n=75), base per eventuali azioni correttive.

Dettaglio in [`reports/ae_per_categoria.csv`](reports/ae_per_categoria.csv) e [`reports/ae_per_fascia_eta.csv`](reports/ae_per_fascia_eta.csv).

## Calcolatore tariffario

[`Calcolatore.xlsx`](Calcolatore.xlsx) implementa il modello in un foglio Excel: inserendo il profilo di un assicurato (età, sesso, categoria contrattuale, settore, area) restituisce il burning cost atteso applicando i fattori tariffari stimati. Permette di simulare scenari di premio senza rieseguire i notebook.

## Limiti e opportunità

- **Correlazione intra-nucleo**: i membri dello stesso nucleo condividono fattori non osservati. Un modello a effetti misti (GLMM) potrebbe catturarli
- **Tempo limitato**: soli 3 anni di dati, con un solo anno di test. Più anni permetterebbero di verificare la stabilità e stimare trend (es. inflazione medica)
- **Linearità del GLM**: il modello cattura solo gli effetti specificati esplicitamente. Un modello non lineare (LightGBM) come challenger, con SHAP, potrebbe scoprire pattern nascosti
- **Settore**: il settore aziendale approssima il rischio professionale ma non lo cattura del tutto. Dati esterni (es. tassi INAIL) potrebbero migliorare il potere di ordinamento

## Struttura del progetto

```
notebooks/
    NB01_data_understanding.ipynb        # EDA e qualità dati
    NB02_data_preparation.ipynb          # Pulizia, feature engineering, split temporale
    NB03_modellazione_validazione.ipynb  # GLM Poisson + Gamma, validazione out-of-time

reports/
    coefficienti_modelli.csv             # Coefficienti frequenza + severity
    confronto_modelli.csv                # Confronto modelli (Gini, MAE)
    ae_per_categoria.csv                 # A/E per categoria contrattuale
    ae_per_fascia_eta.csv                # A/E per fascia di età
    lift_table_modello_scelto.csv        # Lift table per decili, modello scelto
    lift_table_best.csv                  # Lift table, modello alternativo
    dizionario_feature.csv               # Dizionario delle feature
    dati_modello.xlsx                    # Tabella riassuntiva
    appendice_data_quality.md            # Dettaglio controlli qualità dati

Calcolatore.xlsx                         # Calcolatore tariffario
RelazioneFerriAntonio.pdf                # Relazione completa del progetto
requirements.txt                         # Dipendenze Python
```

I modelli serializzati non sono versionati: si rigenerano eseguendo NB03.

## Setup

```bash
pip install -r requirements.txt
jupyter lab notebooks/
```

I notebook vanno eseguiti in sequenza (NB01 → NB02 → NB03). NB02 produce il dataset modellabile usato da NB03.

## Autore

Antonio Ferri — [LinkedIn](https://linkedin.com/in/anton-ferri) · [GitHub](https://github.com/3x14pi)
