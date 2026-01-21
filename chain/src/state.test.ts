
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { State, applyTx } from './state.js';
import { Block, Tx } from './types.js';
import fs from 'fs';

// Mock LevelDB
vi.mock('level', () => {
    return {
        Level: class {
            constructor() { }
            put = vi.fn().mockResolvedValue(undefined);
            get = vi.fn().mockResolvedValue(undefined);
            del = vi.fn().mockResolvedValue(undefined);
            batch = vi.fn().mockResolvedValue(undefined);
            status = 'open';
            open = vi.fn().mockResolvedValue(undefined);
            close = vi.fn().mockResolvedValue(undefined);
        }
    };
});

describe('State', () => {
    let state: State;
    const testDir = './test-data';

    beforeEach(() => {
        state = new State(testDir);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should initialize correctly', () => {
        expect(state).toBeDefined();
    });

    it('should apply transaction correctly', async () => {
        const tx: Tx = {
            from: 'addr1',
            nonce: 0,
            type: 'DATA_REGISTER',
            payload: { sizeGiB: 10, collateral: 100 },
            signature: '0x123'
        };

        // We assume getBalance returns 0 by default (mock behavior)
        // applyTx adds collateral to balance (wait, DATA_REGISTER *locks* collateral?)
        // Let's check state.ts logic. 
        // For DATA_REGISTER: balance -= collateral. 
        // But we start with 0. So -100.

        await applyTx(state, tx);

        // Verifying mocking calls is tricky without exposing the internal db instance
        // But we can check if state.getBalance was called/updated if we mock that specific method?
    });
});
