// ─── Cross-reference IDs ───────────────────────────────────────────

export type XRef = string;

// ─── Dates ─────────────────────────────────────────────────────────

export type CalendarEscape = 'GREGORIAN' | 'JULIAN' | 'HEBREW' | 'FRENCH_R' | 'UNKNOWN';

export interface ExactDate {
  calendar?: CalendarEscape;
  day?: number;
  month?: string;
  year: number;
  bc?: boolean;
}

export type GedcomDate =
  | { type: 'exact'; date: ExactDate }
  | { type: 'about'; date: ExactDate }
  | { type: 'calculated'; date: ExactDate }
  | { type: 'estimated'; date: ExactDate }
  | { type: 'before'; date: ExactDate }
  | { type: 'after'; date: ExactDate }
  | { type: 'between'; from: ExactDate; to: ExactDate }
  | { type: 'from'; from: ExactDate; to?: ExactDate }
  | { type: 'to'; to: ExactDate }
  | { type: 'interpreted'; date: ExactDate; original: string }
  | { type: 'phrase'; text: string };

// ─── Places ────────────────────────────────────────────────────────

export interface Place {
  name: string;
  form?: string;
  phoneticVariations?: Array<{ value: string; type: string }>;
  romanizedVariations?: Array<{ value: string; type: string }>;
  map?: { latitude: number; longitude: number };
  notes?: NoteRef[];
}

// ─── Addresses ─────────────────────────────────────────────────────

export interface Address {
  full?: string;
  continuations?: string[];
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phones?: string[];
  emails?: string[];
  faxes?: string[];
  www?: string[];
}

// ─── Notes ─────────────────────────────────────────────────────────

export type NoteRef =
  | { type: 'pointer'; xref: XRef }
  | { type: 'inline'; text: string };

// ─── Multimedia ────────────────────────────────────────────────────

export interface MultimediaFile {
  file: string;
  format: string;
  mediaType?: string;
  title?: string;
}

export type MultimediaRef =
  | { type: 'pointer'; xref: XRef }
  | { type: 'embedded'; files: MultimediaFile[]; notes?: NoteRef[] };

// ─── Source Citations ──────────────────────────────────────────────

export interface SourceCitation {
  source: XRef;
  page?: string;
  data?: {
    date?: GedcomDate;
    text?: string;
  };
  quality?: 0 | 1 | 2 | 3;
  multimedia?: MultimediaRef[];
  notes?: NoteRef[];
}

// ─── Change Date & Reference Numbers ───────────────────────────────

export interface ChangeDate {
  date: GedcomDate;
  time?: string;
  notes?: NoteRef[];
}

export interface ReferenceNumber {
  value: string;
  type?: string;
}

// ─── Vendor Extensions ─────────────────────────────────────────────

export interface UnknownTag {
  tag: string;
  value?: string;
  children: UnknownTag[];
}

// ─── Events & Attributes ──────────────────────────────────────────

export type Restriction = 'confidential' | 'locked' | 'privacy';

export interface EventOrAttribute {
  value?: string;
  type?: string;
  date?: GedcomDate;
  place?: Place;
  address?: Address;
  agency?: string;
  religion?: string;
  cause?: string;
  restriction?: Restriction;
  notes?: NoteRef[];
  sources?: SourceCitation[];
  multimedia?: MultimediaRef[];
  adoptedBy?: 'HUSB' | 'WIFE' | 'BOTH';
}

// ─── Individual ────────────────────────────────────────────────────

export type Sex = 'M' | 'F' | 'X' | 'U';

export type NameType =
  | 'aka'
  | 'birth'
  | 'immigrant'
  | 'maiden'
  | 'married'
  | 'nickname'
  | 'other';

export interface PersonalName {
  value: string;
  type?: NameType;
  prefix?: string;
  given?: string;
  nickname?: string;
  surnamePrefix?: string;
  surname?: string;
  suffix?: string;
  phonetic?: Array<{ value: string; type: string }>;
  romanized?: Array<{ value: string; type: string }>;
  sources?: SourceCitation[];
  notes?: NoteRef[];
}

export interface FamilyChildLink {
  family: XRef;
  pedigree?: 'adopted' | 'birth' | 'foster' | 'sealing';
  status?: string;
  notes?: NoteRef[];
}

export interface FamilySpouseLink {
  family: XRef;
  notes?: NoteRef[];
}

export interface Association {
  xref: XRef;
  relation: string;
  notes?: NoteRef[];
  sources?: SourceCitation[];
}

export type LdsOrdinanceStatus =
  | 'child'
  | 'completed'
  | 'excluded'
  | 'dns'
  | 'dns/can'
  | 'infant'
  | 'pre-1970'
  | 'stillborn'
  | 'submitted'
  | 'uncleared';

export interface LdsOrdinance {
  date?: GedcomDate;
  temple?: string;
  place?: Place;
  status?: LdsOrdinanceStatus;
  notes?: NoteRef[];
  sources?: SourceCitation[];
}

export interface Individual {
  xref: XRef;
  restriction?: Restriction;
  names: PersonalName[];
  sex?: Sex;

  // Individual events
  birth?: EventOrAttribute;
  christening?: EventOrAttribute;
  death?: EventOrAttribute;
  burial?: EventOrAttribute;
  cremation?: EventOrAttribute;
  adoption?: EventOrAttribute;
  baptism?: EventOrAttribute;
  barMitzvah?: EventOrAttribute;
  basMitzvah?: EventOrAttribute;
  blessing?: EventOrAttribute;
  adultChristening?: EventOrAttribute;
  confirmation?: EventOrAttribute;
  firstCommunion?: EventOrAttribute;
  naturalization?: EventOrAttribute;
  emigration?: EventOrAttribute;
  immigration?: EventOrAttribute;
  probate?: EventOrAttribute;
  will?: EventOrAttribute;
  graduation?: EventOrAttribute;
  retirement?: EventOrAttribute;
  census?: EventOrAttribute[];
  events?: EventOrAttribute[];

  // Individual attributes
  caste?: EventOrAttribute;
  physicalDescription?: EventOrAttribute;
  education?: EventOrAttribute;
  nationalId?: EventOrAttribute;
  nationality?: EventOrAttribute;
  childrenCount?: EventOrAttribute;
  marriageCount?: EventOrAttribute;
  occupation?: EventOrAttribute;
  property?: EventOrAttribute;
  religion?: EventOrAttribute;
  socialSecurityNumber?: EventOrAttribute;
  title?: EventOrAttribute;
  residence?: EventOrAttribute[];
  facts?: EventOrAttribute[];

  // Family links
  familiesAsChild: FamilyChildLink[];
  familiesAsSpouse: FamilySpouseLink[];

  // LDS ordinances
  ldsBaptism?: LdsOrdinance;
  ldsConfirmation?: LdsOrdinance;
  ldsEndowment?: LdsOrdinance;
  ldsSealingToParents?: LdsOrdinance;

  // Other
  submitters?: XRef[];
  associations?: Association[];
  aliases?: XRef[];
  ancestorInterest?: XRef[];
  descendantInterest?: XRef[];
  referenceNumbers?: ReferenceNumber[];
  recordId?: string;
  changeDate?: ChangeDate;
  notes?: NoteRef[];
  sources?: SourceCitation[];
  multimedia?: MultimediaRef[];
  extensions?: UnknownTag[];
}

// ─── Family ────────────────────────────────────────────────────────

export interface Family {
  xref: XRef;
  restriction?: Restriction;
  husband?: XRef;
  wife?: XRef;
  children: XRef[];
  childrenCount?: number;

  // Family events
  annulment?: EventOrAttribute;
  divorce?: EventOrAttribute;
  divorceFiled?: EventOrAttribute;
  engagement?: EventOrAttribute;
  marriage?: EventOrAttribute;
  marriageBanns?: EventOrAttribute;
  marriageContract?: EventOrAttribute;
  marriageLicense?: EventOrAttribute;
  marriageSettlement?: EventOrAttribute;
  census?: EventOrAttribute[];
  events?: EventOrAttribute[];

  // LDS
  ldsSealingToSpouse?: LdsOrdinance;

  // Other
  submitters?: XRef[];
  referenceNumbers?: ReferenceNumber[];
  recordId?: string;
  changeDate?: ChangeDate;
  notes?: NoteRef[];
  sources?: SourceCitation[];
  multimedia?: MultimediaRef[];
  extensions?: UnknownTag[];
}

// ─── Source ────────────────────────────────────────────────────────

export interface Source {
  xref: XRef;
  data?: {
    events?: Array<{
      types: string;
      date?: GedcomDate;
      place?: string;
    }>;
    agency?: string;
    notes?: NoteRef[];
  };
  author?: string;
  title?: string;
  abbreviation?: string;
  publication?: string;
  text?: string;
  repository?: {
    repo: XRef;
    notes?: NoteRef[];
    callNumbers?: Array<{ value: string; mediaType?: string }>;
  };
  referenceNumbers?: ReferenceNumber[];
  recordId?: string;
  changeDate?: ChangeDate;
  notes?: NoteRef[];
  multimedia?: MultimediaRef[];
  extensions?: UnknownTag[];
}

// ─── Repository ────────────────────────────────────────────────────

export interface Repository {
  xref: XRef;
  name: string;
  address?: Address;
  notes?: NoteRef[];
  referenceNumbers?: ReferenceNumber[];
  recordId?: string;
  changeDate?: ChangeDate;
  extensions?: UnknownTag[];
}

// ─── Note Record ───────────────────────────────────────────────────

export interface NoteRecord {
  xref: XRef;
  text: string;
  sources?: SourceCitation[];
  referenceNumbers?: ReferenceNumber[];
  recordId?: string;
  changeDate?: ChangeDate;
  extensions?: UnknownTag[];
}

// ─── Multimedia Record ─────────────────────────────────────────────

export interface MultimediaRecord {
  xref: XRef;
  files: MultimediaFile[];
  notes?: NoteRef[];
  sources?: SourceCitation[];
  referenceNumbers?: ReferenceNumber[];
  recordId?: string;
  changeDate?: ChangeDate;
  extensions?: UnknownTag[];
}

// ─── Submitter ─────────────────────────────────────────────────────

export interface Submitter {
  xref: XRef;
  name: string;
  address?: Address;
  multimedia?: MultimediaRef[];
  languages?: string[];
  rfn?: string;
  referenceNumbers?: ReferenceNumber[];
  recordId?: string;
  changeDate?: ChangeDate;
  notes?: NoteRef[];
  extensions?: UnknownTag[];
}

// ─── Submission ────────────────────────────────────────────────────

export interface Submission {
  xref: XRef;
  submitter?: XRef;
  familyFile?: string;
  temple?: string;
  ancestorGenerations?: number;
  descendantGenerations?: number;
  ordinanceProcessFlag?: 'yes' | 'no';
  recordId?: string;
  notes?: NoteRef[];
  extensions?: UnknownTag[];
}

// ─── Header ────────────────────────────────────────────────────────

export interface Header {
  sourceSystem: {
    id: string;
    version?: string;
    name?: string;
    corporation?: {
      name: string;
      address?: Address;
    };
    data?: {
      name: string;
      date?: GedcomDate;
      copyright?: string;
    };
  };
  destination?: string;
  transmissionDate?: GedcomDate;
  transmissionTime?: string;
  submitter: XRef;
  submission?: XRef;
  file?: string;
  copyright?: string;
  gedcom: {
    version: string;
    form: string;
  };
  charset: {
    name: string;
    version?: string;
  };
  language?: string;
  placeForm?: string;
  note?: string;
}

// ─── Parse Errors ──────────────────────────────────────────────────

export interface ParseError {
  line: number;
  text: string;
  message: string;
  type: 'malformed' | 'unexpected' | 'unknown_tag';
}

// ─── Index Types ───────────────────────────────────────────────────

export interface IndividualSummary {
  xref: string;
  name: string;
  birthYear?: number;
  deathYear?: number;
}

export interface FamilySummary {
  xref: string;
  label: string;
}

// ─── Top-level File ────────────────────────────────────────────────

export interface GedcomFile {
  header: Header;
  individuals: Map<string, Individual>;
  families: Map<string, Family>;
  sources: Map<string, Source>;
  repositories: Map<string, Repository>;
  notes: Map<string, NoteRecord>;
  multimedia: Map<string, MultimediaRecord>;
  submitters: Map<string, Submitter>;
  submission?: Submission;

  individualIndex: IndividualSummary[];
  familyIndex: FamilySummary[];
  parseErrors: ParseError[];
}
