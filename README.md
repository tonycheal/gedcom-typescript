# gedcom-typescript

[![npm version](https://img.shields.io/npm/v/gedcom-typescript.svg)](https://www.npmjs.com/package/gedcom-typescript)
[![npm downloads](https://img.shields.io/npm/dm/gedcom-typescript.svg)](https://www.npmjs.com/package/gedcom-typescript)
[![license](https://img.shields.io/npm/l/gedcom-typescript.svg)](https://github.com/tonycheal/gedcom-typescript/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

Read and write [GEDCOM 5.5.5](https://www.gedcom.org/) genealogy files with fully typed TypeScript objects. Zero dependencies.

## Install

```bash
npm install gedcom-typescript
```

## Quick start

```typescript
import { readGedcom, writeGedcom } from 'gedcom-typescript';
import { readFileSync, writeFileSync } from 'fs';

// Parse a GEDCOM file into typed objects
const gedcom = readGedcom(readFileSync('family.ged', 'utf-8'));

// Access individuals by cross-reference ID
const person = gedcom.individuals.get('@I1@');
console.log(person?.names[0]?.given);   // "John"
console.log(person?.names[0]?.surname); // "Smith"
console.log(person?.birth?.date);       // { type: 'exact', date: { day: 15, month: 'JUN', year: 1950 } }
console.log(person?.birth?.place?.name); // "London, England"

// Write back to GEDCOM format
writeFileSync('output.ged', writeGedcom(gedcom));
```

## API

### `readGedcom(input: string): GedcomFile`

Parses a GEDCOM 5.5.5 string into a fully typed `GedcomFile` object. The parser is **forgiving** — malformed or unrecognised lines are collected in `parseErrors` rather than throwing exceptions, so you always get a usable result even from imperfect files.

### `writeGedcom(file: GedcomFile): string`

Serialises a `GedcomFile` object back to a valid GEDCOM 5.5.5 string. Long values are automatically split using CONC/CONT tags.

## The `GedcomFile` object

Everything lives on the `GedcomFile` that `readGedcom()` returns:

```typescript
interface GedcomFile {
  header: Header;                              // Source system, GEDCOM version, charset
  individuals: Map<string, Individual>;        // Keyed by xref, e.g. '@I1@'
  families: Map<string, Family>;               // Keyed by xref, e.g. '@F1@'
  sources: Map<string, Source>;                // Keyed by xref, e.g. '@S1@'
  repositories: Map<string, Repository>;       // Keyed by xref
  notes: Map<string, NoteRecord>;              // Shared note records
  multimedia: Map<string, MultimediaRecord>;   // Multimedia (OBJE) records
  submitters: Map<string, Submitter>;          // Who submitted the data
  submission?: Submission;                     // Submission record (rare)

  individualIndex: IndividualSummary[];        // Pre-sorted name list for search/display
  familyIndex: FamilySummary[];                // Pre-sorted family labels
  parseErrors: ParseError[];                   // Any lines that couldn't be parsed
}
```

Records are stored in `Map`s keyed by their GEDCOM cross-reference IDs (e.g. `'@I1@'`). This makes lookups O(1) and mirrors how GEDCOM files internally link records together.

## Working with individuals

An `Individual` gives you everything GEDCOM knows about a person:

```typescript
const indi = gedcom.individuals.get('@I1@');

// Names (a person can have multiple — birth name, married name, etc.)
indi.names[0].value          // "John /Smith/"  (raw GEDCOM format with surname in slashes)
indi.names[0].given          // "John"
indi.names[0].surname        // "Smith"
indi.names[0].type           // 'birth' | 'married' | 'maiden' | 'aka' | 'nickname' | ...

// Sex
indi.sex                     // 'M' | 'F' | 'X' | 'U'

// Events — each has optional date, place, sources, notes
indi.birth?.date             // GedcomDate (see below)
indi.birth?.place?.name      // "London, England"
indi.death?.date
indi.burial?.place

// Attributes
indi.occupation?.value       // "Carpenter"
indi.education?.value        // "University of Cambridge"
indi.residence               // EventOrAttribute[] (can have multiple)

// Family links (cross-references to Family records)
indi.familiesAsChild         // [{ family: '@F1@', pedigree: 'birth' }]
indi.familiesAsSpouse        // [{ family: '@F2@' }]
```

### All individual events

`birth`, `christening`, `death`, `burial`, `cremation`, `adoption`, `baptism`, `barMitzvah`, `basMitzvah`, `blessing`, `adultChristening`, `confirmation`, `firstCommunion`, `naturalization`, `emigration`, `immigration`, `probate`, `will`, `graduation`, `retirement`

Plus `census` and `events` (arrays, since a person can have multiple).

### All individual attributes

`caste`, `physicalDescription`, `education`, `nationalId`, `nationality`, `childrenCount`, `marriageCount`, `occupation`, `property`, `religion`, `socialSecurityNumber`, `title`

Plus `residence` and `facts` (arrays).

## Working with families

A `Family` links partners and children:

```typescript
const fam = gedcom.families.get('@F1@');

fam.husband      // '@I1@'  (xref to an Individual)
fam.wife         // '@I2@'
fam.children     // ['@I3@', '@I4@']

// Marriage (and other family events)
fam.marriage?.date
fam.marriage?.place?.name
fam.divorce?.date
```

### All family events

`annulment`, `divorce`, `divorceFiled`, `engagement`, `marriage`, `marriageBanns`, `marriageContract`, `marriageLicense`, `marriageSettlement`

Plus `census` and `events` (arrays).

## Dates

GEDCOM has a rich date system. Dates are parsed into a discriminated union so you can handle each variant:

```typescript
type GedcomDate =
  | { type: 'exact'; date: ExactDate }       // "15 JUN 1950"
  | { type: 'about'; date: ExactDate }       // "ABT 1950"
  | { type: 'calculated'; date: ExactDate }  // "CAL 1950"
  | { type: 'estimated'; date: ExactDate }   // "EST 1950"
  | { type: 'before'; date: ExactDate }      // "BEF 1950"
  | { type: 'after'; date: ExactDate }       // "AFT 1950"
  | { type: 'between'; from: ExactDate; to: ExactDate }  // "BET 1940 AND 1950"
  | { type: 'from'; from: ExactDate; to?: ExactDate }    // "FROM 1940 TO 1950"
  | { type: 'to'; to: ExactDate }            // "TO 1950"
  | { type: 'interpreted'; date: ExactDate; original: string }  // "INT 1950 (about)"
  | { type: 'phrase'; text: string };         // "(unknown)"

interface ExactDate {
  year: number;
  month?: string;    // 'JAN', 'FEB', etc.
  day?: number;
  calendar?: 'GREGORIAN' | 'JULIAN' | 'HEBREW' | 'FRENCH_R' | 'UNKNOWN';
  bc?: boolean;
}
```

Example usage:

```typescript
const date = indi.birth?.date;
if (date) {
  switch (date.type) {
    case 'exact':
    case 'about':
      console.log(`Born ${date.date.year}`);
      break;
    case 'between':
      console.log(`Born between ${date.from.year} and ${date.to.year}`);
      break;
    case 'phrase':
      console.log(`Born: ${date.text}`);
      break;
  }
}
```

## Indexes

For listing and searching, `GedcomFile` includes pre-sorted index arrays:

```typescript
// individualIndex — sorted by name, with birth/death years for display
gedcom.individualIndex.forEach(s => {
  console.log(`${s.name} (${s.birthYear ?? '?'} - ${s.deathYear ?? '?'})`);
  // "John Smith (1950 - 2020)"
});

// Search by name
const smiths = gedcom.individualIndex.filter(s =>
  s.name.toLowerCase().includes('smith')
);

// Each summary has an xref to get the full record
const full = gedcom.individuals.get(smiths[0].xref);

// familyIndex — sorted labels like "John Smith & Jane Doe"
gedcom.familyIndex.forEach(f => {
  console.log(f.label);
});
```

## Sources and citations

Sources document where information came from:

```typescript
// Top-level source records
const src = gedcom.sources.get('@S1@');
src.title          // "England & Wales Civil Registration"
src.author         // "General Register Office"
src.publication    // "London, England"

// Source citations on events (linking to source records)
indi.birth?.sources?.forEach(cit => {
  const source = gedcom.sources.get(cit.source);
  console.log(`Source: ${source?.title}, page ${cit.page}`);
});
```

## Parse errors

The parser never throws. Malformed or unrecognised lines are captured in `parseErrors`:

```typescript
if (gedcom.parseErrors.length > 0) {
  for (const err of gedcom.parseErrors) {
    console.warn(`Line ${err.line}: ${err.message}`);
    console.warn(`  → ${err.text}`);
    // err.type is 'malformed' | 'unexpected' | 'unknown_tag'
  }
}
```

## Vendor extensions

GEDCOM files often contain vendor-specific tags (prefixed with `_`). These are preserved as `extensions` on each record:

```typescript
indi.extensions?.forEach(ext => {
  console.log(`${ext.tag}: ${ext.value}`);
  // e.g. "_MILI: World War II"
});
```

## Notes

Notes can be either inline text or references to shared note records:

```typescript
indi.notes?.forEach(note => {
  if (note.type === 'pointer') {
    const full = gedcom.notes.get(note.xref);
    console.log(full?.text);
  } else {
    console.log(note.text);
  }
});
```

## All exported types

```typescript
import type {
  // Top-level
  GedcomFile, Header,

  // Records
  Individual, Family, Source, Repository,
  NoteRecord, MultimediaRecord, Submitter, Submission,

  // Events & attributes
  EventOrAttribute, Restriction,

  // Names
  PersonalName, NameType, Sex,

  // Dates
  GedcomDate, ExactDate, CalendarEscape,

  // Places & addresses
  Place, Address,

  // References & citations
  NoteRef, MultimediaRef, MultimediaFile, SourceCitation,
  ChangeDate, ReferenceNumber,

  // Family links
  FamilyChildLink, FamilySpouseLink, Association,

  // LDS
  LdsOrdinance, LdsOrdinanceStatus,

  // Indexes
  IndividualSummary, FamilySummary,

  // Errors & extensions
  ParseError, UnknownTag,
} from 'gedcom-typescript';
```

## License

ISC
