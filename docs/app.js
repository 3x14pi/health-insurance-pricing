const state = { coefficients: { frequenza: {}, severity: {} }, categories: {}, ready: false };
const categoryFields = ['sesso', 'categoria', 'legame_familiare', 'settore', 'macroarea'];
const defaults = { sesso: 'M', categoria: 'DIRIGENZIALE', legame_familiare: 'DIPENDENTE', settore: 'BANKING_FINANCE', macroarea: 'NORD-EST' };
const termPattern = /^C\(([^,)]+)(?:, Treatment\(reference='[^']+'\))?\)\[T\.(.+)\]$/;
const interactionPattern = /^C\(fascia_eta\)\[T\.(.+)\]:C\(sesso\)\[T\.(.+)\]$/;

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && next === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  return rows.filter(item => item.length > 1).map(item => Object.fromEntries(headers.map((header, index) => [header, item[index]])));
}

function ageBand(age) {
  if (age <= 17) return '0-17';
  if (age <= 30) return '18-30';
  if (age <= 45) return '31-45';
  if (age <= 60) return '46-60';
  if (age <= 75) return '61-75';
  return '75+';
}

function discoverCategories() {
  state.categories = { sesso: new Set(['F', 'M']), categoria: new Set(['DIP_BASE']), legame_familiare: new Set(['DIPENDENTE']), settore: new Set(['OTHER']), macroarea: new Set(['CENTRO']) };
  Object.values(state.coefficients).forEach(terms => Object.keys(terms).forEach(term => {
    const match = term.match(termPattern);
    if (match && state.categories[match[1]]) state.categories[match[1]].add(match[2]);
  }));
  categoryFields.forEach(field => {
    const select = document.getElementById(field);
    select.replaceChildren();
    [...state.categories[field]].sort().forEach(value => { select.add(new Option(value, value)); });
    select.value = defaults[field];
  });
}

function linearPredictor(model, values) {
  const terms = state.coefficients[model];
  let score = terms.Intercept || 0;
  Object.entries(terms).forEach(([term, coefficient]) => {
    if (term === 'Intercept') return;
    const interaction = term.match(interactionPattern);
    if (interaction) { if (values.fascia_eta === interaction[1] && values.sesso === interaction[2]) score += coefficient; return; }
    const categorical = term.match(termPattern);
    if (categorical) { if (values[categorical[1]] === categorical[2]) score += coefficient; return; }
    if (Object.prototype.hasOwnProperty.call(values, term)) score += coefficient * values[term];
  });
  return score;
}

function readValues() {
  const form = new FormData(document.getElementById('pricing-form'));
  const eta = Number(form.get('eta'));
  const dimensioneAzienda = Number(form.get('dimensione_azienda'));
  return { eta, fascia_eta: ageBand(eta), sesso: form.get('sesso'), categoria: form.get('categoria'), legame_familiare: form.get('legame_familiare'), settore: form.get('settore'), macroarea: form.get('macroarea'), composizione_num: Number(form.get('composizione_num')), log_dim_azienda: Math.log1p(dimensioneAzienda), dimensione_azienda: dimensioneAzienda, esposizione: Number(form.get('esposizione')) };
}

function formatNumber(value, digits = 2) { return new Intl.NumberFormat('it-IT', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value); }

function calculate(event) {
  event.preventDefault();
  const error = document.getElementById('error-message');
  try {
    if (!state.ready) throw new Error('Il modello non è ancora disponibile. Ricarica la pagina e riprova.');
    const values = readValues();
    if (!Number.isFinite(values.eta) || values.eta < 0 || values.eta > 120) throw new Error('Inserisci un eta compresa tra 0 e 120.');
    if (!Number.isFinite(values.dimensione_azienda) || values.dimensione_azienda < 1) throw new Error('Inserisci almeno 1 assicurato nell azienda.');
    const frequency = Math.exp(linearPredictor('frequenza', values));
    const severity = Math.exp(linearPredictor('severity', values));
    const burningCost = frequency * severity;
    document.getElementById('burning-cost').textContent = formatNumber(burningCost);
    document.getElementById('frequency').textContent = formatNumber(frequency, 3);
    document.getElementById('severity').textContent = formatNumber(severity);
    document.getElementById('period-cost').textContent = formatNumber(burningCost * values.esposizione);
    document.getElementById('profile-band').textContent = values.fascia_eta;
    document.getElementById('profile-summary').textContent = `${values.categoria} · ${values.settore}`;
    document.getElementById('empty-state').hidden = true;
    document.getElementById('result').hidden = false;
    error.hidden = true;
  } catch (calculationError) { error.textContent = calculationError.message; error.hidden = false; }
}

async function init() {
  const button = document.getElementById('calculate-button');
  document.getElementById('pricing-form').addEventListener('submit', calculate);
  document.getElementById('eta').addEventListener('input', event => { document.getElementById('age-band').textContent = `Fascia ${ageBand(Number(event.target.value))}`; });
  document.getElementById('esposizione').addEventListener('input', event => { document.getElementById('exposure-value').textContent = formatNumber(Number(event.target.value)); });
  try {
    const coefficientPaths = ['reports/coefficienti_modelli.csv', '../reports/coefficienti_modelli.csv'];
    let coefficientText = null;
    for (const path of coefficientPaths) {
      const response = await fetch(path);
      if (response.ok) {
        coefficientText = await response.text();
        break;
      }
    }
    if (coefficientText === null) throw new Error('Impossibile caricare i coefficienti del modello.');
    parseCsv(coefficientText).forEach(row => { if (state.coefficients[row.modello]) state.coefficients[row.modello][row.termine] = Number(row.coef); });
    if (!state.coefficients.frequenza.Intercept || !state.coefficients.severity.Intercept) throw new Error('I coefficienti del modello non sono validi.');
    discoverCategories();
    state.ready = true;
    button.disabled = false;
    button.querySelector('span').textContent = 'Calcola burning cost';
    document.getElementById('pricing-form').requestSubmit();
  } catch (error) {
    button.disabled = true;
    button.querySelector('span').textContent = 'Modello non disponibile';
    document.getElementById('error-message').textContent = `${error.message} Controlla di aver aperto il link GitHub Pages completo.`;
    document.getElementById('error-message').hidden = false;
  }
}

init();