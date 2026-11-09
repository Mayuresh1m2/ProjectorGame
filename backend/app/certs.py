"""Self-signed HTTPS certificate for the LAN (iPhone Safari needs a secure context for the camera)."""
from __future__ import annotations

import datetime
import ipaddress
import socket
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def _san_names(ips: list[str]) -> tuple[list[str], list[str]]:
    host = socket.gethostname()
    dns = ["localhost", host, f"{host}.local"]
    return dns, sorted(set(ips) | {"127.0.0.1"})


def _cert_covers(path: Path, ips: list[str]) -> bool:
    try:
        cert = x509.load_pem_x509_certificate(path.read_bytes())
        if cert.not_valid_after_utc < datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7):
            return False
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
        have = {str(i) for i in san.get_values_for_type(x509.IPAddress)}
        return set(ips) | {"127.0.0.1"} <= have
    except Exception:
        return False


def ensure_cert(cert_dir: Path, ips: list[str]) -> tuple[Path, Path]:
    """Create (or reuse) a cert whose SANs include every current LAN IP. Regenerates if the IP changed."""
    cert_dir.mkdir(parents=True, exist_ok=True)
    crt, key = cert_dir / "server.crt", cert_dir / "server.key"
    if crt.exists() and key.exists() and _cert_covers(crt, ips):
        return crt, key
    dns, ip_list = _san_names(ips)
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Butterfly Playground (local)")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(k.public_key())
        .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=397))  # iOS rejects >398-day certs
        .add_extension(x509.SubjectAlternativeName(
            [x509.DNSName(d) for d in dns] + [x509.IPAddress(ipaddress.ip_address(i)) for i in ip_list]), False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), True)
        .add_extension(x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]), False)
        .sign(k, hashes.SHA256())
    )
    key.write_bytes(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                    serialization.NoEncryption()))
    key.chmod(0o600)
    crt.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return crt, key
