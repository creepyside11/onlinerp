'use strict';

/**
 * Символы движка GTA:SA.
 *
 * libGame.so в этом клиенте НЕ обрезан: 16 809 экспортированных функций с
 * полными C++ именами. Это главное везение всего проекта — можно цепляться
 * за функции по имени, а не искать смещения наугад.
 *
 * Имена записаны в манглированном виде: так их отдаёт readelf, и так их
 * принимает Module.getExportByName без риска ошибиться в сигнатуре.
 */

const LIB = 'libGame.so';

const FUNC = {
  // Локальный игрок
  findPlayerPed: '_Z13FindPlayerPedi',
  findPlayerVehicle: '_Z17FindPlayerVehicleib',

  // Позиция и телепорт
  teleport: '_ZN7CEntity8TeleportE7CVectorh',
  getBoundCentre: '_ZNK7CEntity14GetBoundCentreER7CVector',
  calcScreenCoors: '_Z15CalcScreenCoorsRK7CVectorPS_PfS3_',

  // Пулы сущностей — источник данных для ESP
  getPed: '_ZN6CPools6GetPedEi',
  getVehicle: '_ZN6CPools10GetVehicleEi',

  // Время — через него делается спидхак
  timerUpdate: '_ZN6CTimer15UpdateVariablesEf',

  // Транспорт
  vehicleFix: '_ZN8CVehicle3FixEv',
  vehicleCanBeDamaged: '_ZN8CVehicle19CanVehicleBeDamagedEP7CEntity11eWeaponTypePh'
};

const DATA = {
  pedPool: '_ZN6CPools11ms_pPedPoolE',
  vehiclePool: '_ZN6CPools15ms_pVehiclePoolE',
  radarTrace: '_ZN6CRadar13ms_RadarTraceE',
  camera: 'TheCamera'
};

/**
 * Смещения полей. Найдены статическим разбором libGame.so, а не угаданы:
 * в конструкторе CPed (0x568634) пара float'ов 100.0 кладётся одним
 * 64-битным стором по адресу ped + 0x6AC, то есть это здоровье и броня.
 *
 * Всё равно проверяются в рантайме: если значение не похоже на здоровье,
 * модуль отказывается писать и сообщает об этом в лог.
 */
const OFFSET = {
  pedHealth: 0x6ac,
  pedArmour: 0x6b0
};

/** Сколько индексов пула просматривать. Выход за границы безопасен:
 *  CPool::GetAt сам возвращает null, но лишние вызовы не бесплатны. */
const POOL_SCAN = {
  peds: 160,
  vehicles: 160
};

module.exports = {
  LIB: LIB,
  FUNC: FUNC,
  DATA: DATA,
  OFFSET: OFFSET,
  POOL_SCAN: POOL_SCAN
};
