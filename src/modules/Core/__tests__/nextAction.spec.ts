import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { next_action } from '../useCases/nextAction.ts';

// SPEC-suspec-v2 AC-023: the `next` ranking engine — store-only reads, most actionable first:
// dead-live run (1) > fresh-live run (2) > finished run with gate gaps (3) > triage debt (4) >
// ready/draft specs (5). Pure filesystem fixtures; nothing here can reach a network.

let store: string;
const NOW = new Date('2026-07-08T12:00:00Z');
const FRESH = '2026-07-08T11:55:00Z'; // 5 min old — fresh under the 15-min threshold
const DEAD = '2026-07-08T09:00:00Z'; // hours old — dead

beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), 'suspec-next-'));
});
afterEach(() => {
    rmSync(store, { recursive: true, force: true });
});

function spec(slug: string, status: string, acs: string[] = ['AC-001']): void {
    const requirements = acs
        .map((id) => `### ${id} — a thing\n\nThe tool must do it.\n\nVerify with: a test.\n`)
        .join('\n');
    writeFileSync(
        join(store, `spec-${slug}.md`),
        `---\ntype: spec\nid: SPEC-${slug}\nstatus: ${status}\ngrammar_version: 1\n---\n\n## Requirements\n\n${requirements}\n## Non-goals\n\n- none.\n`
    );
}

function run_file(slug: string, fm: Record<string, string>): void {
    const lines = Object.entries(fm)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    writeFileSync(join(store, `run-${slug}.md`), `---\ntype: run\n${lines}\n---\n\n# Run\n`);
}

function evidence(runSlug: string, stem: string, ac: string, exit: number): void {
    const dir = join(store, 'evidence', runSlug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${stem}.md`), `---\ntype: evidence\nac: ${ac}\nexit: ${exit}\nprovenance: agent\n---\n`);
}

describe('next_action', () => {
    it('an empty / missing store ranks nothing', () => {
        expect(next_action({ storeDir: store, now: NOW })).toEqual([]);
        expect(next_action({ storeDir: join(store, 'nope'), now: NOW })).toEqual([]);
    });

    it('a live run with a FRESH heartbeat beats a ready spec (live-beats-ready)', () => {
        spec('feat', 'live');
        spec('other', 'ready');
        run_file('feat', { spec: 'SPEC-feat', worktree: store, status: 'live', pid: '1', heartbeat: FRESH });
        const items = next_action({ storeDir: store, now: NOW });
        expect(items[0]).toMatchObject({ rank: 2, kind: 'live-run', ref: 'feat' });
        expect(items[0].action).toContain('attach');
        // the ready spec still ranks — below the live run, and only the un-surfaced one
        expect(items.map((item) => item.kind)).toEqual(['live-run', 'spec']);
        expect(items[1].ref).toBe('SPEC-other');
    });

    it('a live run with a DEAD heartbeat outranks everything → reclaim/attach', () => {
        spec('feat', 'live');
        run_file('feat', {
            spec: 'SPEC-feat',
            worktree: join(store, 'gone'),
            status: 'live',
            pid: '1',
            heartbeat: DEAD,
        });
        run_file('fresh', { spec: 'SPEC-feat2', worktree: store, status: 'live', pid: '2', heartbeat: FRESH });
        const items = next_action({ storeDir: store, now: NOW });
        expect(items[0]).toMatchObject({ rank: 1, kind: 'reclaim-run', ref: 'feat' });
        expect(items[0].detail).toContain('heartbeat is dead');
        expect(items[0].detail).toContain('worktree gone');
        expect(items[0].action).toContain('suspec work SPEC-feat');
        expect(items[1].rank).toBe(2);
    });

    it('a spec-less dead-live run (a crashed check-my-work --save) points at store doctor', () => {
        run_file('check-x', { intent: 'x', worktree: store, status: 'live', pid: '1', heartbeat: DEAD });
        const items = next_action({ storeDir: store, now: NOW });
        expect(items[0]).toMatchObject({ rank: 1, ref: 'check-x' });
        expect(items[0].action).toContain('store doctor');
    });

    it('a finished-but-not-done run whose spec has ACs lacking exit-0 evidence ranks as gate gaps', () => {
        spec('feat', 'live', ['AC-001', 'AC-002']);
        run_file('feat', { spec: 'SPEC-feat', worktree: store, status: 'exited', exit: '0' });
        evidence('feat', '001-test', 'AC-001', 0);
        evidence('feat', '002-lint', 'AC-002', 1); // a failing record satisfies nothing
        const items = next_action({ storeDir: store, now: NOW });
        expect(items[0]).toMatchObject({ rank: 3, kind: 'gate-gaps', ref: 'feat' });
        expect(items[0].detail).toContain('AC-002');
        expect(items[0].detail).not.toContain('AC-001,');
        expect(items[0].action).toContain('suspec evidence add feat');
    });

    it('a run marked done never ranks, and a fully-evidenced run has no gaps item', () => {
        spec('done-one', 'live');
        run_file('done-one', { spec: 'SPEC-done-one', worktree: store, status: 'done' });
        spec('full', 'live');
        run_file('full', { spec: 'SPEC-full', worktree: store, status: 'exited' });
        evidence('full', '001-test', 'AC-001', 0);
        expect(next_action({ storeDir: store, now: NOW })).toEqual([]);
    });

    it('a spec-less or unresolvable-spec run never ranks as gate gaps', () => {
        run_file('check-x', { intent: 'x', worktree: store, status: 'exited', exit: '0' });
        run_file('ghost', { spec: 'SPEC-ghost', worktree: store, status: 'exited' });
        expect(next_action({ storeDir: store, now: NOW })).toEqual([]);
    });

    it('untriaged findings and expired keeps aggregate into one triage item above the spec backlog', () => {
        spec('feat', 'ready');
        writeFileSync(join(store, 'finding-001.md'), '---\ntype: finding\nseverity: minor\n---\n'); // untriaged
        writeFileSync(join(store, 'finding-002.md'), '---\ntype: finding\nexpires: 2026-07-01\n---\n'); // expired keep
        writeFileSync(join(store, 'finding-003.md'), '---\ntype: finding\nexpires: 2026-08-01\n---\n'); // still kept
        const items = next_action({ storeDir: store, now: NOW });
        expect(items[0]).toMatchObject({ rank: 4, kind: 'triage', ref: 'findings' });
        expect(items[0].detail).toContain('1 untriaged finding(s)');
        expect(items[0].detail).toContain('1 expired keep(s)');
        expect(items[0].action).toContain('suspec store doctor');
        expect(items[1]).toMatchObject({ rank: 5, ref: 'SPEC-feat' });
    });

    it('skips unreadable entries; a parse-failing or requirement-less spec never yields a gaps item', () => {
        mkdirSync(join(store, 'run-dir.md')); // a dir masquerading as an artifact — skipped, never a crash
        writeFileSync(join(store, 'spec-broken.md'), 'no frontmatter at all\n'); // parse-failing
        run_file('broken', { spec: 'broken', worktree: store, status: 'exited' });
        writeFileSync(
            join(store, 'spec-bare.md'),
            '---\ntype: spec\nid: SPEC-bare\nstatus: live\ngrammar_version: 1\n---\n\nno requirements yet\n'
        );
        run_file('bare', { spec: 'SPEC-bare', worktree: store, status: 'exited' });
        expect(next_action({ storeDir: store, now: NOW })).toEqual([]);
    });

    it('a spec-less, pid-less, worktree-less fresh-live run still ranks attach-or-wait (fallback fields)', () => {
        run_file('mystery', { status: 'live', heartbeat: FRESH });
        const items = next_action({ storeDir: store, now: NOW });
        expect(items[0]).toMatchObject({ rank: 2, kind: 'live-run', ref: 'mystery' });
        expect(items[0].detail).toContain('a live run holds mystery');
        expect(items[0].detail).toContain('pid unknown');
        expect(items[0].action).toContain('its worktree');
    });

    it('expired keeps alone still aggregate into the triage item', () => {
        writeFileSync(join(store, 'finding-009.md'), '---\ntype: finding\nexpires: 2026-07-01\n---\n');
        const items = next_action({ storeDir: store, now: NOW });
        expect(items[0].detail).toBe('1 expired keep(s) sit in the store');
    });

    it('a run naming its spec by SLUG also keeps it out of the backlog; an id-less spec keys on its slug', () => {
        spec('feat', 'ready');
        run_file('feat', { spec: 'feat', worktree: store, status: 'done' }); // a slug ref, already done
        writeFileSync(
            join(store, 'spec-noid.md'),
            '---\ntype: spec\nstatus: draft\ngrammar_version: 1\n---\n\n## Requirements\n\n### AC-001 — x\n\nIt must work.\n\nVerify with: a test.\n'
        );
        const items = next_action({ storeDir: store, now: NOW });
        expect(items.map((item) => item.ref)).toEqual(['noid']); // SPEC-feat excluded via its slug
    });

    it('orders ready before draft regardless of listing order, and same-status specs by slug', () => {
        spec('aa-ready', 'ready');
        spec('bb-ready', 'ready');
        spec('zz-draft', 'draft');
        expect(next_action({ storeDir: store, now: NOW }).map((item) => item.ref)).toEqual([
            'SPEC-aa-ready',
            'SPEC-bb-ready',
            'SPEC-zz-draft',
        ]);
    });

    it('ready specs rank before draft specs; terminal statuses never rank', () => {
        spec('zz-ready', 'ready');
        spec('aa-draft', 'draft');
        spec('old', 'exited');
        const items = next_action({ storeDir: store, now: NOW });
        expect(items.map((item) => item.ref)).toEqual(['SPEC-zz-ready', 'SPEC-aa-draft']);
        expect(items[0].action).toContain('suspec work SPEC-zz-ready');
        expect(items[1].action).toContain('finish authoring');
    });
});
