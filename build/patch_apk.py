#!/usr/bin/env python3
"""Собрать модифицированный APK: оригинальная игра + Frida gadget.

Код игры не меняется ни на байт. Gadget подключается как зависимость уже
существующей библиотеки (patchelf --add-needed), поэтому:

  • libGame.so остаётся ровно таким, каким его выпустил разработчик;
  • если что-то пойдёт не так, достаточно убрать одну зависимость —
    и получится снова оригинальный клиент.

Такой путь выбран специально вместо правки smali: любая правка кода
приложения — это риск падения на старте, а тут вмешательство минимально.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

ABI = "arm64-v8a"
GADGET_NAME = "libgadget.so"
CONFIG_NAME = "libgadget.config.so"
SCRIPT_NAME = "libscript.so"

# Подпись старого APK становится недействительной после пересборки.
SIGNATURE_SUFFIXES = (".RSA", ".DSA", ".EC", ".SF")


def log(message):
    print(f"[patch] {message}", flush=True)


def run(cmd, **kwargs):
    log(" ".join(cmd))
    subprocess.run(cmd, check=True, **kwargs)


def unpack(apk_path, workdir):
    with zipfile.ZipFile(apk_path) as archive:
        names = archive.namelist()
        for name in names:
            target = os.path.join(workdir, name)
            if name.endswith("/"):
                os.makedirs(target, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with archive.open(name) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
    return names


def pack(workdir, out_path):
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for root, _dirs, files in os.walk(workdir):
            for name in sorted(files):
                full = os.path.join(root, name)
                relative = os.path.relpath(full, workdir).replace(os.sep, "/")

                if relative.startswith("META-INF/") and relative.endswith(SIGNATURE_SUFFIXES):
                    continue
                if relative == "META-INF/MANIFEST.MF":
                    continue

                # Нативные библиотеки храним без сжатия: так их можно
                # отобразить в память напрямую, и zipalign выровняет их
                # по странице.
                compress = zipfile.ZIP_STORED if relative.endswith(".so") else zipfile.ZIP_DEFLATED
                with open(full, "rb") as handle:
                    archive.writestr(relative, handle.read(), compress)


def inject(workdir, gadget, script, script_path):
    lib_dir = os.path.join(workdir, "lib", ABI)
    if not os.path.isdir(lib_dir):
        raise SystemExit(f"в APK нет каталога lib/{ABI} — это не тот файл")

    shutil.copyfile(gadget, os.path.join(lib_dir, GADGET_NAME))
    shutil.copyfile(script, os.path.join(lib_dir, SCRIPT_NAME))

    config = {
        "interaction": {
            "type": "script",
            "path": script_path,
            "on_change": "reload"
        },
        "log": {"level": "info"}
    }
    with open(os.path.join(lib_dir, CONFIG_NAME), "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)

    log(f"gadget, скрипт и конфиг добавлены в lib/{ABI}")


def add_dependency(workdir, host_lib):
    """Подключить gadget к существующей библиотеке через DT_NEEDED."""
    target = os.path.join(workdir, "lib", ABI, host_lib)
    if not os.path.isfile(target):
        raise SystemExit(f"нет библиотеки {host_lib} — некуда подключать gadget")

    run(["patchelf", "--add-needed", GADGET_NAME, target])
    log(f"gadget подключён к {host_lib}")


def align_and_sign(apk_path, keystore, alias, storepass, out_path):
    aligned = apk_path + ".aligned"
    run(["zipalign", "-p", "-f", "4", apk_path, aligned])

    run([
        "apksigner", "sign",
        "--ks", keystore,
        "--ks-key-alias", alias,
        "--ks-pass", f"pass:{storepass}",
        "--out", out_path,
        aligned
    ])
    run(["apksigner", "verify", "--print-certs", out_path])


def main():
    parser = argparse.ArgumentParser(description="собрать APK с меню RakCRMP")
    parser.add_argument("--apk", required=True, help="исходный APK")
    parser.add_argument("--gadget", required=True, help="frida-gadget android arm64")
    parser.add_argument("--script", required=True, help="собранный agent.js")
    parser.add_argument("--out", required=True, help="куда положить результат")
    parser.add_argument("--host-lib", default="libClient.so",
                        help="библиотека, к которой подключить gadget")
    parser.add_argument("--script-path", default=SCRIPT_NAME,
                        help="путь к скрипту в конфиге gadget")
    parser.add_argument("--keystore", required=True)
    parser.add_argument("--alias", default="rakcrmp")
    parser.add_argument("--storepass", required=True)
    parser.add_argument("--no-sign", action="store_true",
                        help="только собрать, без выравнивания и подписи")
    args = parser.parse_args()

    workdir = tempfile.mkdtemp(prefix="rakcrmp-")
    try:
        log(f"распаковка {args.apk}")
        unpack(args.apk, workdir)
        inject(workdir, args.gadget, args.script, args.script_path)
        add_dependency(workdir, args.host_lib)

        unsigned = os.path.join(workdir, "unsigned.apk")
        log("упаковка")
        pack(workdir, unsigned)

        if args.no_sign:
            shutil.copyfile(unsigned, args.out)
            log(f"готово (без подписи): {args.out}")
            return 0

        align_and_sign(unsigned, args.keystore, args.alias, args.storepass, args.out)
        size = os.path.getsize(args.out) / (1024 * 1024)
        log(f"готово: {args.out} ({size:.1f} МБ)")
        return 0
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
