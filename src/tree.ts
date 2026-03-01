export interface GedcomNode {
  level: number;
  xref?: string;
  tag: string;
  value?: string;
  children: GedcomNode[];
  lineNumber: number;
}

const LINE_RE = /^(\d+)\s+(@[^@]+@)?\s*([A-Za-z_]\w*)(?:\s(.*))?$/;

export interface TreeParseResult {
  roots: GedcomNode[];
  errors: Array<{ line: number; text: string; message: string }>;
}

export function buildTree(input: string): TreeParseResult {
  const lines = input.split(/\r?\n/);
  const roots: GedcomNode[] = [];
  const errors: Array<{ line: number; text: string; message: string }> = [];
  const stack: GedcomNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '') continue;

    const match = LINE_RE.exec(trimmed);
    if (!match) {
      errors.push({ line: i + 1, text: raw, message: 'Malformed GEDCOM line' });
      continue;
    }

    const level = parseInt(match[1], 10);
    const xref = match[2]; // includes @ signs
    const tag = match[3].toUpperCase();
    const value = match[4];

    const node: GedcomNode = {
      level,
      tag,
      value,
      children: [],
      lineNumber: i + 1,
    };
    if (xref) node.xref = xref;

    // Handle CONC/CONT — attach to the most recent node at level-1
    if (tag === 'CONC' || tag === 'CONT') {
      const parent = stack[stack.length - 1];
      if (parent) {
        if (parent.value === undefined) parent.value = '';
        if (tag === 'CONT') {
          parent.value += '\n' + (value ?? '');
        } else {
          parent.value += (value ?? '');
        }
      }
      continue;
    }

    // Pop the stack to find this node's parent
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return { roots, errors };
}

export function findChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find(c => c.tag === tag);
}

export function findChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter(c => c.tag === tag);
}
