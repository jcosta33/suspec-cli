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

    it('reads a wrapped flow-style scope list across continuation lines (private workspace #15)', () => {
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

- \`suspec-cli:src/x.ts\`
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

    it('a fenced `## ` heading does not false-close a section; a fenced backticked path is not a protection/area', () => {
        const packet = parse_task_packet(`---
scope: [AC-001]
---
## Do not change

- \`src/frozen.ts\`

\`\`\`md
- \`src/example-only.ts\`
## Affected areas
\`\`\`

## Affected areas

- \`src/real.ts\`
`);
        expect(packet.doNotChange).toEqual(['src/frozen.ts']); // the fenced example path is excluded
        expect(packet.affectedAreas).toEqual(['src/real.ts']); // the section was not false-closed by the fenced H2
    });
});

describe('parse_task_packet — embedded spec snapshot (ADR-0100, suspec-cli#2)', () => {
    it('parses embedded-spec + the scoped requirements (verify command or none)', () => {
        const packet = `---\ntype: task\nid: TASK-x\nsource:\n  - SPEC-x\nscope: [AC-001, AC-002]\nstatus: ready\n---\n\n## Spec snapshot\n\nembedded-spec: SPEC-x\n\n- AC-001 — verify: \`pnpm test\`\n- AC-002 — verify: (none)\n\n## Run summary\n`;
        const parsed = parse_task_packet(packet);
        expect(parsed.embeddedSpecId).toBe('SPEC-x');
        expect(parsed.embeddedRequirements).toEqual([
            { id: 'AC-001', verifyCommand: 'pnpm test' },
            { id: 'AC-002', verifyCommand: null },
        ]);
    });

    it('a packet with no ## Spec snapshot has a null embedded id + empty requirements', () => {
        const packet = '---\ntype: task\nid: TASK-x\nscope: [AC-001]\nstatus: ready\n---\n\n## Run summary\n';
        const parsed = parse_task_packet(packet);
        expect(parsed.embeddedSpecId).toBeNull();
        expect(parsed.embeddedRequirements).toEqual([]);
    });
});
