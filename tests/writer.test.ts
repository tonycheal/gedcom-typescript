import { describe, it, expect } from 'vitest';
import { writeGedcom } from '../src/writer.js';
import type { GedcomFile } from '../src/types.ts';

function makeMinimalFile(): GedcomFile {
  return {
    header: {
      sourceSystem: { id: 'TEST' },
      submitter: '@U1@',
      gedcom: { version: '5.5.5', form: 'LINEAGE-LINKED' },
      charset: { name: 'UTF-8' },
    },
    individuals: new Map([
      ['@I1@', {
        xref: '@I1@',
        names: [{ value: 'John /Smith/', given: 'John', surname: 'Smith' }],
        sex: 'M' as const,
        birth: {
          date: { type: 'exact' as const, date: { day: 15, month: 'JUN', year: 1950 } },
          place: { name: 'London, England' },
        },
        familiesAsChild: [],
        familiesAsSpouse: [{ family: '@F1@' }],
      }],
    ]),
    families: new Map([
      ['@F1@', {
        xref: '@F1@',
        husband: '@I1@',
        children: [],
        marriage: {
          date: { type: 'exact' as const, date: { day: 25, month: 'DEC', year: 1978 } },
        },
      }],
    ]),
    sources: new Map(),
    repositories: new Map(),
    notes: new Map(),
    multimedia: new Map(),
    submitters: new Map([
      ['@U1@', { xref: '@U1@', name: 'Test User' }],
    ]),
    individualIndex: [],
    familyIndex: [],
    parseErrors: [],
  };
}

describe('writeGedcom', () => {
  it('should produce valid GEDCOM structure', () => {
    const output = writeGedcom(makeMinimalFile());
    const lines = output.split('\n');

    expect(lines[0]).toBe('0 HEAD');
    expect(lines[lines.length - 2]).toBe('0 TRLR');
  });

  it('should write header fields', () => {
    const output = writeGedcom(makeMinimalFile());
    expect(output).toContain('1 SOUR TEST');
    expect(output).toContain('2 VERS 5.5.5');
    expect(output).toContain('2 FORM LINEAGE-LINKED');
    expect(output).toContain('1 CHAR UTF-8');
    expect(output).toContain('1 SUBM @U1@');
  });

  it('should write individual records', () => {
    const output = writeGedcom(makeMinimalFile());
    expect(output).toContain('0 @I1@ INDI');
    expect(output).toContain('1 NAME John /Smith/');
    expect(output).toContain('2 GIVN John');
    expect(output).toContain('2 SURN Smith');
    expect(output).toContain('1 SEX M');
    expect(output).toContain('2 DATE 15 JUN 1950');
    expect(output).toContain('2 PLAC London, England');
  });

  it('should write family records', () => {
    const output = writeGedcom(makeMinimalFile());
    expect(output).toContain('0 @F1@ FAM');
    expect(output).toContain('1 HUSB @I1@');
    expect(output).toContain('2 DATE 25 DEC 1978');
  });

  it('should write submitter records', () => {
    const output = writeGedcom(makeMinimalFile());
    expect(output).toContain('0 @U1@ SUBM');
    expect(output).toContain('1 NAME Test User');
  });

  it('should handle multi-line values with CONT', () => {
    const file = makeMinimalFile();
    file.notes.set('@N1@', {
      xref: '@N1@',
      text: 'Line one\nLine two\nLine three',
    });
    const output = writeGedcom(file);
    expect(output).toContain('0 @N1@ NOTE Line one');
    expect(output).toContain('1 CONT Line two');
    expect(output).toContain('1 CONT Line three');
  });

  it('should write date qualifiers', () => {
    const file = makeMinimalFile();
    const indi = file.individuals.get('@I1@')!;
    indi.death = {
      date: { type: 'about', date: { year: 2020 } },
    };
    const output = writeGedcom(file);
    expect(output).toContain('2 DATE ABT 2020');
  });

  it('should write date ranges', () => {
    const file = makeMinimalFile();
    const indi = file.individuals.get('@I1@')!;
    indi.residence = [{
      date: { type: 'between', from: { year: 1970 }, to: { year: 1990 } },
      place: { name: 'Cambridge, England' },
    }];
    const output = writeGedcom(file);
    expect(output).toContain('2 DATE BET 1970 AND 1990');
  });
});
