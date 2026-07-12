function createMockContext2d() {
  const ctx = {
    save: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    arc: jest.fn(),
    fillText: jest.fn(),
    measureText: jest.fn((text) => ({ width: String(text).length * 7 })),
    clearRect: jest.fn(),
    set lineWidth(value) {
      this._lineWidth = value;
    },
    get lineWidth() {
      return this._lineWidth;
    },
    set strokeStyle(value) {
      this._strokeStyle = value;
    },
    get strokeStyle() {
      return this._strokeStyle;
    },
    set fillStyle(value) {
      this._fillStyle = value;
    },
    get fillStyle() {
      return this._fillStyle;
    },
    set font(value) {
      this._font = value;
    },
    get font() {
      return this._font;
    }
  };

  return ctx;
}

function createMockCanvas(width, height) {
  const context = createMockContext2d();
  const canvas = {
    width: width,
    height: height,
    getContext: jest.fn(() => context),
    getBoundingClientRect: jest.fn(() => ({
      width: width,
      height: height
    }))
  };

  return { canvas, context };
}

module.exports = {
  createMockCanvas,
  createMockContext2d
};
