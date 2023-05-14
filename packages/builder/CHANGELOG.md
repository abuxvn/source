# @abux/builder

## 0.1.2

### Patch Changes

- 58b2cdf: Fix commands output:
  - `build`: Allow alias flag for production build as `--production` (alias to `--node-env production`)
  - `dev`: convert from minimal to normal webpack output and collapsible defailted output
  - `init`: collapsible defailted output
  - move `logger` to new library
- 8706de6: Updated dependencies
  - @abux/logger@0.0.2