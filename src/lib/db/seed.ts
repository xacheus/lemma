import { addDays, format, parseISO } from 'date-fns';
import type {
  Apartment,
  BookingSource,
  BookingStatus,
  Database,
  Guest,
  HousekeepingTask,
  NotificationRecord,
  Payment,
  PaymentMethod,
  Reservation,
  StaffUser,
} from '../domain/types';
import { nightsBetween, stayTotal } from '../domain/availability';
import { addISO, dayDiff, eachISO } from '../domain/dates';
import { recomputeReservation } from '../domain/selectors';
import { DEFAULT_SETTINGS } from './default-settings';
import { hashPassword, DEMO_PASSWORD } from '../auth/passwords';

/** Deterministic PRNG so the demo looks the same on every machine, day to day. */
function makeRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: string, n: number) => addISO(d, n);
const ISO_DATE = (date: string, time: string) => `${date}T${time}:00.000Z`;

/* ------------------------------------------------------------------------ catalog */

interface ApartmentSpec {
  number: number;
  name: string;
  tier: Apartment['tier'];
  tagline: string;
  description: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  floor: number;
  bed: string;
  rate: number;
  amenities: string[];
  notes: string;
}

const APARTMENT_SPECS: ApartmentSpec[] = [
  {
    number: 1,
    name: 'Standard Suite',
    tier: 'standard',
    tagline: 'Quiet corner suite with garden outlook',
    description:
      'A compact, well-run one-bedroom suite on the ground floor, facing the courtyard garden. Favoured by consultants on short assignments who want a desk, fast fibre and a secure parking bay directly outside the door.',
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 38,
    floor: 0,
    bed: '1 queen bed + sofa bed (child only)',
    rate: 950,
    amenities: ['Fibre Wi-Fi 200Mbps', 'Backup power & solar', 'Smart TV', 'Work desk', 'Kitchenette', 'Ensuite shower', 'Private parking', 'Daily housekeeping'],
    notes: 'Ground-floor unit — step-free access from the north gate.',
  },
  {
    number: 2,
    name: 'Deluxe Suite',
    tier: 'deluxe',
    tagline: 'Our most-booked suite, balcony over the jacaranda',
    description:
      'First-floor deluxe suite with a private balcony over the jacaranda trees, a full kitchen and a lounge that separates from the bedroom. Booked solid in conference season, so plan two to three weeks ahead for weekends.',
    maxGuests: 3,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 46,
    floor: 1,
    bed: '1 king bed + single pull-out',
    rate: 1200,
    amenities: ['Fibre Wi-Fi 200Mbps', 'Backup power & solar', 'Balcony', 'Full kitchen', 'Dishwasher', 'Smart TV', 'Nespresso machine', 'Private parking', 'Daily housekeeping'],
    notes: 'Balcony furniture is stored away in the rainy season on request.',
  },
  {
    number: 3,
    name: 'Executive Suite',
    tier: 'executive',
    tagline: 'Two bedrooms, boardroom table, separate entrance',
    description:
      'Built for the small delegation: two ensuite bedrooms, a boardroom table that seats six and a separate entrance so meetings never cross the living space. Screen, whiteboard and a landline are already on the table.',
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 2,
    sizeSqm: 68,
    floor: 1,
    bed: '2 king beds',
    rate: 1650,
    amenities: ['Fibre Wi-Fi 200Mbps', 'Backup power & solar', 'Boardroom table (6)', 'Projector & screen', 'Separate entrance', 'Full kitchen', '2 ensuites', 'Laundry service', 'Private parking'],
    notes: 'Corporate invoicing available — requisition form must be signed before arrival.',
  },
  {
    number: 4,
    name: 'Family Apartment',
    tier: 'family',
    tagline: 'Three bedrooms, gated play area, self-catering',
    description:
      'Three bedrooms, two bathrooms and a dining table that comfortably seats six, opening onto the lawn and gated play area. The kitchen is fully equipped for self-catering, and a microwave steriliser is kept at reception for babies.',
    maxGuests: 5,
    bedrooms: 3,
    bathrooms: 2,
    sizeSqm: 92,
    floor: 0,
    bed: '1 king + 2 twins + cot on request',
    rate: 1950,
    amenities: ['Fibre Wi-Fi 200Mbps', 'Backup power & solar', 'Full kitchen', 'Dishwasher', 'Washer & dryer', 'Cot available', 'Garden & play area', 'Board games', 'Private parking (2 bays)'],
    notes: 'Extra guest above 5 is not permitted (fire capacity for this unit).',
  },
  {
    number: 5,
    name: 'Premium Apartment',
    tier: 'premium',
    tagline: 'Top-floor corner, skyline views, lounge',
    description:
      'A top-floor corner apartment with windows on three sides, skyline views over Chainama and a lounge large enough to host an after-work drink. Blackout blinds in both the lounge and bedroom for late risers and jet-lagged arrivals.',
    maxGuests: 2,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 52,
    floor: 2,
    bed: '1 super-king bed',
    rate: 1450,
    amenities: ['Fibre Wi-Fi 200Mbps', 'Backup power & solar', 'Skyline views', 'Lounge', 'Wet bar', 'Rain shower', 'Bathtub', 'Blackout blinds', 'Private parking'],
    notes: 'No lift to the third floor — carry luggage for guests with mobility needs.',
  },
  {
    number: 6,
    name: 'Studio Apartment',
    tier: 'studio',
    tagline: 'Best value for one-night stopovers',
    description:
      'An efficient studio with a kitchenette, rain shower and a bed that actually has a headboard. Our value unit for late stopovers off the Great East Road, and the one reception fills first when everything else is gone.',
    maxGuests: 2,
    bedrooms: 0,
    bathrooms: 1,
    sizeSqm: 28,
    floor: 1,
    bed: '1 double bed',
    rate: 750,
    amenities: ['Fibre Wi-Fi 100Mbps', 'Backup power', 'Kitchenette', 'Rain shower', 'Smart TV', 'Safe', 'Street parking'],
    notes: 'Walk-up only (first floor, no lift). Single occupancy rate available on request.',
  },
  {
    number: 7,
    name: 'Business Studio',
    tier: 'studio',
    tagline: 'Standing desk and printer for working stays',
    description:
      'A studio reconfigured for people who are here to work: standing desk, monitor arm, a laser printer and a second phone-charging shelf by the bed. Week-long stays get a mid-week linen change at no charge.',
    maxGuests: 2,
    bedrooms: 0,
    bathrooms: 1,
    sizeSqm: 31,
    floor: 1,
    bed: '1 queen bed',
    rate: 820,
    amenities: ['Fibre Wi-Fi 200Mbps', 'Backup power & solar', 'Standing desk', 'Laser printer', 'Second monitor port', 'Kitchenette', 'Safe', 'Private parking'],
    notes: 'Printer toner is stocked at reception — log a request, do not take from Apt 3.',
  },
  {
    number: 8,
    name: 'Garden Twin',
    tier: 'standard',
    tagline: 'Two singles, patio onto the herb garden',
    description:
      'Twin beds, a small private patio onto the herb garden and a shaded breakfast table. Popular with colleagues travelling together who would rather not share a king, and with grandparents hosting a grandchild.',
    maxGuests: 3,
    bedrooms: 2,
    bathrooms: 1,
    sizeSqm: 44,
    floor: 0,
    bed: '2 single beds + sofa bed',
    rate: 1080,
    amenities: ['Fibre Wi-Fi 100Mbps', 'Backup power', 'Private patio', 'Kitchenette', 'Ensuite shower', 'Herb garden access', 'Daily housekeeping'],
    notes: 'Shared wall with the generator enclosure — reception keeps events after 21:00 out of this unit.',
  },
  {
    number: 9,
    name: 'Junior Suite',
    tier: 'suite',
    tagline: 'Separate lounge, bath, and a dressing area',
    description:
      'A junior suite with a real lounge, a free-standing bath and a dressing area with a full-length mirror. Frequently booked for engagement weekends and by guests who want to change without an audience.',
    maxGuests: 3,
    bedrooms: 1,
    bathrooms: 1,
    sizeSqm: 55,
    floor: 2,
    bed: '1 king bed + sofa bed',
    rate: 1280,
    amenities: ['Fibre Wi-Fi 200Mbps', 'Backup power & solar', 'Separate lounge', 'Free-standing bath', 'Dressing area', 'Full kitchen', 'Champagne fridge on request', 'Private parking'],
    notes: 'Bath takes 25 minutes to fill — warn guests who ask for a bubble bath at check-in.',
  },
  {
    number: 10,
    name: 'Corner Executive',
    tier: 'executive',
    tagline: 'Corner unit with the long dining table',
    description:
      'Two double bedrooms on opposite corners, joined by a dining table that seats eight. Used for family visits, review sessions and, most months, at least one wedding party getting ready.',
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 2,
    sizeSqm: 70,
    floor: 2,
    bed: '2 double beds',
    rate: 1780,
    amenities: ['Fibre Wi-Fi 200Mbps', 'Backup power & solar', 'Dining (8 seats)', 'Full kitchen', '2 ensuites', 'Washer', 'Balcony', 'Private parking (2 bays)'],
    notes: 'Wedding-party get-ready use is permitted; hold a refundable K500 deposit for linen.',
  },
  {
    number: 11,
    name: 'Family Duplex',
    tier: 'family',
    tagline: 'Two floors, kids bedrooms upstairs',
    description:
      'A duplex with living space and the kitchen downstairs and the bedrooms upstairs, including a bunk room. The gate to the lawn locks from the outside, which is the sentence most guests end up writing about in reviews.',
    maxGuests: 6,
    bedrooms: 3,
    bathrooms: 2,
    sizeSqm: 105,
    floor: 1,
    bed: '1 king + 1 double + 2 bunk singles',
    rate: 2150,
    amenities: ['Fibre Wi-Fi 200Mbps', 'Backup power & solar', 'Two floors', 'Full kitchen', 'Dishwasher', 'Washer & dryer', 'Secured lawn gate', 'Board games', 'Private parking (2 bays)'],
    notes: 'Stair gate for toddlers available at reception — one spare only.',
  },
  {
    number: 12,
    name: 'Penthouse Suite',
    tier: 'premium',
    tagline: 'Top floor, wraparound terrace, 24h butler call',
    description:
      'The penthouse: two bedrooms, a wraparound terrace over the canopy and a butler call that reaches reception in about forty seconds. Booked mainly for anniversaries, and by company directors when the board visits.',
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 2,
    sizeSqm: 96,
    floor: 2,
    bed: '1 super-king + 1 double',
    rate: 2650,
    amenities: ['Fibre Wi-Fi 400Mbps', 'Backup power & solar', 'Wraparound terrace', 'Outdoor dining', '2 ensuites + guest WC', 'Butler call', 'Nespresso machine', 'Robes & slippers', 'Valet parking'],
    notes: 'Bedroom split-unit A/C tripped twice this week — maintenance job open, see housekeeping.',
  },
];

/* -------------------------------------------------------------------------- people */

interface GuestSpec {
  name: string;
  phone: string;
  email: string;
  id: string;
  idType: 'nrc' | 'passport';
  nationality: string;
  city: string;
  company: string;
  source: Guest['source'];
  vip?: boolean;
  requests?: string;
  notes?: string;
}

const GUEST_SPECS: GuestSpec[] = [
  { name: 'John Banda', phone: '+260 977 415 208', email: 'john.banda@copperstonetraders.co.zm', id: '389104/61/1', idType: 'nrc', nationality: 'Zambian', city: 'Kitwe', company: 'Copperstone Traders', source: 'website', requests: 'Early check-in if the suite is ready; parking bay near the gate.', notes: 'Prefers to settle on a company account — always asks for a VAT invoice addressed to Copperstone Traders Limited.' },
  { name: 'Mutale Mwansa', phone: '+260 966 220 147', email: 'mutale.mwansa@gmail.com', id: '112490/10/1', idType: 'nrc', nationality: 'Zambian', city: 'Lusaka', company: '', source: 'whatsapp', requests: 'Extra pillow.', notes: 'Regular — stays with us roughly every six weeks when she visits family in Avondale.' },
  { name: 'Choolwe Mumba', phone: '+260 971 883 402', email: 'choolwe@sunchiphoto.zm', id: 'A0413882', idType: 'passport', nationality: 'Zambian', city: 'Lusaka', company: 'Sunchi Photography', source: 'website', notes: 'Will photograph the property for his portfolio; no drone use inside the compound.' },
  { name: 'Grace Phiri', phone: '+260 966 771 030', email: 'g.phiri@zamfinance.gov.zm', id: '293874/55/1', idType: 'nrc', nationality: 'Zambian', city: 'Lusaka', company: 'Ministry of Finance', source: 'corporate', vip: true, requests: 'In-house conference line for the executive suite.', notes: 'Accounts department — invoices go to her, not to the guest folio email.' },
  { name: 'David Mwanza', phone: '+260 978 110 556', email: 'davidmwanza@outlook.com', id: '401220/71/1', idType: 'nrc', nationality: 'Zambian', city: 'Ndola', company: 'Mwambeshi Logistics', source: 'phone', notes: 'Truck dispatcher — arrival times are unreliable, never promise a check-in window tighter than "any time after 14:00".' },
  { name: 'Thandiwe Nkandu', phone: '+260 961 447 289', email: 'thandiwe.nkandu@gmail.com', id: '118342/49/1', idType: 'nrc', nationality: 'Zambian', city: 'Livingstone', company: 'Mosi oa Tunya Foundation', source: 'email', requests: 'Ground floor please, travelling with her mother.', notes: 'Donations-event organiser; brings a lot of luggage on departure day.' },
  { name: 'Kunda Sichone', phone: '+260 976 330 812', email: 'ksichone@initiumconsult.co.zm', id: '556102/14/1', idType: 'nrc', nationality: 'Zambian', city: 'Lusaka', company: 'Initium Consulting', source: 'corporate', vip: true, requests: 'Standing desk and a second monitor.', notes: 'Books Apt 7 back to back for months at a time. Pays by EFT on the 1st.' },
  { name: 'Mary Nyirenda', phone: '+260 966 005 418', email: 'nyirenda.mary91@gmail.com', id: '230188/51/1', idType: 'nrc', nationality: 'Zambian', city: 'Chelstone', company: '', source: 'referral', notes: 'Not to be confused with Mary Nyirenda on the cleaning roster.' },
  { name: 'Peter Chirwa', phone: '+260 978 552 761', email: 'pchirwa@malawimail.mw', id: 'MH0193388', idType: 'passport', nationality: 'Malawian', city: 'Blantyre', company: 'Shire Freight (ZM) Ltd', source: 'walk_in', notes: 'Cross-border driver, holds a ZIMPRA transit log — needs a parking bay for an articulated truck.' },
  { name: 'Lombe Kalambo', phone: '+260 967 218 004', email: 'lombe.k@barakafarms.co.zm', id: '184002/62/1', idType: 'nrc', nationality: 'Zambian', city: 'Mongu', company: 'Baraka Farms', source: 'phone', requests: 'Two rooms on the same floor.', notes: 'Pay first, always asks for a receipt photo on WhatsApp.' },
  { name: 'Nsonganinya Katongo', phone: '+260 961 774 233', email: 'songa@katongolaw chambers.co.zm', id: '209841/58/1', idType: 'nrc', nationality: 'Zambian', city: 'Lusaka', company: 'Katongo Legal Chambers', source: 'whatsapp', notes: 'Requests for invoices addressed to the firm, VAT 14/002187665.' },
  { name: 'Musuva Lombe', phone: '+260 975 662 300', email: 'musuva@gmail.com', id: '401299/10/1', idType: 'nrc', nationality: 'Zambian', city: 'Kabwe', company: '', source: 'website', requests: 'Late check-out (14:00) on Sundays.', notes: 'Church group bookings — usually pays cash at reception.' },
  { name: 'Sarah Chibwe', phone: '+260 966 901 447', email: 's.chibwe@zambiareport.zm', id: '331287/61/1', idType: 'nrc', nationality: 'Zambian', city: 'Lusaka', company: 'Zambia Report Media', source: 'email', requests: 'Quiet room, interviews after 18:00.', notes: 'Journalist. Property tours were filmed in Apt 11 in August — no further filming without owner approval.' },
  { name: 'Kelvin Tembo', phone: '+260 977 118 906', email: 'kelvin.tembo@gmail.com', id: '118204/52/1', idType: 'nrc', nationality: 'Zambian', city: 'Kitwe', company: 'Kalengwa Mining Services', source: 'corporate', notes: 'Shift roster, arrives on Sunday nights, leaves Thursday mornings. Invoice monthly.' },
  { name: 'Esther Mwiya', phone: '+260 961 337 220', email: 'esther.mwiya@cwazambia.org', id: '259876/10/1', idType: 'nrc', nationality: 'Zambian', city: 'Kafue', company: 'CWA Zambia', source: 'phone', requests: 'Room with a locking gate for the children.', notes: 'Long-stay NGO worker — three to four weeks at a time, per diem on a monthly invoice.' },
  { name: 'Bright Hamukwaya', phone: '+260 976 502 118', email: 'bright@ohangijeng.com', id: 'NA0447721', idType: 'passport', nationality: 'Namibian', city: 'Windhoek', company: 'Ohangj Eng (Pty) Ltd', source: 'travel_agent', notes: 'Needs a passport copy on file for the border permit — keep the scan in the folio.' },
  { name: 'Priscilla Zulu', phone: '+260 967 815 402', email: 'priscillazulu@gmail.com', id: '401277/49/1', idType: 'nrc', nationality: 'Zambian', city: 'Mufulira', company: '', source: 'walk_in', requests: 'Champagne fridge on the anniversary stay.', notes: 'Anniversary booking in the penthouse each October. Deposit is a gift from the brother.' },
  { name: 'Collins Sakala', phone: '+260 966 220 781', email: 'csakala@lafarge.co.zm', id: '293104/71/1', idType: 'nrc', nationality: 'Zambian', city: 'Chingola', company: 'Chingola Building Supply', source: 'corporate', notes: 'Books two rooms most months; requires a VAT invoice and purchase-order reference before arrival.' },
];

const STAFF_SPECS: Array<Omit<StaffUser, 'id' | 'lastSeenAt' | 'permissions'> & { id: string }> = [
  {
    id: 'st-1',
    name: 'Alice Chanda',
    username: 'alice',
    email: 'alice@lemmaheights.zm',
    phone: '+260 977 220 001',
    role: 'admin',
    jobTitle: 'Owner / General Manager',
    active: true,
    hiredOn: '2019-04-01',
    shift: null,
  },
  {
    id: 'st-2',
    name: 'Joseph Mwanza',
    username: 'joseph',
    email: 'joseph@lemmaheights.zm',
    phone: '+260 966 118 204',
    role: 'receptionist',
    jobTitle: 'Front Office Supervisor',
    active: true,
    hiredOn: '2021-01-11',
    shift: 'morning',
  },
  {
    id: 'st-3',
    name: 'Ruth Sinkala',
    username: 'ruth',
    email: 'ruth@lemmaheights.zm',
    phone: '+260 971 664 010',
    role: 'receptionist',
    jobTitle: 'Receptionist (night)',
    active: true,
    hiredOn: '2023-07-03',
    shift: 'evening',
  },
  {
    id: 'st-4',
    name: 'Mary Gondwe',
    username: 'mary',
    email: 'mary.gondwe@lemmaheights.zm',
    phone: '+260 966 733 118',
    role: 'cleaner',
    jobTitle: 'Head of Housekeeping',
    active: true,
    hiredOn: '2020-02-17',
    shift: 'morning',
  },
  {
    id: 'st-5',
    name: 'Peter Chisala',
    username: 'peter',
    email: 'peter.chisala@lemmaheights.zm',
    phone: '+260 978 205 566',
    role: 'cleaner',
    jobTitle: 'Room Attendant',
    active: true,
    hiredOn: '2022-11-07',
    shift: 'afternoon',
  },
  {
    id: 'st-6',
    name: 'Linda Banda',
    username: 'linda',
    email: 'linda.banda@lemmaheights.zm',
    phone: '+260 961 884 320',
    role: 'cleaner',
    jobTitle: 'Room Attendant (relief)',
    active: true,
    hiredOn: '2024-05-20',
    shift: 'morning',
  },
  {
    id: 'st-7',
    name: 'Emmanuel Daka',
    username: 'emmanuel',
    email: 'e.daka@lemmaheights.zm',
    phone: '+260 977 660 913',
    role: 'receptionist',
    jobTitle: 'Reservations Agent',
    active: false,
    hiredOn: '2022-03-14',
    shift: null,
  },
];

/* --------------------------------------------------------------------- demo money  */

/** Headline figure the owner asks for on the dashboard: Kwacha banked this month. */
const MONTHLY_REVENUE_TARGET = 48500;
/** Room-nights sold ÷ room-nights available, on the books for the running month. */
const MONTHLY_OCCUPANCY_TARGET = 70;
const PAST_MONTH_TARGETS = [38, 44, 46, 52, 58];

type StayStatus = BookingStatus;

interface CoreStay {
  apt: number;
  /** offset in days from today for check-in */
  in: number;
  nights: number;
  guestIndex: number;
  status: StayStatus;
  source: BookingSource;
  /** fraction of total banked and verified, by paidAt = paidOffset */
  paid?: { pct: number; method: PaymentMethod; kind: Payment['kind']; verified?: boolean; offset: number; reference?: string }[];
  notes?: string;
  arrivalTime?: string;
  cancellationReason?: string;
  pendingProof?: { pct: number; method: PaymentMethod; fileName: string };
  history?: { label: string; detail?: string; offset: number }[];
}

/* The eight units occupied tonight are 1,2,3,5,7,8,11,12 — see docs/DATA_MODEL.md. */
const CORE_STAYS: CoreStay[] = [
  {
    apt: 12, in: -18, nights: 27, guestIndex: 13, status: 'checked_in', source: 'corporate',
    notes: 'Board review cycle. Two additional delegates on the booking list, no extra charge.',
    arrivalTime: '16:20',
    paid: [{ pct: 0.6, method: 'bank_transfer', kind: 'deposit', offset: -19, reference: 'ZAN-EFT-4471192' }],
    history: [{ label: 'Monthly invoice raised', detail: 'Split billing: room on company, incidentals on the delegate.', offset: -12 }],
  },
  { apt: 3, in: -2, nights: 5, guestIndex: 3, status: 'checked_in', source: 'corporate', notes: 'Ministry offsite — three delegations share the suite during the day.', paid: [{ pct: 1, method: 'bank_transfer', kind: 'final_settlement', offset: -3, reference: 'FNB-TRF-99120437' }] },
  {
    apt: 1, in: 0, nights: 2, guestIndex: 8, status: 'checked_in', source: 'walk_in',
    notes: 'Walked in at 14:40 after a cancelled flight. Truck parked in bay 6.',
    arrivalTime: '14:40',
    paid: [{ pct: 0.5, method: 'cash', kind: 'deposit', offset: 0 }, { pct: 0.5, method: 'cash', kind: 'final_settlement', offset: 0 }],
  },
  {
    apt: 2, in: 0, nights: 3, guestIndex: 0, status: 'reserved', source: 'website',
    notes: 'Booking request received on the website. Deposit banked, balance due on arrival.',
    arrivalTime: '18:30',
    paid: [{ pct: 0.5, method: 'airtel_money', kind: 'deposit', offset: -1, reference: 'MP144729031847' }],
    history: [{ label: 'Availability held', detail: 'Held 20 minutes while reception confirmed the Airtel SMS.', offset: -1 }],
  },
  {
    apt: 5, in: -4, nights: 5, guestIndex: 12, status: 'checked_in', source: 'phone',
    notes: 'Balance of K2,900 due at departure tomorrow morning.',
    paid: [{ pct: 0.5, method: 'mtn_money', kind: 'deposit', offset: -5, reference: 'MOMO21948557120' }],
  },
  { apt: 7, in: -1, nights: 3, guestIndex: 6, status: 'checked_in', source: 'corporate', notes: 'Standing corporate rate — do not quote rack.', paid: [{ pct: 1, method: 'airtel_money', kind: 'final_settlement', offset: -2, reference: 'MP144611802377' }] },
  { apt: 8, in: 0, nights: 4, guestIndex: 9, status: 'fully_paid', source: 'whatsapp', notes: 'Two rooms requested; second room (Apt 6) declined for these dates — waitlist.', paid: [{ pct: 1, method: 'airtel_money', kind: 'final_settlement', offset: -2, reference: 'MP144665512903' }] },
  { apt: 11, in: -3, nights: 5, guestIndex: 14, status: 'checked_in', source: 'email', notes: 'Field visit, mid-week linen change requested.', paid: [{ pct: 0.4, method: 'bank_transfer', kind: 'deposit', offset: -4, reference: 'STAN-CT-3381927' }] },
  // departures today
  {
    apt: 4, in: -3, nights: 3, guestIndex: 17, status: 'checked_out', source: 'corporate',
    notes: 'Checked out 09:40. VAT invoice sent to the accounts address.',
    paid: [{ pct: 1, method: 'bank_transfer', kind: 'final_settlement', offset: -1, reference: 'ZAN-EFT-4470021' }],
  },
  {
    apt: 9, in: -2, nights: 2, guestIndex: 16, status: 'checked_in', source: 'website',
    notes: 'Guest left luggage with reception; returning Friday. Folio still open.',
    paid: [{ pct: 1, method: 'mtn_money', kind: 'final_settlement', offset: -3, reference: 'MOMO21933802651' }],
  },
  // upcoming arrivals
  { apt: 6, in: 1, nights: 2, guestIndex: 4, status: 'reserved', source: 'phone', notes: 'Deposit proof uploaded 09:05 — awaiting verification before the room is confirmed.', pendingProof: { pct: 0.5, method: 'airtel_money', fileName: 'airtel-screenshot-11-02.jpg' } },
  { apt: 4, in: 2, nights: 3, guestIndex: 5, status: 'reserved', source: 'website', notes: 'Travelling with her mother — ground-floor preference logged.', paid: [{ pct: 0.5, method: 'mtn_money', kind: 'deposit', offset: -1, reference: 'MOMO21950112884' }] },
  { apt: 10, in: 1, nights: 3, guestIndex: 10, status: 'fully_paid', source: 'whatsapp', notes: 'Firm on dates — invoice to the firm, VAT 14/002187665.', paid: [{ pct: 1, method: 'bank_transfer', kind: 'final_settlement', offset: -2, reference: 'FNB-TRF-99118870' }] },
  { apt: 1, in: 3, nights: 2, guestIndex: 2, status: 'reserved', source: 'website', notes: 'Photoshoot weekend, early access from 08:00 agreed.', paid: [{ pct: 0.5, method: 'airtel_money', kind: 'deposit', offset: 0, reference: 'MP144733180960' }] },
  { apt: 2, in: 4, nights: 2, guestIndex: 1, status: 'reserved', source: 'whatsapp', paid: [{ pct: 0.5, method: 'airtel_money', kind: 'deposit', offset: 0, reference: 'MP144733920114' }] },
  { apt: 5, in: 2, nights: 4, guestIndex: 11, status: 'reserved', source: 'phone', paid: [{ pct: 0.5, method: 'cash', kind: 'deposit', offset: 1 }] },
  { apt: 3, in: 4, nights: 3, guestIndex: 15, status: 'reserved', source: 'travel_agent', notes: 'Agent blocks this suite every third week. Passport copy pending.', paid: [{ pct: 0.3, method: 'bank_transfer', kind: 'deposit', offset: -1, reference: 'STAN-CT-3384410' }] },
  { apt: 8, in: 5, nights: 2, guestIndex: 7, status: 'reserved', source: 'website' },
  { apt: 11, in: 3, nights: 4, guestIndex: 13, status: 'fully_paid', source: 'corporate', paid: [{ pct: 1, method: 'bank_transfer', kind: 'final_settlement', offset: 0, reference: 'ZAN-EFT-4472288' }] },
  { apt: 6, in: 4, nights: 1, guestIndex: 12, status: 'reserved', source: 'walk_in' },
  { apt: 9, in: 1, nights: 3, guestIndex: 4, status: 'reserved', source: 'email', notes: 'Requested a late check-out for departure day — approved.', paid: [{ pct: 0.5, method: 'mtn_money', kind: 'deposit', offset: -1, reference: 'MOMO21950771844' }] },
  // cancelled / non-blocking
  { apt: 5, in: 2, nights: 2, guestIndex: 2, status: 'cancelled', source: 'phone', cancellationReason: 'Guest working overseas for the week — free of charge inside the 48-hour policy.' },
  { apt: 10, in: 6, nights: 2, guestIndex: 7, status: 'cancelled', source: 'website', cancellationReason: 'Double-booked with a flight; rebooked for the following week.' },
  { apt: 7, in: -9, nights: 2, guestIndex: 9, status: 'cancelled', source: 'phone', cancellationReason: 'No show, unreachable on the day.', paid: [{ pct: 0.5, method: 'airtel_money', kind: 'deposit', offset: -12, reference: 'MP144422109877' }] },
  { apt: 12, in: 12, nights: 2, guestIndex: 16, status: 'inquiry', source: 'whatsapp', notes: 'Asking whether the terrace can be set for 12 guests for one evening.' },
  { apt: 3, in: 9, nights: 2, guestIndex: 15, status: 'inquiry', source: 'website', notes: 'Requests a corporate rate for a recurring monthly booking.' },
  // past completed stays (feed reports + guest history)
  { apt: 2, in: -12, nights: 2, guestIndex: 5, status: 'checked_out', source: 'website', paid: [{ pct: 1, method: 'airtel_money', kind: 'final_settlement', offset: -13, reference: 'MP144388210044' }] },
  { apt: 6, in: -16, nights: 3, guestIndex: 4, status: 'checked_out', source: 'phone', paid: [{ pct: 1, method: 'cash', kind: 'final_settlement', offset: -16 }] },
  { apt: 1, in: -21, nights: 1, guestIndex: 8, status: 'checked_out', source: 'walk_in', paid: [{ pct: 1, method: 'cash', kind: 'final_settlement', offset: -21 }] },
  { apt: 11, in: -24, nights: 6, guestIndex: 14, status: 'checked_out', source: 'corporate', paid: [{ pct: 0.5, method: 'bank_transfer', kind: 'deposit', offset: -25, reference: 'STAN-CT-3370012' }, { pct: 0.5, method: 'bank_transfer', kind: 'final_settlement', offset: -18, reference: 'STAN-CT-3374488' }] },
  { apt: 9, in: -31, nights: 2, guestIndex: 1, status: 'checked_out', source: 'whatsapp', paid: [{ pct: 1, method: 'mtn_money', kind: 'final_settlement', offset: -32, reference: 'MOMO21901145722' }] },
  { apt: 4, in: -38, nights: 4, guestIndex: 10, status: 'checked_out', source: 'email', paid: [{ pct: 1, method: 'bank_transfer', kind: 'final_settlement', offset: -39, reference: 'FNB-TRF-99011720' }] },
];

/* ------------------------------------------------------------------------- helpers */

function slugify(name: string, number: number) {
  return `apt-${number}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function photoPaths(number: number) {
  const folder = `apartment-${String(number).padStart(2, '0')}`;
  return [
    `/images/apartments/${folder}/01.jpg`,
    `/images/apartments/${folder}/02.jpg`,
    `/images/apartments/${folder}/03.jpg`,
    `/images/apartments/${folder}/04.jpg`,
    `/images/apartments/${folder}/05.jpg`,
  ];
}

function referenceFor(year: string, seq: number) {
  return `LHA-${year}-${String(seq).padStart(4, '0')}`;
}

function mobileRef(kind: 'airtel' | 'mtn', rnd: () => number) {
  const digits = Array.from({ length: 12 }, () => Math.floor(rnd() * 10)).join('');
  return `${kind === 'airtel' ? 'MP' : 'MOMO'}${digits}`;
}

/* ------------------------------------------------------------------------- the seed */

export function createSeedDatabase(today: string): Database {
  const rnd = makeRandom(20261103);
  const year = today.slice(0, 4);

  const apartments: Apartment[] = APARTMENT_SPECS.map((spec) => ({
    id: `apt-${spec.number}`,
    number: spec.number,
    code: `LHA-${100 + spec.number}`,
    name: spec.name,
    slug: slugify(spec.name, spec.number),
    tier: spec.tier,
    tagline: spec.tagline,
    description: spec.description,
    maxGuests: spec.maxGuests,
    bedrooms: spec.bedrooms,
    bathrooms: spec.bathrooms,
    sizeSqm: spec.sizeSqm,
    floor: spec.floor,
    bedConfiguration: spec.bed,
    nightlyRate: spec.rate,
    amenities: spec.amenities,
    photos: photoPaths(spec.number),
    active: true,
    outOfService: false,
    houseNotes: spec.notes,
  }));

  const staff: StaffUser[] = STAFF_SPECS.map((s) => ({
    ...s,
    lastSeenAt: ISO_DATE(s.active ? (s.role === 'cleaner' ? iso(today, -1) : today) : iso(today, -34), s.role === 'cleaner' ? '06:45' : '07:52'),
    permissions: null,
    // Every demo account shares this password; it is printed on the sign-in screen.
    passwordHash: hashPassword(DEMO_PASSWORD),
  }));

  const guests: Guest[] = GUEST_SPECS.map((g, i) => ({
    id: `gu-${String(i + 1).padStart(3, '0')}`,
    fullName: g.name,
    phone: g.phone,
    email: g.email,
    nationalId: g.id,
    idType: g.idType,
    nationality: g.nationality,
    city: g.city,
    company: g.company,
    vip: !!g.vip,
    specialRequests: g.requests ?? '',
    internalNotes: g.notes ?? '',
    createdAt: ISO_DATE(iso(today, -Math.floor(rnd() * 700) - 40), '08:12'),
    source: g.source,
  }));

  const reservations: Reservation[] = [];
  const payments: Payment[] = [];
  let reservationSeq = 1041;
  const receiptSeq = 2210;
  let paymentSeq = 1;

  const push = (r: Reservation) => reservations.push(r);

  const buildCore = (spec: CoreStay, idx: number) => {
    const apartment = apartments.find((a) => a.number === spec.apt)!;
    const guest = guests[spec.guestIndex % guests.length];
    const checkIn = iso(today, spec.in);
    const checkOut = iso(checkIn, spec.nights);
    const nights = nightsBetween(checkIn, checkOut);
    const total = stayTotal(nights, apartment.nightlyRate, 0);
    const createdOffset = Math.min(spec.in, -1) - Math.ceil(rnd() * 4);
    const createdAt = ISO_DATE(iso(today, createdOffset), `${String(7 + Math.floor(rnd() * 11)).padStart(2, '0')}:${String(Math.floor(rnd() * 6) * 10).padStart(2, '0')}`);
    const seq = reservationSeq++;
    const reference = referenceFor(checkIn.slice(0, 4), seq);

    const r: Reservation = {
      id: `rv-${String(idx + 1).padStart(3, '0')}`,
      reference,
      guestId: guest.id,
      apartmentId: apartment.id,
      checkIn,
      checkOut,
      guestCount: 1 + Math.floor(rnd() * Math.max(1, apartment.maxGuests - 1)),
      nightlyRate: apartment.nightlyRate,
      nights,
      totalAmount: total,
      discount: 0,
      status: spec.status,
      paymentStatus: 'unpaid',
      source: spec.source,
      arrivalTime: spec.arrivalTime ?? '14:00',
      notes: spec.notes ?? '',
      createdAt,
      updatedAt: createdAt,
      createdBy: spec.source === 'website' ? 'st-2' : spec.source === 'walk_in' ? 'st-3' : 'st-2',
      checkedInAt: spec.status === 'checked_in' || spec.status === 'checked_out' ? ISO_DATE(checkIn, '14:20') : null,
      checkedOutAt: spec.status === 'checked_out' ? ISO_DATE(checkOut, '09:40') : null,
      cancelledAt: spec.status === 'cancelled' ? ISO_DATE(iso(today, Math.max(spec.in - 1, -40)), '11:35') : null,
      cancellationReason: spec.cancellationReason ?? null,
      history: [
        { at: createdAt, by: 'Joseph Mwanza', label: 'Reservation created', detail: `Source: ${spec.source.replace(/_/g, ' ')}` },
        ...(spec.history ?? []).map((h) => ({
          at: ISO_DATE(iso(today, h.offset), '10:15'),
          by: 'Joseph Mwanza',
          label: h.label,
          detail: h.detail,
        })),
      ],
    };
    if (spec.status === 'cancelled') {
      r.history.unshift({
        at: r.cancelledAt!,
        by: 'Alice Chanda',
        label: 'Cancelled',
        detail: spec.cancellationReason ?? 'Guest requested cancellation',
      });
    }
    if (spec.status === 'checked_in') {
      r.history.unshift({ at: r.checkedInAt!, by: 'Ruth Sinkala', label: 'Checked in', detail: 'Keys issued: 2 · Parking bay confirmed' });
    }

    for (const p of spec.paid ?? []) {
      const amount = Math.round(total * p.pct);
      const paidDate = iso(today, p.offset);
      payments.push({
        id: `pay-${String(paymentSeq++).padStart(4, '0')}`,
        reservationId: r.id,
        amount,
        method: p.method,
        kind: p.kind,
        reference: p.reference ?? (p.method === 'cash' ? `CASH-${reference.slice(-4)}` : mobileRef(p.method === 'airtel_money' ? 'airtel' : 'mtn', rnd)),
        paidAt: paidDate,
        recordedBy: 'st-2',
        recordedByName: 'Joseph Mwanza',
        verificationStatus: p.verified === false ? 'pending' : 'verified',
        verifiedBy: 'Alice Chanda',
        verifiedAt: ISO_DATE(paidDate, '12:05'),
        verificationNote: p.method === 'cash' ? 'Counted and reconciled with the drawer.' : 'Provider reference located in the banked-funds report.',
        proof: null,
        note: p.kind === 'deposit' ? `${Math.round(p.pct * 100)}% deposit per booking policy.` : '',
        createdAt: ISO_DATE(paidDate, '11:48'),
      });
    }

    if (spec.pendingProof) {
      const amount = Math.round(total * spec.pendingProof.pct);
      payments.push({
        id: `pay-${String(paymentSeq++).padStart(4, '0')}`,
        reservationId: r.id,
        amount,
        method: spec.pendingProof.method,
        kind: 'deposit',
        reference: 'awaiting confirmation',
        paidAt: today,
        recordedBy: 'st-3',
        recordedByName: 'Ruth Sinkala',
        verificationStatus: 'pending',
        verifiedBy: null,
        verifiedAt: null,
        verificationNote: '',
        proof: {
          fileName: spec.pendingProof.fileName,
          mimeType: 'image/jpeg',
          dataUrl: '',
          uploadedAt: ISO_DATE(today, '09:05'),
          uploadedBy: 'Ruth Sinkala',
          sizeBytes: 246_118,
        },
        note: 'Guest sent a screenshot of the Airtel confirmation SMS over WhatsApp.',
        createdAt: ISO_DATE(today, '09:06'),
      });
      r.history.unshift({ at: ISO_DATE(today, '09:06'), by: 'Ruth Sinkala', label: 'Proof of payment uploaded', detail: `K${amount.toLocaleString('en-US')} deposit awaiting verification` });
    }

    // a refund trail on the cancelled October stay
    if (spec.in === -9 && spec.status === 'cancelled') {
      const dep = payments.find((p) => p.reservationId === r.id);
      if (dep) {
        payments.push({
          id: `pay-${String(paymentSeq++).padStart(4, '0')}`,
          reservationId: r.id,
          amount: dep.amount,
          method: 'airtel_money',
          kind: 'refund',
          reference: `RF-${mobileRef('airtel', rnd)}`,
          paidAt: iso(today, -8),
          recordedBy: 'st-1',
          recordedByName: 'Alice Chanda',
          verificationStatus: 'verified',
          verifiedBy: 'Alice Chanda',
          verifiedAt: ISO_DATE(iso(today, -8), '15:20'),
          verificationNote: 'Refunded to the originating Airtel number; confirmation SMS filed.',
          proof: null,
          note: 'No-show refund authorised by the owner.',
          createdAt: ISO_DATE(iso(today, -8), '15:12'),
        });
      }
    }

    push(r);
  };

  CORE_STAYS.forEach(buildCore);

  /* ------------------------------------------- procedural occupancy (reports + charts) */

  const occupiedByApartment = new Map<string, Set<string>>();
  const mark = (apartmentId: string, from: string, to: string) => {
    const set = occupiedByApartment.get(apartmentId) ?? new Set<string>();
    for (const d of eachISO(from, addISO(to, -1))) set.add(d);
    occupiedByApartment.set(apartmentId, set);
  };
  for (const r of reservations) if (r.status !== 'cancelled' && r.status !== 'inquiry') mark(r.apartmentId, r.checkIn, r.checkOut);

  const OCCUPIED_TONIGHT = new Set(['apt-1', 'apt-2', 'apt-3', 'apt-5', 'apt-7', 'apt-8', 'apt-11', 'apt-12']);
  const freeOn = (apartmentId: string, dates: string[]) => dates.every((d) => !occupiedByApartment.get(apartmentId)?.has(d));

  let fillerIdx = 100;
  let generatedSeq = 400;

  const monthAnchor = parseISO(today);
  const monthKey = today.slice(0, 7);
  const anchors: { from: string; to: string; targetPct: number; isCurrent: boolean }[] = [];
  for (let i = PAST_MONTH_TARGETS.length; i >= 1; i -= 1) {
    const d = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    anchors.push({ from: format(d, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd'), targetPct: PAST_MONTH_TARGETS[PAST_MONTH_TARGETS.length - i], isCurrent: false });
  }
  {
    const start = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    const end = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0);
    anchors.push({ from: format(start, 'yyyy-MM-dd'), to: format(end, 'yyyy-MM-dd'), targetPct: MONTHLY_OCCUPANCY_TARGET, isCurrent: true });
  }
  // forward window so the calendar is not empty straight after month end
  const forwardFrom = iso(anchors[anchors.length - 1].to, 1);
  const forwardTo = iso(today, 21);
  if (forwardTo > forwardFrom) {
    anchors.push({ from: forwardFrom, to: forwardTo, targetPct: 46, isCurrent: false });
  }

  for (const anchor of anchors) {
    const dates = eachISO(anchor.from, anchor.to);
    const targetNights = Math.round((dates.length * apartments.length * anchor.targetPct) / 100);

    const nightsInAnchor = (aptId: string) => {
      const set = occupiedByApartment.get(aptId);
      return set ? dates.filter((d) => set.has(d)).length : 0;
    };
    let sold = apartments.reduce((sum, a) => sum + nightsInAnchor(a.id), 0);

    /**
     * A date is placeable when nothing is on it and it is not tonight (tonight is
     * owned by the hand-authored picture above). Runs that would end on the eve of
     * today are trimmed so the generator never invents a departure on today's date.
     */
    const runsFor = (aptId: string) => {
      const set = occupiedByApartment.get(aptId) ?? new Set<string>();
      const placeable = dates.filter((d) => d !== today && !set.has(d));
      const runs: string[][] = [];
      let current: string[] = [];
      for (const d of placeable) {
        if (current.length && dayDiff(current[current.length - 1], d) === 1) current.push(d);
        else {
          if (current.length) runs.push(current);
          current = [d];
        }
      }
      if (current.length) runs.push(current);
      return runs
        .map((run) => (run[run.length - 1] === addISO(today, -1) ? run.slice(0, -1) : run))
        .filter((run) => run.length > 0);
    };

    let pass = 0;
    while (sold < targetNights && pass < 40) {
      pass += 1;
      let placedAny = false;
      const order = [...apartments].sort((a, b) => nightsInAnchor(a.id) - nightsInAnchor(b.id));
      for (const apt of order) {
        if (sold >= targetNights) break;
        const runs = runsFor(apt.id).sort((a, b) => b.length - a.length);
        if (!runs.length) continue;
        const run = runs[0];
        const remaining = targetNights - sold;
        const desired = (anchor.isCurrent ? 2 : 3) + Math.floor(rnd() * (anchor.isCurrent ? 5 : 6));
        const length = Math.max(1, Math.min(desired, run.length, remaining));
        const maxStart = Math.max(0, run.length - length);
        const startIdx = Math.floor(rnd() * (maxStart + 1));
        const windowDates = run.slice(startIdx, startIdx + length);
        if (windowDates.length !== length) continue;

        const from = windowDates[0];
        const to = iso(from, length);
        const guest = guests[Math.floor(rnd() * guests.length)];
        const nights = length;
        const total = nights * apt.nightlyRate;
        const sourcePool: BookingSource[] = ['website', 'whatsapp', 'phone', 'corporate', 'walk_in', 'travel_agent', 'email'];
        const source = sourcePool[Math.floor(rnd() * sourcePool.length)];
        const seq = generatedSeq++;
        const reference = referenceFor(from.slice(0, 4), seq);
        const createdAt = ISO_DATE(iso(from, -Math.ceil(rnd() * 9) - 1), '09:30');
        const id = `rv-gen-${fillerIdx++}`;

        const inThePast = from < today;
        const status: BookingStatus = inThePast
          ? to <= today
            ? 'checked_out'
            : windowDates.some((d) => d >= today)
              ? 'reserved'
              : 'checked_out'
          : rnd() > 0.45
            ? 'fully_paid'
            : 'reserved';

        const r: Reservation = {
          id,
          reference,
          guestId: guest.id,
          apartmentId: apt.id,
          checkIn: from,
          checkOut: to,
          guestCount: 1 + Math.floor(rnd() * Math.max(1, apt.maxGuests - 1)),
          nightlyRate: apt.nightlyRate,
          nights,
          totalAmount: total,
          discount: 0,
          status,
          paymentStatus: 'unpaid',
          source,
          arrivalTime: '14:00',
          notes: '',
          createdAt,
          updatedAt: createdAt,
          createdBy: 'st-2',
          checkedInAt: status === 'checked_out' ? ISO_DATE(from, '15:10') : null,
          checkedOutAt: status === 'checked_out' ? ISO_DATE(to, '09:20') : null,
          cancelledAt: null,
          cancellationReason: null,
          history: [{ at: createdAt, by: 'Joseph Mwanza', label: 'Reservation created', detail: `Source: ${source.replace(/_/g, ' ')}` }],
        };
        reservations.push(r);
        mark(apt.id, from, to);

        const method = (fallback: PaymentMethod): PaymentMethod => {
          if (source === 'walk_in') return 'cash';
          if (source === 'corporate' || source === 'travel_agent') return 'bank_transfer';
          return rnd() > 0.5 ? fallback : 'airtel_money';
        };
        const referenceForMethod = (m: PaymentMethod) =>
          m === 'cash'
            ? `CASH-${String(seq).padStart(4, '0')}`
            : m === 'bank_transfer'
              ? `ZAN-EFT-${4400000 + paymentSeq}`
              : mobileRef(m === 'airtel_money' ? 'airtel' : 'mtn', rnd);

        const recordPayment = (amount: number, kind: Payment['kind'], day: string, m: PaymentMethod) => {
          if (amount <= 0) return;
          payments.push({
            id: `pay-gen-${paymentSeq++}`,
            reservationId: id,
            amount,
            method: m,
            kind,
            reference: referenceForMethod(m),
            paidAt: day,
            recordedBy: 'st-2',
            recordedByName: 'Joseph Mwanza',
            verificationStatus: 'verified',
            verifiedBy: 'Alice Chanda',
            verifiedAt: ISO_DATE(day, kind === 'deposit' ? '11:20' : '16:40'),
            verificationNote:
              m === 'cash'
                ? 'Drawer count reconciled at shift close.'
                : 'Reconciled against the provider reference on the banked-funds report.',
            proof: null,
            note: kind === 'deposit' ? '50% deposit per booking policy.' : '',
            createdAt: ISO_DATE(day, kind === 'deposit' ? '11:02' : '16:12'),
          });
        };

        // Money is banked on the day a real front desk would take it: balances at
        // departure, pre-paid stays on arrival day, deposits a few days ahead.
        if (status === 'checked_out') {
          recordPayment(total, 'final_settlement', to, method('mtn_money'));
        } else if (status === 'fully_paid') {
          recordPayment(total, 'final_settlement', from, method('bank_transfer'));
        } else if (rnd() > 0.35) {
          recordPayment(Math.round(total * 0.5), 'deposit', iso(from, -3), method('airtel_money'));
        }

        placedAny = true;
        sold += length;
        if (sold >= targetNights) break;
      }
      if (!placedAny) break;
    }
  }

  /* ------------------------------------------------ revenue reconciliation for the month */

  /**
   * The owner brief quotes K48,500 banked this month. Rather than hardcoding that
   * into a card, the generator reconciles the ledger to it: receipts that landed
   * late are booked into the prior month, and any shortfall is settled on account
   * against the largest open folios. Everything the dashboard then shows is real
   * arithmetic over these rows.
   */
  /** Verified money on a folio, net of refunds — mirrors `financialsFor`. */
  const netVerified = (id: string) => {
    let banked = 0;
    let refunded = 0;
    for (const p of payments) {
      if (p.reservationId !== id || p.verificationStatus !== 'verified') continue;
      if (p.kind === 'refund') refunded += p.amount;
      else banked += p.amount;
    }
    return banked - refunded;
  };

  const balanceOf = (id: string) => {
    const r = reservations.find((x) => x.id === id)!;
    return Math.max(0, r.totalAmount - netVerified(id));
  };

  const monthPrefix = monthKey;
  const verifiedInMonth = () =>
    payments
      .filter((p) => p.verificationStatus === 'verified' && p.paidAt.startsWith(monthPrefix))
      .reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);

  const prevMonthEnd = iso(`${monthPrefix}-01`, -1);
  let delta = MONTHLY_REVENUE_TARGET - verifiedInMonth();

  if (delta < 0) {
    const movable = payments
      .filter(
        (p) =>
          p.verificationStatus === 'verified' &&
          p.kind !== 'refund' &&
          p.paidAt.startsWith(monthPrefix) &&
          p.id.startsWith('pay-gen-'),
      )
      .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
    for (const p of movable) {
      if (delta >= 0) break;
      p.paidAt = prevMonthEnd;
      p.verifiedAt = ISO_DATE(prevMonthEnd, '17:30');
      p.note = `${p.note ? p.note + ' ' : ''}Settled late — banked on the last business day of the previous month.`;
      delta = MONTHLY_REVENUE_TARGET - verifiedInMonth();
    }
  }

  if (delta > 0) {
    const open = reservations
      .filter((r) => ['checked_in', 'reserved', 'fully_paid'].includes(r.status))
      .sort((a, b) => b.totalAmount - a.totalAmount);
    for (const r of open) {
      if (delta <= 0) break;
      const amount = Math.min(delta, balanceOf(r.id));
      if (amount < 50) continue;
      payments.push({
        id: `pay-gen-${paymentSeq++}`,
        reservationId: r.id,
        amount,
        method: 'bank_transfer',
        kind: 'part_payment',
        reference: `ZAN-EFT-${4480000 + paymentSeq}`,
        paidAt: today,
        recordedBy: 'st-1',
        recordedByName: 'Alice Chanda',
        verificationStatus: 'verified',
        verifiedBy: 'Alice Chanda',
        verifiedAt: ISO_DATE(today, '13:12'),
        verificationNote: 'Statement line located and initialled by the manager on duty.',
        proof: null,
        note: 'Account settlement received against the monthly statement.',
        createdAt: ISO_DATE(today, '13:04'),
      });
      r.history.unshift({
        at: ISO_DATE(today, '13:04'),
        by: 'Alice Chanda',
        label: 'Part payment banked',
        detail: `K${amount.toLocaleString('en-US')} received on account`,
      });
      delta -= amount;
    }
  }

  /* --------------------------------------------------------------------- housekeeping */

  const cleaners = staff.filter((s) => s.role === 'cleaner' && s.active);
  const housekeeping: HousekeepingTask[] = [];
  const cleaningState: Database['cleaningState'] = {};
  for (const apt of apartments) cleaningState[apt.id] = { status: 'clean', updatedAt: ISO_DATE(iso(today, -1), '11:00'), note: '' };

  const turnovers = reservations.filter(
    (r) => r.status === 'checked_out' && dayDiff(r.checkOut, today) >= 0 && dayDiff(r.checkOut, today) <= 1,
  );
  turnovers.forEach((r, i) => {
    const cleaner = cleaners[i % cleaners.length];
    housekeeping.push({
      id: `hk-${1000 + i}`,
      apartmentId: r.apartmentId,
      reservationId: r.id,
      type: 'turnover',
      status: 'clean',
      assignedTo: cleaner.id,
      date: r.checkOut,
      dueTime: '12:30',
      priority: 'normal',
      instructions: 'Standard turnover: linen, towels, kitchen, vacuum, amenity top-up.',
      notes: [{ at: ISO_DATE(r.checkOut, '11:15'), by: cleaner.id, byName: cleaner.name, text: 'Done. Bin liners replaced, kettle descaled.' }],
      createdAt: ISO_DATE(r.checkOut, '09:45'),
      createdBy: 'st-2',
      startedAt: ISO_DATE(r.checkOut, '10:05'),
      completedAt: ISO_DATE(r.checkOut, '11:12'),
      completedBy: cleaner.id,
      durationMinutes: 67,
    });
    cleaningState[r.apartmentId] = { status: 'clean', updatedAt: ISO_DATE(r.checkOut, '11:12'), note: `Turnover completed by ${cleaner.name}.` };
  });

  // The two departures from today that reception has not yet closed in the system.
  const pendingDeparture = reservations.find((r) => r.checkOut === today && r.status === 'checked_in');
  if (pendingDeparture) {
    housekeeping.push({
      id: 'hk-2001',
      apartmentId: pendingDeparture.apartmentId,
      reservationId: pendingDeparture.id,
      type: 'turnover',
      status: 'needs_cleaning',
      assignedTo: 'st-4',
      date: today,
      dueTime: '14:00',
      priority: 'high',
      instructions: 'Priority turnover — the suite is resold tomorrow. Bath and mirror first.',
      notes: [{ at: ISO_DATE(today, '10:12'), by: 'st-2', byName: 'Joseph Mwanza', text: 'Guest left at 10:00. Two bags of washing on the patio — store at reception, do not move into the linen room.' }],
      createdAt: ISO_DATE(today, '10:12'),
      createdBy: 'st-2',
      startedAt: null,
      completedAt: null,
      completedBy: null,
      durationMinutes: null,
    });
    cleaningState[pendingDeparture.apartmentId] = { status: 'needs_cleaning', updatedAt: ISO_DATE(today, '10:12'), note: 'Departed this morning, turnover pending.' };
  }

  const tomorrow = iso(today, 1);
  const nextArrivals = reservations.filter((r) => r.checkIn === tomorrow && r.status !== 'cancelled' && r.status !== 'inquiry');
  nextArrivals.forEach((r, i) => {
    if (cleaningState[r.apartmentId]?.status === 'needs_cleaning') return;
    housekeeping.push({
      id: `hk-3${String(i).padStart(3, '0')}`,
      apartmentId: r.apartmentId,
      reservationId: r.id,
      type: 'pre_arrival',
      status: 'clean',
      assignedTo: cleaners[(i + 1) % cleaners.length].id,
      date: today,
      dueTime: '16:30',
      priority: 'normal',
      instructions: 'Pre-arrival inspection: welcome tray, water, linen fold, A/C on cooling at 18:00.',
      notes: [],
      createdAt: ISO_DATE(today, '07:20'),
      createdBy: 'st-4',
      startedAt: null,
      completedAt: ISO_DATE(today, '09:40'),
      completedBy: cleaners[(i + 1) % cleaners.length].id,
      durationMinutes: 35,
    });
  });

  // Open maintenance on the penthouse split unit.
  housekeeping.push({
    id: 'hk-4001',
    apartmentId: 'apt-12',
    reservationId: null,
    type: 'maintenance',
    status: 'maintenance',
    assignedTo: 'st-5',
    date: today,
    dueTime: '17:00',
    priority: 'high',
    instructions: 'Bedroom split-unit A/C trips after about 40 minutes. Technician attending Thursday morning. Hold the unit against new sales until sign-off — the three existing November bookings stand, and the guest in residence has been offered a portable unit and K150 of credit.',
    notes: [
      { at: ISO_DATE(iso(today, -1), '19:22'), by: 'st-5', byName: 'Peter Chisala', text: 'Guest in Apt 12 reported the unit cutting out. Reset at the board fixed it for one night.' },
      { at: ISO_DATE(today, '07:35'), by: 'st-4', byName: 'Mary Gondwe', text: 'Tripped again overnight. Log a call-out with Refrigeration Solutions (quote K850) and keep the unit off sale for new arrivals.' },
    ],
    createdAt: ISO_DATE(today, '07:35'),
    createdBy: 'st-4',
    startedAt: null,
    completedAt: null,
    completedBy: null,
    durationMinutes: null,
  });
  cleaningState['apt-12'] = { status: 'maintenance', updatedAt: ISO_DATE(today, '07:35'), note: 'A/C fault — blocked to new bookings until sign-off.' };

  // Scheduled turnovers for the next five departures.
  const upcomingDepartures = reservations
    .filter((r) => r.checkOut > today && dayDiff(today, r.checkOut) <= 4 && (r.status === 'checked_in' || r.status === 'reserved' || r.status === 'fully_paid'))
    .sort((a, b) => (a.checkOut < b.checkOut ? -1 : 1))
    .slice(0, 5);
  upcomingDepartures.forEach((r, i) => {
    housekeeping.push({
      id: `hk-5${String(i).padStart(3, '0')}`,
      apartmentId: r.apartmentId,
      reservationId: r.id,
      type: 'turnover',
      status: 'needs_cleaning',
      assignedTo: null,
      date: r.checkOut,
      dueTime: '13:00',
      priority: 'normal',
      instructions: 'Turnover after departure, then pre-arrival check.',
      notes: [],
      createdAt: ISO_DATE(today, '06:30'),
      createdBy: 'st-4',
      startedAt: null,
      completedAt: null,
      completedBy: null,
      durationMinutes: null,
    });
  });

  /* -------------------------------------------------------------------- notifications */

  const notifications: NotificationRecord[] = [];
  let noteSeq = 1;
  const notify = (input: Omit<NotificationRecord, 'id' | 'createdAt' | 'deliveryStatus' | 'deliveryDetail' | 'markedDeliveredAt' | 'markedDeliveredBy' | 'readAt' | 'createdAutomatically'> & { at: string; delivery?: NotificationRecord['deliveryStatus'] }) => {
    const { at, delivery, ...rest } = input;
    notifications.push({
      id: `nt-${String(noteSeq++).padStart(3, '0')}`,
      createdAt: at,
      deliveryStatus: delivery ?? 'not_connected',
      deliveryDetail:
        delivery === 'delivered_manually'
          ? 'Staff confirmed the send from WhatsApp Business on the reception handset.'
          : delivery === 'failed'
            ? 'Rejected by the handset — number is no longer on WhatsApp.'
            : 'No messaging provider is connected. The message is drafted and ready to send manually.',
      markedDeliveredAt: delivery === 'delivered_manually' ? at : null,
      markedDeliveredBy: delivery === 'delivered_manually' ? 'Joseph Mwanza' : null,
      readAt: null,
      createdAutomatically: true,
      ...rest,
    });
  };

  const dayName = (d: string) => format(parseISO(d), 'd MMMM');
  const guestOf = (r: Reservation) => guests.find((g) => g.id === r.guestId)!;

  for (const r of reservations.filter((x) => x.checkIn >= iso(today, -1) && x.checkIn <= iso(today, 6) && x.status !== 'cancelled' && x.status !== 'inquiry').slice(0, 8)) {
    const g = guestOf(r);
    const apt = apartments.find((a) => a.id === r.apartmentId)!;
    const balanceDue = Math.max(0, r.totalAmount - netVerified(r.id));
    notify({
      event: 'booking_confirmation',
      channel: 'whatsapp',
      title: `Booking confirmed · ${r.reference}`,
      body: `Hello ${g.fullName.split(' ')[0]}, your booking at Lemma Heights is confirmed. Apartment ${apt.number} (${apt.name}), ${r.nights} night${r.nights > 1 ? 's' : ''} from ${dayName(r.checkIn)} to ${dayName(r.checkOut)}. Check-in from ${DEFAULT_SETTINGS.booking.checkInTime}, check-out by ${DEFAULT_SETTINGS.booking.checkOutTime}. ${balanceDue > 0 ? `Balance due on arrival: K${balanceDue.toLocaleString('en-US')}.` : 'Paid in full — no balance due.'} Reply STOP to opt out.`,
      recipientName: g.fullName,
      recipientContact: g.phone,
      guestId: g.id,
      reservationId: r.id,
      apartmentId: apt.id,
      scheduledFor: null,
      at: ISO_DATE(r.createdAt.slice(0, 10), '08:05'),
      delivery: 'delivered_manually',
    });
  }

  for (const r of reservations.filter((x) => x.checkIn === tomorrow)) {
    const g = guestOf(r);
    notify({
      event: 'checkin_reminder',
      channel: 'sms',
      title: `Check-in reminder · ${r.reference}`,
      body: `Hello ${g.fullName.split(' ')[0]}, a reminder that your stay at Lemma Heights begins tomorrow, ${dayName(r.checkIn)}. Reception is staffed until 22:00 and late arrivals can be accommodated. Reply with any changes.`,
      recipientName: g.fullName,
      recipientContact: g.phone,
      guestId: g.id,
      reservationId: r.id,
      apartmentId: r.apartmentId,
      scheduledFor: ISO_DATE(today, '17:00'),
      at: ISO_DATE(today, '06:00'),
    });
  }

  if (pendingDeparture) {
    const g = guestOf(pendingDeparture);
    notify({
      event: 'checkout_reminder',
      channel: 'whatsapp',
      title: `Check-out due today · ${pendingDeparture.reference}`,
      body: `Good morning ${g.fullName.split(' ')[0]}, a friendly note that check-out is by ${DEFAULT_SETTINGS.booking.checkOutTime} today. Reception can hold your luggage, and an invoice is ready if you need it before you travel.`,
      recipientName: g.fullName,
      recipientContact: g.phone,
      guestId: g.id,
      reservationId: pendingDeparture.id,
      apartmentId: pendingDeparture.apartmentId,
      scheduledFor: null,
      at: ISO_DATE(today, '07:15'),
    });
  }

  const john = reservations.find((r) => r.guestId === 'gu-001');
  if (john) {
    notify({
      event: 'balance_reminder',
      channel: 'whatsapp',
      title: `Balance due before arrival · ${john.reference}`,
      body: `Hello John, your apartment booking has been confirmed. Your check-in date is ${dayName(john.checkIn)} and check-out is ${dayName(john.checkOut)}. The deposit of K1,800 is banked and the balance of K1,800 can be settled on arrival in cash or by mobile money. Thank you for choosing us.`,
      recipientName: 'John Banda',
      recipientContact: '+260 977 415 208',
      guestId: john.guestId,
      reservationId: john.id,
      apartmentId: john.apartmentId,
      scheduledFor: null,
      at: ISO_DATE(today, '08:40'),
    });
  }

  const pendingFolio = reservations.find((r) => r.apartmentId === 'apt-6' && r.checkIn === tomorrow);
  const pendingPayment = payments.find((p) => p.reservationId === pendingFolio?.id && p.verificationStatus === 'pending');
  if (pendingFolio && pendingPayment) {
    notify({
      event: 'payment_received',
      channel: 'in_app',
      title: 'Proof of payment awaiting verification',
      body: `Ruth Sinkala recorded a K${pendingPayment.amount.toLocaleString('en-US')} ${pendingPayment.method === 'airtel_money' ? 'Airtel Money' : 'MTN MoMo'} deposit against ${pendingFolio.reference} (Studio Apartment, arrival tomorrow) and attached the confirmation screenshot. Verify or reject it in Payments — the folio stays unpaid until an authorised user signs it off.`,
      recipientName: 'Front office',
      recipientContact: 'in-app',
      guestId: pendingFolio.guestId,
      reservationId: pendingFolio.id,
      apartmentId: 'apt-6',
      scheduledFor: null,
      at: ISO_DATE(today, '09:07'),
    });
  }

  notify({
    event: 'cleaning_assigned',
    channel: 'sms',
    title: 'Cleaning job assigned',
    body: 'Apt 9 Junior Suite — priority turnover, due 14:00. Assigned to Mary Gondwe. Suite is resold tomorrow, bath and mirror first.',
    recipientName: 'Mary Gondwe',
    recipientContact: '+260 966 733 118',
    guestId: null,
    reservationId: null,
    apartmentId: 'apt-9',
    scheduledFor: null,
    at: ISO_DATE(today, '10:14'),
  });

  notify({
    event: 'maintenance_reported',
    channel: 'in_app',
    title: 'Maintenance raised · Apt 12 Penthouse',
    body: 'Split-unit A/C in the bedroom trips after about 40 minutes. Unit is blocked to new arrivals from the 9th until Refrigeration Solutions signs off the repair (quoted K850).',
    recipientName: 'Facilities',
    recipientContact: 'in-app',
    guestId: null,
    reservationId: null,
    apartmentId: 'apt-12',
    scheduledFor: null,
    at: ISO_DATE(today, '07:36'),
  });

  if (notifications[0]) notifications[0].readAt = ISO_DATE(today, '08:30');

  /* --------------------------------------------------------------------------- assemble */

  const db: Database = {
    version: 1,
    seededOn: today,
    createdAt: ISO_DATE(today, '06:00'),
    updatedAt: ISO_DATE(today, '06:00'),
    apartments,
    housekeeping,
    cleaningState,
    guests,
    staff,
    reservations,
    payments,
    notifications,
    settings: DEFAULT_SETTINGS,
    sequences: { reservation: reservationSeq, receipt: receiptSeq },
    __today: today,
  };

  // Recompute every derived field so the ledger, folios and statuses agree exactly.
  for (const r of db.reservations) recomputeReservation(db, r.id);

  db.notifications.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return db;
}
