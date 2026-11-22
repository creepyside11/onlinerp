#!/usr/bin/env python3
"""Создать ключ для подписи APK.

Ключ создаётся ОДИН раз и дальше используется всеми сборками. Это главное
условие нормальных обновлений: Android принимает новую версию поверх старой
только если подпись совпадает. Если ключ менять, каждый раз придётся
удалять приложение и терять его данные.

Формат — PKCS#12: его понимает apksigner и он не требует keytool.

Запуск::

    python3 build/make_keystore.py --out keys/release.p12
"""
import argparse
import datetime
import os
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

# Срок с запасом: Android проверяет, что сертификат был действителен на
# момент подписи, а обновления могут выходить годами.
VALID_DAYS = 365 * 30


def make_key(password, alias, out_path, common_name):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, common_name),
        x509.NameAttribute(NameOID.COUNTRY_NAME, "RU"),
    ])

    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=VALID_DAYS))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    blob = pkcs12.serialize_key_and_certificates(
        name=alias.encode(),
        key=key,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(
            password.encode()
        ),
    )

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "wb") as handle:
        handle.write(blob)
    return cert, blob


def fingerprint(cert):
    return cert.fingerprint(hashes.SHA256()).hex()


def main():
    parser = argparse.ArgumentParser(description="создать ключ подписи")
    parser.add_argument("--out", default="keys/release.p12")
    parser.add_argument("--password", default="rakcrmp")
    parser.add_argument("--alias", default="rakcrmp")
    parser.add_argument("--cn", default="RakCRMP")
    args = parser.parse_args()

    cert, blob = make_key(args.password, args.alias, args.out, args.cn)

    # Проверяем, что файл читается обратно: если apksigner его не поймёт,
    # лучше узнать об этом здесь, а не в CI.
    with open(args.out, "rb") as handle:
        loaded_key, loaded_cert, _extra = pkcs12.load_key_and_certificates(
            handle.read(), args.password.encode()
        )
    assert loaded_key is not None and loaded_cert is not None

    print(f"ключ: {args.out} ({len(blob)} байт)")
    print(f"алиас: {args.alias}")
    print(f"SHA-256: {fingerprint(loaded_cert)}")
    print(f"действителен до: {loaded_cert.not_valid_after_utc:%Y-%m-%d}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
