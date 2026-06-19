import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { build_anchor_resolver } from '../useCases/buildAnchorResolver.ts';

let dir: string;

const SOURCES = `# Sources

<a id="GOOGLESA"></a> Google, *Securing AI Agents*, 2025.
<a id="MAST"></a> The MAST taxonomy.
`;

const SPEC_WITH_SOURCES = `---
type: spec
id: SPEC-cite
status: ready
sources:
  - ../research/sources.md
---

## Requirements

### AC-001 — cites
It must hold per [[GOOGLESA]].
Verify with: a test.

## Non-goals

- none
`;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'swarm-anchor-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe('build_anchor_resolver', () => {
    it('resolves a key whose <a id> anchor exists in the named sources.md, and rejects a dangling one', () => {
        mkdirSync(join(dir, 'specs', 'cite'), { recursive: true });
        mkdirSync(join(dir, 'research'), { recursive: true });
        writeFileSync(join(dir, 'research', 'sources.md'), SOURCES);
        const specPath = join(dir, 'specs', 'cite', 'spec.md');
        // sources: ../research/sources.md resolves relative to the spec file.
        writeFileSync(specPath, SPEC_WITH_SOURCES.replace('../research/sources.md', '../../research/sources.md'));
        const resolves = build_anchor_resolver(
            SPEC_WITH_SOURCES.replace('../research/sources.md', '../../research/sources.md'),
            specPath
        );
        expect(resolves('GOOGLESA')).toBe(true);
        expect(resolves('MAST')).toBe(true);
        expect(resolves('FAROS2025')).toBe(false); // anchor absent → dangling
    });

    it('admits every key when the frontmatter names no sources.md (skip-when-nothing-to-check)', () => {
        const specPath = join(dir, 'spec.md');
        const spec = SPEC_WITH_SOURCES.replace('  - ../research/sources.md\n', '  - ADR-0077\n');
        writeFileSync(specPath, spec);
        const resolves = build_anchor_resolver(spec, specPath);
        expect(resolves('ANYTHING')).toBe(true);
    });

    it('admits every key when the named sources.md does not exist on disk', () => {
        const specPath = join(dir, 'spec.md');
        // sources: ../research/sources.md, but no such file is written → admit-all.
        const resolves = build_anchor_resolver(SPEC_WITH_SOURCES, specPath);
        expect(resolves('GOOGLESA')).toBe(true);
    });

    it('admits every key when the spec does not parse', () => {
        const resolves = build_anchor_resolver('no frontmatter fence here\n', join(dir, 'spec.md'));
        expect(resolves('ANYTHING')).toBe(true);
    });
});
