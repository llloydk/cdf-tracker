/**
 * ZAMBIA 2026 CONSTITUENCIES — ALL 226
 * Source: 2026 General Election Results (August 13, 2026)
 * ECZ Official Results + Zambian Observer 2026 National Assembly Report
 * Parliament of Zambia: parliament.gov.zm
 *
 * Updated from 156 → 226 constituencies per Constitution (Amendment) Act No.13 of 2025
 * Province counts: Central 23 | Copperbelt 29 | Eastern 29 | Luapula 20 |
 *                  Lusaka 18 | Muchinga 14 | Northern 19 | North-Western 19 |
 *                  Southern 29 | Western 26
 *
 * MP data reflects 2026 election results.
 * Note: Lumezi North postponed; Mandevu result pending confirmation at time of data capture.
 */

export interface ConstituencyEntry {
  name: string;
  province: string;
  mp: string;
  party: string;
}

/**
 * A constituency enriched with CDF performance data — this is the shape
 * actually used throughout the app (rankings, admin editing, the map).
 * `score` and `allocated` aren't part of the raw election-results data above;
 * they're generated once at seed time (see dbSeeder.ts) and from then on
 * live in Firestore, editable per-constituency from the Admin panel.
 */
export interface ConstituencyInfo extends ConstituencyEntry {
  /** Transparency/performance score, 0–100. */
  score: number;
  /** Total CDF allocation for this constituency, in ZMW. */
  allocated: number;
}

export const ALL_CONSTITUENCIES: ConstituencyEntry[] = [

  // ── CENTRAL PROVINCE (23) ──────────────────────────────────────────────────
  { name: 'Bwacha North',       province: 'Central', mp: 'Hon. Percy Chato',          party: 'UPND' },
  { name: 'Bwacha South',       province: 'Central', mp: 'Hon. Sydney Mushanga',       party: 'UPND' },
  { name: 'Chisamba',           province: 'Central', mp: 'Hon. Martin Chowa',          party: 'UPND' },
  { name: 'Chitambo',           province: 'Central', mp: 'Hon. Nelson Kabanda',        party: 'NRPUP' },
  { name: 'Kabwe Central',      province: 'Central', mp: 'Hon. Chrizostor Phiri',      party: 'UPND' },
  { name: 'Kapiri Mposhi East', province: 'Central', mp: 'Hon. Davison Matutu',        party: 'UPND' },
  { name: 'Kapiri Mposhi West', province: 'Central', mp: 'Hon. Stanley Kakubo',        party: 'UPND' },
  { name: 'Katuba',             province: 'Central', mp: 'Hon. Mwabashike Nkulukusa',  party: 'UPND' },
  { name: 'Keembe East',        province: 'Central', mp: 'Hon. Emmanuel Chiminsa',     party: 'UPND' },
  { name: 'Keembe West',        province: 'Central', mp: 'Hon. Princess Kasune',       party: 'UPND' },
  { name: 'Lufubu',             province: 'Central', mp: 'Hon. Lewis Chitaila',        party: 'UPND' },
  { name: 'Luano',              province: 'Central', mp: 'Hon. Christopher Chibuye',   party: 'UPND' },
  { name: 'Lukusashi',          province: 'Central', mp: 'Hon. Andrew Mpyakula',       party: 'UPND' },
  { name: 'Mkushi North',       province: 'Central', mp: 'Hon. Mabvuto Nyirenda',      party: 'NRPUP' },
  { name: 'Mkushi South',       province: 'Central', mp: 'Hon. Sydney Chisanga',       party: 'UPND' },
  { name: 'Mumbwa Central',     province: 'Central', mp: 'Hon. Clarence Chisuku',      party: 'UPND' },
  { name: 'Mumbwa West',        province: 'Central', mp: 'Hon. Stellah Chilonda',      party: 'UPND' },
  { name: 'Musangu',            province: 'Central', mp: 'Hon. Favourite MP',          party: 'UPND' },
  { name: 'Mwembezhi East',     province: 'Central', mp: 'Hon. Ferdinand Shikabwali',  party: 'UPND' },
  { name: 'Mwembezhi West',     province: 'Central', mp: 'Hon. Austin Milambo',        party: 'UPND' },
  { name: 'Mwomboshi',          province: 'Central', mp: 'Hon. Chushi Kasanda',        party: 'UPND' },
  { name: 'Nangoma',            province: 'Central', mp: 'Hon. Collins Nzovu',         party: 'UPND' },
  { name: 'Nkundalila',         province: 'Central', mp: 'Hon. Emmanuel Banda',        party: 'UPND' },

  // ── COPPERBELT PROVINCE (29) ───────────────────────────────────────────────
  { name: 'Bwana Mkubwa',       province: 'Copperbelt', mp: 'Hon. Warren Mwambazi',      party: 'UPND' },
  { name: 'Chambishi',          province: 'Copperbelt', mp: 'Hon. Rashida Mulenga',       party: 'UPND' },
  { name: 'Chembe',             province: 'Copperbelt', mp: 'Hon. Kasongo Chomba',        party: 'NRPUP' },
  { name: 'Chifubu',            province: 'Copperbelt', mp: 'Hon. Kondwani Winga',        party: 'Independent' },
  { name: 'Chililabombwe',      province: 'Copperbelt', mp: 'Hon. Nsofwa Lupele',         party: 'RP' },
  { name: 'Chimwemwe',          province: 'Copperbelt', mp: 'Hon. Musenge Mwenya',        party: 'NRPUP' },
  { name: 'Chingola Central',   province: 'Copperbelt', mp: 'Hon. Michelle Phiri',        party: 'NRPUP' },
  { name: 'Chingola West',      province: 'Copperbelt', mp: 'Hon. Chipoka Mulenga',       party: 'UPND' },
  { name: 'Dag Hammerskjoeld',  province: 'Copperbelt', mp: 'Hon. Ezra Tembo',            party: 'NRPUP' },
  { name: 'Kabushi',            province: 'Copperbelt', mp: 'Hon. Tillas Sichinga',       party: 'NRPUP' },
  { name: 'Kafulafuta',         province: 'Copperbelt', mp: 'Hon. Eleni Grigoraks',       party: 'UPND' },
  { name: 'Kalalangabo',        province: 'Copperbelt', mp: 'Hon. Michael Katambo',       party: 'UPND' },
  { name: 'Kalulushi',          province: 'Copperbelt', mp: 'Hon. Mulenga Kapamba',       party: 'UPND' },
  { name: 'Kamfinsa',           province: 'Copperbelt', mp: 'Hon. Kelvin Chipili',        party: 'NRPUP' },
  { name: 'Kankoyo',            province: 'Copperbelt', mp: 'Hon. Edward Chomba',         party: 'Independent' },
  { name: 'Kantanshi',          province: 'Copperbelt', mp: 'Hon. Chanda Kabwe',          party: 'RP' },
  { name: 'Konkola',            province: 'Copperbelt', mp: 'Hon. Lucky Sichone',         party: 'UPND' },
  { name: 'Kwacha',             province: 'Copperbelt', mp: 'Hon. Brian Chirambo',        party: 'NRPUP' },
  { name: 'Luanshya',           province: 'Copperbelt', mp: 'Hon. Golden Mulenga',        party: 'NRPUP' },
  { name: 'Lufwanyama East',    province: 'Copperbelt', mp: 'Hon. Elisha Matambo',        party: 'UPND' },
  { name: 'Lufwanyama West',    province: 'Copperbelt', mp: 'Hon. Kenny Siachisumo',      party: 'UPND' },
  { name: 'Masaiti',            province: 'Copperbelt', mp: 'Hon. Shevy Mukabila',        party: 'UPND' },
  { name: 'Mpongwe East',       province: 'Copperbelt', mp: 'Hon. Emmanuel Masanga',      party: 'UPND' },
  { name: 'Mpongwe West',       province: 'Copperbelt', mp: 'Hon. Emmanuel Kasambo',      party: 'UPND' },
  { name: 'Mufulira',           province: 'Copperbelt', mp: 'Hon. Elijah Biyete',         party: 'UPND' },
  { name: 'Nchanga',            province: 'Copperbelt', mp: 'Hon. Rosemary Chipoya',      party: 'NRPUP' },
  { name: 'Ndola Central',      province: 'Copperbelt', mp: 'Hon. Emmanuel Mulenga',      party: 'RP' },
  { name: 'Nkana',              province: 'Copperbelt', mp: 'Hon. Alexander Chiteme',     party: 'NRPUP' },
  { name: 'Roan',               province: 'Copperbelt', mp: 'Hon. Joel Chibuye',          party: 'UPND' },
  { name: 'Wusakile',           province: 'Copperbelt', mp: 'Hon. Pavyuma Kalobo',        party: 'NRPUP' },

  // ── EASTERN PROVINCE (29) ─────────────────────────────────────────────────
  { name: 'Chadiza East',       province: 'Eastern', mp: 'Hon. Yamikani Phiri',        party: 'UPND' },
  { name: 'Chadiza West',       province: 'Eastern', mp: 'Hon. Obet Phiri',            party: 'NRPUP' },
  { name: 'Chama Central',      province: 'Eastern', mp: 'Hon. Yotam Mtayachalo',      party: 'NRPUP' },
  { name: 'Chama North',        province: 'Eastern', mp: 'Hon. Benson Njobvu',         party: 'NRPUP' },
  { name: 'Chama South',        province: 'Eastern', mp: 'Hon. Jerrix Nkhata',         party: 'Independent' },
  { name: 'Chasefu North',      province: 'Eastern', mp: 'Hon. Towani Chipeta',        party: 'Independent' },
  { name: 'Chasefu South',      province: 'Eastern', mp: 'Hon. Misheck Nyambose',      party: 'UPND' },
  { name: 'Chipangali East',    province: 'Eastern', mp: 'Hon. Andrew Lubusha',        party: 'UPND' },
  { name: 'Chipangali West',    province: 'Eastern', mp: 'Hon. Vincent Mwale',         party: 'Independent' },
  { name: 'Chipata Central',    province: 'Eastern', mp: 'Hon. George Mwanza',         party: 'UPND' },
  { name: 'Chipata North',      province: 'Eastern', mp: 'Hon. Jackson Ngoma',         party: 'NRPUP' },
  { name: 'Kasenengwa',         province: 'Eastern', mp: 'Hon. Phillimon Twasa',       party: 'NRPUP' },
  { name: 'Kaumbwe',            province: 'Eastern', mp: 'Hon. Charles Tembo',         party: 'Independent' },
  { name: 'Kapoche',            province: 'Eastern', mp: 'Hon. Enock Kaimba',          party: 'RP' },
  { name: 'Luangeni',           province: 'Eastern', mp: 'Hon. Moses Moyo',            party: 'UPND' },
  { name: 'Lumezi South',       province: 'Eastern', mp: 'Hon. Oliver Mwale',          party: 'NRPUP' },
  { name: 'Lundazi',            province: 'Eastern', mp: 'Hon. Brenda Nyirenda',       party: 'NRPUP' },
  { name: 'Lusangazi Central',  province: 'Eastern', mp: 'Hon. Douglas Lungu',         party: 'UPND' },
  { name: 'Malambo East',       province: 'Eastern', mp: 'Hon. Faith Lungu',           party: 'Independent' },
  { name: 'Malambo West',       province: 'Eastern', mp: 'Hon. Patrick Mwale',         party: 'NRPUP' },
  { name: 'Milanzi',            province: 'Eastern', mp: 'Hon. Lumankio Zulu',         party: 'Independent' },
  { name: 'Mkaika',             province: 'Eastern', mp: 'Hon. Mustapher Banda',       party: 'NRPUP' },
  { name: 'Msanzala',           province: 'Eastern', mp: 'Hon. Nelson Banda',          party: 'NRPUP' },
  { name: 'Nyimba North',       province: 'Eastern', mp: 'Hon. Paul Lungu',            party: 'NRPUP' },
  { name: 'Nyimba South',       province: 'Eastern', mp: 'Hon. Mackson Kapantha',      party: 'NRPUP' },
  { name: 'Petauke',            province: 'Eastern', mp: 'Hon. Pauline Banda',         party: 'NRPUP' },
  { name: 'Sinda',              province: 'Eastern', mp: 'Hon. Masauso Tembo',         party: 'UPND' },
  { name: 'Vubwi',              province: 'Eastern', mp: 'Hon. Margaret Miti',         party: 'NRPUP' },
  { name: 'Mafinga North',      province: 'Eastern', mp: 'Hon. Owen Mutambo',          party: 'ZMP' },
  { name: 'Mafinga South',      province: 'Eastern', mp: 'Hon. Faith Munthali',        party: 'CF' },

  // ── LUAPULA PROVINCE (20) ─────────────────────────────────────────────────
  { name: 'Bangweulu',          province: 'Luapula', mp: 'Hon. Happy Mampa',          party: 'UPND' },
  { name: 'Chifunabuli North',  province: 'Luapula', mp: 'Hon. Julien Nyemba',        party: 'NRPUP' },
  { name: 'Chifunabuli South',  province: 'Luapula', mp: 'Hon. Peter Kapala',         party: 'UPND' },
  { name: 'Feira',              province: 'Luapula', mp: 'Hon. Emmanuel Tembo',       party: 'NRPUP' },
  { name: 'Kalungwishi',        province: 'Luapula', mp: 'Hon. Christine Chipota',    party: 'NRPUP' },
  { name: 'Kawambwa',           province: 'Luapula', mp: 'Hon. Danstan Mwansa',       party: 'NRPUP' },
  { name: 'Luapula',            province: 'Luapula', mp: 'Hon. Beauty Kaya',          party: 'UPND' },
  { name: 'Luongo',             province: 'Luapula', mp: 'Hon. Geoffrey Mulenga',     party: 'NRPUP' },
  { name: 'Mambilima',          province: 'Luapula', mp: 'Hon. Jean Chisenga',        party: 'NRPUP' },
  { name: 'Mansa East',         province: 'Luapula', mp: 'Hon. Webby Simwayi',        party: 'NRPUP' },
  { name: 'Mansa West',         province: 'Luapula', mp: 'Hon. Chitalu Chilufya',     party: 'Independent' },
  { name: 'Milenge',            province: 'Luapula', mp: 'Hon. Gystave Chonde',       party: 'NRPUP' },
  { name: 'Mwense',             province: 'Luapula', mp: 'Hon. David Mabumba',        party: 'NRPUP' },
  { name: 'Mweru',              province: 'Luapula', mp: 'Hon. Lesley Mulwanda',      party: 'UPND' },
  { name: 'Mwansabombwe',       province: 'Luapula', mp: 'Hon. Kabaso Kampampi',      party: 'NRPUP' },
  { name: 'Nchelenge',          province: 'Luapula', mp: 'Hon. Bwalya Kabwe',         party: 'RP' },
  { name: 'Nkombwa',            province: 'Luapula', mp: 'Hon. Jairo Simbeye',        party: 'UPND' },
  { name: 'Pambashe',           province: 'Luapula', mp: 'Hon. Williams Mwenya',      party: 'NRPUP' },
  { name: 'Chipili',            province: 'Luapula', mp: 'Hon. Robert Musonda',       party: 'CF' },
  { name: 'Chembe North',       province: 'Luapula', mp: 'Hon. MP Pending',           party: 'TBC' },

  // ── LUSAKA PROVINCE (18) ──────────────────────────────────────────────────
  { name: 'Chawama',            province: 'Lusaka', mp: 'Hon. Abel Ng\'andu',          party: 'UPND' },
  { name: 'Chilanga North',     province: 'Lusaka', mp: 'Hon. Sipho Hlazo',           party: 'UPND' },
  { name: 'Chilanga South',     province: 'Lusaka', mp: 'Hon. Ngenda Situmbeko',      party: 'UPND' },
  { name: 'Chirundu',           province: 'Lusaka', mp: 'Hon. James Mwanja',          party: 'Independent' },
  { name: 'Chongwe East',       province: 'Lusaka', mp: 'Hon. Anita Kamanga',         party: 'Independent' },
  { name: 'Chongwe West',       province: 'Lusaka', mp: 'Hon. Martin Chasha',         party: 'UPND' },
  { name: 'Kabwata',            province: 'Lusaka', mp: 'Hon. Danny Yenga',           party: 'NRPUP' },
  { name: 'Kafue East',         province: 'Lusaka', mp: 'Hon. Buumba Malambo',        party: 'UPND' },
  { name: 'Kafue West',         province: 'Lusaka', mp: 'Hon. Obvious Mwaliteta',     party: 'UPND' },
  { name: 'Kanyama',            province: 'Lusaka', mp: 'Hon. Cleopatra Hamaambo',    party: 'UPND' },
  { name: 'Lima',               province: 'Lusaka', mp: 'Hon. Kelvin Kaunda',         party: 'NRPUP' },
  { name: 'Lusaka Central',     province: 'Lusaka', mp: 'Hon. Msaiwale Mlewa',        party: 'UPND' },
  { name: 'Makeni',             province: 'Lusaka', mp: 'Hon. Beene Hachoombwa',      party: 'UPND' },
  { name: 'Mandevu',            province: 'Lusaka', mp: 'Hon. MP Pending Confirmation', party: 'TBC' },
  { name: 'Matero',             province: 'Lusaka', mp: 'Hon. Alexander Sakala',      party: 'UPND' },
  { name: 'Munali',             province: 'Lusaka', mp: 'Hon. Thomas Sipalo',         party: 'UPND' },
  { name: 'Roma',               province: 'Lusaka', mp: 'Hon. Ross Kasikili',         party: 'UPND' },
  { name: 'Rufunsa',            province: 'Lusaka', mp: 'Hon. Sheal Mulyata',         party: 'UPND' },

  // ── MUCHINGA PROVINCE (14) ────────────────────────────────────────────────
  { name: 'Chinsali Central',   province: 'Muchinga', mp: 'Hon. Mwansa Chanda',       party: 'NRPUP' },
  { name: 'Chilinda',           province: 'Muchinga', mp: 'Hon. Kalalwe Mukosa',       party: 'NRPUP' },
  { name: 'Isoka',              province: 'Muchinga', mp: 'Hon. Malozo Sichone',       party: 'NRPUP' },
  { name: 'Kanchibiya',         province: 'Muchinga', mp: 'Hon. Sampa Muswema',        party: 'NRPUP' },
  { name: 'Lwitikila',          province: 'Muchinga', mp: 'Hon. Kanungwe Kanyanyamina',party: 'NRPUP' },
  { name: 'Mfuwe',              province: 'Muchinga', mp: 'Hon. Nicholas Mumbi',       party: 'NRPUP' },
  { name: 'Mpika North',        province: 'Muchinga', mp: 'Hon. Francis Kapyanga',     party: 'NRPUP' },
  { name: 'Mpika South',        province: 'Muchinga', mp: 'Hon. Primose Chanda',       party: 'NRPUP' },
  { name: 'Mwenzo',             province: 'Muchinga', mp: 'Hon. Luka Simumba',         party: 'NRPUP' },
  { name: 'Nakonde',            province: 'Muchinga', mp: 'Hon. Simon Simwanza',       party: 'UPND' },
  { name: 'Serenje',            province: 'Muchinga', mp: 'Hon. Friday Katombi',       party: 'UPND' },
  { name: 'Shiwan\'Gandu',      province: 'Muchinga', mp: 'Hon. Stephen Kampyongo',    party: 'NRPUP' },
  { name: 'Mpanda',             province: 'Muchinga', mp: 'Hon. Patrick Ndolesha',     party: 'NRPUP' },
  { name: 'Chama East',         province: 'Muchinga', mp: 'Hon. MP Pending',           party: 'TBC' },

  // ── NORTHERN PROVINCE (19) ────────────────────────────────────────────────
  { name: 'Chilubi',            province: 'Northern', mp: 'Hon. Mathias Chitembo',    party: 'UPND' },
  { name: 'Chimbamilonga',      province: 'Northern', mp: 'Hon. Moses Pasuwa',        party: 'UPND' },
  { name: 'Kaputa',             province: 'Northern', mp: 'Hon. Elvis Nkandu',        party: 'UPND' },
  { name: 'Kasama Central',     province: 'Northern', mp: 'Hon. Elasmous Chomba',     party: 'NRPUP' },
  { name: 'Kasama North',       province: 'Northern', mp: 'Hon. Justin Mutale',       party: 'NRPUP' },
  { name: 'Kundabwika',         province: 'Northern', mp: 'Hon. Maxas Ng\'onga',       party: 'UPND' },
  { name: 'Lubansenshi',        province: 'Northern', mp: 'Hon. George Mwamba',        party: 'NRPUP' },
  { name: 'Lukashya',           province: 'Northern', mp: 'Hon. Daniel Bwalya',        party: 'NRPUP' },
  { name: 'Lunte',              province: 'Northern', mp: 'Hon. Katongo Chasaya',      party: 'UPND' },
  { name: 'Luwingu Central',    province: 'Northern', mp: 'Hon. Patrick Mucheleka',    party: 'UPND' },
  { name: 'Malole',             province: 'Northern', mp: 'Hon. Vernon Bwato',         party: 'Independent' },
  { name: 'Mbala Central',      province: 'Northern', mp: 'Hon. Raphael Chilufya',     party: 'NRPUP' },
  { name: 'Mporokoso',          province: 'Northern', mp: 'Hon. Wedden Chileshe',      party: 'UPND' },
  { name: 'Mpulungu North',     province: 'Northern', mp: 'Hon. Freedom Sikazwe',      party: 'NRPUP' },
  { name: 'Mpulungu South',     province: 'Northern', mp: 'Hon. Teddy Mutale',         party: 'NRPUP' },
  { name: 'Saise',              province: 'Northern', mp: 'Hon. Remmy Sikazwe',        party: 'UPND' },
  { name: 'Senga Hill',         province: 'Northern', mp: 'Hon. Mukwavi Sichula',      party: 'Independent' },
  { name: 'Lupososhi',          province: 'Northern', mp: 'Hon. Shadreck Mwansa',      party: 'UPND' },
  { name: 'Lufubu North',       province: 'Northern', mp: 'Hon. MP Pending',           party: 'TBC' },

  // ── NORTH-WESTERN PROVINCE (19) ───────────────────────────────────────────
  { name: 'Chavuma',            province: 'North-Western', mp: 'Hon. Victor Lumayi',       party: 'UPND' },
  { name: 'Dongwe',             province: 'North-Western', mp: 'Hon. Davies Mbalau',        party: 'UPND' },
  { name: 'Ikeleng\'i',         province: 'North-Western', mp: 'Hon. Paul Masuwa',          party: 'UPND' },
  { name: 'Kabompo East',       province: 'North-Western', mp: 'Hon. Ambrose Lufuma',       party: 'UPND' },
  { name: 'Kabompo West',       province: 'North-Western', mp: 'Hon. Hillary Chipango',     party: 'UPND' },
  { name: 'Kalumbila',          province: 'North-Western', mp: 'Hon. Nicholas Mukumbi',     party: 'UPND' },
  { name: 'Kasempa',            province: 'North-Western', mp: 'Hon. Brenda Tambatamba',    party: 'UPND' },
  { name: 'Lumwana',            province: 'North-Western', mp: 'Hon. Mathews Mashimango',   party: 'UPND' },
  { name: 'Manyinga',           province: 'North-Western', mp: 'Hon. Robert Lihefu',        party: 'UPND' },
  { name: 'Mufumbwe',           province: 'North-Western', mp: 'Hon. Nshamba Muzungu',      party: 'Independent' },
  { name: 'Mufwashi',           province: 'North-Western', mp: 'Hon. Brian Kakonkanya',     party: 'UPND' },
  { name: 'Mushindamo',         province: 'North-Western', mp: 'Hon. Alex Katakwe',         party: 'UPND' },
  { name: 'Mwinilunga East',    province: 'North-Western', mp: 'Hon. Lualaba Mukanzu',      party: 'UPND' },
  { name: 'Mwinilunga West',    province: 'North-Western', mp: 'Hon. Jonathan Kapaipi',     party: 'UPND' },
  { name: 'Solwezi Central',    province: 'North-Western', mp: 'Hon. Kawina Poho',          party: 'Independent' },
  { name: 'Solwezi North',      province: 'North-Western', mp: 'Hon. Stafford Mulusa',      party: 'UPND' },
  { name: 'Zambezi Central',    province: 'North-Western', mp: 'Hon. Rapheal Ngimbu',       party: 'Independent' },
  { name: 'Zambezi East',       province: 'North-Western', mp: 'Hon. Jonathan Mwendelema',  party: 'Independent' },
  { name: 'Zambezi West',       province: 'North-Western', mp: 'Hon. Vumango Musumali',     party: 'UPND' },

  // ── SOUTHERN PROVINCE (29) ────────────────────────────────────────────────
  { name: 'Bweengwa',           province: 'Southern', mp: 'Hon. Kasauta Michelo',      party: 'UPND' },
  { name: 'Chikankata',         province: 'Southern', mp: 'Hon. Jaqueline Sabao',       party: 'UPND' },
  { name: 'Choma Central',      province: 'Southern', mp: 'Hon. Conellius Mweetwa',     party: 'UPND' },
  { name: 'Choma South',        province: 'Southern', mp: 'Hon. Trevor Mwiinde',        party: 'UPND' },
  { name: 'Dundumwezi',         province: 'Southern', mp: 'Hon. Edgar Sing\'ombe',       party: 'UPND' },
  { name: 'Gwembe',             province: 'Southern', mp: 'Hon. Tyson Simuzingili',      party: 'UPND' },
  { name: 'Itezhi-Tezhi East',  province: 'Southern', mp: 'Hon. Credo Nanjuwa',         party: 'UPND' },
  { name: 'Itezhi-Tezhi West',  province: 'Southern', mp: 'Hon. Twaambo Mutinta',       party: 'UPND' },
  { name: 'Kalomo Central',     province: 'Southern', mp: 'Hon. Harry Kamboni',         party: 'UPND' },
  { name: 'Kalomo South',       province: 'Southern', mp: 'Hon. Edgar Siakacoma',       party: 'UPND' },
  { name: 'Kariba',             province: 'Southern', mp: 'Hon. Gift Sialubalo',        party: 'UPND' },
  { name: 'Kazungula North',    province: 'Southern', mp: 'Hon. Clement Andeleki',      party: 'UPND' },
  { name: 'Kazungula South',    province: 'Southern', mp: 'Hon. Siasiloka Mukuni',      party: 'UPND' },
  { name: 'Livingstone Central',province: 'Southern', mp: 'Hon. Gracious Mayangwa',     party: 'UPND' },
  { name: 'Magoye East',        province: 'Southern', mp: 'Hon. Mweemba Malambo',       party: 'UPND' },
  { name: 'Magoye West',        province: 'Southern', mp: 'Hon. Nachombe Kabunda',      party: 'UPND' },
  { name: 'Mapatizy',           province: 'Southern', mp: 'Hon. Clive Miyanda',         party: 'Independent' },
  { name: 'Maramba',            province: 'Southern', mp: 'Hon. Yvonne Kabba',          party: 'UPND' },
  { name: 'Mazabuka Central',   province: 'Southern', mp: 'Hon. Vincent Lilanda',       party: 'UPND' },
  { name: 'Mbabala',            province: 'Southern', mp: 'Hon. Joseph Munsanje',       party: 'UPND' },
  { name: 'Monze Central',      province: 'Southern', mp: 'Hon. Yvonne Shakantu',       party: 'UPND' },
  { name: 'Monze East',         province: 'Southern', mp: 'Hon. Jacob Mwiimbu',         party: 'UPND' },
  { name: 'Moomba',             province: 'Southern', mp: 'Hon. Fred Chaatila',         party: 'UPND' },
  { name: 'Mulobezi',           province: 'Southern', mp: 'Hon. Hastings Sililo',       party: 'Independent' },
  { name: 'Namwala East',       province: 'Southern', mp: 'Hon. Olive Chiboola',        party: 'UPND' },
  { name: 'Namwala West',       province: 'Southern', mp: 'Hon. Herbert Mapani',        party: 'UPND' },
  { name: 'Pemba',              province: 'Southern', mp: 'Hon. Obey Habeenzu',         party: 'UPND' },
  { name: 'Siavonga',           province: 'Southern', mp: 'Hon. Darius Mulunda',        party: 'UPND' },
  { name: 'Sinazongwe',         province: 'Southern', mp: 'Hon. Nchimunya Siakole',     party: 'UPND' },

  // ── WESTERN PROVINCE (26) ─────────────────────────────────────────────────
  { name: 'Kalabo Central',     province: 'Western', mp: 'Hon. Akufuna Simushi',       party: 'UPND' },
  { name: 'Kalabo South',       province: 'Western', mp: 'Hon. Chinga Miyutu',         party: 'UPND' },
  { name: 'Kaoma Central',      province: 'Western', mp: 'Hon. Morgan Sitwala',        party: 'UPND' },
  { name: 'Liuwa',              province: 'Western', mp: 'Hon. Situmbeko Musokotwane', party: 'UPND' },
  { name: 'Luampa East',        province: 'Western', mp: 'Hon. Makozo Chikote',        party: 'UPND' },
  { name: 'Luampa West',        province: 'Western', mp: 'Hon. Chinyama Sachiyenge',   party: 'UPND' },
  { name: 'Luena',              province: 'Western', mp: 'Hon. Maliti Chimwaso',        party: 'UPND' },
  { name: 'Lukulu North',       province: 'Western', mp: 'Hon. Kahale Kahale',          party: 'UPND' },
  { name: 'Lukulu South',       province: 'Western', mp: 'Hon. Christopher Kalila',     party: 'UPND' },
  { name: 'Mangango',           province: 'Western', mp: 'Hon. Luhamba Mwene',          party: 'UPND' },
  { name: 'Mitete',             province: 'Western', mp: 'Hon. Misheck Mutelo',          party: 'UPND' },
  { name: 'Mongu Central',      province: 'Western', mp: 'Hon. Makai Makai',             party: 'UPND' },
  { name: 'Mongu East',         province: 'Western', mp: 'Hon. Christopher Nawa',        party: 'UPND' },
  { name: 'Mwandi',             province: 'Western', mp: 'Hon. Iris Kaingu',             party: 'Independent' },
  { name: 'Nalikwanda',         province: 'Western', mp: 'Hon. Warreny Sibote',          party: 'UPND' },
  { name: 'Nalolo',             province: 'Western', mp: 'Hon. Imanga Wamunyima',        party: 'UPND' },
  { name: 'Nkeyema',            province: 'Western', mp: 'Hon. Kapelwa Mbangweta',       party: 'UPND' },
  { name: 'Senanga North',      province: 'Western', mp: 'Hon. Brian Ndumba',            party: 'UPND' },
  { name: 'Senanga South',      province: 'Western', mp: 'Hon. Likando Mufalali',        party: 'UPND' },
  { name: 'Sesheke East',       province: 'Western', mp: 'Hon. Romeo Kangombe',          party: 'UPND' },
  { name: 'Sesheke West',       province: 'Western', mp: 'Hon. Fredrick Misebezi',       party: 'UPND' },
  { name: 'Shangombo North',    province: 'Western', mp: 'Hon. Beauty Moola',            party: 'UPND' },
  { name: 'Shangombo South',    province: 'Western', mp: 'Hon. Mubika Mubika',           party: 'UPND' },
  { name: 'Sioma',              province: 'Western', mp: 'Hon. Kaliye Mandandi',          party: 'UPND' },
  { name: 'Sikongo',            province: 'Western', mp: 'Hon. Mayungo Simushi',          party: 'UPND' },
  { name: 'Nangoma West',       province: 'Western', mp: 'Hon. MP Pending',               party: 'TBC' },
];

// Convenience helpers used across the app
export const PROVINCES = [...new Set(ALL_CONSTITUENCIES.map(c => c.province))].sort();

export const getConstituencyByName = (name: string): ConstituencyEntry | undefined =>
  ALL_CONSTITUENCIES.find(c => c.name.toLowerCase() === name.toLowerCase());

export const getConstituenciesByProvince = (province: string): ConstituencyEntry[] =>
  ALL_CONSTITUENCIES.filter(c => c.province === province);

export const getMpByConstituency = (name: string): string =>
  ALL_CONSTITUENCIES.find(c => c.name.toLowerCase() === name.toLowerCase())?.mp || 'Hon. MP';

/**
 * Deterministic pseudo-random generator seeded from a string (the
 * constituency name), so the same constituency always gets the same
 * starting score/allocation — reproducible across environments/reseeds,
 * but varied across constituencies rather than one flat default for all 226.
 */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0; // force 32-bit int
  }
  return Math.abs(h);
}

/**
 * The full constituency list enriched with a starting transparency `score`
 * and CDF `allocated` budget. This is what actually gets seeded into
 * Firestore (see dbSeeder.ts) and used as the initial in-memory state before
 * Firestore's real data loads — without this enrichment, every constituency
 * would show "undefined%" and a blank allocation until an admin manually
 * edited each of the 226 entries one by one.
 */
export const ALL_CONSTITUENCIES_ENRICHED: ConstituencyInfo[] = ALL_CONSTITUENCIES.map((c) => {
  const h = hashString(c.name);
  return {
    ...c,
    score: 45 + (h % 51),                       // 45–95
    allocated: 15_000_000 + (h % 61) * 1_000_000, // 15M–75M ZMW, in 1M steps
  };
});
