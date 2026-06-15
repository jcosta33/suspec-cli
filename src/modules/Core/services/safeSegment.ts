// A slug or id that becomes a filesystem path segment (a spec folder, a task filename) must not
// escape its directory. Reject anything that is not a single conservative segment — no path
// separators, no leading dot/dash, no `..`. Pure.
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function is_safe_segment(value: string): boolean {
    return SAFE_SEGMENT.test(value) && !value.includes('..');
}
