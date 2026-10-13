/* ── Duitku · catatan keuangan offline (v2) ──────────────────────────
   Fitur: transaksi masuk/keluar, dompet + saldo + transfer antar dompet,
   laporan bulanan (grafik 6 bulan, pengeluaran harian, per kategori).
   Semua data di localStorage HP. Satu-satunya jalan keluar = Export JSON/CSV. */
'use strict';
(() => {

const KEY = 'duitku.v1';            // key lama, isinya dimigrasi ke bentuk v2
const HINT_KEY = 'duitku.hintDismissed';

const DEFAULT_WALLETS = ['Superbank', 'Mandiri', 'Mayapada', 'ShopeePay', 'Cash', 'myBCA', 'Flazz', 'Atome BCA'];

const DEFAULT_CATS = {
  out: [
    ['Pinjaman', ['Kartu kredit']],
    ['Kebutuhan rumah', ['Tagihan aplikasi', 'Laundry']],
    ['Makanan & minuman', ['Pacaran']],
    ['Investasi', []],
    ['Kesehatan & olahraga', ['Olahraga', 'Apotek']],
    ['Transportasi', ['Bensin', 'Biaya parkir', 'Perawatan kendaraan']],
    ['Shopping', ['Rokok Elektronik & Vape']],
    ['Keluarga', ['Orang tua', 'Pasangan']],
    ['Pengeluaran Keuangan Lainnya', ['Biaya admin']],
    ['Donasi & hadiah', ['Donasi', 'Hadiah']]
  ],
  in: [
    ['Pemasukan', []],
    ['Transfer Masuk', []],
    ['Pinjaman', []],
    ['Donasi & hadiah', ['Hadiah']]
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
function shortMoney(n) {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const s = (v) => String(v).replace('.', ',');
  if (a >= 1e9) return sign + 'Rp ' + s((a / 1e9).toFixed(1)) + ' M';
  if (a >= 1e6) return sign + 'Rp ' + s((a / 1e6).toFixed(1)) + ' jt';
  if (a >= 1e3) return sign + 'Rp ' + Math.round(a / 1e3) + ' rb';
  return sign + 'Rp ' + nf.format(a);
}
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
function monthShort(ym) { return MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3); }
function dayLabel(iso) {
  const d = parseISO(iso);
  return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3);
}
function shiftMonth(ym, delta) {
  const p = ym.split('-').map(Number);
  const d = new Date(p[0], p[1] - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
function daysInMonth(ym) {
  const p = ym.split('-').map(Number);
  return new Date(p[0], p[1], 0).getDate();
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
function sumOf(list, type) {
  let s = 0;
  list.forEach((t) => { if (t.type === type) s += t.amount; });
  return s;
}

/* ── data ─────────────────────────────────────────────────────────── */
function defaults() {
  return {
    version: 2,
    settings: {
      theme: 'auto', lastBackup: null,
      lastCat: { out: '', in: '' }, lastWallet: DEFAULT_WALLETS[0], lastTo: DEFAULT_WALLETS[1]
    },
    wallets: DEFAULT_WALLETS.map((name) => ({ name, opening: 0 })),
    cats: {
      out: DEFAULT_CATS.out.map(([name, subs]) => ({ name, subs: subs.slice() })),
      in: DEFAULT_CATS.in.map(([name, subs]) => ({ name, subs: subs.slice() }))
    },
    tx: []
  };
}
function normalize(t) {
  const type = t.type === 'in' ? 'in' : (t.type === 'transfer' ? 'transfer' : 'out');
  return {
    id: t.id || uid(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : todayISO(),
    type,
    amount: Math.abs(Number(t.amount) || 0),
    category: type === 'transfer' ? 'Transfer' : (t.category || 'Lainnya'),
    subcategory: type === 'transfer' ? '' : (t.subcategory || ''),
    account: t.account || '',
    toAccount: type === 'transfer' ? (t.toAccount || '') : '',
    note: t.note || '',
    createdAt: Number(t.createdAt) || Date.now()
  };
}
function normCats(raw, base) {
  if (!raw || !Array.isArray(raw.out) || !Array.isArray(raw.in)) return base;
  const fix = (arr) => arr.map((c) => (typeof c === 'string'
    ? { name: c, subs: [] }
    : { name: String(c && c.name || ''), subs: Array.isArray(c && c.subs) ? c.subs.slice() : [] }
  )).filter((c) => c.name);
  const out = fix(raw.out), inn = fix(raw.in);
  return (out.length && inn.length) ? { out, in: inn } : base;
}
function normWallets(raw, base) {
  if (!Array.isArray(raw) || !raw.length) return base;
  const w = raw.map((x) => (typeof x === 'string'
    ? { name: x, opening: 0 }
    : { name: String(x && x.name || ''), opening: Number(x && x.opening) || 0 }
  )).filter((x) => x.name);
  return w.length ? w : base;
}
function migrate(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;
  const s = Object.assign({}, base.settings, raw.settings || {});
  s.lastCat = Object.assign({ out: '', in: '' }, s.lastCat || {});
  const wallets = normWallets(raw.wallets && raw.wallets.length ? raw.wallets : raw.accounts, base.wallets);
  const names = wallets.map((w) => w.name);
  if (!names.includes(s.lastWallet)) s.lastWallet = names[0];
  if (!names.includes(s.lastTo) || s.lastTo === s.lastWallet) {
    s.lastTo = names.find((n) => n !== s.lastWallet) || names[0];
  }
  return {
    version: 2,
    settings: s,
    wallets,
    cats: normCats(raw.cats, base.cats),
    tx: Array.isArray(raw.tx) ? raw.tx.map(normalize) : []
  };
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
  if (!raw) return defaults();
  try { return migrate(JSON.parse(raw)); } catch (e) { return defaults(); }
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
let ui = { tab: 'tx', month: thisMonth(), pickYear: new Date().getFullYear() };
let entry = null;      // { id, type, amountText, date, category, subcategory, account, toAccount }
let walletOpen = '';   // nama dompet yang dibuka di sheet
let catType = 'out';
let openStack = [];

/* ── dompet ───────────────────────────────────────────────────────── */
const walletNames = () => data.wallets.map((w) => w.name);
function walletOf(name) { return data.wallets.find((w) => w.name === name); }
function walletBalance(name) {
  const w = walletOf(name);
  let b = w ? w.opening : 0;
  data.tx.forEach((t) => {
    if (t.account === name || t.toAccount === name) {
      if (t.type === 'transfer') {
        if (t.account === name) b -= t.amount;
        if (t.toAccount === name) b += t.amount;
      } else if (t.account === name) {
        b += t.type === 'in' ? t.amount : -t.amount;
      }
    }
  });
  return b;
}
function walletStats(name, list) {
  const src = list || data.tx;
  const st = { inn: 0, out: 0, trIn: 0, trOut: 0, n: 0 };
  src.forEach((t) => {
    if (t.type === 'transfer') {
      if (t.account === name) { st.trOut += t.amount; st.n++; }
      if (t.toAccount === name) { st.trIn += t.amount; st.n++; }
    } else if (t.account === name) {
      if (t.type === 'in') st.inn += t.amount; else st.out += t.amount;
      st.n++;
    }
  });
  return st;
}
const totalBalance = () => data.wallets.reduce((s, w) => s + walletBalance(w.name), 0);

/* ── daftar transaksi ─────────────────────────────────────────────── */
function monthTx(ym) {
  return data.tx
    .filter((t) => t.date.slice(0, 7) === ym)
    .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : (a.date < b.date ? 1 : -1)));
}

function renderSummary() {
  const list = monthTx(ui.month);
  const inn = sumOf(list, 'in');
  const outp = sumOf(list, 'out');
  const net = inn - outp;
  const trf = list.filter((t) => t.type === 'transfer').length;
  const isNow = ui.month === thisMonth();

  $('#summary').innerHTML = '<div class="sum-hero">' +
    '<span class="sum-label">' + (isNow ? 'Sisa bulan ini' : 'Sisa ' + monthName(ui.month)) + '</span>' +
    '<strong class="sum-value num ' + (net < 0 ? 'neg' : 'pos') + '">' + money(net) + '</strong>' +
    '<div class="sum-split">' +
      '<div><span class="k"><i class="dot pos"></i>Masuk</span><span class="v num">' + money(inn) + '</span></div>' +
      '<div><span class="k"><i class="dot neg"></i>Keluar</span><span class="v num">' + money(outp) + '</span></div>' +
    '</div>' +
    '<p class="sum-count">' + list.length + ' transaksi' +
      (trf ? ' · ' + trf + ' transfer' : '') +
      (list.length ? '' : ' · belum ada catatan') + '</p>' +
    '</div>';
}

function renderList() {
  const list = monthTx(ui.month);
  const el = $('#list');
  if (!list.length) {
    el.innerHTML = '<div class="empty"><b>Belum ada catatan bulan ini</b>' +
      'Tap tombol + di bawah untuk mulai. Data tersimpan di HP ini saja.</div>';
    return;
  }
  const groups = [];
  list.forEach((t) => {
    const last = groups[groups.length - 1];
    if (last && last.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  });

  el.innerHTML = groups.map((g) => {
    const inn = sumOf(g.items, 'in');
    const out = sumOf(g.items, 'out');
    const parts = [];
    if (inn) parts.push('masuk ' + money(inn));
    if (out) parts.push('keluar ' + money(out));
    if (!parts.length) {
      const trf = g.items.filter((x) => x.type === 'transfer').length;
      if (trf) parts.push(trf + ' transfer');
    }
    return '<div class="day">' +
      '<div class="day-head"><span class="day-name">' + dayLabel(g.date) + '</span>' +
      '<span class="day-net">' + parts.join(' · ') + '</span></div>' +
      '<div class="day-group">' + g.items.map((t) => {
        const isTr = t.type === 'transfer';
        const cat = isTr ? 'Transfer' : t.category;
        const sub = (!isTr && t.subcategory) ? t.subcategory : '';
        const meta = isTr
          ? [t.account + ' → ' + (t.toAccount || '?'), t.note].filter(Boolean).join(' · ')
          : [t.account, t.note].filter(Boolean).join(' · ');
        const amt = isTr ? money(t.amount) : (t.type === 'in' ? '+' : '−') + money(t.amount).replace('−', '');
        return '<button class="row" data-id="' + t.id + '">' +
          '<i class="row-side ' + t.type + '"></i>' +
          '<span class="row-main">' +
            '<span class="row-cat">' + esc(cat) +
              (sub ? '<span class="row-meta" style="display:inline;font-weight:500"> · ' + esc(sub) + '</span>' : '') +
            '</span>' +
            '<span class="row-meta">' + esc(meta || 'tanpa dompet') + '</span>' +
          '</span>' +
          '<span class="row-amt num ' + t.type + '">' + amt + '</span>' +
        '</button>';
      }).join('') + '</div></div>';
  }).join('');

  $$('.row', el).forEach((b) => b.addEventListener('click', () => {
    const t = data.tx.find((x) => x.id === b.dataset.id);
    if (t) openEntry(t);
  }));
}

/* ── tab Dompet ───────────────────────────────────────────────────── */
function renderWalletTab() {
  const total = totalBalance();
  const month = monthTx(ui.month);

  $('#walletSummary').innerHTML = '<div class="sum-hero">' +
    '<span class="sum-label">Total saldo semua dompet</span>' +
    '<strong class="sum-value num ' + (total < 0 ? 'neg' : 'ink') + '">' + money(total) + '</strong>' +
    '<p class="sum-count">' + data.wallets.length + ' dompet · saldo awal + semua mutasi di catatan</p>' +
    '</div>';

  $('#walletList').innerHTML = data.wallets.map((w) => {
    const bal = walletBalance(w.name);
    const st = walletStats(w.name, month);
    const bits = [];
    if (st.inn) bits.push('masuk ' + shortMoney(st.inn));
    if (st.out) bits.push('keluar ' + shortMoney(st.out));
    if (st.trIn) bits.push('trf masuk ' + shortMoney(st.trIn));
    if (st.trOut) bits.push('trf keluar ' + shortMoney(st.trOut));
    const netMonth = st.inn - st.out + st.trIn - st.trOut;
    const meta = bits.length
      ? bits.join(' · ') + (st.n ? ' · ' + monthShort(ui.month) : '')
      : 'belum ada mutasi ' + monthShort(ui.month);
    return '<button class="wallet-card" data-wallet="' + esc(w.name) + '">' +
      '<span class="wc-main"><span class="wc-name">' + esc(w.name) + '</span>' +
      '<span class="wc-meta">' + esc(meta) + (bits.length ? ' · selisih ' + money(netMonth) : '') + '</span></span>' +
      '<span class="wc-bal num' + (bal < 0 ? ' neg' : '') + '">' + money(bal) + '</span>' +
    '</button>';
  }).join('');

  $$('#walletList .wallet-card').forEach((b) => b.addEventListener('click', () => openWalletSheet(b.dataset.wallet)));
}

function openWalletSheet(name) {
  const w = walletOf(name);
  if (!w) return;
  walletOpen = name;
  const bal = walletBalance(name);
  const st = walletStats(name);
  const monthSt = walletStats(name, monthTx(ui.month));

  $('#walletTitle').textContent = name;
  const balEl = $('#walletBalance');
  balEl.textContent = money(bal);
  balEl.className = 'sum-value num ' + (bal < 0 ? 'neg' : 'ink');
  $('#walletMeta').textContent = st.n + ' transaksi · selisih ' + money(monthSt.inn - monthSt.out + monthSt.trIn - monthSt.trOut) + ' di ' + monthName(ui.month);
  $('#walletOpening').value = w.opening ? fmtTyping(String(w.opening)) : '';

  const kv = [
    ['Masuk (semua waktu)', money(st.inn), 'pos'],
    ['Keluar (semua waktu)', money(-st.out), 'neg'],
    ['Transfer masuk', money(st.trIn), 'pos'],
    ['Transfer keluar', money(-st.trOut), 'neg']
  ];
  $('#walletDetail').innerHTML = kv.map(([k, v, cls]) =>
    '<div class="kv"><span class="k">' + k + '</span><span class="v num ' + cls + '">' + v + '</span></div>').join('');
  $('#deleteWallet').textContent = 'Hapus dompet';
  delete $('#deleteWallet').dataset.armed;

  openSheet('walletSheet');
}

function saveOpening() {
  const w = walletOf(walletOpen);
  if (!w) return;
  w.opening = amountValue($('#walletOpening').value);
  save();
  closeSheet();
  render();
  toast('Saldo awal ' + w.name + ': ' + money(w.opening));
}

function deleteWallet() {
  const w = walletOf(walletOpen);
  if (!w) return;
  const used = data.tx.some((t) => t.account === w.name || t.toAccount === w.name);
  if (used) { toast('Tidak bisa dihapus: masih dipakai transaksi'); return; }
  if (data.wallets.length <= 1) { toast('Minimal harus ada satu dompet'); return; }
  const btn = $('#deleteWallet');
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.textContent = 'Tap sekali lagi untuk hapus';
    setTimeout(() => {
      if (btn.dataset.armed === '1') { btn.dataset.armed = '0'; btn.textContent = 'Hapus dompet'; }
    }, 3500);
    return;
  }
  data.wallets = data.wallets.filter((x) => x.name !== w.name);
  save();
  closeSheet();
  render();
  toast('Dompet ' + w.name + ' dihapus');
}

/* ── tab Laporan ──────────────────────────────────────────────────── */
function catRows(list, total, positive) {
  const agg = new Map();
  list.forEach((t) => {
    const c = t.category || 'Lainnya';
    if (!agg.has(c)) agg.set(c, { sum: 0, subs: new Map() });
    const a = agg.get(c);
    a.sum += t.amount;
    const s = t.subcategory || '';
    a.subs.set(s, (a.subs.get(s) || 0) + t.amount);
  });
  const rows = Array.from(agg.entries()).sort((a, b) => b[1].sum - a[1].sum);
  if (!rows.length) return '<p class="tiny-note">Belum ada data.</p>';
  const max = rows[0][1].sum || 1;
  return rows.map(([name, a]) => {
    const pct = total ? Math.round(a.sum / total * 100) : 0;
    const subs = Array.from(a.subs.entries()).filter(([s]) => s).sort((x, y) => y[1] - x[1])
      .map(([s, v]) => '<div class="sub-row"><span>' + esc(s) + '</span><span class="v">' + money(v) + '</span></div>').join('');
    return '<div class="cat-row">' +
      '<div class="cat-head"><span class="n">' + esc(name) + '</span>' +
      '<span class="v num">' + money(a.sum) + '</span><span class="p">' + pct + '%</span></div>' +
      '<div class="cat-bar' + (positive ? ' pos' : '') + '"><i style="width:' + Math.max(2, Math.round(a.sum / max * 100)) + '%"></i></div>' +
      (subs ? '<div class="sub-rows">' + subs + '</div>' : '') +
      '</div>';
  }).join('');
}

function renderReport() {
  const list = monthTx(ui.month);
  const inn = sumOf(list, 'in');
  const outp = sumOf(list, 'out');
  const net = inn - outp;
  const trf = list.filter((t) => t.type === 'transfer');
  const dim = daysInMonth(ui.month);
  const elapsed = ui.month === thisMonth() ? Number(todayISO().slice(8, 10)) : dim;
  const perDay = elapsed ? outp / elapsed : 0;

  const flows = data.wallets.map((w) => {
    const st = walletStats(w.name, list);
    const mIn = st.inn + st.trIn;
    const mOut = st.out + st.trOut;
    return { name: w.name, mIn, mOut, net: mIn - mOut, n: st.n };
  }).filter((r) => r.n > 0).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  $('#report').innerHTML =
    '<div class="card">' +
      '<div class="card-h"><h3>6 bulan terakhir</h3><span class="sub">' + monthName(shiftMonth(ui.month, -5)) + ' – ' + monthName(ui.month) + '</span></div>' +
      '<div class="chart-wrap"><svg class="chart" data-chart="months"></svg></div>' +
      '<div class="legend"><span><i class="dot pos"></i>Masuk</span><span><i class="dot neg"></i>Keluar</span></div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-h"><h3>Rekap ' + monthName(ui.month) + '</h3><span class="sub">' + list.length + ' transaksi</span></div>' +
      '<div class="kpi">' +
        '<div><span class="k">Masuk</span><span class="v num pos">' + money(inn) + '</span></div>' +
        '<div><span class="k">Keluar</span><span class="v num neg">' + money(outp) + '</span></div>' +
        '<div><span class="k">Selisih</span><span class="v num ' + (net < 0 ? 'neg' : 'pos') + '">' + money(net) + '</span></div>' +
      '</div>' +
      '<p class="kpi-foot">Rata-rata keluar ' + money(perDay) + '/hari · ' + (elapsed < dim ? elapsed + ' dari ' + dim + ' hari' : dim + ' hari') +
        (trf.length ? ' · ' + trf.length + ' transfer antar dompet (tidak dihitung masuk/keluar)' : '') + '</p>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-h"><h3>Pengeluaran harian</h3><span class="sub">' + monthShort(ui.month) + ' ' + ui.month.slice(0, 4) + '</span></div>' +
      '<div class="chart-wrap"><svg class="chart" data-chart="days"></svg></div>' +
    '</div>' +

    '<div class="card">' +
      '<div class="card-h"><h3>Pengeluaran per kategori</h3><span class="sub">' + money(outp) + '</span></div>' +
      catRows(list.filter((t) => t.type === 'out'), outp, false) +
    '</div>' +

    '<div class="card">' +
      '<div class="card-h"><h3>Pemasukan per kategori</h3><span class="sub">' + money(inn) + '</span></div>' +
      catRows(list.filter((t) => t.type === 'in'), inn, true) +
    '</div>' +

    '<div class="card">' +
      '<div class="card-h"><h3>Mutasi dompet bulan ini</h3><span class="sub">termasuk transfer</span></div>' +
      (flows.length
        ? '<div class="flow-head"><span>Dompet</span><span>Masuk</span><span>Keluar</span><span>Selisih</span></div>' +
          flows.map((f) => '<div class="flow-row"><span class="n">' + esc(f.name) + '</span>' +
            '<span>' + shortMoney(f.mIn) + '</span><span>' + shortMoney(f.mOut) + '</span>' +
            '<span>' + shortMoney(f.net) + '</span></div>').join('')
        : '<p class="tiny-note">Belum ada mutasi bulan ini.</p>') +
    '</div>';

  drawCharts();
}

function chartWidth(el) {
  const w = el && el.getBoundingClientRect ? el.getBoundingClientRect().width : 0;
  return Math.max(240, Math.round(w || 320));
}
function chartMonths(w, h) {
  const rows = [];
  for (let i = 5; i >= 0; i--) {
    const ym = shiftMonth(ui.month, -i);
    const list = monthTx(ym);
    rows.push({ ym, inn: sumOf(list, 'in'), out: sumOf(list, 'out') });
  }
  const max = Math.max(1, ...rows.map((r) => Math.max(r.inn, r.out)));
  const padT = 18, padB = 20, padX = 4;
  const plotH = h - padT - padB;
  const slot = (w - padX * 2) / rows.length;
  const bw = Math.max(7, Math.min(20, slot * 0.3));
  const gap = 3;
  let s = '<line class="grid" x1="' + padX + '" y1="' + padT + '" x2="' + (w - padX) + '" y2="' + padT + '"/>' +
    '<text class="axis" x="' + padX + '" y="' + (padT - 6) + '">' + shortMoney(max) + '</text>' +
    '<line class="zero" x1="' + padX + '" y1="' + (padT + plotH) + '" x2="' + (w - padX) + '" y2="' + (padT + plotH) + '"/>';
  rows.forEach((r, i) => {
    const cx = padX + slot * i + slot / 2;
    const hIn = (r.inn / max) * plotH;
    const hOut = (r.out / max) * plotH;
    const x1 = cx - bw - gap / 2;
    const x2 = cx + gap / 2;
    const y1 = padT + plotH - hIn;
    const y2 = padT + plotH - hOut;
    if (hIn > 0) s += '<rect class="bar-in" x="' + x1.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw + '" height="' + Math.max(2, hIn).toFixed(1) + '" rx="3"/>';
    if (hOut > 0) s += '<rect class="bar-out" x="' + x2.toFixed(1) + '" y="' + y2.toFixed(1) + '" width="' + bw + '" height="' + Math.max(2, hOut).toFixed(1) + '" rx="3"/>';
    s += '<text class="axis" x="' + cx.toFixed(1) + '" y="' + (h - 5) + '" text-anchor="middle">' + monthShort(r.ym) + '</text>';
  });
  return s;
}
function chartDays(w, h) {
  const dim = daysInMonth(ui.month);
  const per = new Array(dim).fill(0);
  monthTx(ui.month).forEach((t) => {
    if (t.type !== 'out') return;
    const d = Number(t.date.slice(8, 10));
    if (d >= 1 && d <= dim) per[d - 1] += t.amount;
  });
  const max = Math.max(1, ...per);
  const padT = 18, padB = 20, padX = 2;
  const plotH = h - padT - padB;
  const slot = (w - padX * 2) / dim;
  const bw = Math.max(2, slot * 0.6);
  let s = '<line class="grid" x1="' + padX + '" y1="' + padT + '" x2="' + (w - padX) + '" y2="' + padT + '"/>' +
    '<text class="axis" x="' + padX + '" y="' + (padT - 6) + '">' + shortMoney(max) + '</text>' +
    '<line class="zero" x1="' + padX + '" y1="' + (padT + plotH) + '" x2="' + (w - padX) + '" y2="' + (padT + plotH) + '"/>';
  for (let d = 1; d <= dim; d++) {
    const v = per[d - 1];
    const cx = padX + slot * (d - 1) + slot / 2;
    if (v > 0) {
      const bh = Math.max(2, (v / max) * plotH);
      s += '<rect class="bar-out" x="' + (cx - bw / 2).toFixed(1) + '" y="' + (padT + plotH - bh).toFixed(1) +
        '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2"/>';
    }
    if (d === 1 || d % 5 === 0) {
      s += '<text class="axis" x="' + cx.toFixed(1) + '" y="' + (h - 5) + '" text-anchor="middle">' + d + '</text>';
    }
  }
  return s;
}
function drawCharts() {
  [['months', 168, chartMonths], ['days', 138, chartDays]].forEach(([key, h, fn]) => {
    const el = $('#report [data-chart="' + key + '"]');
    if (!el) return;
    const w = chartWidth(el.parentElement || el);
    el.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    el.setAttribute('width', w);
    el.setAttribute('height', h);
    el.innerHTML = fn(w, h);
  });
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
  setTimeout(() => { $$('.sheet').forEach((s) => { s.hidden = true; }); scrim.hidden = true; }, 240);
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
const catsOf = (type) => data.cats[type] || [];

function openEntry(tx, preset) {
  const names = walletNames();
  const lastW = names.includes(data.settings.lastWallet) ? data.settings.lastWallet : names[0];
  const lastTo = names.includes(data.settings.lastTo) && data.settings.lastTo !== lastW
    ? data.settings.lastTo : (names.find((n) => n !== lastW) || names[0]);
  if (tx) {
    entry = {
      id: tx.id, type: tx.type, amountText: fmtTyping(String(tx.amount).replace('.', ',')),
      date: tx.date, category: tx.category || '', subcategory: tx.subcategory || '',
      account: tx.account || lastW, toAccount: tx.toAccount || lastTo, note: tx.note || ''
    };
    $('#note').value = entry.note;
    $('#entryTitle').textContent = tx.type === 'transfer' ? 'Ubah transfer' : 'Ubah transaksi';
  } else {
    const p = preset || {};
    entry = {
      id: null, type: p.type || 'out', amountText: '', date: todayISO(),
      category: data.settings.lastCat.out || (catsOf('out')[0] || {}).name || '',
      subcategory: '', account: p.account || lastW, toAccount: p.toAccount || lastTo, note: ''
    };
    $('#note').value = '';
    $('#entryTitle').textContent = entry.type === 'transfer' ? 'Catat transfer' : 'Catat transaksi';
  }
  $('#deleteTx').hidden = !tx;
  $('#deleteTx').textContent = 'Hapus';
  delete $('#deleteTx').dataset.armed;
  $('#amount').value = entry.amountText;
  $('#date').value = entry.date;
  renderEntryChips();
  openSheet('entrySheet');
  if (!tx) setTimeout(() => $('#amount').focus(), 280);
}

function renderEntryChips() {
  const isTr = entry.type === 'transfer';
  $$('#typeSeg .seg-btn').forEach((b) => {
    const on = b.dataset.type === entry.type;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#catField').hidden = isTr;
  $('#accField').hidden = isTr;
  $('#fromField').hidden = !isTr;
  $('#toField').hidden = !isTr;

  const names = walletNames();
  if (!names.includes(entry.account)) entry.account = names[0] || '';
  if (!names.includes(entry.toAccount) || entry.toAccount === entry.account) {
    entry.toAccount = names.find((n) => n !== entry.account) || names[0];
  }

  if (!isTr) {
    const cats = catsOf(entry.type);
    if (!cats.some((c) => c.name === entry.category)) entry.category = cats.length ? cats[0].name : '';
    $('#catChips').innerHTML = cats.map((c, i) =>
      '<button class="chip' + (c.name === entry.category ? ' is-on' : '') + '" data-cat="' + i + '">' + esc(c.name) + '</button>'
    ).join('') || '<span class="tiny-note">Belum ada kategori — tambah di Pengaturan</span>';
    $$('#catChips .chip').forEach((b) => b.addEventListener('click', () => {
      entry.category = cats[Number(b.dataset.cat)].name;
      const subs2 = (cats.find((c) => c.name === entry.category) || {}).subs || [];
      if (!subs2.includes(entry.subcategory)) entry.subcategory = '';
      renderEntryChips();
    }));

    const cat = cats.find((c) => c.name === entry.category);
    const subs = cat ? cat.subs : [];
    $('#subField').hidden = !subs.length;
    if (subs.length) {
      $('#subChips').innerHTML = '<button class="chip sub-chip' + (entry.subcategory === '' ? ' is-on' : '') +
          '" data-sub="">tanpa sub</button>' +
        subs.map((s, i) => '<button class="chip sub-chip' + (s === entry.subcategory ? ' is-on' : '') +
          '" data-sub="' + i + '">' + esc(s) + '</button>').join('');
      $$('#subChips .chip').forEach((b) => b.addEventListener('click', () => {
        entry.subcategory = b.dataset.sub === '' ? '' : subs[Number(b.dataset.sub)];
        renderEntryChips();
      }));
    }

    $('#accChips').innerHTML = names.map((a, i) =>
      '<button class="chip' + (a === entry.account ? ' is-on' : '') + '" data-acc="' + i + '">' + esc(a) + '</button>'
    ).join('');
    $$('#accChips .chip').forEach((b) => b.addEventListener('click', () => {
      entry.account = names[Number(b.dataset.acc)];
      renderEntryChips();
    }));
  } else {
    $('#fromChips').innerHTML = names.map((a, i) =>
      '<button class="chip' + (a === entry.account ? ' is-on' : '') + '" data-from="' + i + '">' + esc(a) + '</button>'
    ).join('');
    $$('#fromChips .chip').forEach((b) => b.addEventListener('click', () => {
      entry.account = names[Number(b.dataset.from)];
      if (entry.toAccount === entry.account) entry.toAccount = names.find((n) => n !== entry.account) || names[0];
      renderEntryChips();
    }));
    $('#toChips').innerHTML = names.map((a, i) =>
      '<button class="chip' + (a === entry.toAccount ? ' is-on' : '') + '" data-to="' + i + '"' +
        (a === entry.account ? ' disabled style="opacity:.4"' : '') + '>' + esc(a) + '</button>'
    ).join('');
    $$('#toChips .chip').forEach((b) => b.addEventListener('click', () => {
      const pick = names[Number(b.dataset.to)];
      if (pick === entry.account) return;
      entry.toAccount = pick;
      renderEntryChips();
    }));
  }

  $('#saveTx').disabled = !(amountValue(entry.amountText) > 0);
}

function saveEntry() {
  const amount = amountValue(entry.amountText);
  if (!(amount > 0)) { toast('Isi jumlahnya dulu'); $('#amount').focus(); return; }
  if (entry.type === 'transfer' && (!entry.toAccount || entry.toAccount === entry.account)) {
    toast('Dompet asal dan tujuan harus beda');
    return;
  }
  const rec = normalize({
    id: entry.id || undefined,
    date: entry.date || todayISO(),
    type: entry.type,
    amount,
    category: entry.category,
    subcategory: entry.subcategory,
    account: entry.account,
    toAccount: entry.toAccount,
    note: $('#note').value.trim(),
    createdAt: entry.id ? (data.tx.find((t) => t.id === entry.id) || {}).createdAt : Date.now()
  });
  if (entry.id) {
    const i = data.tx.findIndex((t) => t.id === entry.id);
    if (i >= 0) data.tx[i] = rec; else data.tx.push(rec);
  } else {
    data.tx.push(rec);
  }
  if (entry.type !== 'transfer') data.settings.lastCat[entry.type] = entry.category;
  data.settings.lastWallet = entry.account;
  data.settings.lastTo = entry.toAccount;
  save();
  ui.month = rec.date.slice(0, 7);
  closeSheet();
  render();
  toast(entry.id ? 'Perubahan disimpan'
    : (rec.type === 'transfer' ? 'Transfer: ' + money(amount) : 'Tercatat: ' + money(amount)));
}

function deleteEntry() {
  const btn = $('#deleteTx');
  if (btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn.textContent = 'Tap sekali lagi untuk hapus';
    setTimeout(() => {
      if (btn.dataset.armed === '1') { btn.dataset.armed = '0'; btn.textContent = 'Hapus'; }
    }, 3500);
    return;
  }
  data.tx = data.tx.filter((t) => t.id !== entry.id);
  save();
  closeSheet();
  render();
  toast('Catatan dihapus');
}

/* ── pilih bulan ──────────────────────────────────────────────────── */
function renderMonthSheet() {
  $('#yearLabel').textContent = ui.pickYear;
  $('#monthGrid').innerHTML = MONTHS.map((m, i) => {
    const ym = ui.pickYear + '-' + String(i + 1).padStart(2, '0');
    return '<button data-ym="' + ym + '"' + (ym === ui.month ? ' class="is-on"' : '') + '>' + m.slice(0, 3) + '</button>';
  }).join('');
  $$('#monthGrid button').forEach((b) => b.addEventListener('click', () => {
    ui.month = b.dataset.ym;
    ui.pickYear = Number(b.dataset.ym.slice(0, 4));
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

  const lb = data.settings.lastBackup;
  let note;
  if (!data.tx.length) note = 'Belum ada transaksi untuk dicadangkan.';
  else if (!lb) note = 'Belum pernah backup. Data ini cuma ada di HP ini — export JSON rutin biar aman.';
  else {
    const d = daysBetween(lb.slice(0, 10), todayISO());
    note = 'Backup terakhir ' + (d <= 0 ? 'hari ini' : d + ' hari lalu') + ' (' + lb.slice(0, 10) + ').';
    if (d >= 14) note += ' Sudah lama — export lagi ya.';
  }
  $('#backupNote').textContent = note;
  try {
    const bytes = (localStorage.getItem(KEY) || '').length;
    const trf = data.tx.filter((t) => t.type === 'transfer').length;
    $('#storeNote').textContent = 'Data lokal: ' + data.tx.length + ' catatan (' + trf + ' transfer), ' +
      data.wallets.length + ' dompet, ' + data.cats.out.length + '+' + data.cats.in.length + ' kategori, ±' + (bytes / 1024).toFixed(1) + ' KB. Tersimpan di HP ini saja.';
  } catch (e) { /* ignore */ }

  $$('#catTypeSeg .seg-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.catType === catType));

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
    app: 'duitku', version: 2, exportedAt: new Date().toISOString(),
    wallets: data.wallets, cats: data.cats, tx: data.tx
  };
  const ok = await deliver('duitku-backup-' + stamp() + '.json', JSON.stringify(payload, null, 1), 'application/json');
  if (ok) {
    data.settings.lastBackup = todayISO();
    save(); renderSettings();
    toast('Backup JSON dibuat');
  }
}
const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
async function exportCsv() {
  const rows = [['Tanggal', 'Aliran', 'Keterangan', 'Akun', 'Ke-Dompet', 'Kategori', 'Sub-Kategori', 'Jumlah']];
  data.tx.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((t) => {
    rows.push([
      t.date,
      t.type === 'in' ? 'CR' : (t.type === 'transfer' ? 'TRF' : 'DB'),
      t.note, t.account, t.toAccount, t.category, t.subcategory,
      t.type === 'out' ? '-' + t.amount : t.amount
    ]);
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
    const msg = 'Ganti semua data sekarang (' + data.tx.length + ' catatan) dengan ' + incoming.length +
      ' catatan dari file?' + (parsed.wallets || parsed.accounts ? ' Dompet & kategori juga ikut diganti.' : '');
    if (!window.confirm(msg)) { toast('Import dibatalkan'); return; }
    data = migrate({
      settings: Object.assign({}, data.settings, parsed.settings || {}),
      wallets: parsed.wallets || parsed.accounts,
      cats: parsed.cats,
      tx: incoming
    });
    save(); closeSheet(); render();
    toast('Import selesai: ' + data.tx.length + ' catatan');
  };
  fr.readAsText(file);
}

/* ── render utama ─────────────────────────────────────────────────── */
function renderHeader() {
  const isWallet = ui.tab === 'wallet';
  $('#prevMonth').hidden = isWallet;
  $('#nextMonth').hidden = isWallet;
  $('#monthBtn').hidden = isWallet;
  $('#topbarTitle').hidden = !isWallet;
  if (!isWallet) {
    $('#monthLabel').textContent = monthName(ui.month);
    $('#prevMonth').setAttribute('aria-label', 'Bulan sebelumnya: ' + monthName(shiftMonth(ui.month, -1)));
    $('#nextMonth').setAttribute('aria-label', 'Bulan berikutnya: ' + monthName(shiftMonth(ui.month, 1)));
  }
}
function renderTabs() {
  $$('#tabbar .tab').forEach((b) => {
    const on = b.dataset.tab === ui.tab;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  $('#viewTx').hidden = ui.tab !== 'tx';
  $('#viewWallet').hidden = ui.tab !== 'wallet';
  $('#viewReport').hidden = ui.tab !== 'report';
}
function render() {
  renderTabs();
  renderHeader();
  if (ui.tab === 'tx') { renderSummary(); renderList(); }
  else if (ui.tab === 'wallet') renderWalletTab();
  else renderReport();
}
function switchTab(tab) {
  ui.tab = tab;
  render();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ── wiring ───────────────────────────────────────────────────────── */
function wire() {
  $('#tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) switchTab(b.dataset.tab);
  });

  $('#prevMonth').addEventListener('click', () => { ui.month = shiftMonth(ui.month, -1); render(); });
  $('#nextMonth').addEventListener('click', () => { ui.month = shiftMonth(ui.month, 1); render(); });
  $('#monthBtn').addEventListener('click', () => {
    ui.pickYear = Number(ui.month.slice(0, 4));
    renderMonthSheet();
    openSheet('monthSheet');
  });
  $('#prevYear').addEventListener('click', () => { ui.pickYear--; renderMonthSheet(); });
  $('#nextYear').addEventListener('click', () => { ui.pickYear++; renderMonthSheet(); });

  $('#addBtn').addEventListener('click', () => openEntry(null));
  $('#scrim').addEventListener('click', closeSheet);
  $$('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openStack.length) closeSheet(); });

  $('#typeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    entry.type = b.dataset.type;
    entry.subcategory = '';
    const names = walletNames();
    entry.account = names.includes(data.settings.lastWallet) ? data.settings.lastWallet : names[0];
    entry.toAccount = names.find((n) => n !== entry.account) || names[0];
    if (entry.type !== 'transfer') {
      const cats = catsOf(entry.type);
      entry.category = data.settings.lastCat[entry.type] || (cats[0] || {}).name || '';
    }
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

  $('#saveOpening').addEventListener('click', saveOpening);
  $('#deleteWallet').addEventListener('click', deleteWallet);
  $('#transferFrom').addEventListener('click', () => {
    const from = walletOpen;
    closeSheet();
    setTimeout(() => openEntry(null, { type: 'transfer', account: from }), 260);
  });
  $('#walletOpening').addEventListener('input', (e) => {
    const el = e.target;
    const atEnd = el.selectionStart === el.value.length;
    if (atEnd) {
      const next = fmtTyping(el.value);
      if (next !== el.value) el.value = next;
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  $('#addWalletBtn').addEventListener('click', () => {
    const v = $('#newWallet').value.trim();
    if (!v) return;
    if (data.wallets.some((w) => w.name === v)) { toast('Dompet itu sudah ada'); return; }
    data.wallets.push({ name: v, opening: 0 });
    $('#newWallet').value = '';
    save(); render();
    toast('Dompet ' + v + ' ditambahkan');
  });

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
      setTimeout(() => {
        if (b.dataset.armed === '1') { b.dataset.armed = '0'; b.textContent = 'Hapus semua transaksi'; }
      }, 4000);
      return;
    }
    data.tx = [];
    save(); closeSheet(); render();
    toast('Semua catatan dihapus');
  });

  $('#hideHint').addEventListener('click', () => {
    try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* ignore */ }
    $('#installHint').hidden = true;
  });

  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (ui.tab === 'report') drawCharts(); }, 150);
  });
}

/* ── boot ─────────────────────────────────────────────────────────── */
function boot() {
  applyTheme();
  wire();
  render();

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

  window.DUITKU = {
    get data() { return data; },
    get ui() { return ui; },
    balance: walletBalance,
    total: totalBalance,
    tab: switchTab,
    reload: () => { data = load(); render(); }
  };
}

document.addEventListener('DOMContentLoaded', boot);
})();
