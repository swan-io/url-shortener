# Swan URL shortener

A simple URL shortener server backed by PostgreSQL.

## Getting started

You need to install [pnpm](https://pnpm.io/installation).

### Clone

```bash
$ git clone git@github.com/swan-io/url-shortener.git
```

### Install

```bash
$ pnpm install
```

### Environment variables

At the project root, you should find a `.env.example` file. Copy its contents to a new `.env` file.

## Development

To start the development server, run:

```bash
$ pnpm dev
```

## Building

To build the production codebase, run:

```bash
$ pnpm build
```

## Testing

Run tests (using [vitest](https://vitest.dev) and [pgmock](https://github.com/stackframe-projects/pgmock)):

```bash
$ pnpm test
```
