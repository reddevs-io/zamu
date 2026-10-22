#!/usr/bin/env node
import { processIo } from './io';
import { main } from './main';

// When the reader closes the pipe early (`pm tasks list | head`), stop quietly instead of crashing.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EPIPE') process.exit(process.exitCode ?? 0);
    throw error;
  });
}

process.exitCode = await main(process.argv.slice(2), processIo());
