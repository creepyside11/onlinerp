'use strict';

/**
 * Дымовой прогон собранного агента без телефона.
 *
 * Подменяет Frida и Android заглушками и проверяет, что бандл загружается,
 * модули связываются и запуск проходит без исключений. Это ловит опечатки и
 * битые require, которые иначе всплыли бы только на устройстве.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bundlePath = path.join(__dirname, 'agent.js');
const source = fs.readFileSync(bundlePath, 'utf8');

const errors = [];
const logs = [];

// Числа вместо заглушек: без них раскладка меню считается с NaN и тест
// проверяет пустоту вместо реальной арифметики.
const NUMERIC = {
  getWidth: 1080,
  getHeight: 2400,
  getActionMasked: 0,
  getX: 100,
  getY: 300,
  density: 3,
  measureText: 42
};

function anyObject(name) {
  const target = function () {};
  target.__name = name;
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'value') return 0;
      if (prop === '$new') return function () { return anyObject(name + '$new'); };
      if (prop === '$dispose') return function () {};
      if (!(prop in t)) t[prop] = anyObject(name + '.' + String(prop));
      return t[prop];
    },
    set(t, prop, value) {
      t[prop] = value;
      if (prop === 'implementation') sandbox.__impls[name] = value;
      return true;
    },
    apply() {
      const last = name.split('.').pop();
      if (Object.prototype.hasOwnProperty.call(NUMERIC, last)) return NUMERIC[last];
      return anyObject(name + '()');
    },
    construct() { return anyObject('new ' + name); }
  });
}

const fakePointer = {
  isNull: () => true,
  add: () => fakePointer,
  readFloat: () => 0,
  writeFloat: () => {},
  readInt: () => 0,
  equals: () => false
};

const sandbox = {
  console: {
    log: (...a) => logs.push(['I', a.join(' ')]),
    warn: (...a) => logs.push(['W', a.join(' ')]),
    error: (...a) => { errors.push(a.join(' ')); logs.push(['E', a.join(' ')]); }
  },
  setInterval: (fn, ms) => { sandbox.__intervals.push({ fn, ms }); return 0; },
  clearInterval: () => {},
  setTimeout: (fn) => { return 0; },
  __intervals: [],
  Java: {
    perform: (fn) => { try { fn(); } catch (e) { errors.push('Java.perform: ' + e); } },
    use: (name) => anyObject(name),
    registerClass: (spec) => {
      const cls = function () {};
      cls.$new = function () { return anyObject(spec.name); };
      cls.__spec = spec;
      sandbox.__classes.push(spec);
      return cls;
    },
    scheduleOnMainThread: (fn) => { sandbox.__mainThread.push(fn); }
  },
  __classes: [],
  __mainThread: [],
  __impls: {},
  Module: {
    getExportByName: () => fakePointer,
    findBaseAddress: () => null
  },
  Memory: {
    alloc: () => fakePointer
  },
  NativeFunction: function () { return function () { return fakePointer; }; },
  Interceptor: {
    attach: () => ({ detach: () => {} }),
    replace: () => {},
    revert: () => {}
  },
  Float32Array: Float32Array,
  Uint8Array: Uint8Array,
  Math: Math,
  Date: Date,
  JSON: JSON,
  String: String,
  Array: Array,
  Object: Object,
  Error: Error,
  isFinite: isFinite
};

sandbox.global = sandbox;
sandbox.self = sandbox;

vm.createContext(sandbox);

let threw = null;
try {
  vm.runInContext(source, sandbox, { filename: 'agent.js' });
} catch (e) {
  threw = e;
}

let failed = false;

if (threw) {
  console.error('ОШИБКА: бандл упал при загрузке: ' + threw);
  failed = true;
}

if (errors.length) {
  console.error('ОШИБКА: агент сообщил об ошибках:');
  errors.forEach((e) => console.error('  ' + e));
  failed = true;
}

// Изобразить запуск Activity: без него меню некуда вешать.
const resume = sandbox.__impls['android.app.Activity.onResume'];
if (resume) {
  const fakeActivity = anyObject('Activity');
  fakeActivity.getClass = () => anyObject('class');
  try {
    resume.call(fakeActivity);
  } catch (e) {
    console.error('ОШИБКА: onResume упал: ' + e);
    failed = true;
  }
  // Выполнить то, что агент отложил до главного потока.
  while (sandbox.__mainThread.length) {
    const fn = sandbox.__mainThread.shift();
    try {
      fn();
    } catch (e) {
      console.error('ОШИБКА: главный поток: ' + e);
      failed = true;
    }
  }
}

const info = logs.filter((l) => l[0] === 'I').map((l) => l[1]);
if (!info.some((l) => l.indexOf('стартует') >= 0)) {
  console.error('ОШИБКА: агент не дошёл до запуска');
  failed = true;
}

// Прогнать отрисовку и касания: так проверяется раскладка меню.
if (sandbox.__classes.length > 0) {
  const spec = sandbox.__classes[0];
  const fakeCanvas = anyObject('Canvas');
  const fakeEvent = anyObject('MotionEvent');

  try {
    spec.methods.onDraw.implementation.call(anyObject('View'), fakeCanvas);
    // открыть меню касанием по кнопке
    const view = anyObject('View');
    spec.methods.onTouchEvent.implementation.call(view, fakeEvent);
    spec.methods.onDraw.implementation.call(view, fakeCanvas);
  } catch (e) {
    console.error('ОШИБКА: отрисовка упала: ' + e);
    failed = true;
  }
}

if (sandbox.__classes.length === 0) {
  console.error('ОШИБКА: класс оверлея не зарегистрирован');
  failed = true;
}

if (sandbox.__intervals.length === 0) {
  console.error('ОШИБКА: цикл опроса не запущен');
  failed = true;
}

if (!failed) {
  console.log('дымовой прогон пройден');
  console.log('  лог: ' + info.length + ' строк');
  console.log('  классов оверлея: ' + sandbox.__classes.length);
  console.log('  интервалов: ' + sandbox.__intervals.length);
}

process.exit(failed ? 1 : 0);
