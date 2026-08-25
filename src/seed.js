/* seed.js — subjects and the full topic list. UMD: node module + browser global. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Seed = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var SUBJECTS = [
    { id: 'math', name: 'Math AA HL',      level: 'HL', tier: 1, weeklyMinutes: 210, quota: 210, sources: ['RV Gold'] },
    { id: 'phys', name: 'Physics HL',      level: 'HL', tier: 1, weeklyMinutes: 180, quota: 180, sources: ['RV Gold'] },
    { id: 'econ', name: 'Economics HL',    level: 'HL', tier: 1, weeklyMinutes: 105, quota: 105, sources: ['RV Gold'] },
    { id: 'peak', name: 'PeakScore',       level: '—',  tier: 1, weeklyMinutes: 300, quota: 300, sources: [] },
    { id: 'chem', name: 'Chemistry SL',    level: 'SL', tier: 2, weeklyMinutes: 140, quota: 140, priority: 1.25, sources: ['RV Gold'] },
    { id: 'sat',  name: 'SAT',             level: '—',  tier: 2, weeklyMinutes: 240, quota: 240, sources: ['Bluebook', 'Erica Meltzer'] },
    { id: 'eng',  name: 'English A SL',    level: 'SL', tier: 3, weeklyMinutes: 45,  quota: 45,  sources: [] },
    { id: 'port', name: 'Portuguese A SL', level: 'SL', tier: 3, weeklyMinutes: 30,  quota: 30,  sources: [] }
  ];

  var TOPICS = {
    math: [
      'Exponents & logarithms', 'Sequences & series', 'The binomial theorem', 'Counting principles & permutations',
      'Proof: induction & contradiction', 'Complex numbers', 'Polynomials, factor & remainder theorems',
      'Functions: composition & inverses', 'Transformations of graphs', 'Quadratics & inequalities', 'Rational functions',
      'Trigonometric identities & equations', 'Trigonometric functions & modelling', 'Vectors & the scalar/vector product',
      'Vector lines & planes', 'Descriptive & bivariate statistics', 'Probability & conditional probability',
      'Binomial distribution', 'The normal distribution', 'Limits, continuity & l’Hôpital',
      'Differentiation rules & implicit differentiation', 'Optimisation & related rates', 'Maclaurin series',
      'Integration techniques', 'Areas, volumes & kinematics (calculus)', 'Differential equations'
    ],
    phys: [
      'A.1 Kinematics', 'A.2 Forces & momentum', 'A.3 Work, energy & power', 'A.4 Rigid body mechanics',
      'A.5 Galilean & special relativity', 'B.1 Thermal energy transfers', 'B.2 Greenhouse effect', 'B.3 Gas laws',
      'B.4 Thermodynamics', 'B.5 Current & circuits', 'C.1 Simple harmonic motion', 'C.2 Wave model',
      'C.3 Wave phenomena', 'C.4 Standing waves & resonance', 'C.5 Doppler effect', 'D.1 Gravitational fields',
      'D.2 Electric & magnetic fields', 'D.3 Motion in electromagnetic fields', 'D.4 Induction',
      'E.1 Structure of the atom', 'E.2 Quantum physics', 'E.3 Radioactive decay', 'E.4 Fission', 'E.5 Fusion & stars'
    ],
    chem: [
      'S1.1 Particulate nature of matter', 'S1.2 The nuclear atom', 'S1.3 Electron configurations',
      'S1.4 Counting particles: the mole', 'S1.5 Ideal gases', 'S2.1 The ionic model', 'S2.2 The covalent model',
      'S2.3 The metallic model', 'S3.1 The periodic table & periodicity', 'S3.2 Functional groups & nomenclature',
      'R1.1 Enthalpy changes', 'R1.2 Energy cycles (Hess’s law)', 'R1.3 Energy from fuels',
      'R2.1 Amount of chemical change', 'R2.2 Rate of reaction', 'R2.3 Chemical equilibrium',
      'R3.1 Acids & bases (proton transfer)', 'R3.2 Redox (electron transfer)'
    ],
    econ: [
      'Scarcity, choice & the economic problem', 'Economic models: PPC & circular flow', 'Demand & its determinants',
      'Supply & its determinants', 'Market equilibrium & allocative efficiency', 'Elasticities: PED & YED',
      'Elasticity of supply (PES)', 'Government intervention: taxes, subsidies & price controls',
      'Market failure: externalities', 'Market failure: public goods & common pool resources',
      'Market power: monopoly & oligopoly (HL)', 'Behavioural economics & rational choice (HL)',
      'Measuring economic activity: GDP & GNI', 'Aggregate demand & aggregate supply',
      'Macroeconomic objectives: growth, unemployment & inflation', 'Inequality & poverty',
      'Demand-side policies: fiscal & monetary', 'Supply-side policies',
      'International trade & comparative advantage', 'Trade protection: tariffs, quotas & subsidies',
      'Exchange rates & the balance of payments', 'Economic development: measures & strategies'
    ],
    eng: [
      'Paper 1: guided analysis of unseen prose', 'Paper 1: guided analysis of unseen poetry',
      'Paper 1: thesis & structure under time', 'Paper 2: comparative essay planning',
      'Paper 2: works — themes & evidence bank', 'Individual Oral: global issue & extract choice',
      'Individual Oral: 10-minute delivery practice', 'Literary devices & assessment criteria'
    ],
    port: [
      'Paper 1: análise orientada de prosa', 'Paper 1: análise orientada de poesia',
      'Paper 1: tese e estrutura sob tempo', 'Paper 2: planejamento de ensaio comparativo',
      'Paper 2: obras — temas e evidências', 'Oral Individual: questão global e trechos',
      'Oral Individual: prática de apresentação', 'Recursos literários e critérios de avaliação'
    ],
    sat: [
      'R&W: Information & Ideas', 'R&W: Craft & Structure', 'R&W: Expression of Ideas',
      'R&W: Standard English Conventions', 'Math: Algebra', 'Math: Advanced Math',
      'Math: Problem-Solving & Data Analysis', 'Math: Geometry & Trigonometry'
    ],
    peak: [
      'Product: build & ship', 'Growth: distribution & users', 'Content: question bank & guides', 'Ops: feedback & metrics'
    ]
  };

  function seedState() {
    var topics = [];
    SUBJECTS.forEach(function (s) {
      TOPICS[s.id].forEach(function (name, i) {
        topics.push({ id: s.id + '-' + (i + 1), subjectId: s.id, name: name, status: 'new', lastStudied: null, reviewDue: null });
      });
    });
    return {
      version: 1,
      settings: { floorMode: false, satDone: false, satTarget: 1600, satDeadline: '2026-12-18' },
      subjects: SUBJECTS.map(function (s) { return Object.assign({}, s, { sources: s.sources.slice() }); }),
      topics: topics,
      grades: [],
      tests: [],
      log: []
    };
  }

  return { SUBJECTS: SUBJECTS, TOPICS: TOPICS, seedState: seedState };
});
