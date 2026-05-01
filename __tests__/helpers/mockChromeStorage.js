function createChromeStorageLocal(initialState) {
  const store = Object.assign({}, initialState || {});

  function get(keys, callback) {
    const response = {};

    if (Array.isArray(keys)) {
      keys.forEach((key) => {
        response[key] = store[key];
      });
    } else if (typeof keys === "string") {
      response[keys] = store[keys];
    } else if (keys && typeof keys === "object") {
      Object.keys(keys).forEach((key) => {
        response[key] = Object.prototype.hasOwnProperty.call(store, key) ? store[key] : keys[key];
      });
    }

    callback(response);
  }

  function set(payload, callback) {
    Object.assign(store, payload || {});
    if (typeof callback === "function") {
      callback();
    }
  }

  return {
    get: jest.fn(get),
    set: jest.fn(set),
    __store: store
  };
}

function attachChromeStorage(initialState) {
  const local = createChromeStorageLocal(initialState);
  global.chrome = {
    storage: { local },
    runtime: {
      getURL: jest.fn((path) => path)
    },
    windows: {
      create: jest.fn()
    }
  };
  return local;
}

module.exports = {
  attachChromeStorage,
  createChromeStorageLocal
};
