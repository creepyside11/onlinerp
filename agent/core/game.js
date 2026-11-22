'use strict';

/**
 * Обёртки над движком. Всё, что знает о внутренностях игры, живёт здесь:
 * модули меню работают только через этот слой и не трогают адреса сами.
 */

const symbols = require('./symbols');
const log = require('./log');

let base = null;
let fns = {};
let ready = false;

function addr(name) {
  return Module.getExportByName(symbols.LIB, name);
}

function fn(exportName, ret, args) {
  return new NativeFunction(addr(exportName), ret, args);
}

/**
 * Дождаться загрузки libGame.so. На старте процесса её ещё нет: игра
 * подгружает движок после инициализации оболочки.
 */
function waitForEngine(onReady, onFail) {
  let attempts = 0;

  const timer = setInterval(function () {
    attempts++;
    try {
      base = Module.findBaseAddress(symbols.LIB);
      if (base !== null) {
        clearInterval(timer);
        try {
          resolve();
          ready = true;
          onReady();
        } catch (e) {
          onFail(e);
        }
        return;
      }
    } catch (e) {
      /* модуля ещё нет — это нормально */
    }

    if (attempts > 300) {
      clearInterval(timer);
      onFail(new Error('libGame.so не загрузилась за 60 с'));
    }
  }, 200);
}

function resolve() {
  fns.findPlayerPed = fn(symbols.FUNC.findPlayerPed, 'pointer', ['int']);
  fns.findPlayerVehicle = fn(symbols.FUNC.findPlayerVehicle, 'pointer', ['int', 'bool']);
  fns.getPed = fn(symbols.FUNC.getPed, 'pointer', ['int']);
  fns.getVehicle = fn(symbols.FUNC.getVehicle, 'pointer', ['int']);
  fns.getBoundCentre = fn(symbols.FUNC.getBoundCentre, 'void', ['pointer', 'pointer']);
  fns.calcScreenCoors = fn(symbols.FUNC.calcScreenCoors, 'bool',
    ['pointer', 'pointer', 'pointer', 'pointer']);
  fns.vehicleFix = fn(symbols.FUNC.vehicleFix, 'void', ['pointer']);

  fns.pedPool = addr(symbols.DATA.pedPool);
  fns.vehiclePool = addr(symbols.DATA.vehiclePool);
  fns.radarTrace = addr(symbols.DATA.radarTrace);

  log.info('движок найден, база', base);
}

function isReady() {
  return ready;
}

/** Указатель на локального игрока или null. */
function player() {
  const p = fns.findPlayerPed(0);
  return p.isNull() ? null : p;
}

/** Машина игрока или null. */
function playerVehicle() {
  const v = fns.findPlayerVehicle(0, true);
  return v.isNull() ? null : v;
}

/**
 * Позиция сущности. GetBoundCentre принимает ссылку на CVector, поэтому
 * пишем в свой буфер — это надёжнее, чем ловить три float из регистров.
 */
const centreBuf = Memory.alloc(16);

function positionOf(entity) {
  if (!entity) return null;
  fns.getBoundCentre(entity, centreBuf);
  const x = centreBuf.readFloat();
  const y = centreBuf.add(4).readFloat();
  const z = centreBuf.add(8).readFloat();
  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return null;
  if (Math.abs(x) > 20000 || Math.abs(y) > 20000) return null;
  return { x: x, y: y, z: z };
}

function playerPosition() {
  return positionOf(player());
}

/** Здоровье игрока. Возвращает null, если значение не похоже на здоровье. */
function playerHealth() {
  const p = player();
  if (!p) return null;
  const raw = p.add(symbols.OFFSET.pedHealth).readFloat();
  if (!isFinite(raw) || raw < 0 || raw > 1000) return null;
  return raw;
}

/** Записать здоровье. Возвращает true, если запись прошла проверку. */
function setPlayerHealth(value) {
  const p = player();
  if (!p) return false;
  const slot = p.add(symbols.OFFSET.pedHealth);
  const before = slot.readFloat();
  if (!isFinite(before) || before < 0 || before > 1000) return false;
  slot.writeFloat(value);
  return true;
}

/** Телепорт сущности в точку. */
function teleport(entity, x, y, z) {
  if (!entity) return false;
  const teleportFn = fn(symbols.FUNC.teleport, 'void',
    ['pointer', 'float', 'float', 'float', 'uchar']);
  teleportFn(entity, x, y, z, 0);
  return true;
}

/**
 * Проекция мира в экран. Нужна для ESP и BOX: рисуем в тех же пикселях,
 * что отдаёт игра, поэтому ничего пересчитывать не приходится.
 */
const inVec = Memory.alloc(16);
const outVec = Memory.alloc(16);
const wBuf = Memory.alloc(4);
const hBuf = Memory.alloc(4);

function worldToScreen(pos) {
  inVec.writeFloat(pos.x);
  inVec.add(4).writeFloat(pos.y);
  inVec.add(8).writeFloat(pos.z);
  const ok = fns.calcScreenCoors(inVec, outVec, wBuf, hBuf);
  if (!ok) return null;
  const sx = outVec.readFloat();
  const sy = outVec.add(4).readFloat();
  if (!isFinite(sx) || !isFinite(sy)) return null;
  return { x: sx, y: sy };
}

/** Перебор педов из пула. */
function eachPed(cb) {
  for (let i = 0; i < symbols.POOL_SCAN.peds; i++) {
    let ped;
    try {
      ped = fns.getPed(i);
    } catch (e) {
      continue;
    }
    if (!ped || ped.isNull()) continue;
    if (cb(ped, i) === false) return;
  }
}

/** Перебор машин из пула. */
function eachVehicle(cb) {
  for (let i = 0; i < symbols.POOL_SCAN.vehicles; i++) {
    let veh;
    try {
      veh = fns.getVehicle(i);
    } catch (e) {
      continue;
    }
    if (!veh || veh.isNull()) continue;
    if (cb(veh, i) === false) return;
  }
}

/** Метка на карте. Нужна для телепорта «по метке». */
function waypoint() {
  const trace = fns.radarTrace;
  if (!trace) return null;
  // ms_RadarTrace — массив блипов. Ищем первый с флагом показа и типом
  // метки: в GTA:SA это BLIP_WAYPOINT = 8.
  for (let i = 0; i < 250; i++) {
    const blip = trace.add(i * 40);
    try {
      const type = blip.add(0x2c).readInt();
      if (type !== 8) continue;
      const x = blip.readFloat();
      const y = blip.add(4).readFloat();
      const z = blip.add(8).readFloat();
      if (!isFinite(x) || !isFinite(y)) continue;
      if (Math.abs(x) > 20000 || Math.abs(y) > 20000) continue;
      return { x: x, y: y, z: z };
    } catch (e) {
      return null;
    }
  }
  return null;
}

module.exports = {
  waitForEngine: waitForEngine,
  isReady: isReady,
  base: function () { return base; },
  player: player,
  playerVehicle: playerVehicle,
  positionOf: positionOf,
  playerPosition: playerPosition,
  playerHealth: playerHealth,
  setPlayerHealth: setPlayerHealth,
  teleport: teleport,
  worldToScreen: worldToScreen,
  eachPed: eachPed,
  eachVehicle: eachVehicle,
  waypoint: waypoint,
  raw: function () { return fns; }
};
