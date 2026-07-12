# Glossary

Repository terms used by the CLI and its documentation.

| Term         | Meaning                                                                              |
| ------------ | ------------------------------------------------------------------------------------ |
| check face   | The checker behavior selected by an input file's frontmatter `type`.                 |
| companion    | A spec or task file supplied explicitly while checking a review.                     |
| contract     | The canonical check definitions and severities in Suspec's `checks/checks.yaml`.     |
| diagnostic   | A check code, severity, message, and optional source line produced by the engine.    |
| level        | The aggregate result `clean`, `warning`, or `blocking` used to choose the exit code. |
| primary path | A file named as a positional argument to `suspec check`.                             |
| report       | The structured result for one checked input or file set.                             |

Add a term only when the code or documentation gives it a stable, repository-specific meaning.
