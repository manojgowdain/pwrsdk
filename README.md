
# @manojgowdain/pwrsdk

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.js
```

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Private package publishing

This package is configured for GitHub Packages as `@manojgowdain/pwrsdk`.

Publish options:

```bash
npm publish
```

or create a GitHub release / run the `Publish Private Package` workflow manually.

To install it in another project, add this to that project's `.npmrc`:

```ini
@manojgowdain:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Then install:

```bash
npm install @manojgowdain/pwrsdk
```

or:

```bash
bun add @manojgowdain/pwrsdk
```

Keep the package private from GitHub Packages settings, or keep the source repository private so new packages inherit private visibility.
