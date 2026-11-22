'use strict';

/**
 * Совместимость с разными версиями Frida.
 *
 * В Frida 17 убрали `Module.getExportByName(имя, символ)` — теперь это
 * `Module.getGlobalExportByName(символ)`. Метод экземпляра
 * `module.getExportByName(символ)` при этом живёт в обеих версиях, поэтому
 * работаем через него и не зависим от версии.
 */

const log = require('./log');

function findModule(name) {
  try {
    return Process.findModuleByName(name);
  } catch (e) {
    return null;
  }
}

/** Модуль по имени. Бросает, если не загружен — вызывающий сам решает. */
function moduleOrThrow(name) {
  const mod = findModule(name);
  if (mod === null) throw new Error('модуль не загружен: ' + name);
  return mod;
}

/** Адрес экспорта. */
function exportOf(moduleName, symbol) {
  const mod = moduleOrThrow(moduleName);
  return mod.getExportByName(symbol);
}

/** База модуля или null, если он ещё не загружен. */
function baseOf(moduleName) {
  const mod = findModule(moduleName);
  if (mod === null) return null;
  return mod.base;
}

/** Обёртка над NativeFunction по имени экспорта. */
function callable(moduleName, symbol, ret, args) {
  return new NativeFunction(exportOf(moduleName, symbol), ret, args);
}

/**
 * Прочитать float-аргумент из регистра s0.
 *
 * Важно: Frida отдаёт `d0` как double, а `s0` как float. Для 32-битного
 * аргумента годится только `s0` — если взять `d0`, прочитаются 8 байт и
 * получится мусор.
 */
function readFloatArg(ctx) {
  if (typeof ctx.s0 === 'number') return { kind: 's0', value: ctx.s0 };
  return null;
}

function writeFloatArg(ctx, kind, value) {
  if (kind === 's0') {
    ctx.s0 = value;
    return true;
  }
  return false;
}

module.exports = {
  findModule: findModule,
  moduleOrThrow: moduleOrThrow,
  exportOf: exportOf,
  baseOf: baseOf,
  callable: callable,
  readFloatArg: readFloatArg,
  writeFloatArg: writeFloatArg
};
