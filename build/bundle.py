#!/usr/bin/env python3
"""Собрать агент в один файл.

Frida грузит один скрипт, а писать всё в одном файле на полторы тысячи строк
неудобно. Здесь свой минимальный сборщик: он проходит по require('./...') и
склеивает модули в один самодостаточный файл. Никаких npm-зависимостей —
сборка не может сломаться из-за версии пакета.
"""
import argparse
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGENT = os.path.join(ROOT, "agent")
ENTRY = "main.js"

REQUIRE_RE = re.compile(r"""require\(\s*['"]([^'"]+)['"]\s*\)""")


def normalise(from_id, request):
    """Превратить require('./x') в путь модуля внутри agent/."""
    if not request.startswith("."):
        raise SystemExit(f"внешний require не поддерживается: {request}")
    base = os.path.dirname(from_id)
    path = os.path.normpath(os.path.join(base, request))
    if not path.endswith(".js"):
        path += ".js"
    return path.replace(os.sep, "/")


def collect():
    """Обойти граф зависимостей и вернуть модули в порядке загрузки."""
    order = []
    seen = set()

    def walk(module_id):
        if module_id in seen:
            return
        seen.add(module_id)
        full = os.path.join(AGENT, module_id)
        if not os.path.isfile(full):
            raise SystemExit(f"модуль не найден: {module_id}")
        source = open(full, encoding="utf-8").read()

        deps = {}
        for request in REQUIRE_RE.findall(source):
            deps[request] = normalise(module_id, request)
            walk(deps[request])

        order.append((module_id, source, deps))

    walk(ENTRY)
    return order


def build():
    modules = collect()
    out = []
    out.append("// Собрано build/bundle.py — не редактировать вручную.")
    out.append("(function () {")
    out.append("'use strict';")
    out.append("var __defs = Object.create(null);")
    out.append("var __cache = Object.create(null);")
    out.append("")

    for module_id, source, deps in modules:
        dep_map = ", ".join(
            "%s: %s" % (js_str(k), js_str(v)) for k, v in deps.items()
        )
        out.append("// ---- %s ----" % module_id)
        out.append("__defs[%s] = {" % js_str(module_id))
        out.append("  deps: {%s}," % dep_map)
        out.append("  fn: function (module, exports, require) {")
        out.append(source)
        out.append("  }")
        out.append("};")
        out.append("")

    out.append("""function __load(id) {
  if (__cache[id]) return __cache[id].exports;
  var def = __defs[id];
  if (!def) throw new Error('модуль не найден: ' + id);
  var module = { exports: {} };
  __cache[id] = module;
  var localRequire = function (name) {
    var target = def.deps[name];
    if (!target) throw new Error('require не разрешён: ' + name + ' из ' + id);
    return __load(target);
  };
  def.fn.call(module.exports, module, module.exports, localRequire);
  return module.exports;
}

__load(%s);
})();""" % js_str(ENTRY))

    return "\n".join(out)


def js_str(value):
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main():
    parser = argparse.ArgumentParser(description="собрать агент RakCRMP")
    parser.add_argument("-o", "--out", default=os.path.join(ROOT, "build", "agent.js"))
    args = parser.parse_args()

    bundle = build()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        handle.write(bundle)

    lines = bundle.count("\n") + 1
    print(f"собрано: {args.out} ({lines} строк, {len(bundle)} байт)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
