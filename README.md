# Swan URL shortener

An simple URL shortener server backed by PostgreSQL.

## Getting started

You need to install [yarn](https://classic.yarnpkg.com/en/docs/install#mac-stable).

### Clone

```bash
$ git clone git@github.com/swan-io/url-shortener.git
```

### Install

```bash
$ yarn
```

### Environment variables

At the project root, you should find a `.env.example` file. Copy its contents to a new `.env` file.

## Development

To start the development server, run:

```bash
$ yarn dev
```

## Building

To build the production codebase, run:

```bash
$ yarn build
```

## Testing

Run tests (using [vitest](https://vitest.dev) and [pgmock](https://github.com/stackframe-projects/pgmock)):

```bash
$ yarn test
```
