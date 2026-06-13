// ReconcileEngine, M1 scope (AC-011, D-002): derive a read-only board over the workspace artifacts
// — each spec with the tasks that target it, each task's review status, the tasks that are
// review-ready but have no review packet, and the needs-human list. Artifact-level only (the true
// requirement→task coverage join is the M3 coverage engine). Reads the filesystem; writes nothing.

import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { ok, type Result } from '../../../infra/errors/result.ts';
import type { AppError } from '../../../infra/errors/createAppError.ts';
import { read_frontmatter } from '../services/readFrontmatter.ts';
import type { OutcomeLevel } from './unixOutcome.ts';

export type BoardTask = Readonly<{
    id: string;
    status: string;
    hasReview: boolean;
    reviewStatus: string | null;
}>;

export type BoardSpec = Readonly<{
    id: string;
    status: string;
    tasks: readonly BoardTask[];
}>;

export type DerivedBoard = Readonly<{
    level: OutcomeLevel;
    specs: readonly BoardSpec[];
    tasksWithoutReview: readonly string[];
    needsHuman: readonly string[];
}>;

export type DeriveBoardInput = Readonly<{
    workspaceDir: string;
}>;

const REVIEW_READY = 'review-ready';
const ATTENTION_STATUSES = new Set(['needs-human', 'blocked']);

function read_md_frontmatters(dir: string): Record<string, string>[] {
    if (!existsSync(dir)) {
        return [];
    }
    return readdirSync(dir)
        .filter((name) => name.endsWith('.md'))
        .map((name) => read_frontmatter(readFileSync(join(dir, name), 'utf8')));
}

function read_specs(workspaceDir: string): { id: string; status: string }[] {
    const specsDir = join(workspaceDir, 'specs');
    if (!existsSync(specsDir)) {
        return [];
    }
    const specs: { id: string; status: string }[] = [];
    for (const entry of readdirSync(specsDir).sort()) {
        const specPath = join(specsDir, entry, 'spec.md');
        if (!existsSync(specPath)) {
            continue;
        }
        const fm = read_frontmatter(readFileSync(specPath, 'utf8'));
        specs.push({ id: fm.id ?? entry, status: fm.status ?? 'unknown' });
    }
    return specs;
}

export function derive_board(input: DeriveBoardInput): Result<DerivedBoard, AppError> {
    const specs = read_specs(input.workspaceDir);
    const tasks = read_md_frontmatters(join(input.workspaceDir, 'tasks'));
    const reviews = read_md_frontmatters(join(input.workspaceDir, 'reviews'));

    // review by the task it covers
    const reviewStatusByTask = new Map<string, string>();
    const needsHuman: string[] = [];
    for (const review of reviews) {
        if (review.task !== undefined) {
            reviewStatusByTask.set(review.task, review.status ?? 'draft');
        }
        if (review.status !== undefined && ATTENTION_STATUSES.has(review.status) && review.task !== undefined) {
            needsHuman.push(review.task);
        }
    }

    const task_id_of = (task: Record<string, string>) => task.id ?? '(unnamed task)';

    const tasksWithoutReview = tasks
        .filter((task) => task.status === REVIEW_READY && !reviewStatusByTask.has(task_id_of(task)))
        .map(task_id_of);

    const boardTaskFor = (task: Record<string, string>): BoardTask => {
        const id = task_id_of(task);
        return {
            id,
            status: task.status ?? 'unknown',
            hasReview: reviewStatusByTask.has(id),
            reviewStatus: reviewStatusByTask.get(id) ?? null,
        };
    };

    const boardSpecs: BoardSpec[] = specs.map((spec) => ({
        id: spec.id,
        status: spec.status,
        tasks: tasks.filter((task) => task.source === spec.id).map(boardTaskFor),
    }));

    return ok({ level: 'clean', specs: boardSpecs, tasksWithoutReview, needsHuman });
}
