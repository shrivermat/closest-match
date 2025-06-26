// Jest setup file for testing environment

// Mock fetch for testing
global.fetch = jest.fn();

// Mock performance.now
Object.defineProperty(global, 'performance', {
  value: {
    now: jest.fn(() => Date.now())
  }
});

// Mock console for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};