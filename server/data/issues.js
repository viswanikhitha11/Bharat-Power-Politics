'use strict';
// Voter groups (overlapping identities, used as weights) and the six manifesto issues.
const GROUPS = [
  { id: 'youth', name: 'Youth', icon: '🎓' },
  { id: 'farmers', name: 'Farmers', icon: '🌾' },
  { id: 'urban', name: 'Urban Middle Class', icon: '🏙️' },
  { id: 'women', name: 'Women', icon: '👩' },
  { id: 'business', name: 'Business & Traders', icon: '💼' },
  { id: 'workers', name: 'Workers & Poor', icon: '🛠️' },
  { id: 'seniors', name: 'Seniors', icon: '🧓' },
  { id: 'minorities', name: 'Minority Communities', icon: '🤝' },
];
// stance -2..+2 ; labels shown in the UI at the extremes
const ISSUES = [
  { id: 'tax', name: 'Taxation', lo: 'Deep tax cuts', hi: 'Higher progressive taxes' },
  { id: 'welfare', name: 'Welfare & Subsidies', lo: 'Minimal safety net', hi: 'Universal welfare' },
  { id: 'farm', name: 'Farm Policy', lo: 'Market reforms', hi: 'MSP & loan waivers' },
  { id: 'jobs', name: 'Jobs & Industry', lo: 'Private-sector led', hi: 'State-led job guarantee' },
  { id: 'infra', name: 'Infrastructure', lo: 'Fiscal austerity', hi: 'Mega-projects' },
  { id: 'social', name: 'Health & Education', lo: 'Private provision', hi: 'Public-first investment' },
];
//                tax  wel  farm jobs infra social
const PREF = {
  youth:      [-0.5, 0.5, 0.0, 1.5, 1.0, 1.5],
  farmers:    [-1.0, 1.5, 2.0, 0.5, 0.5, 0.5],
  urban:      [-1.0, 0.0, -0.5, 0.5, 1.5, 1.0],
  women:      [ 0.0, 1.5, 0.5, 0.5, 0.5, 2.0],
  business:   [-2.0, -1.0, -1.0, -1.0, 1.5, 0.0],
  workers:    [ 0.5, 1.5, 0.0, 2.0, 0.5, 1.0],
  seniors:    [-0.5, 1.0, 0.5, 0.0, 0.5, 2.0],
  minorities: [ 0.0, 1.5, 0.5, 1.0, 0.5, 1.5],
};
const WEIGHT = {
  youth:      [0.3, 0.3, 0.1, 1.0, 0.5, 0.6],
  farmers:    [0.4, 0.6, 1.0, 0.3, 0.3, 0.3],
  urban:      [0.8, 0.3, 0.1, 0.6, 0.8, 0.5],
  women:      [0.4, 0.8, 0.2, 0.4, 0.3, 1.0],
  business:   [1.0, 0.2, 0.1, 0.4, 0.8, 0.2],
  workers:    [0.4, 0.7, 0.1, 1.0, 0.4, 0.5],
  seniors:    [0.5, 0.6, 0.3, 0.2, 0.3, 1.0],
  minorities: [0.3, 0.7, 0.3, 0.6, 0.4, 0.7],
};
module.exports = {
  GROUPS, ISSUES,
  PREF: GROUPS.map(g => PREF[g.id]),
  WEIGHT: GROUPS.map(g => WEIGHT[g.id]),
};
