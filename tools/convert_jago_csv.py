#!/usr/bin/env python3
"""Konversi export CSV Jago/Superbank -> backup JSON Duitku + CSV balik untuk verifikasi.

Format sumber: Date;Flow;Vendor;Description;Financial account;Currency;Amount;Category;Sub-Category
Tanggal = M/D/YYYY (US). Flow: DB = pengeluaran, CR = pemasukan.
"""
import csv
import json
import os
import sys
from datetime import datetime

SRC = [
    ('/home/ubuntu/.hermes/cache/documents/doc_1753fa0698d4_Laporan-Keuangan-2026-08.csv', '2026-08'),
    ('/home/ubuntu/.hermes/cache/documents/doc_07d426d7e8f7_Laporan-Keuangan-2026-09 2.csv', '2026-09'),
    ('/home/ubuntu/.hermes/cache/documents/doc_a1adc57d6844_Laporan-Keuangan-2026-10.csv', '2026-10'),
]
OUT_DIR = '/home/ubuntu/duitku/data'

# default app, dipakai sebagai pelengkap kalau ada kategori yang belum muncul di data
DEFAULT_CATS = {
    'out': [('Pinjaman', ['Kartu kredit']), ('Kebutuhan rumah', ['Tagihan aplikasi', 'Laundry']),
            ('Makanan & minuman', ['Pacaran']), ('Investasi', []),
            ('Kesehatan & olahraga', ['Olahraga', 'Apotek']),
            ('Transportasi', ['Bensin', 'Biaya parkir']), ('Shopping', []), ('Keluarga', []),
            ('Pengeluaran Keuangan Lainnya', ['Biaya admin']), ('Donasi & hadiah', ['Donasi'])],
    'in': [('Pemasukan', []), ('Transfer Masuk', []), ('Pinjaman', []), ('Donasi & hadiah', [])],
}
DEFAULT_ACCOUNTS = ['Superbank', 'Mandiri', 'Mayapada', 'ShopeePay', 'Cash', 'myBCA', 'Flazz']


def clean(v):
    v = (v or '').strip()
    return '' if v in ('', '-') else v


def parse_date(s):
    m, d, y = (int(x) for x in s.strip().split('/'))
    if m > 12 and d <= 12:          # jaga-jaga kalau ada yang format D/M
        m, d = d, m
    if not (1 <= m <= 12 and 1 <= d <= 31):
        raise ValueError('tanggal aneh: ' + s)
    return f'{y:04d}-{m:02d}-{d:02d}'


def read_file(path, tag):
    rows = []
    with open(path, newline='', encoding='utf-8-sig') as fh:
        for r in csv.DictReader(fh, delimiter=';'):
            if not (r.get('Date') or '').strip():
                continue
            vendor, desc = clean(r.get('Vendor')), clean(r.get('Description'))
            if vendor and desc:
                note = f'{vendor} — {desc}'
            else:
                note = vendor or desc
            rows.append({
                'date': parse_date(r['Date']),
                'type': 'in' if r['Flow'].strip().upper() == 'CR' else 'out',
                'amount': float(r['Amount'].strip()),
                'category': clean(r.get('Category')) or 'Lainnya',
                'subcategory': clean(r.get('Sub-Category')),
                'account': clean(r.get('Financial account')),
                'note': note,
                '_file': tag,
            })
    return rows


def main():
    raw = []
    for path, tag in SRC:
        if not os.path.exists(path):
            sys.exit('file hilang: ' + path)
        part = read_file(path, tag)
        print(f'{tag}: {len(part)} baris  ({part[0]["date"]} .. {part[-1]["date"]})')
        raw += part

    # buang irisan antar file (tidak ada di data ini, tapi biar aman): simpan sebanyak
    # kemunculan terbanyak di satu file saja
    from collections import defaultdict
    seen = defaultdict(int)
    per_file = defaultdict(int)
    for r in raw:
        key = (r['date'], r['type'], r['amount'], r['category'], r['subcategory'], r['account'], r['note'])
        per_file[(key, r['_file'])] += 1
    keep_quota = {}
    for (key, _f), n in per_file.items():
        keep_quota[key] = max(keep_quota.get(key, 0), n)
    deduped = []
    for r in raw:
        key = (r['date'], r['type'], r['amount'], r['category'], r['subcategory'], r['account'], r['note'])
        if seen[key] < keep_quota[key]:
            seen[key] += 1
            deduped.append(r)
    print(f'total: {len(raw)} baris, setelah dedupe antar-file: {len(deduped)} (buang {len(raw) - len(deduped)})')

    # urutan: tanggal naik, di dalam tanggal mengikuti urutan file (paling baru di atas)
    deduped.sort(key=lambda r: r['date'])
    BASE = int(datetime(2026, 10, 14).timestamp() * 1000)
    for i, r in enumerate(deduped):
        r['id'] = f'{r["date"].replace("-", "")}-{i:04d}'
        r['createdAt'] = BASE - i

    # kategori & akun: urutan kemunculan di data, dilengkapi default
    cats = {'out': [], 'in': []}
    index = {'out': {}, 'in': {}}
    for r in deduped:
        t = r['type']
        if r['category'] not in index[t]:
            index[t][r['category']] = len(cats[t])
            cats[t].append({'name': r['category'], 'subs': []})
        c = cats[t][index[t][r['category']]]
        if r['subcategory'] and r['subcategory'] not in c['subs']:
            c['subs'].append(r['subcategory'])
    for t in ('out', 'in'):
        for name, subs in DEFAULT_CATS[t]:
            if name not in index[t]:
                index[t][name] = len(cats[t])
                cats[t].append({'name': name, 'subs': list(subs)})
            else:
                c = cats[t][index[t][name]]
                for s in subs:
                    if s not in c['subs']:
                        c['subs'].append(s)

    accounts = []
    for r in deduped:
        if r['account'] and r['account'] not in accounts:
            accounts.append(r['account'])
    for a in DEFAULT_ACCOUNTS:
        if a not in accounts:
            accounts.append(a)

    tx = [{k: v for k, v in r.items() if not k.startswith('_')} for r in deduped]

    os.makedirs(OUT_DIR, exist_ok=True)
    payload = {
        'app': 'duitku', 'version': 2,
        'exportedAt': datetime.now().astimezone().isoformat(),
        'wallets': [{'name': a, 'opening': 0} for a in accounts], 'cats': cats, 'tx': tx,
    }
    jpath = os.path.join(OUT_DIR, 'duitku-backup-2026-08-29_2026-10-13.json')
    with open(jpath, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
    print('JSON:', jpath, os.path.getsize(jpath), 'bytes')

    # CSV balik, format sama seperti sumber, buat cek di Excel
    cpath = os.path.join(OUT_DIR, 'duitku-transaksi-2026-08-29_2026-10-13.csv')
    with open(cpath, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.writer(fh, delimiter=';', quoting=csv.QUOTE_ALL)
        w.writerow(['Tanggal', 'Aliran', 'Keterangan', 'Akun', 'Kategori', 'Sub-Kategori', 'Jumlah'])
        for r in deduped:
            w.writerow([r['date'], 'CR' if r['type'] == 'in' else 'DB', r['note'], r['account'],
                        r['category'], r['subcategory'], ('-' if r['type'] == 'out' else '') + f'{r["amount"]:g}'])
    print('CSV :', cpath, os.path.getsize(cpath), 'bytes')

    # ringkasan per bulan
    print('\n--- ringkasan per bulan ---')
    agg = {}
    for r in deduped:
        m = r['date'][:7]
        a = agg.setdefault(m, {'in': 0, 'out': 0, 'n': 0})
        a[r['type']] += r['amount']
        a['n'] += 1
    for m in sorted(agg):
        a = agg[m]
        print(f'{m}: masuk {a["in"]:>12,.0f} | keluar {a["out"]:>12,.2f} | net {a["in"]-a["out"]:>13,.2f} | {a["n"]:>4} trx')

    print('\n--- cek vs workbook (10 Sep - 9 Okt 2026) ---')
    sel = [r for r in deduped if '2026-09-10' <= r['date'] <= '2026-10-09']
    i_ = sum(r['amount'] for r in sel if r['type'] == 'in')
    o_ = sum(r['amount'] for r in sel if r['type'] == 'out')
    print(f'CSV      : masuk {i_:,.2f} | keluar {o_:,.2f} | net {i_-o_:,.2f} | {len(sel)} trx')
    print('xlsx     : masuk 11,260,793 | keluar 13,239,551.15 | net -1,978,758.15 | 162 trx')
    print('cocok    :', abs(i_ - 11260793) < 0.01 and abs(o_ - 13239551.15) < 0.01 and len(sel) == 162)

    print('\nakun   :', ', '.join(accounts))
    print('kat out:', ', '.join(f'{c["name"]}({len(c["subs"])})' for c in cats['out']))
    print('kat in :', ', '.join(f'{c["name"]}({len(c["subs"])})' for c in cats['in']))
    print('range  :', deduped[0]['date'], '->', deduped[-1]['date'])


if __name__ == '__main__':
    main()
