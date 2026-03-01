import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readGedcom } from '../src/parser.js';

const fixture = readFileSync(join(__dirname, 'fixtures/minimal.ged'), 'utf-8');

describe('readGedcom', () => {
  const file = readGedcom(fixture);

  describe('header', () => {
    it('should parse source system', () => {
      expect(file.header.sourceSystem.id).toBe('GEDCOM-TS');
      expect(file.header.sourceSystem.version).toBe('1.0');
      expect(file.header.sourceSystem.name).toBe('gedcom-typescript');
    });

    it('should parse GEDCOM version', () => {
      expect(file.header.gedcom.version).toBe('5.5.5');
      expect(file.header.gedcom.form).toBe('LINEAGE-LINKED');
    });

    it('should parse charset', () => {
      expect(file.header.charset.name).toBe('UTF-8');
    });

    it('should parse submitter reference', () => {
      expect(file.header.submitter).toBe('@U1@');
    });

    it('should parse language', () => {
      expect(file.header.language).toBe('English');
    });

    it('should parse header note', () => {
      expect(file.header.note).toBe('This is a test file for gedcom-typescript.');
    });
  });

  describe('submitters', () => {
    it('should parse submitter', () => {
      const subm = file.submitters.get('@U1@');
      expect(subm).toBeDefined();
      expect(subm!.name).toBe('Test User');
      expect(subm!.address?.full).toBe('123 Main Street');
      expect(subm!.address?.city).toBe('London');
      expect(subm!.address?.state).toBe('England');
      expect(subm!.address?.postalCode).toBe('SW1A 1AA');
      expect(subm!.address?.country).toBe('UK');
      expect(subm!.address?.phones).toEqual(['+44 20 1234 5678']);
      expect(subm!.address?.emails).toEqual(['test@example.com']);
      expect(subm!.languages).toEqual(['English']);
    });
  });

  describe('individuals', () => {
    it('should parse all individuals', () => {
      expect(file.individuals.size).toBe(5);
    });

    it('should parse individual with basic fields', () => {
      const john = file.individuals.get('@I1@');
      expect(john).toBeDefined();
      expect(john!.xref).toBe('@I1@');
      expect(john!.sex).toBe('M');
      expect(john!.names).toHaveLength(1);
      expect(john!.names[0].value).toBe('John /Smith/');
      expect(john!.names[0].given).toBe('John');
      expect(john!.names[0].surname).toBe('Smith');
    });

    it('should parse birth event', () => {
      const john = file.individuals.get('@I1@')!;
      expect(john.birth).toBeDefined();
      expect(john.birth!.date).toEqual({
        type: 'exact',
        date: { day: 15, month: 'JUN', year: 1950 },
      });
      expect(john.birth!.place?.name).toBe('London, Middlesex, England');
    });

    it('should parse death event', () => {
      const john = file.individuals.get('@I1@')!;
      expect(john.death).toBeDefined();
      expect(john.death!.date).toEqual({
        type: 'exact',
        date: { day: 3, month: 'MAR', year: 2020 },
      });
    });

    it('should parse approximate dates', () => {
      const jane = file.individuals.get('@I2@')!;
      expect(jane.birth!.date).toEqual({
        type: 'about',
        date: { year: 1955 },
      });
    });

    it('should parse occupation attribute', () => {
      const john = file.individuals.get('@I1@')!;
      expect(john.occupation).toBeDefined();
      expect(john.occupation!.value).toBe('Software Engineer');
    });

    it('should parse repeatable residence', () => {
      const john = file.individuals.get('@I1@')!;
      expect(john.residence).toHaveLength(2);
      expect(john.residence![0].date).toEqual({
        type: 'from',
        from: { year: 1970 },
        to: { year: 1990 },
      });
      expect(john.residence![0].place?.name).toBe('Cambridge, England');
    });

    it('should parse multiple names with types', () => {
      const jane = file.individuals.get('@I2@')!;
      expect(jane.names).toHaveLength(2);
      expect(jane.names[0].type).toBe('married');
      expect(jane.names[1].type).toBe('birth');
      expect(jane.names[1].surname).toBe('Williams');
    });

    it('should parse family links', () => {
      const john = file.individuals.get('@I1@')!;
      expect(john.familiesAsChild).toHaveLength(1);
      expect(john.familiesAsChild[0].family).toBe('@F1@');
      expect(john.familiesAsSpouse).toHaveLength(1);
      expect(john.familiesAsSpouse[0].family).toBe('@F2@');
    });

    it('should parse inline notes', () => {
      const john = file.individuals.get('@I1@')!;
      expect(john.notes).toBeDefined();
      expect(john.notes).toHaveLength(1);
      expect(john.notes![0]).toEqual({
        type: 'inline',
        text: 'John was a pioneer in early computing.',
      });
    });

    it('should parse change date with time', () => {
      const john = file.individuals.get('@I1@')!;
      expect(john.changeDate).toBeDefined();
      expect(john.changeDate!.date).toEqual({
        type: 'exact',
        date: { day: 1, month: 'JAN', year: 2024 },
      });
      expect(john.changeDate!.time).toBe('12:00:00');
    });
  });

  describe('families', () => {
    it('should parse all families', () => {
      expect(file.families.size).toBe(2);
    });

    it('should parse family members', () => {
      const fam = file.families.get('@F2@')!;
      expect(fam.husband).toBe('@I1@');
      expect(fam.wife).toBe('@I2@');
      expect(fam.children).toEqual(['@I5@']);
    });

    it('should parse marriage event', () => {
      const fam = file.families.get('@F1@')!;
      expect(fam.marriage).toBeDefined();
      expect(fam.marriage!.date).toEqual({
        type: 'exact',
        date: { day: 10, month: 'OCT', year: 1948 },
      });
      expect(fam.marriage!.place?.name).toBe('London, England');
    });
  });

  describe('sources', () => {
    it('should parse source record', () => {
      const src = file.sources.get('@S1@');
      expect(src).toBeDefined();
      expect(src!.title).toBe('England and Wales Civil Registration Index');
      expect(src!.author).toBe('General Register Office');
      expect(src!.publication).toBe('London: HMSO');
    });

    it('should parse source repository reference', () => {
      const src = file.sources.get('@S1@')!;
      expect(src.repository).toBeDefined();
      expect(src.repository!.repo).toBe('@R1@');
      expect(src.repository!.callNumbers).toHaveLength(1);
      expect(src.repository!.callNumbers![0].value).toBe('CR/1950/123');
    });
  });

  describe('repositories', () => {
    it('should parse repository', () => {
      const repo = file.repositories.get('@R1@');
      expect(repo).toBeDefined();
      expect(repo!.name).toBe('The National Archives');
      expect(repo!.address?.full).toBe('Kew, Richmond');
      expect(repo!.address?.city).toBe('Richmond');
    });
  });

  describe('notes', () => {
    it('should parse shared note with CONC/CONT', () => {
      const note = file.notes.get('@N1@');
      expect(note).toBeDefined();
      expect(note!.text).toContain('This is a shared note');
      expect(note!.text).toContain('multiple places');
    });
  });

  describe('indexes', () => {
    it('should build individual index sorted by name', () => {
      expect(file.individualIndex).toHaveLength(5);
      const names = file.individualIndex.map(s => s.name);
      expect(names).toEqual([...names].sort());
    });

    it('should include birth/death years in index', () => {
      const john = file.individualIndex.find(s => s.xref === '@I1@');
      expect(john).toBeDefined();
      expect(john!.name).toBe('John Smith');
      expect(john!.birthYear).toBe(1950);
      expect(john!.deathYear).toBe(2020);
    });

    it('should build family index', () => {
      expect(file.familyIndex).toHaveLength(2);
      const f2 = file.familyIndex.find(s => s.xref === '@F2@');
      expect(f2).toBeDefined();
      expect(f2!.label).toContain('John Smith');
      expect(f2!.label).toContain('Jane Doe');
    });
  });

  describe('parse errors', () => {
    it('should have no errors for valid file', () => {
      expect(file.parseErrors).toEqual([]);
    });

    it('should collect errors for malformed lines', () => {
      const badFile = `0 HEAD
1 SOUR TEST
1 SUBM @U1@
1 GEDC
2 VERS 5.5.5
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
this is garbage
0 @I1@ INDI
1 NAME Test /Person/
0 TRLR`;
      const result = readGedcom(badFile);
      expect(result.parseErrors.length).toBeGreaterThan(0);
      expect(result.parseErrors[0].type).toBe('malformed');
      expect(result.parseErrors[0].text).toContain('garbage');
      // Should still parse what it can
      expect(result.individuals.size).toBe(1);
    });
  });
});
