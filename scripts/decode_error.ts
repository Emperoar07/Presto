
import { keccak256, toBytes } from 'viem';

const errors = [
    'InvalidAmount()',
    'InsufficientBalance()',
    'InsufficientAllowance()',
    'TransferFailed()',
    'SlippageExceeded()',
    'InvalidTick()',
    'ZeroAmount()',
    'DivisionByZero()',
    'PoolEmpty()',
    'InvalidRatio()',
    'Overflow()',
    'Unauthorized()',
    'InvalidOrder()',
    'OrderNotFound()',
    'InvalidToken()',
    'ReserveZero()'
];

console.log('Checking error signatures...');
errors.forEach(err => {
    const sig = keccak256(toBytes(err)).slice(0, 10);
    console.log(`${err}: ${sig}`);
    if (sig === '0xaa4bc69a') {
        console.log(`MATCH FOUND: ${err}`);
    }
});
