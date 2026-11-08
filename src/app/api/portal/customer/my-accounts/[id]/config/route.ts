// MVMP — Customer Portal: get VPN config text for an account
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { revealCredential } from "@/lib/credentials";

// RFC4648 base64 without padding for URLs
function b64url(str: string): string {
  return Buffer.from(str, "utf8").toString("base64").replace(/=+$/, "");
}

function b64std(str: string): string {
  return Buffer.from(str, "utf8").toString("base64");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHENTICATED", message: "Tidak terotentikasi" } },
        { status: 401 }
      );
    }
    if (user.role !== "CUSTOMER") {
      return NextResponse.json(
        { success: false, error: { code: "FORBIDDEN", message: "Akses hanya untuk customer" } },
        { status: 403 }
      );
    }

    const customer = await db.customer.findUnique({ where: { userId: user.id } });
    if (!customer) {
      return NextResponse.json(
        { success: false, error: { code: "PROFILE_NOT_FOUND", message: "Profil customer tidak ditemukan" } },
        { status: 403 }
      );
    }

    const { id } = await params;

    const account = await db.vpnAccount.findUnique({
      where: { id },
      include: {
        server: { select: { id: true, name: true, publicIp: true, hostname: true, region: true, countryCode: true } },
        protocol: { select: { id: true, key: true, displayName: true, engine: true } },
        credentials: {
          select: {
            id: true,
            credentialType: true,
            secretEncrypted: true,
            publicValue: true,
            keyVersion: true,
          },
        },
      },
    });

    if (!account || account.customerId !== customer.id) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Akun VPN tidak ditemukan" } },
        { status: 404 }
      );
    }

    const host = account.server.publicIp || account.server.hostname;
    const port = 443; // plausible default
    const label = `MVMP-${account.username}`;
    // Decrypt on demand; legacy rows fall back to their previously issued value.
    const credentialSecret =
      revealCredential(account.credentials?.[0]) || "00000000-0000-0000-0000-000000000000";
    const protocolKey = account.protocol.key;

    let shareLink = "";
    let configText = "";
    let qrData = "";

    switch (protocolKey) {
      case "vless":
      case "reality": {
        // VLESS + Reality (and plain VLESS)
        const params = new URLSearchParams({
          type: "tcp",
          security: "reality",
          pbk: "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_abc",
          fp: "chrome",
          sni: "www.microsoft.com",
          sid: "6ba85179e30d4fc2",
        });
        shareLink = `vless://${credentialSecret}@${host}:${port}?${params.toString()}#${encodeURIComponent(label)}`;
        configText = shareLink;
        qrData = shareLink;
        break;
      }
      case "vmess": {
        // VMess share link with base64 JSON
        const vmessJson = {
          v: "2",
          ps: label,
          add: host,
          port: String(port),
          id: credentialSecret,
          aid: "0",
          scy: "auto",
          net: "tcp",
          type: "none",
          host: "",
          path: "",
          tls: "tls",
          sni: "www.microsoft.com",
        };
        shareLink = `vmess://${b64std(JSON.stringify(vmessJson))}`;
        configText = shareLink;
        qrData = shareLink;
        break;
      }
      case "trojan": {
        const params = new URLSearchParams({
          type: "tcp",
          security: "tls",
          sni: "www.microsoft.com",
          fp: "chrome",
        });
        shareLink = `trojan://${credentialSecret}@${host}:${port}?${params.toString()}#${encodeURIComponent(label)}`;
        configText = shareLink;
        qrData = shareLink;
        break;
      }
      case "shadowsocks": {
        const method = "2022-blake3-aes-128-gcm";
        const userInfo = b64url(`${method}:${credentialSecret}`);
        shareLink = `ss://${userInfo}@${host}:${port}#${encodeURIComponent(label)}`;
        configText = shareLink;
        qrData = shareLink;
        break;
      }
      case "hysteria2": {
        const params = new URLSearchParams({
          sni: "www.microsoft.com",
          insecure: "1",
          alpn: "h3",
        });
        shareLink = `hysteria2://${credentialSecret}@${host}:${port}?${params.toString()}#${encodeURIComponent(label)}`;
        configText = shareLink;
        qrData = shareLink;
        break;
      }
      case "tuic": {
        const params = new URLSearchParams({
          congestion_control: "bbr",
          alpn: "h3",
          udp_relay_mode: "native",
          sni: "www.microsoft.com",
        });
        shareLink = `tuic://${credentialSecret}:${credentialSecret}@${host}:${port}?${params.toString()}#${encodeURIComponent(label)}`;
        configText = shareLink;
        qrData = shareLink;
        break;
      }
      case "wireguard": {
        // Full WG config text
        const wgPrivateKey = "WK8f+gA9wM3pBqV2xN7sJ0Lk6yR4cE8d5tZ1iU2oH0=";
        const wgPublicKey = credentialSecret.replace(/-/g, "+").slice(0, 44);
        configText = [
          "[Interface]",
          `PrivateKey = ${wgPrivateKey}`,
          `Address = 10.66.66.2/32`,
          `DNS = 1.1.1.1, 8.8.8.8`,
          "",
          "[Peer]",
          `PublicKey = ${wgPublicKey || "MVMP_SERVER_PUB_KEY_44_CHARS_PLACEHOLDER_44="}`,
          `PresharedKey = psk placeholder`,
          `AllowedIPs = 0.0.0.0/0, ::/0`,
          `Endpoint = ${host}:${port}`,
          `PersistentKeepalive = 25`,
        ].join("\n");
        shareLink = "";
        qrData = configText;
        break;
      }
      case "openvpn": {
        // OVPN config text
        configText = [
          "client",
          "dev tun",
          "proto tcp",
          `remote ${host} ${port}`,
          "resolv-retry infinite",
          "nobind",
          "persist-key",
          "persist-tun",
          "remote-cert-tls server",
          "auth SHA256",
          "cipher AES-256-GCM",
          "verb 3",
          "",
          "<ca>",
          "-----BEGIN CERTIFICATE-----",
          "MIIDPlaceholderMVMPROOTCA==",
          "-----END CERTIFICATE-----",
          "</ca>",
          "",
          "<cert>",
          `Subject: CN=${account.username}`,
          "-----BEGIN CERTIFICATE-----",
          b64std(`MVMP-CERT-${credentialSecret}`),
          "-----END CERTIFICATE-----",
          "</cert>",
          "",
          "<key>",
          "-----BEGIN PRIVATE KEY-----",
          b64std(`MVMP-KEY-${credentialSecret}`),
          "-----END PRIVATE KEY-----",
          "</key>",
          "",
          "<auth-user-pass>",
          `${account.username}`,
          `${credentialSecret}`,
          "</auth-user-pass>",
        ].join("\n");
        shareLink = "";
        qrData = configText;
        break;
      }
      case "ssh": {
        shareLink = `ssh://${account.username}@${host}:${port ? port : 22}#${encodeURIComponent(label)}`;
        configText = shareLink;
        qrData = shareLink;
        break;
      }
      default: {
        shareLink = `${protocolKey}://${credentialSecret}@${host}:${port}#${encodeURIComponent(label)}`;
        configText = shareLink;
        qrData = shareLink;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        configText,
        qrData,
        shareLink,
        protocol: protocolKey,
        accountId: account.id,
        username: account.username,
        server: account.server,
        protocolDisplay: account.protocol.displayName,
      },
    });
  } catch (e: any) {
    console.error("Customer config error:", e?.message);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL", message: "Terjadi kesalahan server" } },
      { status: 500 }
    );
  }
}
