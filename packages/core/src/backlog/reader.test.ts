// Folder reads with and without a provider batch read (GitLab reads files over GraphQL in batches).
import { describe, expect, it } from 'vitest';
import { locateFolder, readFolder } from './reader';
import {
  BatchingFakeProvider,
  blobSha,
  configFile,
  FakeProvider,
  FakeRepository,
  taskFile,
  taskPath,
} from './testing';

function repoWithTasks(count: number): FakeRepository {
  const files: Record<string, string> = { 'backlog/config.yml': configFile() };
  for (let n = 1; n <= count; n++) {
    files[taskPath('backlog', `back-${n}`, `Task ${n}`)] = taskFile({ id: `BACK-${n}`, title: `Task ${n}` });
  }
  return new FakeRepository('group/sub/repo', files);
}

async function read(provider: FakeProvider, repo: FakeRepository) {
  const location = await locateFolder(provider, repo.path, repo.head, null);
  expect(location.folder).toBe('backlog');
  return readFolder(provider, repo.path, { ...location, folder: 'backlog' }, null);
}

describe('readFolder', () => {
  it('reads every task file in one batch when the provider has a batch read', async () => {
    const repo = repoWithTasks(300);
    const provider = new BatchingFakeProvider([repo]);
    const result = await read(provider, repo);
    expect(result.files).toHaveLength(300);
    expect(result.downloads).toBe(301);
    expect(provider.batches).toHaveLength(1);
    expect(provider.batches[0]).toHaveLength(300);
    // Only the config is read alone.
    expect(provider.calls.readBlob).toBe(1);
  });

  it('reads files the batch left out one by one', async () => {
    const repo = repoWithTasks(3);
    const provider = new BatchingFakeProvider([repo]);
    const skipped = repo.get(taskPath('backlog', 'back-2', 'Task 2')) as string;
    provider.omit.add(blobSha(skipped));
    const result = await read(provider, repo);
    expect(result.files).toHaveLength(3);
    expect(provider.calls.readBlob).toBe(2);
    expect(result.files.every((file) => 'read' in file && file.read.ok)).toBe(true);
  });

  it('reads each file alone on providers without a batch read', async () => {
    const repo = repoWithTasks(5);
    const provider = new FakeProvider([repo]);
    const result = await read(provider, repo);
    expect(result.files).toHaveLength(5);
    expect(provider.calls.readBlob).toBe(6);
  });
});
