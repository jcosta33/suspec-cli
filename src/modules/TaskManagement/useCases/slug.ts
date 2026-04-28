

import { createAppError, type AppError } from '../../../infra/errors/createAppError.ts';
import { err, ok, type Result } from '../../../infra/errors/result.ts';

/**
 * Slug normalization utilities.
 */

const DEFAULT_MAX_LEN = 60;

export type InvalidSlugError = AppError<
    'InvalidSlug',
    { original: string; reason: string }
>;

export type ToSlugResult = Result<string, InvalidSlugError>;

/**
 * Convert a human-readable title to a URL-safe slug.
 * @param {string} title
 * @param {number} maxLen
 * @returns {ToSlugResult}
 */
export function to_slug(title: string, maxLen: number = DEFAULT_MAX_LEN): ToSlugResult {
    if (!title || typeof title !== 'string') {
        return err(createAppError('InvalidSlug', 'Title is required to generate a slug', { original: title, reason: 'empty' }));
    }

    const slug = title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // strip punctuation except hyphens
        .replace(/[\s]+/g, '-') // spaces → hyphens
        .replace(/-{2,}/g, '-') // collapse repeated hyphens
        .replace(/^-+|-+$/g, '') // strip leading/trailing hyphens
        .slice(0, maxLen)
        .replace(/-+$/g, ''); // strip trailing hyphens after slice

    if (!slug) {
        return err(createAppError('InvalidSlug', `Title "${title}" produced an empty slug after normalization`, { original: title, reason: 'normalized to empty' }));
    }
    return ok(slug);
}

/**
 * Derive all path/name artifacts from a slug.
 * @param {string} slug
 * @param {string} repoName  - basename of the repo directory
 * @param {object} config    - loaded config.json
 * @returns {object}
 */
export function derive_names(slug: string, repoName: string, config: Record<string, string>) {
    const branch = `agent/${slug}`;
    const worktreePath = (config.worktreeDirPattern || "../{repoName}--{slug}")
        .replace('{repoName}', repoName)
        .replace('{slug}', slug);
    return {
        branch,
        worktreePath,
        taskFile: `.agents/tasks/${slug}.md`,
    };
}

/**
 * Find an available duplicate slug by appending -2, -3, ...
 * @param {string} baseSlug
 * @param {Set<string>} existingSlugs
 * @returns {string}
 */
export function next_duplicate_slug(baseSlug: string, existingSlugs: Set<string>) {
    let n = 2;
    while (existingSlugs.has(`${baseSlug}-${n.toString()}`)) n++;
    return `${baseSlug}-${n.toString()}`;
}
