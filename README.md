# gedcom-typescript

Read and write [GEDCOM 5.5.5](https://www.gedcom.org/) files with fully typed TypeScript objects.

## Install

```bash
npm install gedcom-typescript
```

## Usage

```typescript
import { readGedcom, writeGedcom } from 'gedcom-typescript';
import { readFileSync, writeFileSync } from 'fs';

// Parse a GEDCOM file
const gedcom = readGedcom(readFileSync('family.ged', 'utf-8'));

// Access typed data
for (const [xref, indi] of gedcom.individuals) {
  console.log(indi.names[0]?.value);
}

// Check for parse issues
if (gedcom.parseErrors.length > 0) {
  console.warn('Parse warnings:', gedcom.parseErrors);
}

// Use the index for quick lookups
const matches = gedcom.individualIndex.filter(s =>
  s.name.toLowerCase().includes('smith')
);

// Write back to GEDCOM format
writeFileSync('output.ged', writeGedcom(gedcom));
```

## API

### `readGedcom(input: string): GedcomFile`

Parses a GEDCOM 5.5.5 string into a fully typed `GedcomFile` object. The parser is forgiving — malformed or unexpected lines are collected in `parseErrors` rather than throwing.

### `writeGedcom(file: GedcomFile): string`

Serializes a `GedcomFile` object back to a valid GEDCOM 5.5.5 string.

## Types

All types are exported for use in your own code:

```typescript
import type {
  GedcomFile,
  Individual,
  Family,
  Source,
  Repository,
  NoteRecord,
  MultimediaRecord,
  Header,
  EventOrAttribute,
  GedcomDate,
  Place,
  // ... and more
} from 'gedcom-typescript';
```

## License

ISC
