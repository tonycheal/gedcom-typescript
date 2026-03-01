import { buildTree, findChild, findChildren, GedcomNode } from './tree.js';
import type {
  Address,
  Association,
  ChangeDate,
  EventOrAttribute,
  ExactDate,
  Family,
  FamilyChildLink,
  FamilySummary,
  FamilySpouseLink,
  GedcomDate,
  GedcomFile,
  Header,
  Individual,
  IndividualSummary,
  LdsOrdinance,
  LdsOrdinanceStatus,
  MultimediaFile,
  MultimediaRecord,
  MultimediaRef,
  NameType,
  NoteRecord,
  NoteRef,
  ParseError,
  PersonalName,
  Place,
  ReferenceNumber,
  Repository,
  Restriction,
  Sex,
  Source,
  SourceCitation,
  Submission,
  Submitter,
  UnknownTag,
} from './types.js';

// ─── Month parsing ─────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

// ─── Date parsing ──────────────────────────────────────────────────

function parseExactDate(text: string): ExactDate | undefined {
  const parts = text.trim().split(/\s+/);
  if (parts.length === 0) return undefined;

  let calendar: ExactDate['calendar'];
  let idx = 0;

  // Check for calendar escape
  if (parts[idx]?.startsWith('@#D')) {
    const cal = parts[idx].replace(/@#D|@/g, '');
    const calMap: Record<string, ExactDate['calendar']> = {
      GREGORIAN: 'GREGORIAN', JULIAN: 'JULIAN', HEBREW: 'HEBREW', FRENCH_R: 'FRENCH_R',
    };
    calendar = calMap[cal] ?? 'UNKNOWN';
    idx++;
  }

  let day: number | undefined;
  let month: string | undefined;
  let year: number | undefined;
  let bc = false;

  const remaining = parts.slice(idx);

  if (remaining.length >= 3) {
    day = parseInt(remaining[0], 10);
    month = remaining[1].toUpperCase();
    year = parseInt(remaining[2], 10);
    if (remaining[3]?.toUpperCase() === 'B.C.') bc = true;
  } else if (remaining.length === 2) {
    if (remaining[0].toUpperCase() in MONTHS || remaining[0].length === 3) {
      month = remaining[0].toUpperCase();
      year = parseInt(remaining[1], 10);
    } else {
      day = parseInt(remaining[0], 10);
      month = remaining[1].toUpperCase();
    }
    if (remaining[2]?.toUpperCase() === 'B.C.') bc = true;
  } else if (remaining.length === 1) {
    year = parseInt(remaining[0], 10);
  }

  if (year === undefined || isNaN(year)) return undefined;

  const result: ExactDate = { year };
  if (calendar) result.calendar = calendar;
  if (day !== undefined && !isNaN(day)) result.day = day;
  if (month) result.month = month;
  if (bc) result.bc = true;
  return result;
}

function parseDate(value: string | undefined): GedcomDate | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;

  const upper = v.toUpperCase();

  // Phrase in parentheses
  if (v.startsWith('(') && v.endsWith(')')) {
    return { type: 'phrase', text: v.slice(1, -1) };
  }

  // Interpreted
  if (upper.startsWith('INT ')) {
    const parenIdx = v.indexOf('(');
    const dateStr = v.slice(4, parenIdx > 0 ? parenIdx : undefined).trim();
    const phrase = parenIdx > 0 ? v.slice(parenIdx + 1, v.lastIndexOf(')')) : '';
    const date = parseExactDate(dateStr);
    if (date) return { type: 'interpreted', date, original: phrase };
  }

  // Between
  if (upper.startsWith('BET ')) {
    const andIdx = upper.indexOf(' AND ');
    if (andIdx > 0) {
      const from = parseExactDate(v.slice(4, andIdx));
      const to = parseExactDate(v.slice(andIdx + 5));
      if (from && to) return { type: 'between', from, to };
    }
  }

  // From ... To
  if (upper.startsWith('FROM ')) {
    const toIdx = upper.indexOf(' TO ');
    if (toIdx > 0) {
      const from = parseExactDate(v.slice(5, toIdx));
      const to = parseExactDate(v.slice(toIdx + 4));
      if (from) return { type: 'from', from, to: to ?? undefined };
    } else {
      const from = parseExactDate(v.slice(5));
      if (from) return { type: 'from', from };
    }
  }

  // To (period end only)
  if (upper.startsWith('TO ') && !upper.startsWith('TO ')) {
    // This would never match, handle TO below
  }
  if (upper.startsWith('TO ')) {
    const to = parseExactDate(v.slice(3));
    if (to) return { type: 'to', to };
  }

  // Qualifiers
  const qualifiers: Array<[string, GedcomDate['type']]> = [
    ['ABT ', 'about'],
    ['CAL ', 'calculated'],
    ['EST ', 'estimated'],
    ['BEF ', 'before'],
    ['AFT ', 'after'],
  ];
  for (const [prefix, type] of qualifiers) {
    if (upper.startsWith(prefix)) {
      const date = parseExactDate(v.slice(prefix.length));
      if (date) return { type, date } as GedcomDate;
    }
  }

  // Plain exact date
  const date = parseExactDate(v);
  if (date) return { type: 'exact', date };

  // Fallback: treat as phrase
  return { type: 'phrase', text: v };
}

// ─── Shared sub-parsers ────────────────────────────────────────────

function parsePlace(node: GedcomNode): Place | undefined {
  const plac = findChild(node, 'PLAC');
  if (!plac) return undefined;

  const place: Place = { name: plac.value ?? '' };

  const form = findChild(plac, 'FORM');
  if (form?.value) place.form = form.value;

  const fone = findChildren(plac, 'FONE');
  if (fone.length > 0) {
    place.phoneticVariations = fone.map(f => ({
      value: f.value ?? '',
      type: findChild(f, 'TYPE')?.value ?? '',
    }));
  }

  const romn = findChildren(plac, 'ROMN');
  if (romn.length > 0) {
    place.romanizedVariations = romn.map(r => ({
      value: r.value ?? '',
      type: findChild(r, 'TYPE')?.value ?? '',
    }));
  }

  const mapNode = findChild(plac, 'MAP');
  if (mapNode) {
    const lat = findChild(mapNode, 'LATI')?.value;
    const lng = findChild(mapNode, 'LONG')?.value;
    if (lat && lng) {
      place.map = {
        latitude: parseCoordinate(lat),
        longitude: parseCoordinate(lng),
      };
    }
  }

  const notes = parseNoteRefs(plac);
  if (notes.length > 0) place.notes = notes;

  return place;
}

function parseCoordinate(value: string): number {
  const dir = value.charAt(0);
  const num = parseFloat(value.slice(1));
  return (dir === 'S' || dir === 'W') ? -num : num;
}

function parseAddress(node: GedcomNode): Address | undefined {
  const addr = findChild(node, 'ADDR');
  if (!addr) {
    // Check for phone/email/fax/www without ADDR block
    const phones = findChildren(node, 'PHON').map(p => p.value ?? '').filter(Boolean);
    const emails = findChildren(node, 'EMAIL').map(e => e.value ?? '').filter(Boolean);
    const faxes = findChildren(node, 'FAX').map(f => f.value ?? '').filter(Boolean);
    const www = findChildren(node, 'WWW').map(w => w.value ?? '').filter(Boolean);
    if (phones.length || emails.length || faxes.length || www.length) {
      const result: Address = {};
      if (phones.length) result.phones = phones;
      if (emails.length) result.emails = emails;
      if (faxes.length) result.faxes = faxes;
      if (www.length) result.www = www;
      return result;
    }
    return undefined;
  }

  const result: Address = {};
  if (addr.value) result.full = addr.value;

  const city = findChild(addr, 'CITY');
  if (city?.value) result.city = city.value;

  const state = findChild(addr, 'STAE');
  if (state?.value) result.state = state.value;

  const post = findChild(addr, 'POST');
  if (post?.value) result.postalCode = post.value;

  const country = findChild(addr, 'CTRY');
  if (country?.value) result.country = country.value;

  // Phone/email/fax/www are siblings of ADDR, not children
  const phones = findChildren(node, 'PHON').map(p => p.value ?? '').filter(Boolean);
  if (phones.length) result.phones = phones;

  const emails = findChildren(node, 'EMAIL').map(e => e.value ?? '').filter(Boolean);
  if (emails.length) result.emails = emails;

  const faxes = findChildren(node, 'FAX').map(f => f.value ?? '').filter(Boolean);
  if (faxes.length) result.faxes = faxes;

  const www = findChildren(node, 'WWW').map(w => w.value ?? '').filter(Boolean);
  if (www.length) result.www = www;

  return result;
}

function parseNoteRefs(node: GedcomNode): NoteRef[] {
  return findChildren(node, 'NOTE').map(n => {
    if (n.value?.startsWith('@')) {
      return { type: 'pointer' as const, xref: n.value };
    }
    return { type: 'inline' as const, text: n.value ?? '' };
  });
}

function parseMultimediaRefs(node: GedcomNode): MultimediaRef[] {
  return findChildren(node, 'OBJE').map(o => {
    if (o.value?.startsWith('@')) {
      return { type: 'pointer' as const, xref: o.value };
    }
    const files = findChildren(o, 'FILE').map(f => {
      const file: MultimediaFile = {
        file: f.value ?? '',
        format: findChild(f, 'FORM')?.value ?? '',
      };
      const formNode = findChild(f, 'FORM');
      const medi = formNode ? findChild(formNode, 'MEDI') : undefined;
      if (medi?.value) file.mediaType = medi.value;
      const titl = findChild(f, 'TITL');
      if (titl?.value) file.title = titl.value;
      return file;
    });
    const notes = parseNoteRefs(o);
    const result: MultimediaRef = { type: 'embedded', files };
    if (notes.length > 0) result.notes = notes;
    return result;
  });
}

function parseSourceCitations(node: GedcomNode): SourceCitation[] {
  return findChildren(node, 'SOUR').filter(s => s.value?.startsWith('@')).map(s => {
    const cit: SourceCitation = { source: s.value! };

    const page = findChild(s, 'PAGE');
    if (page?.value) cit.page = page.value;

    const data = findChild(s, 'DATA');
    if (data) {
      cit.data = {};
      const date = findChild(data, 'DATE');
      if (date?.value) cit.data.date = parseDate(date.value);
      const text = findChild(data, 'TEXT');
      if (text?.value) cit.data.text = text.value;
    }

    const quay = findChild(s, 'QUAY');
    if (quay?.value) {
      const q = parseInt(quay.value, 10);
      if (q >= 0 && q <= 3) cit.quality = q as 0 | 1 | 2 | 3;
    }

    const mm = parseMultimediaRefs(s);
    if (mm.length > 0) cit.multimedia = mm;

    const notes = parseNoteRefs(s);
    if (notes.length > 0) cit.notes = notes;

    return cit;
  });
}

function parseChangeDate(node: GedcomNode): ChangeDate | undefined {
  const chan = findChild(node, 'CHAN');
  if (!chan) return undefined;

  const dateNode = findChild(chan, 'DATE');
  if (!dateNode?.value) return undefined;

  const date = parseDate(dateNode.value);
  if (!date) return undefined;

  const result: ChangeDate = { date };
  const time = findChild(dateNode, 'TIME');
  if (time?.value) result.time = time.value;

  const notes = parseNoteRefs(chan);
  if (notes.length > 0) result.notes = notes;

  return result;
}

function parseReferenceNumbers(node: GedcomNode): ReferenceNumber[] {
  return findChildren(node, 'REFN').map(r => {
    const ref: ReferenceNumber = { value: r.value ?? '' };
    const type = findChild(r, 'TYPE');
    if (type?.value) ref.type = type.value;
    return ref;
  });
}

function parseRestriction(value: string | undefined): Restriction | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === 'confidential' || lower === 'locked' || lower === 'privacy') {
    return lower;
  }
  return undefined;
}

function parseEvent(node: GedcomNode): EventOrAttribute {
  const evt: EventOrAttribute = {};

  if (node.value && node.value !== 'Y') evt.value = node.value;

  const type = findChild(node, 'TYPE');
  if (type?.value) evt.type = type.value;

  const dateNode = findChild(node, 'DATE');
  if (dateNode?.value) evt.date = parseDate(dateNode.value);

  const place = parsePlace(node);
  if (place) evt.place = place;

  const address = parseAddress(node);
  if (address) evt.address = address;

  const agnc = findChild(node, 'AGNC');
  if (agnc?.value) evt.agency = agnc.value;

  const reli = findChild(node, 'RELI');
  if (reli?.value) evt.religion = reli.value;

  const caus = findChild(node, 'CAUS');
  if (caus?.value) evt.cause = caus.value;

  const resn = findChild(node, 'RESN');
  if (resn?.value) evt.restriction = parseRestriction(resn.value);

  const notes = parseNoteRefs(node);
  if (notes.length > 0) evt.notes = notes;

  const sources = parseSourceCitations(node);
  if (sources.length > 0) evt.sources = sources;

  const mm = parseMultimediaRefs(node);
  if (mm.length > 0) evt.multimedia = mm;

  // ADOP-specific
  if (node.tag === 'ADOP') {
    const famc = findChild(node, 'FAMC');
    if (famc) {
      const adop = findChild(famc, 'ADOP');
      if (adop?.value) {
        const adoptVal = adop.value.toUpperCase();
        if (adoptVal === 'HUSB' || adoptVal === 'WIFE' || adoptVal === 'BOTH') {
          evt.adoptedBy = adoptVal;
        }
      }
    }
  }

  return evt;
}

function parseUnknownTags(node: GedcomNode): UnknownTag[] {
  return node.children
    .filter(c => c.tag.startsWith('_'))
    .map(c => ({
      tag: c.tag,
      value: c.value,
      children: parseUnknownTags(c),
    }));
}

function parseLdsOrdinance(node: GedcomNode): LdsOrdinance {
  const ord: LdsOrdinance = {};

  const dateNode = findChild(node, 'DATE');
  if (dateNode?.value) ord.date = parseDate(dateNode.value);

  const temp = findChild(node, 'TEMP');
  if (temp?.value) ord.temple = temp.value;

  const place = parsePlace(node);
  if (place) ord.place = place;

  const stat = findChild(node, 'STAT');
  if (stat?.value) {
    const statusMap: Record<string, LdsOrdinanceStatus> = {
      CHILD: 'child', COMPLETED: 'completed', EXCLUDED: 'excluded',
      DNS: 'dns', 'DNS/CAN': 'dns/can', INFANT: 'infant',
      'PRE-1970': 'pre-1970', STILLBORN: 'stillborn',
      SUBMITTED: 'submitted', UNCLEARED: 'uncleared',
    };
    const s = statusMap[stat.value.toUpperCase()];
    if (s) ord.status = s;
  }

  const notes = parseNoteRefs(node);
  if (notes.length > 0) ord.notes = notes;

  const sources = parseSourceCitations(node);
  if (sources.length > 0) ord.sources = sources;

  return ord;
}

// ─── Record parsers ────────────────────────────────────────────────

function parsePersonalName(node: GedcomNode): PersonalName {
  const name: PersonalName = { value: node.value ?? '' };

  const type = findChild(node, 'TYPE');
  if (type?.value) {
    const typeMap: Record<string, NameType> = {
      aka: 'aka', birth: 'birth', immigrant: 'immigrant',
      maiden: 'maiden', married: 'married', nickname: 'nickname',
    };
    name.type = typeMap[type.value.toLowerCase()] ?? 'other';
  }

  const npfx = findChild(node, 'NPFX');
  if (npfx?.value) name.prefix = npfx.value;

  const givn = findChild(node, 'GIVN');
  if (givn?.value) name.given = givn.value;

  const nick = findChild(node, 'NICK');
  if (nick?.value) name.nickname = nick.value;

  const spfx = findChild(node, 'SPFX');
  if (spfx?.value) name.surnamePrefix = spfx.value;

  const surn = findChild(node, 'SURN');
  if (surn?.value) name.surname = surn.value;

  const nsfx = findChild(node, 'NSFX');
  if (nsfx?.value) name.suffix = nsfx.value;

  const fone = findChildren(node, 'FONE');
  if (fone.length > 0) {
    name.phonetic = fone.map(f => ({
      value: f.value ?? '',
      type: findChild(f, 'TYPE')?.value ?? '',
    }));
  }

  const romn = findChildren(node, 'ROMN');
  if (romn.length > 0) {
    name.romanized = romn.map(r => ({
      value: r.value ?? '',
      type: findChild(r, 'TYPE')?.value ?? '',
    }));
  }

  const sources = parseSourceCitations(node);
  if (sources.length > 0) name.sources = sources;

  const notes = parseNoteRefs(node);
  if (notes.length > 0) name.notes = notes;

  return name;
}

function parseIndividual(node: GedcomNode): Individual {
  const indi: Individual = {
    xref: node.xref ?? '',
    names: [],
    familiesAsChild: [],
    familiesAsSpouse: [],
  };

  const resn = findChild(node, 'RESN');
  if (resn?.value) indi.restriction = parseRestriction(resn.value);

  // Names
  indi.names = findChildren(node, 'NAME').map(parsePersonalName);

  // Sex
  const sex = findChild(node, 'SEX');
  if (sex?.value) {
    const s = sex.value.toUpperCase();
    if (s === 'M' || s === 'F' || s === 'X' || s === 'U') indi.sex = s as Sex;
  }

  // Individual events
  const parseOptEvent = (tag: string) => { const c = findChild(node, tag); return c ? parseEvent(c) : undefined; };
  const parseEventArray = (tag: string) => { const cs = findChildren(node, tag); return cs.length > 0 ? cs.map(parseEvent) : undefined; };

  indi.birth = parseOptEvent('BIRT');
  indi.christening = parseOptEvent('CHR');
  indi.death = parseOptEvent('DEAT');
  indi.burial = parseOptEvent('BURI');
  indi.cremation = parseOptEvent('CREM');
  indi.adoption = parseOptEvent('ADOP');
  indi.baptism = parseOptEvent('BAPM');
  indi.barMitzvah = parseOptEvent('BARM');
  indi.basMitzvah = parseOptEvent('BASM');
  indi.blessing = parseOptEvent('BLES');
  indi.adultChristening = parseOptEvent('CHRA');
  indi.confirmation = parseOptEvent('CONF');
  indi.firstCommunion = parseOptEvent('FCOM');
  indi.naturalization = parseOptEvent('NATU');
  indi.emigration = parseOptEvent('EMIG');
  indi.immigration = parseOptEvent('IMMI');
  indi.probate = parseOptEvent('PROB');
  indi.will = parseOptEvent('WILL');
  indi.graduation = parseOptEvent('GRAD');
  indi.retirement = parseOptEvent('RETI');
  indi.census = parseEventArray('CENS');
  indi.events = parseEventArray('EVEN');

  // Individual attributes
  indi.caste = parseOptEvent('CAST');
  indi.physicalDescription = parseOptEvent('DSCR');
  indi.education = parseOptEvent('EDUC');
  indi.nationalId = parseOptEvent('IDNO');
  indi.nationality = parseOptEvent('NATI');
  indi.childrenCount = parseOptEvent('NCHI');
  indi.marriageCount = parseOptEvent('NMR');
  indi.occupation = parseOptEvent('OCCU');
  indi.property = parseOptEvent('PROP');
  indi.religion = parseOptEvent('RELI');
  indi.socialSecurityNumber = parseOptEvent('SSN');
  indi.title = parseOptEvent('TITL');
  indi.residence = parseEventArray('RESI');
  indi.facts = parseEventArray('FACT');

  // Family links
  indi.familiesAsChild = findChildren(node, 'FAMC').map(f => {
    const link: FamilyChildLink = { family: f.value ?? '' };
    const pedi = findChild(f, 'PEDI');
    if (pedi?.value) {
      const val = pedi.value.toLowerCase();
      if (val === 'adopted' || val === 'birth' || val === 'foster' || val === 'sealing') {
        link.pedigree = val;
      }
    }
    const stat = findChild(f, 'STAT');
    if (stat?.value) link.status = stat.value;
    const notes = parseNoteRefs(f);
    if (notes.length > 0) link.notes = notes;
    return link;
  });

  indi.familiesAsSpouse = findChildren(node, 'FAMS').map(f => {
    const link: FamilySpouseLink = { family: f.value ?? '' };
    const notes = parseNoteRefs(f);
    if (notes.length > 0) link.notes = notes;
    return link;
  });

  // LDS ordinances
  const bapl = findChild(node, 'BAPL');
  if (bapl) indi.ldsBaptism = parseLdsOrdinance(bapl);
  const conl = findChild(node, 'CONL');
  if (conl) indi.ldsConfirmation = parseLdsOrdinance(conl);
  const endl = findChild(node, 'ENDL');
  if (endl) indi.ldsEndowment = parseLdsOrdinance(endl);
  const slgc = findChild(node, 'SLGC');
  if (slgc) indi.ldsSealingToParents = parseLdsOrdinance(slgc);

  // Submitters
  const subm = findChildren(node, 'SUBM').map(s => s.value ?? '').filter(Boolean);
  if (subm.length > 0) indi.submitters = subm;

  // Associations
  const asso = findChildren(node, 'ASSO');
  if (asso.length > 0) {
    indi.associations = asso.map(a => {
      const assoc: Association = {
        xref: a.value ?? '',
        relation: findChild(a, 'RELA')?.value ?? '',
      };
      const notes = parseNoteRefs(a);
      if (notes.length > 0) assoc.notes = notes;
      const sources = parseSourceCitations(a);
      if (sources.length > 0) assoc.sources = sources;
      return assoc;
    });
  }

  // Aliases
  const alia = findChildren(node, 'ALIA').map(a => a.value ?? '').filter(Boolean);
  if (alia.length > 0) indi.aliases = alia;

  // Ancestor/descendant interest
  const anci = findChildren(node, 'ANCI').map(a => a.value ?? '').filter(Boolean);
  if (anci.length > 0) indi.ancestorInterest = anci;
  const desi = findChildren(node, 'DESI').map(d => d.value ?? '').filter(Boolean);
  if (desi.length > 0) indi.descendantInterest = desi;

  // Reference numbers, RIN, change date
  const refns = parseReferenceNumbers(node);
  if (refns.length > 0) indi.referenceNumbers = refns;

  const rin = findChild(node, 'RIN');
  if (rin?.value) indi.recordId = rin.value;

  indi.changeDate = parseChangeDate(node);

  // Notes, sources, multimedia
  const notes = parseNoteRefs(node);
  if (notes.length > 0) indi.notes = notes;

  const sources = parseSourceCitations(node);
  if (sources.length > 0) indi.sources = sources;

  const mm = parseMultimediaRefs(node);
  if (mm.length > 0) indi.multimedia = mm;

  // Vendor extensions
  const ext = parseUnknownTags(node);
  if (ext.length > 0) indi.extensions = ext;

  return indi;
}

function parseFamily(node: GedcomNode): Family {
  const fam: Family = {
    xref: node.xref ?? '',
    children: [],
  };

  const resn = findChild(node, 'RESN');
  if (resn?.value) fam.restriction = parseRestriction(resn.value);

  const husb = findChild(node, 'HUSB');
  if (husb?.value) fam.husband = husb.value;

  const wife = findChild(node, 'WIFE');
  if (wife?.value) fam.wife = wife.value;

  fam.children = findChildren(node, 'CHIL').map(c => c.value ?? '').filter(Boolean);

  const nchi = findChild(node, 'NCHI');
  if (nchi?.value) fam.childrenCount = parseInt(nchi.value, 10);

  // Family events
  const parseFamEvent = (tag: string) => { const c = findChild(node, tag); return c ? parseEvent(c) : undefined; };
  const parseFamEventArray = (tag: string) => { const cs = findChildren(node, tag); return cs.length > 0 ? cs.map(parseEvent) : undefined; };

  fam.annulment = parseFamEvent('ANUL');
  fam.divorce = parseFamEvent('DIV');
  fam.divorceFiled = parseFamEvent('DIVF');
  fam.engagement = parseFamEvent('ENGA');
  fam.marriage = parseFamEvent('MARR');
  fam.marriageBanns = parseFamEvent('MARB');
  fam.marriageContract = parseFamEvent('MARC');
  fam.marriageLicense = parseFamEvent('MARL');
  fam.marriageSettlement = parseFamEvent('MARS');
  fam.census = parseFamEventArray('CENS');
  fam.events = parseFamEventArray('EVEN');

  // LDS
  const slgs = findChild(node, 'SLGS');
  if (slgs) fam.ldsSealingToSpouse = parseLdsOrdinance(slgs);

  // Submitters
  const subm = findChildren(node, 'SUBM').map(s => s.value ?? '').filter(Boolean);
  if (subm.length > 0) fam.submitters = subm;

  // Reference numbers, RIN, change date
  const refns = parseReferenceNumbers(node);
  if (refns.length > 0) fam.referenceNumbers = refns;

  const rin = findChild(node, 'RIN');
  if (rin?.value) fam.recordId = rin.value;

  fam.changeDate = parseChangeDate(node);

  const notes = parseNoteRefs(node);
  if (notes.length > 0) fam.notes = notes;

  const sources = parseSourceCitations(node);
  if (sources.length > 0) fam.sources = sources;

  const mm = parseMultimediaRefs(node);
  if (mm.length > 0) fam.multimedia = mm;

  const ext = parseUnknownTags(node);
  if (ext.length > 0) fam.extensions = ext;

  return fam;
}

function parseSource(node: GedcomNode): Source {
  const src: Source = { xref: node.xref ?? '' };

  // DATA sub-record
  const dataNode = findChild(node, 'DATA');
  if (dataNode) {
    src.data = {};
    const events = findChildren(dataNode, 'EVEN');
    if (events.length > 0) {
      src.data.events = events.map(e => {
        const evt: { types: string; date?: GedcomDate; place?: string } = {
          types: e.value ?? '',
        };
        const date = findChild(e, 'DATE');
        if (date?.value) evt.date = parseDate(date.value);
        const plac = findChild(e, 'PLAC');
        if (plac?.value) evt.place = plac.value;
        return evt;
      });
    }
    const agnc = findChild(dataNode, 'AGNC');
    if (agnc?.value) src.data.agency = agnc.value;
    const notes = parseNoteRefs(dataNode);
    if (notes.length > 0) src.data.notes = notes;
  }

  const auth = findChild(node, 'AUTH');
  if (auth?.value) src.author = auth.value;

  const titl = findChild(node, 'TITL');
  if (titl?.value) src.title = titl.value;

  const abbr = findChild(node, 'ABBR');
  if (abbr?.value) src.abbreviation = abbr.value;

  const publ = findChild(node, 'PUBL');
  if (publ?.value) src.publication = publ.value;

  const text = findChild(node, 'TEXT');
  if (text?.value) src.text = text.value;

  // Repository reference
  const repo = findChild(node, 'REPO');
  if (repo?.value) {
    src.repository = { repo: repo.value };
    const repoNotes = parseNoteRefs(repo);
    if (repoNotes.length > 0) src.repository.notes = repoNotes;
    const calns = findChildren(repo, 'CALN');
    if (calns.length > 0) {
      src.repository.callNumbers = calns.map(c => {
        const cn: { value: string; mediaType?: string } = { value: c.value ?? '' };
        const medi = findChild(c, 'MEDI');
        if (medi?.value) cn.mediaType = medi.value;
        return cn;
      });
    }
  }

  const refns = parseReferenceNumbers(node);
  if (refns.length > 0) src.referenceNumbers = refns;

  const rin = findChild(node, 'RIN');
  if (rin?.value) src.recordId = rin.value;

  src.changeDate = parseChangeDate(node);

  const notes = parseNoteRefs(node);
  if (notes.length > 0) src.notes = notes;

  const mm = parseMultimediaRefs(node);
  if (mm.length > 0) src.multimedia = mm;

  const ext = parseUnknownTags(node);
  if (ext.length > 0) src.extensions = ext;

  return src;
}

function parseRepository(node: GedcomNode): Repository {
  const repo: Repository = {
    xref: node.xref ?? '',
    name: findChild(node, 'NAME')?.value ?? '',
  };

  repo.address = parseAddress(node);

  const notes = parseNoteRefs(node);
  if (notes.length > 0) repo.notes = notes;

  const refns = parseReferenceNumbers(node);
  if (refns.length > 0) repo.referenceNumbers = refns;

  const rin = findChild(node, 'RIN');
  if (rin?.value) repo.recordId = rin.value;

  repo.changeDate = parseChangeDate(node);

  const ext = parseUnknownTags(node);
  if (ext.length > 0) repo.extensions = ext;

  return repo;
}

function parseNoteRecord(node: GedcomNode): NoteRecord {
  const note: NoteRecord = {
    xref: node.xref ?? '',
    text: node.value ?? '',
  };

  const sources = parseSourceCitations(node);
  if (sources.length > 0) note.sources = sources;

  const refns = parseReferenceNumbers(node);
  if (refns.length > 0) note.referenceNumbers = refns;

  const rin = findChild(node, 'RIN');
  if (rin?.value) note.recordId = rin.value;

  note.changeDate = parseChangeDate(node);

  const ext = parseUnknownTags(node);
  if (ext.length > 0) note.extensions = ext;

  return note;
}

function parseMultimediaRecord(node: GedcomNode): MultimediaRecord {
  const rec: MultimediaRecord = {
    xref: node.xref ?? '',
    files: findChildren(node, 'FILE').map(f => {
      const file: MultimediaFile = {
        file: f.value ?? '',
        format: findChild(f, 'FORM')?.value ?? '',
      };
      const formNode = findChild(f, 'FORM');
      if (formNode) {
        const medi = findChild(formNode, 'MEDI');
        if (medi?.value) file.mediaType = medi.value;
      }
      const titl = findChild(f, 'TITL');
      if (titl?.value) file.title = titl.value;
      return file;
    }),
  };

  const notes = parseNoteRefs(node);
  if (notes.length > 0) rec.notes = notes;

  const sources = parseSourceCitations(node);
  if (sources.length > 0) rec.sources = sources;

  const refns = parseReferenceNumbers(node);
  if (refns.length > 0) rec.referenceNumbers = refns;

  const rin = findChild(node, 'RIN');
  if (rin?.value) rec.recordId = rin.value;

  rec.changeDate = parseChangeDate(node);

  const ext = parseUnknownTags(node);
  if (ext.length > 0) rec.extensions = ext;

  return rec;
}

function parseSubmitter(node: GedcomNode): Submitter {
  const subm: Submitter = {
    xref: node.xref ?? '',
    name: findChild(node, 'NAME')?.value ?? '',
  };

  subm.address = parseAddress(node);

  const mm = parseMultimediaRefs(node);
  if (mm.length > 0) subm.multimedia = mm;

  const langs = findChildren(node, 'LANG').map(l => l.value ?? '').filter(Boolean);
  if (langs.length > 0) subm.languages = langs;

  const rfn = findChild(node, 'RFN');
  if (rfn?.value) subm.rfn = rfn.value;

  const refns = parseReferenceNumbers(node);
  if (refns.length > 0) subm.referenceNumbers = refns;

  const rin = findChild(node, 'RIN');
  if (rin?.value) subm.recordId = rin.value;

  subm.changeDate = parseChangeDate(node);

  const notes = parseNoteRefs(node);
  if (notes.length > 0) subm.notes = notes;

  const ext = parseUnknownTags(node);
  if (ext.length > 0) subm.extensions = ext;

  return subm;
}

function parseSubmission(node: GedcomNode): Submission {
  const subn: Submission = { xref: node.xref ?? '' };

  const subm = findChild(node, 'SUBM');
  if (subm?.value) subn.submitter = subm.value;

  const famf = findChild(node, 'FAMF');
  if (famf?.value) subn.familyFile = famf.value;

  const temp = findChild(node, 'TEMP');
  if (temp?.value) subn.temple = temp.value;

  const ance = findChild(node, 'ANCE');
  if (ance?.value) subn.ancestorGenerations = parseInt(ance.value, 10);

  const desc = findChild(node, 'DESC');
  if (desc?.value) subn.descendantGenerations = parseInt(desc.value, 10);

  const ordi = findChild(node, 'ORDI');
  if (ordi?.value) subn.ordinanceProcessFlag = ordi.value.toLowerCase() === 'yes' ? 'yes' : 'no';

  const rin = findChild(node, 'RIN');
  if (rin?.value) subn.recordId = rin.value;

  const notes = parseNoteRefs(node);
  if (notes.length > 0) subn.notes = notes;

  const ext = parseUnknownTags(node);
  if (ext.length > 0) subn.extensions = ext;

  return subn;
}

function parseHeader(node: GedcomNode): Header {
  const sourNode = findChild(node, 'SOUR');

  const header: Header = {
    sourceSystem: {
      id: sourNode?.value ?? '',
    },
    submitter: findChild(node, 'SUBM')?.value ?? '',
    gedcom: {
      version: '',
      form: 'LINEAGE-LINKED',
    },
    charset: {
      name: 'UTF-8',
    },
  };

  if (sourNode) {
    const vers = findChild(sourNode, 'VERS');
    if (vers?.value) header.sourceSystem.version = vers.value;

    const name = findChild(sourNode, 'NAME');
    if (name?.value) header.sourceSystem.name = name.value;

    const corp = findChild(sourNode, 'CORP');
    if (corp?.value) {
      header.sourceSystem.corporation = { name: corp.value };
      const addr = parseAddress(corp);
      if (addr) header.sourceSystem.corporation.address = addr;
    }

    const data = findChild(sourNode, 'DATA');
    if (data?.value) {
      header.sourceSystem.data = { name: data.value };
      const date = findChild(data, 'DATE');
      if (date?.value) header.sourceSystem.data.date = parseDate(date.value);
      const copr = findChild(data, 'COPR');
      if (copr?.value) header.sourceSystem.data.copyright = copr.value;
    }
  }

  const dest = findChild(node, 'DEST');
  if (dest?.value) header.destination = dest.value;

  const dateNode = findChild(node, 'DATE');
  if (dateNode?.value) {
    header.transmissionDate = parseDate(dateNode.value);
    const time = findChild(dateNode, 'TIME');
    if (time?.value) header.transmissionTime = time.value;
  }

  const subn = findChild(node, 'SUBN');
  if (subn?.value) header.submission = subn.value;

  const file = findChild(node, 'FILE');
  if (file?.value) header.file = file.value;

  const copr = findChild(node, 'COPR');
  if (copr?.value) header.copyright = copr.value;

  const gedc = findChild(node, 'GEDC');
  if (gedc) {
    const vers = findChild(gedc, 'VERS');
    if (vers?.value) header.gedcom.version = vers.value;
    const form = findChild(gedc, 'FORM');
    if (form?.value) header.gedcom.form = form.value;
  }

  const charNode = findChild(node, 'CHAR');
  if (charNode) {
    header.charset.name = charNode.value ?? 'UTF-8';
    const vers = findChild(charNode, 'VERS');
    if (vers?.value) header.charset.version = vers.value;
  }

  const lang = findChild(node, 'LANG');
  if (lang?.value) header.language = lang.value;

  const plac = findChild(node, 'PLAC');
  if (plac) {
    const form = findChild(plac, 'FORM');
    if (form?.value) header.placeForm = form.value;
  }

  const note = findChild(node, 'NOTE');
  if (note?.value) header.note = note.value;

  return header;
}

// ─── Index builders ────────────────────────────────────────────────

function displayName(indi: Individual): string {
  const name = indi.names[0];
  if (!name) return '(unknown)';
  return name.value.replace(/\//g, '').trim();
}

function extractYear(date: GedcomDate | undefined): number | undefined {
  if (!date) return undefined;
  if ('date' in date) return date.date.year;
  if ('from' in date) return date.from.year;
  return undefined;
}

function buildIndividualIndex(individuals: Map<string, Individual>): IndividualSummary[] {
  const index: IndividualSummary[] = [];
  for (const [xref, indi] of individuals) {
    const summary: IndividualSummary = {
      xref,
      name: displayName(indi),
    };
    const birthYear = extractYear(indi.birth?.date);
    if (birthYear) summary.birthYear = birthYear;
    const deathYear = extractYear(indi.death?.date);
    if (deathYear) summary.deathYear = deathYear;
    index.push(summary);
  }
  return index.sort((a, b) => a.name.localeCompare(b.name));
}

function buildFamilyIndex(
  families: Map<string, Family>,
  individuals: Map<string, Individual>,
): FamilySummary[] {
  const index: FamilySummary[] = [];
  for (const [xref, fam] of families) {
    const husbName = fam.husband ? displayName(individuals.get(fam.husband) ?? { xref: '', names: [], familiesAsChild: [], familiesAsSpouse: [] }) : undefined;
    const wifeName = fam.wife ? displayName(individuals.get(fam.wife) ?? { xref: '', names: [], familiesAsChild: [], familiesAsSpouse: [] }) : undefined;

    let label: string;
    if (husbName && wifeName) {
      label = `${husbName} & ${wifeName}`;
    } else if (husbName) {
      label = husbName;
    } else if (wifeName) {
      label = wifeName;
    } else {
      label = xref;
    }

    index.push({ xref, label });
  }
  return index.sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Main entry point ──────────────────────────────────────────────

export function readGedcom(input: string): GedcomFile {
  const { roots, errors } = buildTree(input);

  const parseErrors: ParseError[] = errors.map(e => ({
    line: e.line,
    text: e.text,
    message: e.message,
    type: 'malformed' as const,
  }));

  // Default header in case none found
  let header: Header = {
    sourceSystem: { id: '' },
    submitter: '',
    gedcom: { version: '5.5.5', form: 'LINEAGE-LINKED' },
    charset: { name: 'UTF-8' },
  };

  const individuals = new Map<string, Individual>();
  const families = new Map<string, Family>();
  const sources = new Map<string, Source>();
  const repositories = new Map<string, Repository>();
  const notes = new Map<string, NoteRecord>();
  const multimedia = new Map<string, MultimediaRecord>();
  const submitters = new Map<string, Submitter>();
  let submission: Submission | undefined;

  for (const root of roots) {
    switch (root.tag) {
      case 'HEAD':
        header = parseHeader(root);
        break;
      case 'INDI':
        if (root.xref) individuals.set(root.xref, parseIndividual(root));
        break;
      case 'FAM':
        if (root.xref) families.set(root.xref, parseFamily(root));
        break;
      case 'SOUR':
        if (root.xref) sources.set(root.xref, parseSource(root));
        break;
      case 'REPO':
        if (root.xref) repositories.set(root.xref, parseRepository(root));
        break;
      case 'NOTE':
        if (root.xref) notes.set(root.xref, parseNoteRecord(root));
        break;
      case 'OBJE':
        if (root.xref) multimedia.set(root.xref, parseMultimediaRecord(root));
        break;
      case 'SUBM':
        if (root.xref) submitters.set(root.xref, parseSubmitter(root));
        break;
      case 'SUBN':
        submission = parseSubmission(root);
        break;
      case 'TRLR':
        break;
      default:
        if (!root.tag.startsWith('_')) {
          parseErrors.push({
            line: root.lineNumber,
            text: `${root.level} ${root.xref ?? ''} ${root.tag} ${root.value ?? ''}`.trim(),
            message: `Unexpected top-level tag: ${root.tag}`,
            type: 'unexpected',
          });
        }
        break;
    }
  }

  return {
    header,
    individuals,
    families,
    sources,
    repositories,
    notes,
    multimedia,
    submitters,
    submission,
    individualIndex: buildIndividualIndex(individuals),
    familyIndex: buildFamilyIndex(families, individuals),
    parseErrors,
  };
}
