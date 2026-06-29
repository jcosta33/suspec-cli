// C017 orphaned-reference (ADR-0097, #45). A skill guide may bundle a `references/` directory — a
// point-of-need resource (a fillable template, a checklist) the SKILL.md is meant to send the reader
// to. A reference file the SKILL.md never names is ORPHANED: it ships weight no one is pointed at, the
// exact failure the refload field-test measured (a bundled template lifted output only when the guide
// actually loaded it). This walks the workspace's `.agents/skills/*/SKILL.md` and flags a bundled
// reference whose filename appears nowhere in its own SKILL.md body.
//
// Direction is ORPHAN-ONLY (a reference no one points at), never the inverse (a named-but-absent
// target) — the inverse is a different, higher-FP check (a guide naming `foo.md` in prose may mean a
// repo file, not a bundled reference). Matching is lenient — the bare filename anywhere in the body
// counts as "named" (a markdown link, a bare mention, a code span) — so the check stays 0-FP on a
// guide that does point at its references (measured 0-orphan on the real skills suspec, ADR-0097).

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// `reference` is the file's path RELATIVE to the references/ dir (e.g. `sub/named.md`), so a nested
// orphan is named precisely; `basename` is what the SKILL.md is checked for naming.
export type OrphanedReference = Readonly<{ skill: string; reference: string }>;
type ReferenceFile = Readonly<{ rel: string; basename: string }>;

// Collect every file under a references/ dir (recursively), each with its path relative to references/.
function reference_files(refsDir: string, prefix = ''): ReferenceFile[] {
    const out: ReferenceFile[] = [];
    for (const entry of readdirSync(refsDir).sort()) {
        const full = join(refsDir, entry);
        const rel = prefix === '' ? entry : `${prefix}/${entry}`;
        if (statSync(full).isDirectory()) {
            out.push(...reference_files(full, rel));
        } else {
            out.push({ rel, basename: entry });
        }
    }
    return out;
}

function escape_regexp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A reference is "named" when its basename appears in the SKILL.md at a FILENAME boundary — preceded by
// start-of-text or a non-filename char (so `references/a.md`, `` `a.md` ``, `(a.md)` all count). The
// boundary stops the substring false-negative where a bare `includes` would treat `a.md` as named just
// because the body mentions `data.md` (a longer token that contains it). Lenient otherwise (a markdown
// link, a bare mention, a code span all count), so a guide that does point at its references is 0-FP.
function names_reference(body: string, basename: string): boolean {
    return new RegExp(`(^|[^A-Za-z0-9_.-])${escape_regexp(basename)}`).test(body);
}

export function find_orphaned_references(workspaceDir: string): OrphanedReference[] {
    const skillsDir = join(workspaceDir, '.agents', 'skills');
    if (!existsSync(skillsDir)) {
        return [];
    }
    const orphans: OrphanedReference[] = [];
    for (const skill of readdirSync(skillsDir).sort()) {
        const skillMd = join(skillsDir, skill, 'SKILL.md');
        const refsDir = join(skillsDir, skill, 'references');
        if (!existsSync(skillMd) || !existsSync(refsDir) || !statSync(refsDir).isDirectory()) {
            continue;
        }
        const body = readFileSync(skillMd, 'utf8');
        for (const reference of reference_files(refsDir)) {
            if (!names_reference(body, reference.basename)) {
                orphans.push({ skill, reference: reference.rel });
            }
        }
    }
    return orphans;
}
