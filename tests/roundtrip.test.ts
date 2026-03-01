import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readGedcom } from '../src/parser.js';
import { writeGedcom } from '../src/writer.js';

const fixture = readFileSync(join(__dirname, 'fixtures/minimal.ged'), 'utf-8');

describe('roundtrip', () => {
  it('should preserve data through parse → write → parse', () => {
    const first = readGedcom(fixture);
    const written = writeGedcom(first);
    const second = readGedcom(written);

    // Same number of records
    expect(second.individuals.size).toBe(first.individuals.size);
    expect(second.families.size).toBe(first.families.size);
    expect(second.sources.size).toBe(first.sources.size);
    expect(second.repositories.size).toBe(first.repositories.size);
    expect(second.notes.size).toBe(first.notes.size);
    expect(second.submitters.size).toBe(first.submitters.size);

    // Same header
    expect(second.header.sourceSystem.id).toBe(first.header.sourceSystem.id);
    expect(second.header.gedcom.version).toBe(first.header.gedcom.version);
    expect(second.header.charset.name).toBe(first.header.charset.name);

    // Spot-check individual data
    const john1 = first.individuals.get('@I1@')!;
    const john2 = second.individuals.get('@I1@')!;
    expect(john2.names[0].value).toBe(john1.names[0].value);
    expect(john2.names[0].given).toBe(john1.names[0].given);
    expect(john2.names[0].surname).toBe(john1.names[0].surname);
    expect(john2.sex).toBe(john1.sex);
    expect(john2.birth?.date).toEqual(john1.birth?.date);
    expect(john2.birth?.place?.name).toBe(john1.birth?.place?.name);
    expect(john2.death?.date).toEqual(john1.death?.date);
    expect(john2.occupation?.value).toBe(john1.occupation?.value);
    expect(john2.residence).toHaveLength(john1.residence!.length);
    expect(john2.familiesAsChild).toHaveLength(john1.familiesAsChild.length);
    expect(john2.familiesAsSpouse).toHaveLength(john1.familiesAsSpouse.length);

    // Spot-check family data
    const fam1 = first.families.get('@F2@')!;
    const fam2 = second.families.get('@F2@')!;
    expect(fam2.husband).toBe(fam1.husband);
    expect(fam2.wife).toBe(fam1.wife);
    expect(fam2.children).toEqual(fam1.children);
    expect(fam2.marriage?.date).toEqual(fam1.marriage?.date);

    // Indexes should be rebuilt
    expect(second.individualIndex).toHaveLength(first.individualIndex.length);
    expect(second.familyIndex).toHaveLength(first.familyIndex.length);

    // No parse errors on roundtrip
    expect(second.parseErrors).toEqual([]);
  });
});
