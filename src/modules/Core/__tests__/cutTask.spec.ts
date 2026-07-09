import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { assertErr } from '../../../infra/errors/testing/assertErr.ts';
import { cut_task } from '../useCases/cutTask.ts';

let store: string;

const SPEC = `---
type: spec
id: SPEC-checkout
title: Checkout
status: ready
sources:
  - self
---

# Checkout

## Intent

Checkout applies the discount.

## Requirements

### AC-001 — applies

When a code is valid, checkout must apply it.

Verify with: pnpm test checkout

### AC-002 — rejects

When a code is expired, checkout must reject it.

Verify with: pnpm test expiry
`;

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-cuttask-'));
    writeFileSync(join(store, 'spec-checkout.md'), SPEC);
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

describe('cut_task — store task slices (ADR-0137)', () => {
    it('cuts task-<slug>.md INTO THE STORE with the scoped requirements + verify commands', () => {
        const report = assertOk(cut_task({ storeDir: store, specRef: 'SPEC-checkout', scope: ['AC-001'] }));
        expect(report.taskId).toBe('TASK-checkout');
        expect(report.path).toBe(join(store, 'task-checkout.md'));
        const content = readFileSync(report.path, 'utf8');
        expect(content).toContain('type: task');
        expect(content).toContain('scope: [AC-001]');
        expect(content).toContain('- [ ] pnpm test checkout (AC-001)');
        expect(content).toContain(`- Spec: \`${join(store, 'spec-checkout.md')}\``);
        expect(content).toContain('embedded-spec: SPEC-checkout');
        // atomic store write stamps the grammar version
        expect(content).toContain('grammar_version:');
    });

    it('resolves the spec by slug too, and dedups the requested scope', () => {
        const report = assertOk(cut_task({ storeDir: store, specRef: 'checkout', scope: ['AC-001', 'AC-001'] }));
        expect(report.specId).toBe('SPEC-checkout');
        expect(report.scope).toEqual(['AC-001']);
    });

    it('a scope id the spec does not define is an error — scope is never invented', () => {
        const failure = assertErr(cut_task({ storeDir: store, specRef: 'SPEC-checkout', scope: ['AC-009'] }));
        expect(failure._tag).toBe('unknown_scope');
        expect(failure.message).toContain('AC-009');
    });

    it('an empty scope cuts an unbounded slice with the placeholder scope section', () => {
        const report = assertOk(cut_task({ storeDir: store, specRef: 'SPEC-checkout', scope: [] }));
        expect(readFileSync(report.path, 'utf8')).toContain('<!-- add the requirement ids this task covers -->');
    });

    it('a missing spec errs store_spec_not_found', () => {
        const failure = assertErr(cut_task({ storeDir: store, specRef: 'SPEC-ghost', scope: [] }));
        expect(failure._tag).toBe('store_spec_not_found');
    });

    it('an unparseable spec errs store_spec_unparseable', () => {
        writeFileSync(join(store, 'spec-broken.md'), 'no frontmatter at all');
        const failure = assertErr(cut_task({ storeDir: store, specRef: 'broken', scope: [] }));
        expect(failure._tag).toBe('store_spec_unparseable');
    });

    it('the second default cut auto-suffixes (-2) and reports it', () => {
        assertOk(cut_task({ storeDir: store, specRef: 'SPEC-checkout', scope: ['AC-001'] }));
        const second = assertOk(cut_task({ storeDir: store, specRef: 'SPEC-checkout', scope: ['AC-002'] }));
        expect(second.taskId).toBe('TASK-checkout-2');
        expect(second.autoSuffixed).toBe(true);
        expect(existsSync(join(store, 'task-checkout-2.md'))).toBe(true);
    });

    it('an explicit --id collides hard (no auto-suffix) unless --force replaces it', () => {
        assertOk(cut_task({ storeDir: store, specRef: 'SPEC-checkout', scope: [], taskId: 'TASK-mine' }));
        const collision = assertErr(
            cut_task({ storeDir: store, specRef: 'SPEC-checkout', scope: [], taskId: 'TASK-mine' })
        );
        expect(collision._tag).toBe('task_exists');
        const replaced = assertOk(
            cut_task({ storeDir: store, specRef: 'SPEC-checkout', scope: ['AC-002'], taskId: 'TASK-mine', force: true })
        );
        expect(replaced.autoSuffixed).toBe(false);
        expect(readFileSync(replaced.path, 'utf8')).toContain('scope: [AC-002]');
    });

    it('a path-escaping task id is rejected before any write', () => {
        const failure = assertErr(
            cut_task({ storeDir: store, specRef: 'SPEC-checkout', scope: [], taskId: 'TASK-../escape' })
        );
        expect(failure._tag).toBe('Usage');
        expect(existsSync(join(store, '..', 'escape.md'))).toBe(false);
    });

    it('an AC with no named Verify command falls back to the placeholder', () => {
        writeFileSync(
            join(store, 'spec-bare.md'),
            [
                '---',
                'type: spec',
                'id: SPEC-bare',
                'title: Bare',
                'status: ready',
                'sources:',
                '  - self',
                '---',
                '',
                '# Bare',
                '',
                '## Requirements',
                '',
                '### AC-001 — thing',
                '',
                'It must thing.',
                '',
            ].join('\n')
        );
        const report = assertOk(cut_task({ storeDir: store, specRef: 'SPEC-bare', scope: ['AC-001'] }));
        expect(readFileSync(report.path, 'utf8')).toContain('- [ ] {{command}} (AC-001)');
    });
});
