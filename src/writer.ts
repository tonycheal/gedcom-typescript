import type {
  Address,
  ChangeDate,
  EventOrAttribute,
  ExactDate,
  Family,
  GedcomDate,
  GedcomFile,
  Header,
  Individual,
  LdsOrdinance,
  MultimediaRecord,
  MultimediaRef,
  NoteRecord,
  NoteRef,
  PersonalName,
  Place,
  ReferenceNumber,
  Repository,
  Source,
  SourceCitation,
  Submission,
  Submitter,
  UnknownTag,
} from './types.js';

const MAX_LINE_LENGTH = 255;

// ─── Line output helpers ───────────────────────────────────────────

class GedcomWriter {
  private lines: string[] = [];

  line(level: number, tag: string, value?: string, xref?: string): void {
    let prefix = xref ? `${level} ${xref} ${tag}` : `${level} ${tag}`;

    if (value === undefined || value === '') {
      this.lines.push(prefix);
      return;
    }

    // Split multi-line values with CONT, and long lines with CONC
    const textLines = value.split('\n');
    for (let i = 0; i < textLines.length; i++) {
      let chunk = textLines[i];
      const currentTag = i === 0 ? tag : 'CONT';
      const currentPrefix = i === 0 ? prefix : `${level + 1} CONT`;

      if (i === 0) {
        const fullLine = `${currentPrefix} ${chunk}`;
        if (fullLine.length <= MAX_LINE_LENGTH) {
          this.lines.push(fullLine);
        } else {
          // Need to split with CONC
          const available = MAX_LINE_LENGTH - currentPrefix.length - 1;
          this.lines.push(`${currentPrefix} ${chunk.slice(0, available)}`);
          chunk = chunk.slice(available);
          while (chunk.length > 0) {
            const concPrefix = `${level + 1} CONC`;
            const concAvail = MAX_LINE_LENGTH - concPrefix.length - 1;
            this.lines.push(`${concPrefix} ${chunk.slice(0, concAvail)}`);
            chunk = chunk.slice(concAvail);
          }
        }
      } else {
        const fullLine = `${currentPrefix} ${chunk}`;
        if (fullLine.length <= MAX_LINE_LENGTH) {
          this.lines.push(chunk ? `${currentPrefix} ${chunk}` : currentPrefix);
        } else {
          const available = MAX_LINE_LENGTH - currentPrefix.length - 1;
          this.lines.push(`${currentPrefix} ${chunk.slice(0, available)}`);
          chunk = chunk.slice(available);
          while (chunk.length > 0) {
            const concPrefix = `${level + 1} CONC`;
            const concAvail = MAX_LINE_LENGTH - concPrefix.length - 1;
            this.lines.push(`${concPrefix} ${chunk.slice(0, concAvail)}`);
            chunk = chunk.slice(concAvail);
          }
        }
      }
    }
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }

  // ─── Date formatting ──────────────────────────────────────────

  writeExactDate(date: ExactDate): string {
    const parts: string[] = [];
    if (date.calendar && date.calendar !== 'GREGORIAN') {
      parts.push(`@#D${date.calendar}@`);
    }
    if (date.day !== undefined) parts.push(String(date.day));
    if (date.month) parts.push(date.month);
    parts.push(String(date.year));
    if (date.bc) parts.push('B.C.');
    return parts.join(' ');
  }

  writeDate(level: number, date: GedcomDate | undefined): void {
    if (!date) return;
    let value: string;
    switch (date.type) {
      case 'exact': value = this.writeExactDate(date.date); break;
      case 'about': value = `ABT ${this.writeExactDate(date.date)}`; break;
      case 'calculated': value = `CAL ${this.writeExactDate(date.date)}`; break;
      case 'estimated': value = `EST ${this.writeExactDate(date.date)}`; break;
      case 'before': value = `BEF ${this.writeExactDate(date.date)}`; break;
      case 'after': value = `AFT ${this.writeExactDate(date.date)}`; break;
      case 'between': value = `BET ${this.writeExactDate(date.from)} AND ${this.writeExactDate(date.to)}`; break;
      case 'from':
        value = `FROM ${this.writeExactDate(date.from)}`;
        if (date.to) value += ` TO ${this.writeExactDate(date.to)}`;
        break;
      case 'to': value = `TO ${this.writeExactDate(date.to)}`; break;
      case 'interpreted': value = `INT ${this.writeExactDate(date.date)} (${date.original})`; break;
      case 'phrase': value = `(${date.text})`; break;
    }
    this.line(level, 'DATE', value);
  }

  // ─── Shared structure writers ─────────────────────────────────

  writePlace(level: number, place: Place | undefined): void {
    if (!place) return;
    this.line(level, 'PLAC', place.name);
    if (place.form) this.line(level + 1, 'FORM', place.form);
    if (place.phoneticVariations) {
      for (const pv of place.phoneticVariations) {
        this.line(level + 1, 'FONE', pv.value);
        if (pv.type) this.line(level + 2, 'TYPE', pv.type);
      }
    }
    if (place.romanizedVariations) {
      for (const rv of place.romanizedVariations) {
        this.line(level + 1, 'ROMN', rv.value);
        if (rv.type) this.line(level + 2, 'TYPE', rv.type);
      }
    }
    if (place.map) {
      this.line(level + 1, 'MAP');
      const latDir = place.map.latitude >= 0 ? 'N' : 'S';
      const lngDir = place.map.longitude >= 0 ? 'E' : 'W';
      this.line(level + 2, 'LATI', `${latDir}${Math.abs(place.map.latitude)}`);
      this.line(level + 2, 'LONG', `${lngDir}${Math.abs(place.map.longitude)}`);
    }
    this.writeNoteRefs(level + 1, place.notes);
  }

  writeAddress(level: number, address: Address | undefined, parentLevel?: number): void {
    if (!address) return;
    const addrLevel = level;
    const contactLevel = parentLevel ?? level - 1;

    if (address.full || address.city || address.state || address.postalCode || address.country) {
      this.line(addrLevel, 'ADDR', address.full);
      if (address.city) this.line(addrLevel + 1, 'CITY', address.city);
      if (address.state) this.line(addrLevel + 1, 'STAE', address.state);
      if (address.postalCode) this.line(addrLevel + 1, 'POST', address.postalCode);
      if (address.country) this.line(addrLevel + 1, 'CTRY', address.country);
    }

    if (address.phones) for (const p of address.phones) this.line(contactLevel + 1, 'PHON', p);
    if (address.emails) for (const e of address.emails) this.line(contactLevel + 1, 'EMAIL', e);
    if (address.faxes) for (const f of address.faxes) this.line(contactLevel + 1, 'FAX', f);
    if (address.www) for (const w of address.www) this.line(contactLevel + 1, 'WWW', w);
  }

  writeNoteRefs(level: number, notes: NoteRef[] | undefined): void {
    if (!notes) return;
    for (const note of notes) {
      if (note.type === 'pointer') {
        this.line(level, 'NOTE', note.xref);
      } else {
        this.line(level, 'NOTE', note.text);
      }
    }
  }

  writeMultimediaRefs(level: number, refs: MultimediaRef[] | undefined): void {
    if (!refs) return;
    for (const ref of refs) {
      if (ref.type === 'pointer') {
        this.line(level, 'OBJE', ref.xref);
      } else {
        this.line(level, 'OBJE');
        for (const f of ref.files) {
          this.line(level + 1, 'FILE', f.file);
          this.line(level + 2, 'FORM', f.format);
          if (f.mediaType) this.line(level + 3, 'MEDI', f.mediaType);
          if (f.title) this.line(level + 2, 'TITL', f.title);
        }
        this.writeNoteRefs(level + 1, ref.notes);
      }
    }
  }

  writeSourceCitations(level: number, citations: SourceCitation[] | undefined): void {
    if (!citations) return;
    for (const cit of citations) {
      this.line(level, 'SOUR', cit.source);
      if (cit.page) this.line(level + 1, 'PAGE', cit.page);
      if (cit.data) {
        this.line(level + 1, 'DATA');
        this.writeDate(level + 2, cit.data.date);
        if (cit.data.text) this.line(level + 2, 'TEXT', cit.data.text);
      }
      if (cit.quality !== undefined) this.line(level + 1, 'QUAY', String(cit.quality));
      this.writeMultimediaRefs(level + 1, cit.multimedia);
      this.writeNoteRefs(level + 1, cit.notes);
    }
  }

  writeChangeDate(level: number, change: ChangeDate | undefined): void {
    if (!change) return;
    this.line(level, 'CHAN');
    this.writeDate(level + 1, change.date);
    if (change.time) this.line(level + 2, 'TIME', change.time);
    this.writeNoteRefs(level + 1, change.notes);
  }

  writeReferenceNumbers(level: number, refs: ReferenceNumber[] | undefined): void {
    if (!refs) return;
    for (const ref of refs) {
      this.line(level, 'REFN', ref.value);
      if (ref.type) this.line(level + 1, 'TYPE', ref.type);
    }
  }

  writeUnknownTags(level: number, tags: UnknownTag[] | undefined): void {
    if (!tags) return;
    for (const tag of tags) {
      this.line(level, tag.tag, tag.value);
      this.writeUnknownTags(level + 1, tag.children);
    }
  }

  writeEvent(level: number, tag: string, event: EventOrAttribute | undefined): void {
    if (!event) return;
    this.line(level, tag, event.value ?? (tag === 'DEAT' || tag === 'BIRT' || tag === 'MARR' ? 'Y' : undefined));
    if (event.type) this.line(level + 1, 'TYPE', event.type);
    this.writeDate(level + 1, event.date);
    this.writePlace(level + 1, event.place);
    this.writeAddress(level + 1, event.address, level);
    if (event.agency) this.line(level + 1, 'AGNC', event.agency);
    if (event.religion) this.line(level + 1, 'RELI', event.religion);
    if (event.cause) this.line(level + 1, 'CAUS', event.cause);
    if (event.restriction) this.line(level + 1, 'RESN', event.restriction);
    if (event.adoptedBy && tag === 'ADOP') {
      this.line(level + 1, 'FAMC');
      this.line(level + 2, 'ADOP', event.adoptedBy);
    }
    this.writeNoteRefs(level + 1, event.notes);
    this.writeSourceCitations(level + 1, event.sources);
    this.writeMultimediaRefs(level + 1, event.multimedia);
  }

  writeLdsOrdinance(level: number, tag: string, ord: LdsOrdinance | undefined): void {
    if (!ord) return;
    this.line(level, tag);
    this.writeDate(level + 1, ord.date);
    if (ord.temple) this.line(level + 1, 'TEMP', ord.temple);
    this.writePlace(level + 1, ord.place);
    if (ord.status) {
      const statusMap: Record<string, string> = {
        child: 'CHILD', completed: 'COMPLETED', excluded: 'EXCLUDED',
        dns: 'DNS', 'dns/can': 'DNS/CAN', infant: 'INFANT',
        'pre-1970': 'PRE-1970', stillborn: 'STILLBORN',
        submitted: 'SUBMITTED', uncleared: 'UNCLEARED',
      };
      this.line(level + 1, 'STAT', statusMap[ord.status] ?? ord.status.toUpperCase());
    }
    this.writeNoteRefs(level + 1, ord.notes);
    this.writeSourceCitations(level + 1, ord.sources);
  }

  writePersonalName(level: number, name: PersonalName): void {
    this.line(level, 'NAME', name.value);
    if (name.type) this.line(level + 1, 'TYPE', name.type);
    if (name.prefix) this.line(level + 1, 'NPFX', name.prefix);
    if (name.given) this.line(level + 1, 'GIVN', name.given);
    if (name.nickname) this.line(level + 1, 'NICK', name.nickname);
    if (name.surnamePrefix) this.line(level + 1, 'SPFX', name.surnamePrefix);
    if (name.surname) this.line(level + 1, 'SURN', name.surname);
    if (name.suffix) this.line(level + 1, 'NSFX', name.suffix);
    if (name.phonetic) {
      for (const pv of name.phonetic) {
        this.line(level + 1, 'FONE', pv.value);
        if (pv.type) this.line(level + 2, 'TYPE', pv.type);
      }
    }
    if (name.romanized) {
      for (const rv of name.romanized) {
        this.line(level + 1, 'ROMN', rv.value);
        if (rv.type) this.line(level + 2, 'TYPE', rv.type);
      }
    }
    this.writeSourceCitations(level + 1, name.sources);
    this.writeNoteRefs(level + 1, name.notes);
  }

  // ─── Record writers ───────────────────────────────────────────

  writeHeader(header: Header): void {
    this.line(0, 'HEAD');
    this.line(1, 'SOUR', header.sourceSystem.id);
    if (header.sourceSystem.version) this.line(2, 'VERS', header.sourceSystem.version);
    if (header.sourceSystem.name) this.line(2, 'NAME', header.sourceSystem.name);
    if (header.sourceSystem.corporation) {
      this.line(2, 'CORP', header.sourceSystem.corporation.name);
      this.writeAddress(3, header.sourceSystem.corporation.address, 2);
    }
    if (header.sourceSystem.data) {
      this.line(2, 'DATA', header.sourceSystem.data.name);
      this.writeDate(3, header.sourceSystem.data.date);
      if (header.sourceSystem.data.copyright) this.line(3, 'COPR', header.sourceSystem.data.copyright);
    }
    if (header.destination) this.line(1, 'DEST', header.destination);
    if (header.transmissionDate) {
      this.writeDate(1, header.transmissionDate);
      if (header.transmissionTime) this.line(2, 'TIME', header.transmissionTime);
    }
    this.line(1, 'SUBM', header.submitter);
    if (header.submission) this.line(1, 'SUBN', header.submission);
    if (header.file) this.line(1, 'FILE', header.file);
    if (header.copyright) this.line(1, 'COPR', header.copyright);
    this.line(1, 'GEDC');
    this.line(2, 'VERS', header.gedcom.version);
    this.line(2, 'FORM', header.gedcom.form);
    this.line(1, 'CHAR', header.charset.name);
    if (header.charset.version) this.line(2, 'VERS', header.charset.version);
    if (header.language) this.line(1, 'LANG', header.language);
    if (header.placeForm) {
      this.line(1, 'PLAC');
      this.line(2, 'FORM', header.placeForm);
    }
    if (header.note) this.line(1, 'NOTE', header.note);
  }

  writeIndividual(indi: Individual): void {
    this.line(0, 'INDI', undefined, indi.xref);
    if (indi.restriction) this.line(1, 'RESN', indi.restriction);

    for (const name of indi.names) this.writePersonalName(1, name);
    if (indi.sex) this.line(1, 'SEX', indi.sex);

    // Events
    this.writeEvent(1, 'BIRT', indi.birth);
    this.writeEvent(1, 'CHR', indi.christening);
    this.writeEvent(1, 'DEAT', indi.death);
    this.writeEvent(1, 'BURI', indi.burial);
    this.writeEvent(1, 'CREM', indi.cremation);
    this.writeEvent(1, 'ADOP', indi.adoption);
    this.writeEvent(1, 'BAPM', indi.baptism);
    this.writeEvent(1, 'BARM', indi.barMitzvah);
    this.writeEvent(1, 'BASM', indi.basMitzvah);
    this.writeEvent(1, 'BLES', indi.blessing);
    this.writeEvent(1, 'CHRA', indi.adultChristening);
    this.writeEvent(1, 'CONF', indi.confirmation);
    this.writeEvent(1, 'FCOM', indi.firstCommunion);
    this.writeEvent(1, 'NATU', indi.naturalization);
    this.writeEvent(1, 'EMIG', indi.emigration);
    this.writeEvent(1, 'IMMI', indi.immigration);
    this.writeEvent(1, 'PROB', indi.probate);
    this.writeEvent(1, 'WILL', indi.will);
    this.writeEvent(1, 'GRAD', indi.graduation);
    this.writeEvent(1, 'RETI', indi.retirement);
    if (indi.census) for (const evt of indi.census) this.writeEvent(1, 'CENS', evt);
    if (indi.events) for (const evt of indi.events) this.writeEvent(1, 'EVEN', evt);

    // Attributes
    this.writeEvent(1, 'CAST', indi.caste);
    this.writeEvent(1, 'DSCR', indi.physicalDescription);
    this.writeEvent(1, 'EDUC', indi.education);
    this.writeEvent(1, 'IDNO', indi.nationalId);
    this.writeEvent(1, 'NATI', indi.nationality);
    this.writeEvent(1, 'NCHI', indi.childrenCount);
    this.writeEvent(1, 'NMR', indi.marriageCount);
    this.writeEvent(1, 'OCCU', indi.occupation);
    this.writeEvent(1, 'PROP', indi.property);
    this.writeEvent(1, 'RELI', indi.religion);
    this.writeEvent(1, 'SSN', indi.socialSecurityNumber);
    this.writeEvent(1, 'TITL', indi.title);
    if (indi.residence) for (const evt of indi.residence) this.writeEvent(1, 'RESI', evt);
    if (indi.facts) for (const evt of indi.facts) this.writeEvent(1, 'FACT', evt);

    // Family links
    for (const link of indi.familiesAsChild) {
      this.line(1, 'FAMC', link.family);
      if (link.pedigree) this.line(2, 'PEDI', link.pedigree);
      if (link.status) this.line(2, 'STAT', link.status);
      this.writeNoteRefs(2, link.notes);
    }
    for (const link of indi.familiesAsSpouse) {
      this.line(1, 'FAMS', link.family);
      this.writeNoteRefs(2, link.notes);
    }

    // LDS ordinances
    this.writeLdsOrdinance(1, 'BAPL', indi.ldsBaptism);
    this.writeLdsOrdinance(1, 'CONL', indi.ldsConfirmation);
    this.writeLdsOrdinance(1, 'ENDL', indi.ldsEndowment);
    this.writeLdsOrdinance(1, 'SLGC', indi.ldsSealingToParents);

    // Other
    if (indi.submitters) for (const s of indi.submitters) this.line(1, 'SUBM', s);
    if (indi.associations) {
      for (const a of indi.associations) {
        this.line(1, 'ASSO', a.xref);
        this.line(2, 'RELA', a.relation);
        this.writeNoteRefs(2, a.notes);
        this.writeSourceCitations(2, a.sources);
      }
    }
    if (indi.aliases) for (const a of indi.aliases) this.line(1, 'ALIA', a);
    if (indi.ancestorInterest) for (const a of indi.ancestorInterest) this.line(1, 'ANCI', a);
    if (indi.descendantInterest) for (const d of indi.descendantInterest) this.line(1, 'DESI', d);
    this.writeReferenceNumbers(1, indi.referenceNumbers);
    if (indi.recordId) this.line(1, 'RIN', indi.recordId);
    this.writeChangeDate(1, indi.changeDate);
    this.writeNoteRefs(1, indi.notes);
    this.writeSourceCitations(1, indi.sources);
    this.writeMultimediaRefs(1, indi.multimedia);
    this.writeUnknownTags(1, indi.extensions);
  }

  writeFamily(fam: Family): void {
    this.line(0, 'FAM', undefined, fam.xref);
    if (fam.restriction) this.line(1, 'RESN', fam.restriction);
    if (fam.husband) this.line(1, 'HUSB', fam.husband);
    if (fam.wife) this.line(1, 'WIFE', fam.wife);
    for (const child of fam.children) this.line(1, 'CHIL', child);
    if (fam.childrenCount !== undefined) this.line(1, 'NCHI', String(fam.childrenCount));

    this.writeEvent(1, 'ANUL', fam.annulment);
    this.writeEvent(1, 'DIV', fam.divorce);
    this.writeEvent(1, 'DIVF', fam.divorceFiled);
    this.writeEvent(1, 'ENGA', fam.engagement);
    this.writeEvent(1, 'MARR', fam.marriage);
    this.writeEvent(1, 'MARB', fam.marriageBanns);
    this.writeEvent(1, 'MARC', fam.marriageContract);
    this.writeEvent(1, 'MARL', fam.marriageLicense);
    this.writeEvent(1, 'MARS', fam.marriageSettlement);
    if (fam.census) for (const evt of fam.census) this.writeEvent(1, 'CENS', evt);
    if (fam.events) for (const evt of fam.events) this.writeEvent(1, 'EVEN', evt);

    this.writeLdsOrdinance(1, 'SLGS', fam.ldsSealingToSpouse);

    if (fam.submitters) for (const s of fam.submitters) this.line(1, 'SUBM', s);
    this.writeReferenceNumbers(1, fam.referenceNumbers);
    if (fam.recordId) this.line(1, 'RIN', fam.recordId);
    this.writeChangeDate(1, fam.changeDate);
    this.writeNoteRefs(1, fam.notes);
    this.writeSourceCitations(1, fam.sources);
    this.writeMultimediaRefs(1, fam.multimedia);
    this.writeUnknownTags(1, fam.extensions);
  }

  writeSource(src: Source): void {
    this.line(0, 'SOUR', undefined, src.xref);
    if (src.data) {
      this.line(1, 'DATA');
      if (src.data.events) {
        for (const evt of src.data.events) {
          this.line(2, 'EVEN', evt.types);
          this.writeDate(3, evt.date);
          if (evt.place) this.line(3, 'PLAC', evt.place);
        }
      }
      if (src.data.agency) this.line(2, 'AGNC', src.data.agency);
      this.writeNoteRefs(2, src.data.notes);
    }
    if (src.author) this.line(1, 'AUTH', src.author);
    if (src.title) this.line(1, 'TITL', src.title);
    if (src.abbreviation) this.line(1, 'ABBR', src.abbreviation);
    if (src.publication) this.line(1, 'PUBL', src.publication);
    if (src.text) this.line(1, 'TEXT', src.text);
    if (src.repository) {
      this.line(1, 'REPO', src.repository.repo);
      this.writeNoteRefs(2, src.repository.notes);
      if (src.repository.callNumbers) {
        for (const cn of src.repository.callNumbers) {
          this.line(2, 'CALN', cn.value);
          if (cn.mediaType) this.line(3, 'MEDI', cn.mediaType);
        }
      }
    }
    this.writeReferenceNumbers(1, src.referenceNumbers);
    if (src.recordId) this.line(1, 'RIN', src.recordId);
    this.writeChangeDate(1, src.changeDate);
    this.writeNoteRefs(1, src.notes);
    this.writeMultimediaRefs(1, src.multimedia);
    this.writeUnknownTags(1, src.extensions);
  }

  writeRepository(repo: Repository): void {
    this.line(0, 'REPO', undefined, repo.xref);
    this.line(1, 'NAME', repo.name);
    this.writeAddress(1, repo.address, 0);
    this.writeNoteRefs(1, repo.notes);
    this.writeReferenceNumbers(1, repo.referenceNumbers);
    if (repo.recordId) this.line(1, 'RIN', repo.recordId);
    this.writeChangeDate(1, repo.changeDate);
    this.writeUnknownTags(1, repo.extensions);
  }

  writeNoteRecord(note: NoteRecord): void {
    this.line(0, 'NOTE', note.text, note.xref);
    this.writeSourceCitations(1, note.sources);
    this.writeReferenceNumbers(1, note.referenceNumbers);
    if (note.recordId) this.line(1, 'RIN', note.recordId);
    this.writeChangeDate(1, note.changeDate);
    this.writeUnknownTags(1, note.extensions);
  }

  writeMultimediaRecord(rec: MultimediaRecord): void {
    this.line(0, 'OBJE', undefined, rec.xref);
    for (const f of rec.files) {
      this.line(1, 'FILE', f.file);
      this.line(2, 'FORM', f.format);
      if (f.mediaType) this.line(3, 'MEDI', f.mediaType);
      if (f.title) this.line(2, 'TITL', f.title);
    }
    this.writeNoteRefs(1, rec.notes);
    this.writeSourceCitations(1, rec.sources);
    this.writeReferenceNumbers(1, rec.referenceNumbers);
    if (rec.recordId) this.line(1, 'RIN', rec.recordId);
    this.writeChangeDate(1, rec.changeDate);
    this.writeUnknownTags(1, rec.extensions);
  }

  writeSubmitter(subm: Submitter): void {
    this.line(0, 'SUBM', undefined, subm.xref);
    this.line(1, 'NAME', subm.name);
    this.writeAddress(1, subm.address, 0);
    this.writeMultimediaRefs(1, subm.multimedia);
    if (subm.languages) for (const l of subm.languages) this.line(1, 'LANG', l);
    if (subm.rfn) this.line(1, 'RFN', subm.rfn);
    this.writeReferenceNumbers(1, subm.referenceNumbers);
    if (subm.recordId) this.line(1, 'RIN', subm.recordId);
    this.writeChangeDate(1, subm.changeDate);
    this.writeNoteRefs(1, subm.notes);
    this.writeUnknownTags(1, subm.extensions);
  }

  writeSubmission(subn: Submission): void {
    this.line(0, 'SUBN', undefined, subn.xref);
    if (subn.submitter) this.line(1, 'SUBM', subn.submitter);
    if (subn.familyFile) this.line(1, 'FAMF', subn.familyFile);
    if (subn.temple) this.line(1, 'TEMP', subn.temple);
    if (subn.ancestorGenerations !== undefined) this.line(1, 'ANCE', String(subn.ancestorGenerations));
    if (subn.descendantGenerations !== undefined) this.line(1, 'DESC', String(subn.descendantGenerations));
    if (subn.ordinanceProcessFlag) this.line(1, 'ORDI', subn.ordinanceProcessFlag);
    if (subn.recordId) this.line(1, 'RIN', subn.recordId);
    this.writeNoteRefs(1, subn.notes);
    this.writeUnknownTags(1, subn.extensions);
  }
}

// ─── Main entry point ──────────────────────────────────────────────

export function writeGedcom(file: GedcomFile): string {
  const w = new GedcomWriter();

  w.writeHeader(file.header);

  if (file.submission) w.writeSubmission(file.submission);
  for (const subm of file.submitters.values()) w.writeSubmitter(subm);
  for (const indi of file.individuals.values()) w.writeIndividual(indi);
  for (const fam of file.families.values()) w.writeFamily(fam);
  for (const src of file.sources.values()) w.writeSource(src);
  for (const repo of file.repositories.values()) w.writeRepository(repo);
  for (const note of file.notes.values()) w.writeNoteRecord(note);
  for (const mm of file.multimedia.values()) w.writeMultimediaRecord(mm);

  w.line(0, 'TRLR');

  return w.toString();
}
