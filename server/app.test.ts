import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import Database from 'better-sqlite3';
import { createApp } from './app.ts';
import { migrate } from './db/migrations.ts';
import { SessionResolver } from './ai/session.ts';
import { loadModelsConfig } from './ai/config.ts';
import { AiService } from './ai/service.ts';
import { MockProvider, block, answerChecks, isCheckCall } from './ai/testing/mockProvider.ts';

// Recovery note: full file restored from 328d8d4 in the next atomic recovery commit.
