import { doc, getDoc, setDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { Project, PaymentMethod } from '../types';
import { ALL_CONSTITUENCIES_ENRICHED } from '../constituencies';

const CURATED_PROJECTS: Project[] = [
  {id:'P001',name:'Matero Primary School Block',constituency:'Matero',province:'Lusaka',sector:'Education',budget:850000,spent:820000,pct:96,status:'complete',mp:'Hon. Miles Sampa'},
  {id:'P002',name:'Kabulonga Clinic Extension',constituency:'Lusaka Central',province:'Lusaka',sector:'Health',budget:1200000,spent:540000,pct:45,status:'ongoing',mp:'Hon. Mulambo Hamakuni Haimbe'},
  {id:'P003',name:'Chawama Road Rehabilitation',constituency:'Chawama',province:'Lusaka',sector:'Roads',budget:2500000,spent:0,pct:0,status:'stalled',mp:'Hon. Tasila Lungu'},
  {id:'P004',name:'Mandevu Water Kiosks ×5',constituency:'Mandevu',province:'Lusaka',sector:'Water',budget:600000,spent:600000,pct:100,status:'complete',mp:'Hon. Christopher Shakafuswa'},
  {id:'P005',name:'Lusaka Central Youth Hall',constituency:'Lusaka Central',province:'Lusaka',sector:'Youth',budget:980000,spent:320000,pct:33,status:'ongoing',mp:'Hon. Mulambo Hamakuni Haimbe'},
  {id:'P006',name:'Kabwata Maize Grinding Mills',constituency:'Kabwata',province:'Lusaka',sector:'Agriculture',budget:420000,spent:420000,pct:100,status:'complete',mp:'Hon. Andrew Tayengwa'},
  {id:'P007',name:'Wusakile Secondary Desks',constituency:'Wusakile',province:'Copperbelt',sector:'Education',budget:310000,spent:310000,pct:100,status:'complete',mp:'Hon. Pavyuma Kalobo'},
  {id:'P008',name:'Nkana Borehole Drilling',constituency:'Nkana',province:'Copperbelt',sector:'Water',budget:750000,spent:420000,pct:56,status:'ongoing',mp:'Hon. Binwell Mpundu'},
  {id:'P009',name:'Ndola Central Market Upgrade',constituency:'Ndola Central',province:'Copperbelt',sector:'Agriculture',budget:1800000,spent:0,pct:0,status:'planned',mp:'Hon. Frank Tayali'},
  {id:'P010',name:'Chipata Central Health Post',constituency:'Chipata Central',province:'Eastern',sector:'Health',budget:1500000,spent:1500000,pct:100,status:'complete',mp:'Hon. Reuben Mtolo Phiri'},
  {id:'P011',name:'Katete–Sinda Road Grading',constituency:'Sinda',province:'Eastern',sector:'Roads',budget:3200000,spent:1100000,pct:34,status:'stalled',mp:'Hon. Masautso K Tembo'},
  {id:'P012',name:'Choma Girls School Dormitory',constituency:'Choma',province:'Southern',sector:'Education',budget:2100000,spent:1890000,pct:90,status:'ongoing',mp:'Hon. Cornelius Mweetwa'},
  {id:'P013',name:'Livingstone Heritage Park',constituency:'Livingstone',province:'Southern',sector:'Youth',budget:890000,spent:0,pct:0,status:'planned',mp:'Hon. Rhodine Sikumba'},
  {id:'P014',name:'Mazabuka Irrigation Scheme',constituency:'Mazabuka Central',province:'Southern',sector:'Agriculture',budget:3400000,spent:2200000,pct:65,status:'ongoing',mp:'Hon. Gary Nkombo'},
  {id:'P015',name:'Serenje Irrigation Canal',constituency:'Serenje',province:'Central',sector:'Agriculture',budget:4200000,spent:840000,pct:20,status:'stalled',mp:'Hon. George Kasabila Kandafula'},
  {id:'P016',name:'Mansa Teacher Quarters',constituency:'Mansa Central',province:'Luapula',sector:'Education',budget:1100000,spent:1100000,pct:100,status:'complete',mp:'Hon. Chitalu Chilufya'},
  {id:'P017',name:'Nchelenge Fishing Coop Shed',constituency:'Nchelenge',province:'Luapula',sector:'Agriculture',budget:780000,spent:390000,pct:50,status:'ongoing',mp:'Hon. Simon Mwale'},
  {id:'P018',name:'Kasama Stadium Fencing',constituency:'Kasama Central',province:'Northern',sector:'Youth',budget:650000,spent:0,pct:0,status:'planned',mp:'Hon. Sibongile Mwamba'},
  {id:'P019',name:'Mbala–Mpulungu Road Repair',constituency:'Mbala',province:'Northern',sector:'Roads',budget:5800000,spent:3480000,pct:60,status:'ongoing',mp:'Hon. Njavwa Simutowe'},
  {id:'P020',name:'Solwezi Urban Drainage',constituency:'Solwezi Central',province:'Copperbelt',sector:'Water',budget:2200000,spent:2200000,pct:100,status:'complete',mp:'Hon. Stafford Mulusa'},
  {id:'P021',name:'Mongu Primary School Desks',constituency:'Mongu Central',province:'Western',sector:'Education',budget:280000,spent:0,pct:0,status:'planned',mp:'Hon. Oliver Amutike'},
  {id:'P022',name:'Kabwe Central Refuse Equipment',constituency:'Kabwe Central',province:'Central',sector:'Youth',budget:560000,spent:280000,pct:50,status:'ongoing',mp:'Hon. Chrizoster Halwindi'},
  {id:'P023',name:'Chipata–Lundazi Road Phase 1',constituency:'Lundazi',province:'Eastern',sector:'Roads',budget:6200000,spent:1860000,pct:30,status:'ongoing',mp:'Hon. Brenda Nyirenda'},
  {id:'P024',name:'Monze Borehole Network',constituency:'Monze',province:'Southern',sector:'Water',budget:920000,spent:920000,pct:100,status:'complete',mp:'Hon. Jacob Jack Mwiimbu'},
  {id:'P025',name:'Chilanga Agriculture Co-op',constituency:'Chilanga',province:'Lusaka',sector:'Agriculture',budget:740000,spent:370000,pct:50,status:'ongoing',mp:'Hon. Sipho Hlazo'},
  {id:'P026',name:'Chingola Youth Sports Complex',constituency:'Chingola',province:'Copperbelt',sector:'Youth',budget:1200000,spent:480000,pct:40,status:'ongoing',mp:'Hon. Chipoka Mulenga'},
  {id:'P027',name:'Mansa Health Clinic Renovation',constituency:'Mansa Central',province:'Luapula',sector:'Health',budget:950000,spent:950000,pct:100,status:'complete',mp:'Hon. Chitalu Chilufya'},
  {id:'P028',name:'Kawambwa Road Grading',constituency:'Kawambwa',province:'Luapula',sector:'Roads',budget:2800000,spent:700000,pct:25,status:'stalled',mp:'Hon. Nickson Chilangwa'},
  {id:'P029',name:'Kapiri Mposhi Market Stalls',constituency:'Kapiri Mposhi',province:'Central',sector:'Agriculture',budget:880000,spent:660000,pct:75,status:'ongoing',mp:'Hon. Stanley Kasongo Kakubo'},
  {id:'P030',name:'Chibombo Borehole Network ×8',constituency:'Chisamba',province:'Central',sector:'Water',budget:1400000,spent:1400000,pct:100,status:'complete',mp:'Hon. Chushi C Kasanda'},
];

/**
 * The 30 entries above only cover ~30 of Zambia's 228 constituencies — every
 * other constituency would otherwise show "0 Projects logged • K0 disbursed"
 * forever, which reads as broken even though it's just missing demo data.
 * This fills in exactly one deterministic starter project for every
 * constituency NOT already covered above, so every constituency has real,
 * non-zero figures out of the box. Deterministic (hashed from the
 * constituency name) so re-seeding produces the same values, not fresh
 * random noise on every reseed.
 */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

const SECTORS = ['Education', 'Health', 'Roads', 'Water', 'Agriculture', 'Youth'] as const;
const STATUS_CYCLE: Project['status'][] = ['complete', 'ongoing', 'stalled', 'planned', 'ongoing', 'complete'];
const PROJECT_NOUN: Record<typeof SECTORS[number], string> = {
  Education: 'School Infrastructure Upgrade',
  Health: 'Rural Health Post Improvement',
  Roads: 'Feeder Road Rehabilitation',
  Water: 'Community Borehole Project',
  Agriculture: 'Farmer Input Support Scheme',
  Youth: 'Youth Skills & Recreation Hub',
};

const coveredConstituencies = new Set(CURATED_PROJECTS.map((p) => p.constituency));

const FILLER_PROJECTS: Project[] = ALL_CONSTITUENCIES_ENRICHED
  .filter((c) => !coveredConstituencies.has(c.name))
  .map((c, idx) => {
    const h = hashStr(c.name);
    const sector = SECTORS[h % SECTORS.length];
    const status = STATUS_CYCLE[h % STATUS_CYCLE.length];
    const budget = 400_000 + (h % 45) * 100_000; // 400K – 4.9M ZMW
    const pct = status === 'complete' ? 100 : status === 'planned' ? 0 : 15 + (h % 75); // 15–89%
    const spent = Math.round(budget * (pct / 100));
    return {
      id: 'PF' + (idx + 1).toString().padStart(3, '0'),
      name: `${c.name} ${PROJECT_NOUN[sector]}`,
      constituency: c.name,
      province: c.province,
      sector,
      budget,
      spent,
      pct,
      status,
      mp: c.mp,
    } as Project;
  });

export const DEF_PROJECTS: Project[] = [...CURATED_PROJECTS, ...FILLER_PROJECTS];

const DEF_PAYMENT_METHODS: PaymentMethod[] = [
  {id:'mtn',    name:'MTN Mobile Money', icon:'📱', color:'#FFCB05', detailLabel:'MTN MoMo Number', detail:'096 000 0000', note:'Dial *303# or use the MTN MoMo app to send.'},
  {id:'airtel', name:'Airtel Money',     icon:'📱', color:'#ED1C24', detailLabel:'Airtel Money Number', detail:'097 000 0000', note:'Dial *115# or use the Airtel Money app to send.'},
  {id:'zamtel', name:'Zamtel Kwacha',    icon:'📱', color:'#0072BC', detailLabel:'Zamtel Kwacha Number', detail:'095 000 0000', note:'Dial *422# to send via Zamtel Kwacha.'},
  {id:'zanaco', name:'Zanaco Bank',      icon:'🏦', color:'#00A651', detailLabel:'Account Number', detail:'0000000000000', note:'Account name: Zambia CDF Tracker. Branch: Cairo Road.'},
  {id:'natsave',name:'NATSAVE',          icon:'🏦', color:'#1B3A6B', detailLabel:'Account Number', detail:'0000000000', note:'Account name: Zambia CDF Tracker.'},
];

export async function seedDatabase() {
  try {
    const projectsCol = collection(db, 'projects');
    let projectSnapshot;
    try {
      projectSnapshot = await getDocs(projectsCol);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'projects');
      return;
    }

    if (projectSnapshot.empty) {
      console.log('Seeding projects to Firestore...');
      const batch = writeBatch(db);
      DEF_PROJECTS.forEach((proj) => {
        const ref = doc(db, 'projects', proj.id);
        batch.set(ref, proj);
      });
      try {
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'projects');
      }
      console.log('Successfully seeded projects!');
    } else {
      // Self-heal: a PREVIOUS seed (e.g. before the constituency-coverage
      // expansion below existed) may have only covered a subset of
      // constituencies. Top up any constituency that still has zero
      // projects — without touching or duplicating anything already there,
      // including real projects an admin has since added by hand.
      const existingConstituencies = new Set<string>();
      projectSnapshot.forEach((d) => {
        const data = d.data() as Project;
        if (data.constituency) existingConstituencies.add(data.constituency);
      });
      const gapFillers = DEF_PROJECTS.filter((p) => !existingConstituencies.has(p.constituency));
      if (gapFillers.length > 0) {
        console.log(`Topping up ${gapFillers.length} constituencies with no projects yet...`);
        const batch = writeBatch(db);
        gapFillers.forEach((proj) => {
          const ref = doc(db, 'projects', proj.id);
          batch.set(ref, proj);
        });
        try {
          await batch.commit();
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, 'projects');
        }
        console.log('Successfully topped up missing-constituency projects!');
      }
    }

    const payCol = collection(db, 'paymentMethods');
    let paySnapshot;
    try {
      paySnapshot = await getDocs(payCol);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'paymentMethods');
      return;
    }

    if (paySnapshot.empty) {
      console.log('Seeding payment methods to Firestore...');
      const batch = writeBatch(db);
      DEF_PAYMENT_METHODS.forEach((pm) => {
        const ref = doc(db, 'paymentMethods', pm.id);
        batch.set(ref, pm);
      });
      try {
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'paymentMethods');
      }
      console.log('Successfully seeded payment methods!');
    }

    const constCol = collection(db, 'constituencies');
    let constSnapshot;
    try {
      constSnapshot = await getDocs(constCol);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'constituencies');
      return;
    }

    if (constSnapshot.empty) {
      console.log('Seeding constituencies to Firestore...');
      // 226 constituencies is comfortably under Firestore's 500-writes-per-batch limit.
      // Each doc includes a starting `score` (transparency rating) and `allocated`
      // (CDF budget) so the Rankings view has real numbers from the first load,
      // instead of every constituency showing "undefined%" until an admin edits it.
      const batch = writeBatch(db);
      ALL_CONSTITUENCIES_ENRICHED.forEach((c) => {
        const ref = doc(db, 'constituencies', c.name);
        batch.set(ref, c);
      });
      try {
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'constituencies');
      }
      console.log('Successfully seeded constituencies!');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
    handleFirestoreError(error, OperationType.WRITE, 'projects');
  }
}
