'use strict';
// ALL PARTIES AND LEADERS ARE FICTIONAL. Edit freely.
// appeal: base appeal per voter group (order = GROUPS). stance: default manifesto (order = ISSUES).
// strength: regional base support (0..1) by state id; unlisted states default to 0.12.
// urbanLean: -1 (rural party) .. +1 (urban party)
const P = [
  {
    id: 'BRD', name: 'Bharat Rashtra Dal', short: 'BRD', color: '#FF8A00', symbol: '🪷', slogan: 'Strong Nation, Stronger Economy',
    leader: { name: 'Vikrant Raghunath', title: 'National President', age: 61, home: 'Gujarat', charisma: 9, trust: 6, vision: 6, stamina: 8,
      bio: 'A disciplined organiser and commanding orator who built a nationwide cadre network. Admired for decisive style, criticised for centralising power.' },
    appeal: [.60, .50, .65, .50, .75, .40, .60, .20], stance: [-1, 0, 0, -1, 2, 0], urbanLean: .2,
    strength: { GJ: .80, MP: .75, RJ: .65, UP: .60, HR: .60, UK: .70, DL: .55, MH: .50, KA: .45, CG: .55, AS: .50, HP: .50, GA: .55, AR: .50, JH: .40, BR: .35, OD: .35, CH: .45, DD: .60, AN: .35, LD: .40, JK: .30, MN: .45, TR: .45, SK: .30 },
  },
  {
    id: 'JCS', name: 'Jan Congress Samaj', short: 'JCS', color: '#1E9BE0', symbol: '✋', slogan: 'Together for Every Indian',
    leader: { name: 'Meenakshi Devraj', title: 'Party Chairperson', age: 58, home: 'Karnataka', charisma: 7, trust: 7, vision: 8, stamina: 6,
      bio: 'A seasoned parliamentarian and former welfare minister, known for coalition-building and a pro-welfare, pluralist platform.' },
    appeal: [.50, .55, .50, .55, .45, .50, .50, .65], stance: [0, 2, 1, 1, 0, 2], urbanLean: 0,
    strength: { KL: .60, KA: .55, PB: .50, HP: .50, CG: .50, TS: .60, AS: .40, MH: .40, RJ: .40, MP: .35, UK: .40, HR: .40, GA: .40, ML: .55, MZ: .50, NL: .35, AN: .45, LK: .60, PY: .45, AP: .30, JK: .40, DL: .35, CH: .40, BR: .25, UP: .25, TN: .25, MN: .40, AR: .35, SK: .30, GJ: .25 },
  },
  {
    id: 'LSM', name: 'Lal Sangh Morcha', short: 'LSM', color: '#D7263D', symbol: '⚒️', slogan: 'Land, Labour, Dignity',
    leader: { name: 'Arvind Menon', title: 'General Secretary', age: 66, home: 'Kerala', charisma: 5, trust: 8, vision: 7, stamina: 6,
      bio: 'A scholar-activist with a spotless reputation, trusted by workers and unions; less effective in large rallies.' },
    appeal: [.55, .55, .40, .50, .25, .80, .45, .60], stance: [2, 2, 1, 2, 0, 1], urbanLean: -.1,
    strength: { KL: .60, WB: .35, TR: .50, BR: .28, JH: .25, TN: .20, AP: .18, OD: .15 },
  },
  {
    id: 'HKP', name: 'Hari Kranti Party', short: 'HKP', color: '#2FA84F', symbol: '🌾', slogan: 'Annadata First',
    leader: { name: 'Balwant Singh Dhillon', title: 'Kisan Neta', age: 63, home: 'Punjab', charisma: 6, trust: 8, vision: 4, stamina: 8,
      bio: 'A farmer-leader who rose from village cooperatives. Deeply trusted in the countryside; limited urban appeal.' },
    appeal: [.40, .85, .30, .45, .35, .50, .50, .40], stance: [-1, 1, 2, 0, 0, 0], urbanLean: -.6,
    strength: { PB: .45, HR: .45, UP: .35, RJ: .35, MP: .30, MH: .30, KA: .20, BR: .20, UK: .30, HP: .25 },
  },
  {
    id: 'DSM', name: 'Dakshin Swabhiman Manch', short: 'DSM', color: '#8E3FD1', symbol: '☀️', slogan: 'Pride of the South',
    leader: { name: 'Kavitha Senthilnathan', title: 'Party Supremo', age: 55, home: 'Tamil Nadu', charisma: 8, trust: 7, vision: 6, stamina: 7,
      bio: 'A former film-star turned chief minister with enormous grassroots affection and a regional-autonomy agenda.' },
    appeal: [.55, .50, .50, .60, .50, .55, .50, .50], stance: [0, 2, 1, 1, 1, 2], urbanLean: .1,
    strength: { TN: .75, PY: .60, AP: .50, TS: .35, KA: .30, KL: .15, AN: .25, LK: .20 },
  },
  {
    id: 'PJD', name: 'Purvanchal Janata Dal', short: 'PJD', color: '#0FA3A3', symbol: '🏹', slogan: 'Voice of the Heartland',
    leader: { name: 'Jagdish Pratap Sinha', title: 'Party Convenor', age: 60, home: 'Bihar', charisma: 7, trust: 5, vision: 5, stamina: 8,
      bio: 'A street-smart political survivor with strong social-coalition arithmetic; dogged by past controversies.' },
    appeal: [.50, .60, .35, .50, .40, .60, .45, .55], stance: [0, 1, 1, 1, 1, 1], urbanLean: -.3,
    strength: { BR: .60, JH: .55, UP: .45, OD: .55, WB: .35, CG: .20, AS: .20, MN: .20 },
  },
  {
    id: 'NAP', name: 'Nav Bharat Aam Party', short: 'NAP', color: '#F2C200', symbol: '🧹', slogan: 'Clean Politics, Real Delivery',
    leader: { name: 'Ananya Kapoor Rao', title: 'Founder-Convenor', age: 49, home: 'Delhi', charisma: 8, trust: 6, vision: 9, stamina: 5,
      bio: 'A former civil servant who built a start-up style party around governance reform; strong with young urbanites, thin on the ground elsewhere.' },
    appeal: [.75, .35, .70, .55, .60, .45, .40, .45], stance: [-1, 1, 0, 1, 1, 2], urbanLean: .8,
    strength: { DL: .55, PB: .40, GJ: .30, GA: .35, CH: .45, HR: .25, MH: .20, UK: .20, JK: .25 },
  },
];
// Balance pass: extra thin-presence states + per-party scaling so no party starts hopelessly ahead.
const EXTRA = {
  NAP: { MH: .28, KA: .30, TS: .30, UP: .20, RJ: .22, MP: .20, BR: .15, WB: .20, TN: .15, AP: .20 },
  LSM: { UP: .15, MH: .20, KA: .20, RJ: .20, AS: .20, MP: .15, TS: .20, PB: .20, HR: .18, UK: .18, CG: .20, DL: .20, HP: .18 },
  HKP: { GJ: .20, AP: .15, TS: .20 },
};
const SCALE = { BRD: .76, JCS: 1.08, PJD: 1.1, DSM: 1.1, HKP: 1.05, LSM: 1.05 };
for (const p of P) {
  for (const [k, v] of Object.entries(EXTRA[p.id] || {})) if (p.strength[k] === undefined) p.strength[k] = v;
  for (const k of Object.keys(p.strength)) p.strength[k] = Math.min(0.85, +(p.strength[k] * (SCALE[p.id] || 1)).toFixed(3));
}
module.exports = P;
