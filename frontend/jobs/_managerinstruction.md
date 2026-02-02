# WorkSplit Job Creation Guide

## Job File Format

```markdown
---
context_files:
  - src/path/to/context1.tsx
  - src/path/to/context2.ts
output_dir: src/components/feature/
output_file: Component.tsx
depends_on:
  - previous_job_name  # optional
---

# Job Title

## Requirements
- Requirement 1
- Requirement 2

## Implementation Details
- Detail 1
- Detail 2
```

## Best Practices

### Job Sizing
- Target 100-300 lines per job
- Break large features into multiple jobs
- Use `depends_on` for sequential jobs

### Mode Selection
| Situation | Mode |
|-----------|------|
| New file | REPLACE |
| < 10 line edit | Manual |
| 10-50 line edit | EDIT (cautious) |
| Multiple files | REPLACE or separate jobs |

### Naming Convention
Use sequential prefixes for related jobs:
- `feature_001_types.md`
- `feature_002_hook.md`
- `feature_003_component.md`

### Context Files
- Include relevant type definitions
- Include similar components for style reference
- Limit to 5 files max (per worksplit.toml)

## Running Jobs

```bash
# Run all pending jobs
worksplit run

# Check status
worksplit status -v

# Preview a job's prompt
worksplit preview job_name
```
