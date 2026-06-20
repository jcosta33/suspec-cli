import { describe, it, expect } from 'vitest';

import { parse_task_packet } from '../useCases/parseTaskPacket.ts';

const PACKET = `---
type: task
id: TASK-feat
source:
  - SPEC-feat
scope: [AC-001, AC-002, AC-003]
status: review-ready
---

# Task: feat

## Affected areas

- \`src/modules/Core/useCases/reconcileReview.ts\`
- \`web: src/checkout/cart.ts\`

## Verify

- [ ] \`pnpm test\` (AC-001)

## Run summary

- Changed files: \`src/modules/Core/useCases/reconcileReview.ts\`, \`src/index.ts\`
- Verify results: green
`;

describe('parse_task_packet — scope (AC-017)', () => {
    it('splits the flow-style scope list into requirement ids', () => {
        expect(parse_task_packet(PACKET).scope).toEqual(['AC-001', 'AC-002', 'AC-003']);
    });

    it('reads a bare scalar scope', () => {
        const single = parse_task_packet(PACKET.replace('scope: [AC-001, AC-002, AC-003]', 'scope: AC-007'));
        expect(single.scope).toEqual(['AC-007']);
    });

    it('a packet with no scope key yields an empty scope', () => {
        const noScope = parse_task_packet(PACKET.replace('scope: [AC-001, AC-002, AC-003]\n', ''));
        expect(noScope.scope).toEqual([]);
    });

    it('an empty flow-style scope list yields an empty scope', () => {
        const empty = parse_task_packet(PACKET.replace('scope: [AC-001, AC-002, AC-003]', 'scope: []'));
        expect(empty.scope).toEqual([]);
    });

    it('a packet with no frontmatter fence yields an empty scope', () => {
        expect(parse_task_packet('# Task\n\nno frontmatter\n').scope).toEqual([]);
    });

    it('reads a wrapped flow-style scope list across continuation lines (swarm-hq #15)', () => {
        const wrapped = `---\ntype: task\nid: TASK-feat\nscope: [AC-001,\n  AC-002,\n  AC-003]\nstatus: review-ready\n---\n# Task\n`;
        expect(parse_task_packet(wrapped).scope).toEqual(['AC-001', 'AC-002', 'AC-003']);
    });

    it('reads a bracket-on-next-line scope list (the flagship-demo shape that parsed empty before)', () => {
        const nextLine = `---\ntype: task\nid: TASK-feat\nscope:\n  [AC-001, AC-002, PG-001]\nstatus: review-ready\n---\n# Task\n`;
        expect(parse_task_packet(nextLine).scope).toEqual(['AC-001', 'AC-002', 'PG-001']);
    });

    it('reads a block-style scope list, and a bare scalar does not over-read the next key', () => {
        const block = `---\ntype: task\nid: TASK-feat\nscope:\n  - AC-001\n  - AC-002\nstatus: review-ready\n---\n# Task\n`;
        expect(parse_task_packet(block).scope).toEqual(['AC-001', 'AC-002']);
        const scalar = `---\ntype: task\nscope: AC-007\nstatus: review-ready\n---\n# Task\n`;
        expect(parse_task_packet(scalar).scope).toEqual(['AC-007']); // stops at the next top-level key
    });
});

describe('parse_task_packet — ReDoS guard (swarm-hq #15)', () => {
    it('parses a Changed-files line carrying a huge path-shaped token in well under a second', () => {
        const huge = `${'a/'.repeat(80000)}:`; // a non-matching token that was O(n²) under the old PATH_LIKE
        const packet = `---\ntype: task\nscope: [AC-001]\n---\n\n## Run summary\n\n- Changed files: ${huge}\n`;
        const start = Date.now();
        parse_task_packet(packet);
        expect(Date.now() - start).toBeLessThan(500);
    });
});

describe('parse_task_packet — Affected areas (AC-018)', () => {
    it('reads backtick paths and strips a context prefix', () => {
        expect(parse_task_packet(PACKET).affectedAreas).toEqual([
            'src/checkout/cart.ts',
            'src/modules/Core/useCases/reconcileReview.ts',
        ]);
    });

    it('strips a no-space context prefix (`ctx:path`) too', () => {
        const p = parse_task_packet(`---
scope: [AC-001]
---
## Affected areas

- \`swarm-cli:src/x.ts\`
`);
        expect(p.affectedAreas).toEqual(['src/x.ts']);
    });

    it('a prefix-only token strips to nothing and is skipped', () => {
        const p = parse_task_packet(`---
scope: [AC-001]
---
## Affected areas

- \`web:\`
`);
        expect(p.affectedAreas).toEqual([]);
    });

    it('skips a template line still carrying a {{placeholder}}', () => {
        const tmpl = parse_task_packet(`---
scope: [AC-001]
---
## Affected areas

- \`{{path}}\`
`);
        expect(tmpl.affectedAreas).toEqual([]);
    });
});

describe('parse_task_packet — Do not change (C014, ADR-0086)', () => {
    it('reads backtick paths under the Do not change section (shared matcher: strips a context prefix)', () => {
        const p = parse_task_packet(`---
scope: [AC-001]
---
## Do not change

- \`src/auth/token-family.ts\` — rotation logic is frozen.
- \`web: src/checkout/total.ts\`
`);
        expect(p.doNotChange).toEqual(['src/auth/token-family.ts', 'src/checkout/total.ts']);
    });

    it('skips the cutPacket placeholder default — a freshly-cut task protects nothing yet', () => {
        const tmpl = parse_task_packet(`---
scope: [AC-001]
---
## Do not change

- {{areas explicitly out of bounds}}
`);
        expect(tmpl.doNotChange).toEqual([]);
    });

    it('a packet with no Do not change section protects nothing', () => {
        expect(parse_task_packet(PACKET).doNotChange).toEqual([]);
    });
});

describe('parse_task_packet — Run summary changed files (AC-018)', () => {
    it('reads the backticked Changed files tokens', () => {
        expect(parse_task_packet(PACKET).claimedChangedFiles).toEqual([
            'src/index.ts',
            'src/modules/Core/useCases/reconcileReview.ts',
        ]);
    });

    it('falls back to bare path-like tokens when no backticks are used', () => {
        const bare = parse_task_packet(`---
scope: [AC-001]
---
## Run summary

- Changed files: src/a.ts, src/b.ts and some prose
`);
        expect(bare.claimedChangedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('a packet with an unfilled Run summary placeholder claims nothing', () => {
        const tmpl = parse_task_packet(`---
scope: [AC-001]
---
## Run summary

- Changed files: {{paths}}
`);
        expect(tmpl.claimedChangedFiles).toEqual([]);
    });

    it('a packet with no Run summary section claims nothing', () => {
        const none = parse_task_packet(`---
scope: [AC-001]
---
# Task
`);
        expect(none.claimedChangedFiles).toEqual([]);
    });

    it('drops backticked non-path tokens — a commit sha or a symbol is not a claimed file (#44)', () => {
        const noisy = parse_task_packet(`---
scope: [AC-001]
---
## Run summary

- Changed files: refactored \`reconcile_self_report\` in \`0791385\`, plus \`src/real.ts\`
`);
        expect(noisy.claimedChangedFiles).toEqual(['src/real.ts']);
    });

    it('a prose Changed files line with no path-like tokens claims nothing (#44)', () => {
        const prose = parse_task_packet(`---
scope: [AC-001]
---
## Run summary

- Changed files: taskLocator, deriveBoard, and the reconcile helpers
`);
        expect(prose.claimedChangedFiles).toEqual([]);
    });
});
