/* ── Duitku · catatan keuangan offline ───────────────────────────────
   Semua data disimpan di localStorage HP (tidak ada server, tidak ada
   network call). Satu-satunya jalan keluar data = Export JSON / CSV. */
'use strict';
(() => {

const KEY = 'duitku.v1';
const HINT_KEY = 'duitku.hintDismissed';

const DEFAULT_ACCOUNTS = ['Superbank', 'Mandiri', 'Mayapada', 'ShopeePay', 'Cash', 'myBCA', 'Flazz'];

const DEFAULT_CATS = {
  out: [
    ['Pinjaman', ['Kartu kredit']],
    ['Kebutuhan rumah', ['Tagihan aplikasi', 'Laundry']],
    ['Makanan & minuman', ['Pacaran']],
    ['Investasi', []],
    ['Kesehatan & olahraga', ['Olahraga', 'Apotek']],
    ['Transportasi', ['Bensin', 'Biaya parkir']],
    ['Shopping', []],
    ['Keluarga', ['Orang tua']],
    ['Pengeluaran Keuangan Lainnya', ['Biaya admin']],
    ['Donasi & hadiah', ['Donasi']]
  ],
  in: [
    ['Pemasukan', []],
    ['Transfer Masuk', []],
    ['Pinjaman', []],
    ['Donasi & hadiah', []]
  ]
};

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/* ── util ─────────────────────────────────────────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  const neg = n < 0;
  return (neg ? '−' : '') + 'Rp ' + nf.format(Math.abs(n));
}
function moneyShort(n) { return money(n); }

function toISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const todayISO = () => toISO(new Date());
function parseISO(s) {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}
const thisMonth = () => todayISO().slice(0, 7);
function monthName(ym) {
  const p = ym.split('-').map(Number);
  return MONTHS[p[1] - 1] + ' ' + p[0];
}
function dayLabel(iso) {
  const d = parseISO(iso);
  return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3);
}
function shiftMonth(ym, delta) {
  const p = ym.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}
/* input jumlah gaya Indonesia: 51292 → "51.292", desimal pakai koma */
function fmtTyping(raw) {
  const s = String(raw).replace(/[^\d,]/g, '');
  const i = s.indexOf(',');
  let intPart = (i >= 0 ? s.slice(0, i) : s).replace(/\D/g, '');
  const dec = i >= 0 ? s.slice(i + 1).replace(/\D/g, '').slice(0, 2) : null;
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const grouped = intPart ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '0';
  return dec === null ? (intPart ? grouped : '') : grouped + ',' + dec;
}
function amountValue(text) {
  const s = String(text || '').replace(/[^\d,]/g, '');
  if (!s) return 0;
  const i = s.indexOf(',');
  const intPart = (i >= 0 ? s.slice(0, i) : s).replace(/\D/g, '') || '0';
  const dec = i >= 0 ? s.slice(i + 1).replace(/\D/g, '').slice(0, 2) : '';
  return Number(intPart + (dec ? '.' + dec : ''));
}

/* ── storage ──────────────────────────────────────────────────────── */
function defaults() {
  return {
    version: 1,
    settings: { theme: 'auto', lastBackup: null, lastCat: { out: '', in: '' }, lastAcc: '' },
    accounts: DEFAULT_ACCOUNTS.slice(),
    cats: {
      out: DEFAULT_CATS.out.map(([name, subs]) => ({ name, subs: subs.slice() })),
      in: DEFAULT_CATS.in.map(([name, subs]) => ({ name, subs: subs.slice() }))
    },
    tx: []
  };
}
function normalize(t) {
  return {
    id: t.id || uid(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : todayISO(),
    type: t.type === 'in' ? 'in' : 'out',
    amount: Math.abs(Number(t.amount) || 0),
    category: t.category || 'Lainnya',
    subcategory: t.subcategory || '',
    account: t.account || '',
    note: t.note || '',
    createdAt: Number(t.createdAt) || Date.now()
  };
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
  if (!raw) return defaults();
  let d;
  try { d = JSON.parse(raw); } catch (e) { return defaults(); }
  const base = defaults();
  if (!d || typeof d !== 'object') return base;
  const out = {
    version: 1,
    settings: Object.assign(base.settings, d.settings || {}),
    accounts: Array.isArray(d.accounts) && d.accounts.length ? d.accounts.slice() : base.accounts,
    cats: {
      out: Array.isArray(d.cats && d.cats.out) && d.cats.out.length ? d.cats.out : base.cats.out,
      in: Array.isArray(d.cats && d.cats.in) && d.cats.in.length ? d.cats.in : base.cats.in
    },
    tx: Array.isArray(d.tx) ? d.tx.map(normalize) : []
  };
  out.settings.lastCat = Object.assign({ out: '', in: '' }, out.settings.lastCat || {});
  return out;
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    toast('Gagal menyimpan: penyimpanan penuh');
    return false;
  }
}

/* ── state ────────────────────────────────────────────────────────── */
let data = load();
let view = { month: thisMonth(), showCats: false, pickYear: new Date().getFullYear() };
let entry = null;          // { id?, type, amountText, date, category, subcategory, account, note }
let catType = 'out';       // tab kategori di pengaturan
let openStack = [];

/* ── render: ringkasan + daftar ───────────────────────────────────── */
function monthTx(ym) {
  return data.tx
    .filter((t) => t.date.slice(0, 7) === ym)
    .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : (a.date < b.date ? 1 : -1)));
}

function renderSummary() {
  const list = monthTx(view.month);
  const inn = list.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  const outp = list.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
  const net = inn - outp;
  const isNow = view.month === thisMonth();

  let html = '<div class="sum-hero">' +
    '<span class="sum-label">' + (isNow ? 'Sisa bulan ini' : 'Sisa ' + monthName(view.month)) + '</span>' +
    '<strong class="sum-value num ' + (net < 0 ? 'neg' : 'pos') + '">' + money(net) + '</strong>' +
    '<div class="sum-split">' +
      '<div><span class="k"><i class="dot pos"></i>Masuk</span><span class="v num">' + money(inn) + '</span></div>' +
      '<div><span class="k"><i class="dot neg"></i>Keluar</span><span class="v num">' + money(outp) + '</span></div>' +
    '</div>' +
    '<p class="sum-count">' + list.length + ' transaksi' + (list.length ? '' : ' · belum ada catatan') + '</p>';

  if (list.length) {
    const byCat = {};
    list.filter((t) => t.type === 'out').forEach((t) => {
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    });
    const rows = Object.keys(byCat).map((k) => [k, byCat[k]]).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = rows.length ? rows[0][1] : 1;
    html += '<button class="cat-toggle" id="catToggle" aria-expanded="' + (view.showCats ? 'true' : 'false') + '">' +
      '<span>Rincian pengeluaran per kategori</span>' +
      '<svg class="i" viewBox="0 0 24 24"><use href="#i-down"/></svg></button>';
    if (view.showCats) {
      html += '<div class="cat-lines">' + rows.map(([name, val]) =>
        '<div class="cat-line"><span class="n">' + esc(name) + '</span>' +
        '<span class="v">' + money(val) + '</span>' +
        '<span class="bar"><i style="width:' + Math.max(2, Math.round((val / max) * 100)) + '%"></i></span></div>'
      ).join('') + '</div>';
    }
  }
  html += '</div>';
  $('#summary').innerHTML = html;
}

function renderList() {
  const list = monthTx(view.month);
  const el = $('#list');
  if (!list.length) {
    el.innerHTML = '<div class="empty"><b>Belum ada catatan bulan ini</b>' +
      'Tap tombol Catat di bawah untuk mulai. Data tersimpan di HP ini saja.</div>';
    return;
  }
  const groups = [];
  list.forEach((t) => {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  });

  el.innerHTML = groups.map((g) => {
    const inn = g.items.filter((t) => t.type === 'in').reduce((s, t) => s + t.amount, 0);
    const out = g.items.filter((t) => t.type === 'out').reduce((s, t) => s + t.amount, 0);
    const parts = [];
    if (inn) parts.push('masuk ' + moneyShort(inn));
    if (out) parts.push('keluar ' + moneyShort(out));
    return '<div class="day">' +
      '<div class="day-head"><span class="day-name">' + dayLabel(g.date) + '</span>' +
      '<span class="day-net">' + parts.join(' · ') + '</span></div>' +
      '<div class="day-group">' + g.items.map((t) =>
        '<button class="row" data-id="' + t.id + '">' +
          '<i class="row-side ' + t.type + '"></i>' +
          '<span class="row-main">' +
            '<span class="row-cat">' + esc(t.category) +
              (t.subcategory ? '<span class="row-meta" style="display:inline;font-weight:500"> · ' + esc(t.subcategory) + '</span>' : '') +
            '</span>' +
            '<span class="row-meta">' + esc([t.account, t.note].filter(Boolean).join(' · ') || 'tanpa akun') + '</span>' +
          '</span>' +
          '<span class="row-amt num ' + t.type + '">' + (t.type === 'in' ? '+' : '−') + money(t.amount).replace('−', '') + '</span>' +
        '</button>'
      ).join('') + '</div></div>';
  }).join('');

  $$('.row', el).forEach((b) => b.addEventListener('click', () => {
    const t = data.tx.find((x) => x.id === b.dataset.id);
    if (t) openEntry(t);
  }));
}

function renderTop() {
  $('#monthLabel').textContent = monthName(view.month);
  $('#prevMonth').setAttribute('aria-label', 'Bulan sebelumnya: ' + monthName(shiftMonth(view.month, -1)));
  $('#nextMonth').setAttribute('aria-label', 'Bulan berikutnya: ' + monthName(shiftMonth(view.month, 1)));
}
function render() {
  renderTop();
  renderSummary();
  renderList();
  const ct = $('#catToggle');
  if (ct) ct.addEventListener('click', () => { view.showCats = !view.showCats; renderSummary(); });
}

/* ── sheet ────────────────────────────────────────────────────────── */
function openSheet(id) {
  const el = $('#' + id);
  const scrim = $('#scrim');
  $$('.sheet').forEach((s) => { if (s.id !== id) s.classList.remove('on'); });
  el.hidden = false;
  scrim.hidden = false;
  requestAnimationFrame(() => { el.classList.add('on'); scrim.classList.add('on'); });
  openStack = [id];
}
function closeSheet() {
  $$('.sheet').forEach((s) => s.classList.remove('on'));
  const scrim = $('#scrim');
  scrim.classList.remove('on');
  const done = () => { $$('.sheet').forEach((s) => { s.hidden = true; }); scrim.hidden = true; };
  setTimeout(done, 240);
  openStack = [];
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('on');
    setTimeout(() => { t.hidden = true; }, 220);
  }, 2100);
}

/* ── form catat / edit ────────────────────────────────────────────── */
function catsOf(type) { return data.cats[type] || []; }

function openEntry(tx) {
  const lastAcc = data.settings.lastAcc && data.accounts.includes(data.settings.lastAcc)
    ? data.settings.lastAcc : (data.accounts[0] || '');
  entry = tx ? {
    id: tx.id, type: tx.type, amountText: fmtTyping(String(tx.amount).replace('.', ',')),
    date: tx.date, category: tx.category, subcategory: tx.subcategory || '',
    account: tx.account || lastAcc, note: tx.note || ''
  } : {
    id: null, type: 'out', amountText: '', date: todayISO(),
    category: data.settings.lastCat.out || (catsOf('out')[0] || {}).name || '',
    subcategory: '', account: lastAcc, note: ''
  };
  $('#entryTitle').textContent = tx ? 'Ubah transaksi' : 'Catat transaksi';
  $('#deleteTx').hidden = !tx;
  $('#deleteTx').textContent = 'Hapus';
  $('#amount').value = entry.amountText;
  $('#date').value = entry.date;
  $('#note').value = entry.note;
  renderEntryChips();
  openSheet('entrySheet');
  if (!tx) setTimeout(() => $('#amount').focus(), 280);
}

function renderEntryChips() {
  $$('#typeSeg .seg-btn').forEach((b) => {
    const on = b.dataset.type === entry.type;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const cats = catsOf(entry.type);
  if (!cats.some((c) => c.name === entry.category)) entry.category = cats.length ? cats[0].name : '';
  $('#catChips').innerHTML = cats.map((c, i) =>
    '<button class="chip' + (c.name === entry.category ? ' is-on' : '') + '" data-cat="' + i + '">' + esc(c.name) + '</button>'
  ).join('') || '<span class="tiny-note">Belum ada kategori — tambah di Pengaturan</span>';
  $$('#catChips .chip').forEach((b) => b.addEventListener('click', () => {
    entry.category = cats[Number(b.dataset.cat)].name;
    const subs = (cats.find((c) => c.name === entry.category) || {}).subs || [];
    if (!subs.includes(entry.subcategory)) entry.subcategory = '';
    renderEntryChips();
  }));

  const cat = cats.find((c) => c.name === entry.category);
  const subs = cat ? cat.subs : [];
  $('#subField').hidden = !subs.length;
  if (subs.length) {
    if (!subs.includes(entry.subcategory) && entry.subcategory !== '') entry.subcategory = '';
    $('#subChips').innerHTML = '<button class="chip sub-chip' + (entry.subcategory === '' ? ' is-on' : '') +
        '" data-sub="">tanpa sub</button>' +
      subs.map((s, i) => '<button class="chip sub-chip' + (s === entry.subcategory ? ' is-on' : '') +
        '" data-sub="' + i + '">' + esc(s) + '</button>').join('');
    $$('#subChips .chip').forEach((b) => b.addEventListener('click', () => {
      entry.subcategory = b.dataset.sub === '' ? '' : subs[Number(b.dataset.sub)];
      renderEntryChips();
    }));
  }

  const accs = data.accounts;
  if (!accs.includes(entry.account)) entry.account = accs[0] || '';
  $('#accChips').innerHTML = accs.map((a, i) =>
    '<button class="chip' + (a === entry.account ? ' is-on' : '') + '" data-acc="' + i + '">' + esc(a) + '</button>'
  ).join('');
  $$('#accChips .chip').forEach((b) => b.addEventListener('click', () => {
    entry.account = accs[Number(b.dataset.acc)];
    renderEntryChips();
  }));

  $('#saveTx').disabled = !(amountValue(entry.amountText) > 0);
}

function saveEntry() {
  const amount = amountValue(entry.amountText);
  if (!(amount > 0)) { toast('Isi jumlahnya dulu'); $('#amount').focus(); return; }
  const rec = normalize({
    id: entry.id || undefined,
    date: entry.date || todayISO(),
    type: entry.type,
    amount: amount,
    category: entry.category,
    subcategory: entry.subcategory,
    account: entry.account,
    note: $('#note').value.trim(),
    createdAt: entry.id ? (data.tx.find((t) => t.id === entry.id) || {}).createdAt : Date.now()
  });
  if (entry.id) {
    const i = data.tx.findIndex((t) => t.id === entry.id);
    if (i >= 0) data.tx[i] = rec; else data.tx.push(rec);
  } else {
    data.tx.push(rec);
  }
  data.settings.lastCat[entry.type] = entry.category;
  data.settings.lastAcc = entry.account;
  save();
  view.month = rec.date.slice(0, 7);
  closeSheet();
  render();
  toast(entry.id ? 'Perubahan disimpan' : 'Tercatat: ' + money(amount));
}

function deleteEntry() {
  const btn = $('#deleteTx');
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.innerHTML = 'Tap sekali lagi untuk hapus';
    setTimeout(() => {
      if (btn.dataset.armed === '1') { btn.dataset.armed = '0'; btn.innerHTML = 'Hapus'; }
    }, 3500);
    return;
  }
  data.tx = data.tx.filter((t) => t.id !== entry.id);
  save();
  closeSheet();
  render();
  toast('Transaksi dihapus');
}

/* ── pilih bulan ──────────────────────────────────────────────────── */
function renderMonthSheet() {
  $('#yearLabel').textContent = view.pickYear;
  $('#monthGrid').innerHTML = MONTHS.map((m, i) => {
    const ym = view.pickYear + '-' + String(i + 1).padStart(2, '0');
    return '<button data-ym="' + ym + '"' + (ym === view.month ? ' class="is-on"' : '') + '>' + m.slice(0, 3) + '</button>';
  }).join('');
  $$('#monthGrid button').forEach((b) => b.addEventListener('click', () => {
    view.month = b.dataset.ym;
    view.pickYear = Number(b.dataset.ym.slice(0, 4));
    closeSheet();
    render();
  }));
}

/* ── pengaturan ───────────────────────────────────────────────────── */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', data.settings.theme || 'auto');
  $$('#themeSeg .seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.theme === (data.settings.theme || 'auto')));
}

function renderSettings() {
  applyTheme();
  $('#accManage').innerHTML = data.accounts.map((a, i) =>
    '<button class="chip is-on" data-rm-acc="' + i + '">' + esc(a) +
    '<span class="x"><svg class="i" viewBox="0 0 24 24"><use href="#i-close"/></svg></span></button>').join('');

  const cats = data.cats[catType];
  $('#catManage').innerHTML = cats.map((c, i) =>
    '<div class="cm-row"><div class="cm-head"><span class="cm-name">' + esc(c.name) + '</span>' +
    '<button class="icon-btn tiny" data-rm-cat="' + i + '" aria-label="Hapus kategori"><svg class="i" viewBox="0 0 24 24"><use href="#i-trash"/></svg></button></div>' +
    '<div class="cm-subs">' + (c.subs.length ? c.subs.map((s, j) =>
      '<button class="chip sub-chip is-on" data-rm-sub="' + i + ':' + j + '">' + esc(s) +
      '<span class="x"><svg class="i" viewBox="0 0 24 24"><use href="#i-close"/></svg></span></button>').join('')
      : '<span class="tiny-note">tanpa sub-kategori</span>') + '</div>' +
    '<div class="cm-add"><input data-add-sub="' + i + '" placeholder="Tambah sub-kategori" autocomplete="off">' +
    '<button class="mini" data-do-sub="' + i + '">Tambah</button></div>' +
    '</div>').join('');

  const withData = data.tx.length > 0;
  const lb = data.settings.lastBackup;
  let note;
  if (!withData) note = 'Belum ada transaksi untuk dicadangkan.';
  else if (!lb) note = 'Belum pernah backup. Data ini cuma ada di HP ini — export JSON rutin biar aman.';
  else {
    const d = daysBetween(lb.slice(0, 10), todayISO());
    note = 'Backup terakhir ' + (d <= 0 ? 'hari ini' : d + ' hari lalu') + ' (' + lb.slice(0, 10) + ').';
    if (d >= 14) note += ' Sudah lama — export lagi ya.';
  }
  $('#backupNote').textContent = note;
  try {
    const bytes = (localStorage.getItem(KEY) || '').length;
    $('#storeNote').textContent = 'Data lokal: ' + data.tx.length + ' transaksi, ' +
      data.accounts.length + ' akun, ±' + (bytes / 1024).toFixed(1) + ' KB. Tersimpan di HP ini saja.';
  } catch (e) { /* ignore */ }

  $$('#catTypeSeg .seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.catType === catType));

  $$('#accManage .chip').forEach((b) => b.addEventListener('click', () => {
    const name = data.accounts[Number(b.dataset.rmAcc)];
    if (data.tx.some((t) => t.account === name)) { toast('Tidak bisa dihapus: masih dipakai transaksi'); return; }
    data.accounts.splice(Number(b.dataset.rmAcc), 1);
    save(); renderSettings();
  }));
  $$('#catManage [data-rm-cat]').forEach((b) => b.addEventListener('click', () => {
    const name = data.cats[catType][Number(b.dataset.rmCat)].name;
    if (data.tx.some((t) => t.category === name)) { toast('Tidak bisa dihapus: masih dipakai'); return; }
    data.cats[catType].splice(Number(b.dataset.rmCat), 1);
    save(); renderSettings();
  }));
  $$('#catManage [data-rm-sub]').forEach((b) => b.addEventListener('click', () => {
    const [i, j] = b.dataset.rmSub.split(':').map(Number);
    data.cats[catType][i].subs.splice(j, 1);
    save(); renderSettings();
  }));
  $$('#catManage [data-do-sub]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.doSub);
    const inp = $('#catManage [data-add-sub="' + i + '"]');
    const val = inp.value.trim();
    if (!val) return;
    if (!data.cats[catType][i].subs.includes(val)) data.cats[catType][i].subs.push(val);
    save(); renderSettings();
  }));
}

/* ── backup ───────────────────────────────────────────────────────── */
function stamp() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
    '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
}
async function deliver(filename, text, mime) {
  const file = new File([text], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
      // lanjut ke download
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
async function exportJson() {
  const payload = {
    app: 'duitku', version: 1, exportedAt: new Date().toISOString(),
    accounts: data.accounts, cats: data.cats, tx: data.tx
  };
  const ok = await deliver('duitku-backup-' + stamp() + '.json', JSON.stringify(payload, null, 1), 'application/json');
  if (ok) {
    data.settings.lastBackup = todayISO();
    save(); renderSettings();
    toast('Backup JSON dibuat');
  }
}
function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
async function exportCsv() {
  const rows = [['Tanggal', 'Aliran', 'Keterangan', 'Akun', 'Kategori', 'Sub-Kategori', 'Jumlah']];
  data.tx.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((t) => {
    rows.push([t.date, t.type === 'in' ? 'CR' : 'DB', t.note, t.account, t.category, t.subcategory,
      (t.type === 'in' ? '' : '-') + t.amount]);
  });
  const csv = '\ufeff' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  const ok = await deliver('duitku-transaksi-' + stamp() + '.csv', csv, 'text/csv');
  if (ok) toast('CSV dibuat');
}
function importJson(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let parsed;
    try { parsed = JSON.parse(fr.result); } catch (e) { toast('File bukan JSON yang valid'); return; }
    const incoming = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed.tx) ? parsed.tx
      : (parsed.data && Array.isArray(parsed.data.tx)) ? parsed.data.tx : null;
    if (!incoming) { toast('Struktur backup tidak dikenali'); return; }
    const msg = 'Ganti semua data sekarang (' + data.tx.length + ' transaksi) dengan ' + incoming.length +
      ' transaksi dari file? Tap OK untuk ganti.';
    if (!window.confirm(msg)) { toast('Import dibatalkan'); return; }
    data.tx = incoming.map(normalize);
    if (Array.isArray(parsed.accounts) && parsed.accounts.length) data.accounts = parsed.accounts.slice();
    if (parsed.cats && Array.isArray(parsed.cats.out) && Array.isArray(parsed.cats.in)) data.cats = parsed.cats;
    save(); closeSheet(); render();
    toast('Import selesai: ' + data.tx.length + ' transaksi');
  };
  fr.readAsText(file);
}

/* ── wiring ───────────────────────────────────────────────────────── */
function wire() {
  $('#prevMonth').addEventListener('click', () => { view.month = shiftMonth(view.month, -1); render(); });
  $('#nextMonth').addEventListener('click', () => { view.month = shiftMonth(view.month, 1); render(); });
  $('#monthBtn').addEventListener('click', () => {
    view.pickYear = Number(view.month.slice(0, 4));
    renderMonthSheet();
    openSheet('monthSheet');
  });
  $('#prevYear').addEventListener('click', () => { view.pickYear--; renderMonthSheet(); });
  $('#nextYear').addEventListener('click', () => { view.pickYear++; renderMonthSheet(); });

  $('#addBtn').addEventListener('click', () => openEntry(null));
  $('#scrim').addEventListener('click', closeSheet);
  $$('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openStack.length) closeSheet(); });

  $('#typeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    entry.type = b.dataset.type;
    entry.subcategory = '';
    renderEntryChips();
  });
  $('#amount').addEventListener('input', (e) => {
    const el = e.target;
    const atEnd = el.selectionStart === el.value.length;
    if (atEnd) {
      const next = fmtTyping(el.value);
      if (next !== el.value) el.value = next;
      el.setSelectionRange(el.value.length, el.value.length);
    }
    entry.amountText = el.value;
    $('#saveTx').disabled = !(amountValue(el.value) > 0);
  });
  $('#date').addEventListener('change', (e) => { entry.date = e.target.value || todayISO(); });
  $$('[data-date-off]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date();
    d.setDate(d.getDate() - Number(b.dataset.dateOff));
    entry.date = toISO(d);
    $('#date').value = entry.date;
  }));
  $('#saveTx').addEventListener('click', saveEntry);
  $('#deleteTx').addEventListener('click', deleteEntry);

  $('#settingsBtn').addEventListener('click', () => { renderSettings(); openSheet('settingsSheet'); });
  $('#themeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    data.settings.theme = b.dataset.theme;
    save(); applyTheme();
  });
  $('#catTypeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    catType = b.dataset.catType;
    renderSettings();
  });
  $('#addAcc').addEventListener('click', () => {
    const v = $('#newAcc').value.trim();
    if (!v) return;
    if (!data.accounts.includes(v)) data.accounts.push(v);
    $('#newAcc').value = '';
    save(); renderSettings();
  });
  $('#addCat').addEventListener('click', () => {
    const v = $('#newCat').value.trim();
    if (!v) return;
    if (!data.cats[catType].some((c) => c.name === v)) data.cats[catType].push({ name: v, subs: [] });
    $('#newCat').value = '';
    save(); renderSettings();
  });
  $('#exportJson').addEventListener('click', exportJson);
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJson(f);
    e.target.value = '';
  });
  $('#wipe').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (b.dataset.armed !== '1') {
      b.dataset.armed = '1';
      b.textContent = 'Tap sekali lagi untuk hapus semua';
      setTimeout(() => { if (b.dataset.armed === '1') { b.dataset.armed = '0'; b.textContent = 'Hapus semua transaksi'; } }, 4000);
      return;
    }
    data.tx = [];
    save(); closeSheet(); render();
    toast('Semua transaksi dihapus');
  });

  $('#hideHint').addEventListener('click', () => {
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* ignore */ }
    $('#installHint').hidden = true;
  });
}

/* ── boot ─────────────────────────────────────────────────────────── */
function boot() {
  applyTheme();
  wire();
  render();
  data.tx.length || null;

  const standalone = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  let hinted = false;
  try { hinted = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { hinted = false; }
  if (!standalone && !hinted) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    $('#installHint').hidden = false;
    $('#installHint').firstElementChild.innerHTML = ios
      ? 'Pasang di iPhone: tap <b>Bagikan</b> lalu <b>Add to Home Screen</b>.'
      : 'Pasang sebagai app: menu browser → <b>Install / Add to Home Screen</b>.';
  }

  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.DUITKU = { get data() { return data; }, set tx(v) { data.tx = v; save(); render(); } };
}

document.addEventListener('DOMContentLoaded', boot);
})();
