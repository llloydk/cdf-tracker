import { Project } from './types';

// Currency formatter
export function zmw(v: number): string {
  if (v >= 1000000) {
    return 'K' + (v / 1000000).toFixed(1) + 'M';
  }
  if (v >= 1000) {
    return 'K' + (v / 1000).toFixed(0) + 'K';
  }
  return 'K' + Math.round(v).toLocaleString();
}

// Escapes special characters
export function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c);
  });
}

// CSS class for project status
export function sClass(status: string): string {
  switch (status) {
    case 'ongoing': return 'bg-blue-100 text-blue-700 font-medium';
    case 'complete': return 'bg-emerald-100 text-emerald-700 font-bold';
    case 'stalled': return 'bg-red-100 text-red-700 border border-red-200/50 font-bold';
    case 'planned': return 'bg-slate-150 text-slate-600 font-medium border border-slate-200/30';
    default: return 'bg-slate-100 text-slate-700';
  }
}

// Labels for project status
export function sLabel(status: string): string {
  switch (status) {
    case 'ongoing': return 'Ongoing';
    case 'complete': return 'Complete';
    case 'stalled': return '⚠️ Stalled';
    case 'planned': return 'Planned';
    default: return status;
  }
}

// Password hashing helper (SHA-256 using native crypto with pure JS fallback for HTTP/network devices)
export async function hashPassword(pw: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (e) {
      console.warn('Subtle crypto failed, falling back to pure-JS SHA-256:', e);
    }
  }

  // Pure JavaScript SHA-256 fallback for insecure HTTP environments (e.g. running on local network devices)
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const words: number[] = [];
  const asciiLength = pw.length * 8;
  const maxWord = 0xffffffff;
  
  for (let i = 0; i < pw.length * 8; i += 8) {
    words[i >> 5] |= (pw.charCodeAt(i / 8) & 0xff) << (24 - (i % 32));
  }
  
  words[asciiLength >> 5] |= 0x80 << (24 - (asciiLength % 32));
  words[(((asciiLength + 64) >>> 9) << 4) + 15] = asciiLength;
  
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  
  for (let i = 0; i < words.length; i += 16) {
    const w = words.slice(i, i + 16);
    while (w.length < 64) {
      const s0 = rightRotate(w[w.length - 15], 7) ^ rightRotate(w[w.length - 15], 18) ^ (w[w.length - 15] >>> 3);
      const s1 = rightRotate(w[w.length - 2], 17) ^ rightRotate(w[w.length - 2], 19) ^ (w[w.length - 2] >>> 10);
      w.push((w[w.length - 16] + s0 + w[w.length - 7] + s1) & maxWord);
    }
    
    let [a, b, c, d, e, f, g, h0] = h;
    for (let j = 0; j < 64; j++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h0 + S1 + ch + k[j] + w[j]) & maxWord;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) & maxWord;
      
      h0 = g;
      g = f;
      f = e;
      e = (d + temp1) & maxWord;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) & maxWord;
    }
    
    h[0] = (h[0] + a) & maxWord;
    h[1] = (h[1] + b) & maxWord;
    h[2] = (h[2] + c) & maxWord;
    h[3] = (h[3] + d) & maxWord;
    h[4] = (h[4] + e) & maxWord;
    h[5] = (h[5] + f) & maxWord;
    h[6] = (h[6] + g) & maxWord;
    h[7] = (h[7] + h0) & maxWord;
  }
  
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += h[i].toString(16).padStart(8, '0');
  }
  return result;
}

// Export data to CSV
export function expCSV(projects: Project[]) {
  const rows = [['ID', 'Project', 'Constituency', 'Province', 'Sector', 'Budget', 'Spent', '%', 'Status', 'MP']];
  projects.forEach((p) => {
    rows.push([p.id, p.name, p.constituency, p.province, p.sector, p.budget.toString(), p.spent.toString(), p.pct + '%', p.status, p.mp]);
  });
  dlCSV(rows, 'cdf-projects.csv');
}

function dlCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
