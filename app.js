const toggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('#menu');
toggle.addEventListener('click', () => {
  menu.hidden = !menu.hidden;
  toggle.setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !menu.hidden) {
    menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
  }
});
document.querySelector('#contrast').addEventListener('click', () => document.body.classList.toggle('contrast'));
document.querySelectorAll('.rc-grupo h2 button').forEach(button => {
  button.addEventListener('click', () => {
    const list = document.getElementById(button.getAttribute('aria-controls'));
    list.hidden = !list.hidden;
    button.setAttribute('aria-expanded', String(!list.hidden));
    button.querySelector('span').textContent = list.hidden ? '+' : '−';
  });
});
const banners = [
  ['aa61569f409afbc9.png', 'Mês do cliente — Mais Correios', 'https://www.maiscorreios.com.br/'],
  ['125e1ba35c6bda6b.png', 'Black Friday Correios', 'https://www.correios.com.br/blackfriday/blackfriday'],
  ['28cf96b3bec5efca.png', 'Promoção dia das Crianças — Correios Celular', 'https://www.correioscelular.com.br/']
];
let current = 0;
function showBanner(index) {
  current = (index + banners.length) % banners.length;
  const [file, alt, href] = banners[current];
  const image = document.querySelector('#banner-image');
  image.src = `images/${file}`; image.alt = alt;
  document.querySelector('#banner-link').href = href;
  document.querySelectorAll('.dots button').forEach((button, i) => button.setAttribute('aria-pressed', String(i === current)));
}
document.querySelector('.prev').addEventListener('click', () => showBanner(current - 1));
document.querySelector('.next').addEventListener('click', () => showBanner(current + 1));
document.querySelectorAll('.dots button').forEach((button, i) => button.addEventListener('click', () => showBanner(i)));

const DAY = 24 * 60 * 60 * 1000;
const STAGES = [
  { days: 0, title: 'Objeto postado.', location: 'CHINA', icon: 'caixa.svg' },
  { days: 1, title: 'Objeto recebido na unidade de exportação no país de origem.', location: 'CHINA', icon: 'caixa-aberta.svg' },
  { days: 3, title: 'Objeto em transferência — por favor aguarde.', location: 'CHINA → Unidade de Tratamento Internacional — BR', icon: 'envio.svg' },
  { days: 6, title: 'Objeto recebido pelos Correios do Brasil.', location: 'Curitiba — PR', icon: 'bandeira-brasil.svg' }
];
let activeRecord = null;
let serverClock = null;
function trackingNow() {
  return serverClock ? serverClock.now + (performance.now() - serverClock.receivedAt) : Date.now();
}
function stageTime(stage) {
  return stage.days === 0 ? activeRecord.startedAt : activeRecord.firstSeenAt + stage.days * DAY;
}
function validDocument(value) {
  if (!/^\d{11}$|^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const digit = (base, weights) => {
    const sum = [...base].reduce((sum, d, i) => sum + Number(d) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const weights = value.length === 11
    ? [[10,9,8,7,6,5,4,3,2], [11,10,9,8,7,6,5,4,3,2]]
    : [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]];
  const base = value.slice(0, -2);
  const first = digit(base, weights[0]);
  return value.endsWith(`${first}${digit(base + first, weights[1])}`);
}
const dateFormat = new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short', timeZone:'America/Fortaleza'});
function renderTimeline() {
  if (!activeRecord) return;
  const now = trackingNow();
  const visible = STAGES.filter(stage => now >= stageTime(stage));
  const timeline = document.querySelector('#timeline');
  timeline.replaceChildren();
  [...visible].reverse().forEach(stage => {
    const item = document.createElement('li');
    const icon = document.createElement('img');
    icon.src = 'images/' + stage.icon; icon.alt = '';
    icon.className = stage.icon === 'bandeira-brasil.svg' ? 'flag-icon' : 'event-icon';
    const content = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = stage.title;
    const location = document.createElement('p'); location.textContent = stage.location;
    const time = document.createElement('time');
    const instant = new Date(stageTime(stage));
    time.dateTime = instant.toISOString(); time.textContent = dateFormat.format(instant);
    content.append(title, location, time); item.append(icon, content); timeline.append(item);
  });

}
function showView(requested) {
  const show = requested && activeRecord !== null;
  document.querySelector('#tracking-result').hidden = !show;
  document.querySelector('.tracking').hidden = show;
  document.querySelector('main > h1').textContent = show ? 'Rastreamento fictício' : 'Rastreamento';
  document.body.classList.toggle('result-view', show);
  if (show) {
    renderTimeline();
  }
}
function showRoute() { showView(location.hash === '#acompanhamento'); }
window.addEventListener('hashchange', showRoute);
document.querySelector('.back-link').addEventListener('click', event => {
  event.preventDefault();
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  showView(false);
});

async function loadRecord(documentNumber) {
  if (!['http:', 'https:'].includes(location.protocol)) {
    throw new Error('Abra a página pelo endereço do backend. O HTML avulso não acessa o banco de dados.');
  }
  let response;
  try {
    response = await fetch('/api/tracking', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({document: documentNumber}),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error('Não foi possível acessar o servidor. Abra a página pelo endereço do backend, fora da prévia do ChatGPT.');
  }
  if (!response.ok) throw new Error('O servidor não conseguiu consultar o histórico. Nenhuma data foi reiniciada.');
  let record;
  try { record = await response.json(); } catch {
    throw new Error('O backend não está disponível neste endereço. Não foi criado um histórico temporário.');
  }
  if (record.version !== 2 || ![record.startedAt, record.firstSeenAt, record.serverNow].every(Number.isFinite)) {
    throw new Error('O servidor retornou um histórico inválido. Tente novamente mais tarde.');
  }
  serverClock = {now: record.serverNow, receivedAt: performance.now()};
  return record;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTimeline(); });
setInterval(renderTimeline, 60000);
async function consultDocument(event) {
  event.preventDefault();
  const input = document.querySelector('#objeto');
  const feedback = document.querySelector('#feedback');
  const raw = input.value.trim();
  const documentNumber = raw.replace(/[.\-/\s]/g, '');
  if (!validDocument(documentNumber)) {
    feedback.textContent = 'CPF/CNPJ inválido. Digite um CPF com 11 dígitos ou CNPJ com 14 dígitos e verificadores corretos. Não é necessário código de rastreio.';
    input.setAttribute('aria-invalid', 'true');
    feedback.scrollIntoView({block: 'center', behavior: 'smooth'});
    input.focus({preventScroll: true});
    return;
  }
  const button = event.submitter || document.querySelector('.primary');
  input.removeAttribute('aria-invalid');
  button.disabled = true;
  feedback.textContent = 'Consultando…';
  try {
    activeRecord = await loadRecord(documentNumber);
    feedback.textContent = '';
    input.value = '';
    try { history.replaceState(null, '', '#acompanhamento'); } catch {}
    showView(true);
    window.scrollTo({top: 0, behavior: 'smooth'});
  } catch (error) {
    feedback.textContent = error.message || 'Não foi possível acessar o histórico. Tente novamente.';
    feedback.scrollIntoView({block: 'center', behavior: 'smooth'});
  } finally { button.disabled = false; }
}
document.querySelector('#tracking-form').addEventListener('submit', consultDocument);
document.querySelector('.primary').addEventListener('click', consultDocument);
showRoute();

document.querySelector('#script-status').hidden = true;
