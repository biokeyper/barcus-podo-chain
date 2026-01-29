
import { beforeAll } from 'vitest';

beforeAll(() => {
    process.on('unhandledRejection', (reason: any) => {
        const ignoredErrors = ['StreamStateError', 'InvalidStateError', 'StreamResetError', 'StreamClosedError'];
        if (reason && ignoredErrors.includes(reason.name)) {
            // Intentionally ignore these libp2p/floodsub errors that happen during rapid teardown in tests
            return;
        }

        // For other rejections, log them as we normally would or throw
        console.error('Unhandled Rejection at:', reason.stack || reason);
    });
});
