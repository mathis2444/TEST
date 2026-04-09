const STORAGE_KEY = 'support-lt-tracker.v1';

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function fmt(n) {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeGap(support, price) {
  const diff = Number(price) - Number(support);
  const pct = Number(support) === 0 ? 0 : (diff / Number(support)) * 100;
  return { diff, pct };
}

const rows = document.getElementById('rows');
const form = document.getElementById('add-form');
const search = document.getElementById('search');

let items = loadItems();

function render() {
  const q = search.value.trim().toLowerCase();
  rows.innerHTML = '';

  items
    .filter(it => [it.name, it.ticker].join(' ').toLowerCase().includes(q))
    .forEach((it, index) => {
      const { diff, pct } = computeGap(it.support, it.price);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${it.name}</td>
        <td>${it.ticker || '-'}</td>
        <td>${fmt(it.support)} €</td>
        <td>${fmt(it.price)} €</td>
        <td class="${diff >= 0 ? 'badge-up' : 'badge-down'}">${diff >= 0 ? '+' : ''}${fmt(diff)} €</td>
        <td class="${pct >= 0 ? 'badge-up' : 'badge-down'}">${pct >= 0 ? '+' : ''}${fmt(pct)} %</td>
        <td><button class="danger" data-index="${index}">Supprimer</button></td>
      `;
      rows.appendChild(tr);
    });
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const item = {
    name: document.getElementById('name').value.trim(),
    ticker: document.getElementById('ticker').value.trim(),
    support: Number(document.getElementById('support').value),
    price: Number(document.getElementById('price').value),
  };

  if (!item.name || Number.isNaN(item.support) || Number.isNaN(item.price)) return;

  items.unshift(item);
  saveItems(items);
  form.reset();
  render();
});

rows.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-index]');
  if (!btn) return;
  const index = Number(btn.dataset.index);
  items.splice(index, 1);
  saveItems(items);
  render();
});

search.addEventListener('input', render);

render();
